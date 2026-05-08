import { query, queryOne } from '@/lib/db'

export type SystemErrorLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export type SystemErrorLogRecord = {
  id: string
  level: SystemErrorLogLevel
  source: string
  message: string
  stack: string | null
  path: string | null
  method: string | null
  userId: string | null
  userEmail: string | null
  userDisplayName: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export type CreateSystemErrorLogInput = {
  level?: SystemErrorLogLevel
  source: string
  message: string
  stack?: string | null
  path?: string | null
  method?: string | null
  userId?: string | null
  metadata?: Record<string, unknown>
}

type SystemErrorLogRow = {
  id: string
  level: SystemErrorLogLevel
  source: string
  message: string
  stack: string | null
  path: string | null
  method: string | null
  user_id: string | null
  user_email: string | null
  user_display_name: string | null
  metadata: Record<string, unknown> | null
  created_at: Date | string
} & Record<string, unknown>

export async function createSystemErrorLog(input: CreateSystemErrorLogInput): Promise<SystemErrorLogRecord> {
  const row = await queryOne<SystemErrorLogRow>(
    `
    WITH inserted AS (
      INSERT INTO system_error_logs
        (level, source, message, stack, path, method, user_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    )
    SELECT
      log.*,
      u.email AS user_email,
      COALESCE(p.display_name, u.display_name) AS user_display_name
    FROM inserted log
    LEFT JOIN users u ON u.id = log.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    `,
    [
      input.level ?? 'error',
      input.source,
      input.message,
      input.stack ?? null,
      input.path ?? null,
      input.method ?? null,
      input.userId ?? null,
      input.metadata ?? {},
    ],
  )

  if (!row) throw new Error('System error log was not saved')
  return mapSystemErrorLogRow(row)
}

export async function listSystemErrorLogs(limit = 50): Promise<SystemErrorLogRecord[]> {
  const rows = await query<SystemErrorLogRow>(
    `
    SELECT
      log.*,
      u.email AS user_email,
      COALESCE(p.display_name, u.display_name) AS user_display_name
    FROM system_error_logs log
    LEFT JOIN users u ON u.id = log.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    ORDER BY log.created_at DESC
    LIMIT $1
    `,
    [Math.max(1, Math.min(limit, 200))],
  )

  return rows.map(mapSystemErrorLogRow)
}

function mapSystemErrorLogRow(row: SystemErrorLogRow): SystemErrorLogRecord {
  return {
    id: row.id,
    level: row.level,
    source: row.source,
    message: row.message,
    stack: row.stack,
    path: row.path,
    method: row.method,
    userId: row.user_id,
    userEmail: row.user_email,
    userDisplayName: row.user_display_name,
    metadata: row.metadata ?? {},
    createdAt: toIsoString(row.created_at),
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
