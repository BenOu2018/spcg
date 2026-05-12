import type { DefaultSession } from 'next-auth'

export {}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      username?: string | null
      avatarUrl?: string | null
      phoneVerified?: boolean
    } & DefaultSession['user']
  }

  interface User {
    username?: string | null
    avatarUrl?: string | null
    phoneVerified?: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string
  }
}
