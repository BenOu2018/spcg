import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { query, queryOne } from '@/lib/db'
import { verifyPassword } from '@/lib/password'

type UserRow = {
  id: string
  email: string
  password_hash: string
  display_name: string | null
  account_status: string | null
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
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : ''
        const password = typeof credentials?.password === 'string' ? credentials.password : ''
        if (!email || !password) return null

        const user = await queryOne<UserRow>(
          `
          SELECT
            u.id,
            u.email,
            u.password_hash,
            COALESCE(p.display_name, u.display_name) AS display_name,
            uas.account_status
          FROM users u
          LEFT JOIN profiles p ON p.user_id = u.id
          LEFT JOIN user_admin_states uas ON uas.user_id = u.id
          WHERE u.email = $1
          `,
          [email],
        )

        if (!user || user.account_status === 'suspended' || user.account_status === 'deleted') {
          return null
        }

        const passwordValid = await verifyPassword(password, user.password_hash)
        if (!passwordValid) return null

        await query('UPDATE users SET last_sign_in_at = NOW() WHERE id = $1', [user.id])

        return {
          id: user.id,
          email: user.email,
          name: user.display_name ?? user.email,
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
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.userId ?? token.sub ?? '')
      }
      return session
    },
  },
})
