import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import pg from 'pg'

const { Pool } = pg
const ENV_DATABASE_URL_FILES = ['.env.local', 'apps/web/.env.local', '.env']

async function main() {
  const databaseUrl = await resolveDatabaseUrl()
  if (!databaseUrl) {
    throw new Error(`DATABASE_URL is required. Set it in the environment or one of: ${ENV_DATABASE_URL_FILES.join(', ')}`)
  }

  const migrationsDir = resolve('db/migrations')
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort()
  if (files.length === 0) throw new Error('No SQL migrations found in db/migrations')

  const pool = new Pool({ connectionString: databaseUrl })
  const client = await pool.connect()

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    for (const file of files) {
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file])
      if (applied.rowCount && applied.rowCount > 0) {
        console.log(`skip ${file}`)
        continue
      }

      const sql = await readFile(join(migrationsDir, file), 'utf8')
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`applied ${file}`)
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

async function resolveDatabaseUrl(): Promise<string | null> {
  const explicit = process.env.DATABASE_URL?.trim()
  if (explicit) return explicit

  for (const envFile of ENV_DATABASE_URL_FILES) {
    const value = await readEnvValue(envFile, 'DATABASE_URL')
    if (value) {
      console.log(`Using DATABASE_URL from ${envFile}`)
      return value
    }
  }

  return null
}

async function readEnvValue(filePath: string, key: string): Promise<string | null> {
  let content = ''
  try {
    content = await readFile(resolve(filePath), 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const match = trimmed.match(new RegExp(`^(?:export\\s+)?${key}\\s*=\\s*(.*)$`))
    if (!match) continue

    const rawValue = match[1]?.trim() ?? ''
    const quote = rawValue[0]
    if ((quote === '"' || quote === "'") && rawValue.endsWith(quote)) {
      return rawValue.slice(1, -1)
    }
    return rawValue.replace(/\s+#.*$/, '').trim() || null
  }

  return null
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
