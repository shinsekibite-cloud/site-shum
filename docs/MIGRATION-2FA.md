/**
 * Migration note (2FA):
 * - Added User.totpSecret String? and User.totpEnabled Boolean @default(false)
 * - Apply with: `npx prisma db push` (or generate a migration in prod)
 * - See src/lib/totp.ts and /api/user/2fa/*
 */
