import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { query, queryOne } from '@/lib/db'
import { verifyPassword } from '@/lib/password'

type UserRow = {
  id: string
  username: string
  email: string | null
  password_hash: string
  display_name: string | null
  avatar_url: string | null
  phone_verified_at: string | null
  account_status: string | null
}

type SessionUserRow = {
  username: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  phone_verified_at: string | null
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/auth/sign-in',
  },
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Email, username, or nickname', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const identifier = typeof credentials?.username === 'string' ? credentials.username.trim() : ''
        const password = typeof credentials?.password === 'string' ? credentials.password : ''
        if (!identifier || !password) return null

        const user = await findLoginUser(identifier)

        if (!user || user.account_status === 'suspended' || user.account_status === 'deleted') {
          return null
        }

        const passwordValid = await verifyPassword(password, user.password_hash)
        if (!passwordValid) return null

        await query('UPDATE users SET last_sign_in_at = NOW() WHERE id = $1', [user.id])

        return {
          id: user.id,
          email: user.email ?? null,
          name: user.display_name ?? user.username,
          username: user.username,
          image: user.avatar_url ?? undefined,
          avatarUrl: user.avatar_url ?? null,
          phoneVerified: Boolean(user.phone_verified_at),
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        const userId = String(token.userId ?? token.sub ?? '')
        session.user.id = userId
        if (userId) {
          try {
            const currentUser = await queryOne<SessionUserRow>(
              `
              SELECT
                u.username,
                u.email,
                COALESCE(p.display_name, u.display_name) AS display_name,
                p.avatar_url,
                p.phone_verified_at
              FROM users u
              LEFT JOIN profiles p ON p.user_id = u.id
              WHERE u.id = $1
              `,
              [userId],
            )
            if (currentUser) {
              session.user.email = currentUser.email ?? ''
              session.user.name = currentUser.display_name ?? currentUser.username
              session.user.username = currentUser.username
              session.user.image = currentUser.avatar_url
              session.user.avatarUrl = currentUser.avatar_url
              session.user.phoneVerified = Boolean(currentUser.phone_verified_at)
            }
          } catch {
            // Keep the token-backed session if the database is temporarily unavailable.
          }
        }
      }
      return session
    },
  },
})

async function findLoginUser(identifier: string): Promise<UserRow | null> {
  const user = await queryOne<UserRow>(
    `
    SELECT
      u.id,
      u.username,
      u.email,
      u.password_hash,
      COALESCE(p.display_name, u.display_name) AS display_name,
      p.avatar_url,
      p.phone_verified_at,
      uas.account_status
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN user_admin_states uas ON uas.user_id = u.id
    WHERE lower(u.username) = lower($1)
       OR lower(u.email) = lower($1)
    `,
    [identifier],
  )
  if (user) return user

  const displayNameMatches = await query<UserRow>(
    `
    SELECT
      u.id,
      u.username,
      u.email,
      u.password_hash,
      COALESCE(p.display_name, u.display_name) AS display_name,
      p.avatar_url,
      p.phone_verified_at,
      uas.account_status
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN user_admin_states uas ON uas.user_id = u.id
    WHERE lower(COALESCE(p.display_name, u.display_name, '')) = lower($1)
    ORDER BY u.created_at ASC
    LIMIT 2
    `,
    [identifier],
  )

  if (displayNameMatches.length !== 1) return null
  return displayNameMatches[0] ?? null
}
