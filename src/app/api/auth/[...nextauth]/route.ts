import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { loginIpRateLimiter } from "@/lib/rateLimit";

const handler = NextAuth(authOptions);

function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xf || req.headers.get("x-real-ip")?.trim() || "127.0.0.1";
}

export async function GET(
  req: Request,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  return (handler as (req: Request, ctx: unknown) => Promise<Response>)(req, context);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  const path = new URL(req.url).pathname;
  if (path.includes("/callback/credentials")) {
    const ip = clientIp(req);
    if (!(await loginIpRateLimiter.checkAsync(`login-ip:${ip}`))) {
      // NextAuth client (redirect:false) reads `error` from the returned `url`.
      // Point at pages.signIn (/login), not /api/auth/error, so a full redirect
      // (if any) lands on the form with a clear message — not a blank error page.
      const origin = new URL(req.url).origin;
      const msg = encodeURIComponent(
        "Слишком много попыток входа с этого адреса. Подождите несколько минут."
      );
      return Response.json(
        { url: `${origin}/login?error=${msg}` },
        { status: 401 }
      );
    }
  }
  return (handler as (req: Request, ctx: unknown) => Promise<Response>)(req, context);
}
