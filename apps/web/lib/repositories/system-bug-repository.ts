import type { PoolClient } from 'pg'
import { query, queryOne, withTransaction } from '@/lib/db'

export type SystemBugStatus = 'open' | 'triaged' | 'resolved' | 'ignored'

export type SystemBugRecord = {
  id: string
  userId: string | null
  userEmail: string | null
  userDisplayName: string | null
  url: string
  pathname: string
  description: string
  ideLevelId: string | null
  ideLevelTitle: string | null
  ideLanguage: string | null
  ideResolvedLanguage: string | null
  ideCode: string | null
  userAgent: string | null
  viewport: Record<string, unknown>
  metadata: Record<string, unknown>
  status: SystemBugStatus
  adminNote: string | null
  handledBy: string | null
  handledAt: string | null
  createdAt: string
  updatedAt: string
}

export type SystemBugCreateInput = {
  userId: string
  url: string
  pathname: string
  description: string
  ideLevelId?: string | null
  ideLevelTitle?: string | null
  ideLanguage?: string | null
  ideResolvedLanguage?: string | null
  ideCode?: string | null
  userAgent?: string | null
  viewport?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type SystemBugAuditInput = {
  userId: string
  role: string
}

type SystemBugRow = {
  id: string
  user_id: string | null
  user_email: string | null
  user_display_name: string | null
  url: string
  pathname: string
  description: string
  ide_level_id: string | null
  ide_level_title: string | null
  ide_language: string | null
  ide_resolved_language: string | null
  ide_code: string | null
  user_agent: string | null
  viewport: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  status: SystemBugStatus
  admin_note: string | null
  handled_by: string | null
  handled_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
} & Record<string, unknown>

export async function createSystemBug(input: SystemBugCreateInput): Promise<SystemBugRecord> {
  const row = await queryOne<SystemBugRow>(
    `
    WITH inserted AS (
      INSERT INTO system_bugs (
        user_id, url, pathname, description, ide_level_id, ide_level_title,
        ide_language, ide_resolved_language, ide_code, user_agent, viewport, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    )
    SELECT
      b.*,
      u.email AS user_email,
      COALESCE(p.display_name, u.display_name, u.username) AS user_display_name
    FROM inserted b
    LEFT JOIN users u ON u.id = b.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    `,
    [
      input.userId,
      input.url,
      input.pathname,
      input.description,
      input.ideLevelId ?? null,
      input.ideLevelTitle ?? null,
      input.ideLanguage ?? null,
      input.ideResolvedLanguage ?? null,
      input.ideCode ?? null,
      input.userAgent ?? null,
      input.viewport ?? {},
      input.metadata ?? {},
    ],
  )

  if (!row) throw new Error('System bug was not saved')
  return mapSystemBugRow(row)
}

export async function listSystemBugs(limit = 100): Promise<SystemBugRecord[]> {
  const rows = await query<SystemBugRow>(
    `
    SELECT
      b.*,
      u.email AS user_email,
      COALESCE(p.display_name, u.display_name, u.username) AS user_display_name
    FROM system_bugs b
    LEFT JOIN users u ON u.id = b.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    ORDER BY b.created_at DESC
    LIMIT $1
    `,
    [Math.max(1, Math.min(limit, 200))],
  )

  return rows.map(mapSystemBugRow)
}

export async function getSystemBug(id: string): Promise<SystemBugRecord | null> {
  const row = await queryOne<SystemBugRow>(
    `
    SELECT
      b.*,
      u.email AS user_email,
      COALESCE(p.display_name, u.display_name, u.username) AS user_display_name
    FROM system_bugs b
    LEFT JOIN users u ON u.id = b.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE b.id = $1
    `,
    [id],
  )

  return row ? mapSystemBugRow(row) : null
}

export async function updateSystemBugStatus(input: {
  id: string
  status: SystemBugStatus
  adminNote: string | null
  audit: SystemBugAuditInput
}): Promise<SystemBugRecord> {
  return withTransaction(async (client) => {
    const before = await readSystemBugAuditSnapshot(client, input.id)
    if (!before) throw new Error('System bug not found')

    const result = await client.query<SystemBugRow>(
      `
      UPDATE system_bugs
      SET
        status = $2,
        admin_note = $3,
        handled_by = $4,
        handled_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [input.id, input.status, input.adminNote, input.audit.userId],
    )

    const updated = result.rows[0]
    if (!updated) throw new Error('System bug not found')
    const after = await readSystemBugAuditSnapshot(client, input.id)
    await insertAuditLog(client, input.audit, input.id, before, after, {
      status: input.status,
      adminNotePresent: Boolean(input.adminNote),
    })

    const full = await readSystemBugFull(client, input.id)
    if (!full) throw new Error('System bug not found')
    return mapSystemBugRow(full)
  })
}

async function readSystemBugFull(client: PoolClient, id: string): Promise<SystemBugRow | null> {
  const result = await client.query<SystemBugRow>(
    `
    SELECT
      b.*,
      u.email AS user_email,
      COALESCE(p.display_name, u.display_name, u.username) AS user_display_name
    FROM system_bugs b
    LEFT JOIN users u ON u.id = b.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE b.id = $1
    `,
    [id],
  )

  return result.rows[0] ?? null
}

async function readSystemBugAuditSnapshot(client: PoolClient, id: string): Promise<Record<string, unknown> | null> {
  const result = await client.query<{ data: Record<string, unknown> }>(
    `
    SELECT jsonb_build_object(
      'id', id,
      'userId', user_id,
      'url', url,
      'pathname', pathname,
      'descriptionLength', length(description),
      'ideLevelId', ide_level_id,
      'ideLanguage', ide_language,
      'ideCodeLength', length(COALESCE(ide_code, '')),
      'status', status,
      'adminNote', admin_note,
      'handledBy', handled_by,
      'handledAt', handled_at
    ) AS data
    FROM system_bugs
    WHERE id = $1
    `,
    [id],
  )

  return result.rows[0]?.data ?? null
}

async function insertAuditLog(
  client: PoolClient,
  audit: SystemBugAuditInput,
  id: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  metadata: Record<string, unknown>,
) {
  await client.query(
    `
    INSERT INTO admin_audit_logs
      (actor_user_id, actor_role, action, resource_type, resource_id, before_data, after_data, metadata)
    VALUES ($1, $2, 'system_bug.update', 'system_bug', $3, $4, $5, $6)
    `,
    [audit.userId, audit.role, id, before, after, metadata],
  )
}

function mapSystemBugRow(row: SystemBugRow): SystemBugRecord {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    userDisplayName: row.user_display_name,
    url: row.url,
    pathname: row.pathname,
    description: row.description,
    ideLevelId: row.ide_level_id,
    ideLevelTitle: row.ide_level_title,
    ideLanguage: row.ide_language,
    ideResolvedLanguage: row.ide_resolved_language,
    ideCode: row.ide_code,
    userAgent: row.user_agent,
    viewport: row.viewport ?? {},
    metadata: row.metadata ?? {},
    status: row.status,
    adminNote: row.admin_note,
    handledBy: row.handled_by,
    handledAt: row.handled_at ? toIsoString(row.handled_at) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
