import pg from 'pg'

type AdminRole = 'owner' | 'admin' | 'editor' | 'reviewer' | 'support'

type Args = {
  email: string | null
  userId: string | null
  role: AdminRole
  displayName: string | null
}

const VALID_ROLES: AdminRole[] = ['owner', 'admin', 'editor', 'reviewer', 'support']
const { Pool } = pg

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }

  const pool = new Pool({ connectionString: databaseUrl })

  try {
    const userId = args.userId ?? (await findUserIdByEmail(pool, args.email))
    await pool.query(
      `
      INSERT INTO admin_roles (user_id, role, active, display_name)
      VALUES ($1, $2, TRUE, $3)
      ON CONFLICT (user_id)
      DO UPDATE SET role = EXCLUDED.role, active = TRUE, display_name = EXCLUDED.display_name
      `,
      [userId, args.role, args.displayName],
    )

    console.log(`Bootstrapped ${args.role} admin role for ${args.email ?? userId}.`)
  } finally {
    await pool.end()
  }
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    email: null,
    userId: null,
    role: 'owner',
    displayName: null,
  }

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    const value = argv[i + 1]

    if (token === '--email') {
      if (!value) throw new Error('--email requires a value')
      args.email = value.toLowerCase()
      i++
      continue
    }

    if (token === '--user-id') {
      if (!value) throw new Error('--user-id requires a value')
      args.userId = value
      i++
      continue
    }

    if (token === '--role') {
      if (!isAdminRole(value)) throw new Error(`--role must be one of: ${VALID_ROLES.join(', ')}`)
      args.role = value
      i++
      continue
    }

    if (token === '--display-name') {
      if (!value) throw new Error('--display-name requires a value')
      args.displayName = value
      i++
      continue
    }

    throw new Error(`Unknown argument: ${token}`)
  }

  if (!args.email && !args.userId) {
    throw new Error('Provide --email or --user-id')
  }

  return args
}

async function findUserIdByEmail(pool: pg.Pool, email: string | null): Promise<string> {
  if (!email) throw new Error('--email is required when --user-id is not provided')

  const result = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email])
  const userId = result.rows[0]?.id
  if (!userId) throw new Error(`No local user found for email: ${email}`)
  return userId
}

function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && VALID_ROLES.includes(value as AdminRole)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
