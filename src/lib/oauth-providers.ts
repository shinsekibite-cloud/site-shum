/**
 * Optional OAuth providers (Yandex / VK / ESIA).
 * Enabled only when client id+secret env vars are set.
 * See docs/OAUTH-YANDEX-VK.md and docs/OAUTH-ESIA.md
 */

function esiaEnv() {
  const clientId = (process.env.ESIA_CLIENT_ID || '').trim();
  const clientSecret = (process.env.ESIA_CLIENT_SECRET || '').trim();
  return { clientId, clientSecret, ready: Boolean(clientId && clientSecret) };
}

export function buildOptionalOAuthProviders(): any[] {
  const out: any[] = [];

  const yandexId = (process.env.YANDEX_CLIENT_ID || "").trim();
  const yandexSecret = (process.env.YANDEX_CLIENT_SECRET || "").trim();
  if (yandexId && yandexSecret) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const YandexProvider = require("next-auth/providers/yandex").default;
    out.push(
      YandexProvider({
        clientId: yandexId,
        clientSecret: yandexSecret,
      })
    );
  }

  const vkId = (process.env.VK_CLIENT_ID || "").trim();
  const vkSecret = (process.env.VK_CLIENT_SECRET || "").trim();
  if (vkId && vkSecret) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const VkProvider = require("next-auth/providers/vk").default;
    out.push(
      VkProvider({
        clientId: vkId,
        clientSecret: vkSecret,
      })
    );
  }

  const esia = esiaEnv();
  if (esia.ready) {
    out.push({
      id: 'esia',
      name: 'Госуслуги',
      type: 'oauth',
      clientId: esia.clientId,
      clientSecret: esia.clientSecret,
      checks: 'pkce',
      authorization: {
        url: (process.env.ESIA_AUTH_URL || 'https://esia.gosuslugi.ru/aas/oauth2/ac').trim(),
        params: {
          scope: (process.env.ESIA_SCOPE || 'openid fullname email mobile').trim(),
          response_type: 'code',
        },
      },
      token: (process.env.ESIA_TOKEN_URL || 'https://esia.gosuslugi.ru/aas/oauth2/te').trim(),
      userinfo: (process.env.ESIA_USERINFO_URL || 'https://esia.gosuslugi.ru/rs/prns').trim(),
      issuer: (process.env.ESIA_ISSUER || 'https://esia.gosuslugi.ru').trim(),
      profile(profile: Record<string, unknown>) {
        const oid = String(profile.oid || profile.sub || profile.id || '');
        const first = String(profile.firstName || profile.given_name || '');
        const last = String(profile.lastName || profile.family_name || '');
        const name = [first, last].filter(Boolean).join(' ') || String(profile.name || 'Госуслуги');
        const email = typeof profile.email === 'string' && profile.email.includes('@') ? profile.email : null;
        const mobile = typeof profile.mobile === 'string' ? profile.mobile : null;
        return {
          id: oid || `esia:${name}`,
          name,
          email,
          phone: mobile,
        };
      },
    });
  }

  return out;
}

export function oauthProviderFlags() {
  return {
    yandex: Boolean((process.env.YANDEX_CLIENT_ID || "").trim() && (process.env.YANDEX_CLIENT_SECRET || "").trim()),
    vk: Boolean((process.env.VK_CLIENT_ID || "").trim() && (process.env.VK_CLIENT_SECRET || "").trim()),
    esia: esiaEnv().ready,
  };
}
