import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { buildOptionalOAuthProviders } from "./oauth-providers";
import { consumeCaptchaToken } from "@/lib/captcha";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";
import bcrypt from "bcrypt";
import { isPhoneLikeLogin, phoneNational10 } from "./phone";
import {
  COOKIES_POLICY_VERSION,
  PRIVACY_POLICY_VERSION,
  RULES_POLICY_VERSION,
} from "@/lib/consent-versions";

async function findUserByLogin(loginRaw: string) {
  const raw = loginRaw.trim();
  if (!raw) return null;

  if (raw.includes("@") || !isPhoneLikeLogin(raw)) {
    if (raw.includes("@")) {
      const email = raw.toLowerCase();
      return prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      });
    }
    return prisma.user.findFirst({
      where: { email: { equals: raw.toLowerCase(), mode: "insensitive" } },
    });
  }

  const national = phoneNational10(raw);
  if (national.length !== 10) {
    return null;
  }

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      password: string | null;
      image: string | null;
      role: string;
      permissions: string | null;
      blockedAt: Date | null;
      blockedReason: string | null;
      deletedAt: Date | null;
      tokenVersion: number;
      mustChangePassword: boolean;
      ecoPoints: number;
    }>
  >`
    SELECT id, name, email, phone, password, image, role, permissions,
           "blockedAt", "blockedReason", "deletedAt", "tokenVersion", "mustChangePassword",
           "ecoPoints"
    FROM "User"
    WHERE length(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 10
      AND right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = ${national}
    LIMIT 1
  `;
  return rows[0] || null;
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    ...buildOptionalOAuthProviders(),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email или телефон", type: "text" },
        password: { label: "Пароль", type: "password" },
        captchaToken: { label: "Captcha", type: "text" },
        requireCaptcha: { label: "RequireCaptcha", type: "text" },
        website: { label: "Website", type: "text" },
        totpCode: { label: "2FA code", type: "text" },
        challengeToken: { label: "2FA challenge", type: "text" },
        authTicket: { label: "Auth ticket", type: "text" },
        smsCode: { label: "SMS code", type: "text" },
      },
      async authorize(credentials) {
        const challengeToken = credentials?.challengeToken
          ? String(credentials.challengeToken)
          : "";
        const totpCode = credentials?.totpCode ? String(credentials.totpCode).trim() : "";
        const authTicket = credentials?.authTicket ? String(credentials.authTicket) : "";
        const smsCode = credentials?.smsCode ? String(credentials.smsCode).replace(/\D/g, "") : "";

        // Second step: challenge + TOTP (password optional / ignored)
        if (challengeToken && totpCode) {
          const { verifyTotpChallenge } = await import("@/lib/totp-challenge");
          const { verifyTotp } = await import("@/lib/totp");
          const challenge = verifyTotpChallenge(challengeToken);
          if (!challenge) {
            throw new Error("Сессия подтверждения истекла. Войдите снова.");
          }
          const u = await prisma.user.findUnique({
            where: { id: challenge.uid },
          });
          if (!u || u.blockedAt || u.deletedAt) {
            throw new Error("Аккаунт недоступен");
          }
          if (!u.totpEnabled || !u.totpSecret) {
            throw new Error("2FA не настроена");
          }
          if (!verifyTotp(u.totpSecret, totpCode)) {
            throw new Error("Неверный код 2FA");
          }
          return u as any;
        }

        if (!credentials?.email || (!credentials?.password && !smsCode)) {
          throw new Error("Неверные данные");
        }

        const loginRaw = String(credentials.email).trim();
        const password = credentials?.password ? String(credentials.password) : "";
        const captchaToken = credentials.captchaToken ? String(credentials.captchaToken) : "";
        const { loginRateLimiter, loginIpRateLimiter, isLoginLocked, noteLoginFailure, clearLoginFailures } =
          await import("./rateLimit");
        let ip = "0.0.0.0";
        try {
          const { headers } = await import("next/headers");
          const h = await headers();
          ip =
            h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            h.get("x-real-ip") ||
            "0.0.0.0";
        } catch {
          /* ignore */
        }
        const rateKey = isPhoneLikeLogin(loginRaw)
          ? `login:phone:${phoneNational10(loginRaw)}`
          : `login:${loginRaw.toLowerCase()}`;
        if (await isLoginLocked(rateKey) || await isLoginLocked(`ip:${ip}`)) {
          throw new Error("Слишком много неудачных попыток. Подождите 15 минут.");
        }
        if (!(await loginIpRateLimiter.checkAsync(`ip:${ip}`))) {
          throw new Error("Слишком много попыток входа с этого адреса. Подождите несколько минут.");
        }
        if (!(await loginRateLimiter.checkAsync(rateKey))) {
          throw new Error("Слишком много попыток входа. Подождите несколько минут.");
        }
        if (authTicket) {
          const { verifyAuthTicket } = await import("./auth-ticket");
          const ticketLogin = isPhoneLikeLogin(loginRaw) ? phoneNational10(loginRaw) : loginRaw;
          const ticket = verifyAuthTicket(authTicket, ticketLogin || loginRaw);
          if (!ticket) {
            throw new Error("Сессия проверки истекла. Обновите страницу.");
          }
        } else {
          const cap = await consumeCaptchaToken(captchaToken, String(credentials.website || ""));
          if (!cap.ok) {
            throw new Error(cap.message || "Пройдите проверку «я не робот»");
          }
        }

        if (smsCode) {
          const { getAccessSettings } = await import("./access-settings");
          const access = await getAccessSettings();
          if (!access.smsLoginEnabled) {
            throw new Error("Вход по SMS выключен");
          }
          const { verifySmsOtp } = await import("./sms-otp");
          if (!(await verifySmsOtp(loginRaw, smsCode))) {
            await noteLoginFailure(rateKey);
            await noteLoginFailure(`ip:${ip}`);
            throw new Error("Неверный код из SMS");
          }
          const smsUser = await findUserByLogin(loginRaw);
          if (!smsUser || (smsUser as { blockedAt?: Date | null }).blockedAt || (smsUser as { deletedAt?: Date | null }).deletedAt) {
            throw new Error("Неверный логин или пароль");
          }
          await clearLoginFailures(rateKey);
          await clearLoginFailures(`ip:${ip}`);
          return smsUser as any;
        }

        let user = await findUserByLogin(loginRaw);

        const techEmail = (process.env.TECH_EMAIL || "").trim().toLowerCase();
        const loginEmail = loginRaw.includes("@") ? loginRaw.toLowerCase() : "";
        const isTechLogin = Boolean(techEmail && loginEmail === techEmail);

        /**
         * TECH bootstrap is one-shot create only (no password on account yet).
         * Existing TECH accounts authenticate via DB hash (or TECH_PASSWORD_HASH for recovery).
         * Plaintext TECH_BOOTSTRAP_PASSWORD must NEVER reset an existing account.
         */
        const verifyTechBootstrapCreate = async () => {
          const bootstrap = process.env.TECH_BOOTSTRAP_PASSWORD || "";
          const hashEnv = process.env.TECH_PASSWORD_HASH || "";
          if (hashEnv) return bcrypt.compare(password, hashEnv);
          if (bootstrap && password === bootstrap) return true;
          return false;
        };

        const verifyTechRecoveryHash = async () => {
          const hashEnv = process.env.TECH_PASSWORD_HASH || "";
          if (!hashEnv) return false;
          return bcrypt.compare(password, hashEnv);
        };

        if (isTechLogin && (!user || !user.password)) {
          if (await verifyTechBootstrapCreate()) {
            const hashed = await bcrypt.hash(password, 12);
            const now = new Date();
            user = (await prisma.user.create({
              data: {
                email: techEmail,
                name: "Техслужба",
                password: hashed,
                role: "TECH",
                privacyAcceptedAt: now,
                privacyFirstAcceptedAt: now,
                privacyPolicyVersion: PRIVACY_POLICY_VERSION,
                cookiesAcceptedAt: now,
                cookiesPolicyVersion: COOKIES_POLICY_VERSION,
                rulesAcceptedAt: now,
                rulesPolicyVersion: RULES_POLICY_VERSION,
              },
            })) as typeof user;
          }
        } else if (isTechLogin && user && (await verifyTechRecoveryHash())) {
          // Recovery only via TECH_PASSWORD_HASH — sync role, do not accept plaintext bootstrap.
          const hashed = await bcrypt.hash(password, 12);
          const now = new Date();
          const prev = user as {
            privacyAcceptedAt?: Date | null;
            privacyFirstAcceptedAt?: Date | null;
            privacyPolicyVersion?: string | null;
            cookiesAcceptedAt?: Date | null;
            cookiesPolicyVersion?: string | null;
          };
          user = (await prisma.user.update({
            where: { id: user.id },
            data: {
              password: hashed,
              role: "TECH",
              mustChangePassword: false,
              privacyAcceptedAt: prev.privacyAcceptedAt || now,
              privacyFirstAcceptedAt: prev.privacyFirstAcceptedAt || now,
              privacyPolicyVersion: prev.privacyPolicyVersion || PRIVACY_POLICY_VERSION,
              cookiesAcceptedAt: prev.cookiesAcceptedAt || now,
              cookiesPolicyVersion: prev.cookiesPolicyVersion || COOKIES_POLICY_VERSION,
              privacyRefusedAt: null,
            },
          })) as typeof user;
        }

        if (!user || !user.password) {
          throw new Error("Неверный логин или пароль");
        }

        if ((user as { blockedAt?: Date | null }).blockedAt) {
          throw new Error("Аккаунт заблокирован. Обратитесь в администрацию.");
        }
        if ((user as { deletedAt?: Date | null }).deletedAt) {
          throw new Error("Аккаунт удалён.");
        }

        const passwordHash = user.password;
        if (!passwordHash) {
          throw new Error("Неверный логин или пароль");
        }
        const isPasswordValid = await bcrypt.compare(password, passwordHash);
        if (!isPasswordValid) {
          await noteLoginFailure(rateKey);
          await noteLoginFailure(`ip:${ip}`);
          throw new Error("Неверный логин или пароль");
        }
        await clearLoginFailures(rateKey);
        await clearLoginFailures(`ip:${ip}`);

        // 2FA gate: password OK → require TOTP when enabled
        const totpRow = await prisma.user.findUnique({
          where: { id: user.id },
          select: { totpEnabled: true, totpSecret: true },
        });
        if (totpRow?.totpEnabled && totpRow.totpSecret) {
          if (totpCode) {
            const { verifyTotp } = await import("@/lib/totp");
            if (verifyTotp(totpRow.totpSecret, totpCode)) {
              return user as any;
            }
            throw new Error("Неверный код 2FA");
          }
          const { issueTotpChallenge } = await import("@/lib/totp-challenge");
          throw new Error(`NEEDS_2FA:${issueTotpChallenge(user.id)}`);
        }

        return user as any;
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider && account.provider !== "credentials") {
        if (user?.id) {
          const row = await prisma.user.findUnique({
            where: { id: user.id },
            select: { blockedAt: true, deletedAt: true },
          });
          if (row?.blockedAt || row?.deletedAt) return false;
        }
      }
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.permissions = (user as any).permissions;
        token.image = user.image;
        token.phone = (user as any).phone;
        token.nickname = (user as any).nickname ?? null;
        token.ecoPoints =
          typeof (user as any).ecoPoints === "number" ? (user as any).ecoPoints : undefined;
        token.tv = (user as any).tokenVersion ?? 0;
        token.mustChangePassword = Boolean((user as any).mustChangePassword);
        delete token.error;
      }
      if (token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: {
              role: true,
              permissions: true,
              image: true,
              name: true,
              nickname: true,
              email: true,
              phone: true,
              ecoPoints: true,
              blockedAt: true,
              deletedAt: true,
              tokenVersion: true,
              tokenKeepAlive: true,
              mustChangePassword: true,
              moderationApprovedAt: true,
              createdAt: true,
            },
          });
          if (!dbUser) {
            token.error = "gone";
            return token;
          }
          if (dbUser.deletedAt) {
            token.error = "deleted";
            return token;
          }
          if (dbUser.blockedAt) {
            token.error = "blocked";
            return token;
          }

          if (trigger === "update" && session) {
            if (session.image !== undefined) token.image = session.image;
            if (session.name !== undefined) token.name = session.name;
            if (session.email !== undefined) token.email = session.email;
            if (session.phone !== undefined) token.phone = session.phone;
            if ((session as { nickname?: unknown }).nickname !== undefined) {
              token.nickname = (session as { nickname?: string | null }).nickname ?? null;
            }
            // Keep-current after «завершить другие»: one-time nonce from revoke API
            const keepAlive =
              typeof (session as { keepAlive?: unknown }).keepAlive === "string"
                ? String((session as { keepAlive: string }).keepAlive)
                : "";
            if (keepAlive && dbUser.tokenKeepAlive && keepAlive === dbUser.tokenKeepAlive) {
              token.tv = dbUser.tokenVersion;
              delete token.error;
              await prisma.user.update({
                where: { id: token.id as string },
                data: { tokenKeepAlive: null },
              });
            }
          }

          if (typeof token.tv === "number" && dbUser.tokenVersion !== token.tv) {
            token.error = "revoked";
            return token;
          }
          token.role = dbUser.role;
          token.mustChangePassword = Boolean(dbUser.mustChangePassword);
          token.permissions = dbUser.permissions;
          token.image = dbUser.image;
          token.phone = dbUser.phone;
          token.nickname = dbUser.nickname ?? null;
          token.ecoPoints = typeof dbUser.ecoPoints === "number" ? dbUser.ecoPoints : 0;
          token.tv = dbUser.tokenVersion;
          if (dbUser.name) token.name = dbUser.name;
          if (dbUser.email) token.email = dbUser.email;
          try {
            const { syncAccountModeration } = await import("@/lib/account-moderation");
            token.moderationPending = await syncAccountModeration(token.id as string);
          } catch {
            token.moderationPending = false;
          }
          delete token.error;
        } catch {
          /* ignore */
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.error) {
        return { ...session, user: undefined as any, error: token.error };
      }
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        (session.user as any).mustChangePassword = Boolean(token.mustChangePassword);
        session.user.permissions = token.permissions as string;
        session.user.isSuperAdmin = (await import('./acl-shared')).isSuperAdmin(
          token.role as string,
          token.permissions as string
        );
        session.user.image = token.image as string;
        session.user.phone = (token.phone as string) || null;
        session.user.nickname = (token.nickname as string) || null;
        session.user.ecoPoints =
          typeof token.ecoPoints === "number" ? token.ecoPoints : undefined;
        session.user.moderationPending = Boolean(token.moderationPending);
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
