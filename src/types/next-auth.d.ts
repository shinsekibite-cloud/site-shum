import NextAuth, { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role?: string
      permissions?: string | null
      isSuperAdmin?: boolean
      phone?: string | null
      nickname?: string | null
      ecoPoints?: number
      moderationPending?: boolean
    } & DefaultSession["user"]
    error?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: string
    permissions?: string | null
    phone?: string | null
    image?: string | null
    nickname?: string | null
    ecoPoints?: number
    tv?: number
    error?: string
    moderationPending?: boolean
    mustChangePassword?: boolean
  }
}
