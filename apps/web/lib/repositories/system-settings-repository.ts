import type { PoolClient } from 'pg'
import { isDbConfigured, queryOne, withTransaction } from '@/lib/db'

export type SystemSettingRecord<T extends Record<string, unknown> = Record<string, unknown>> = {
  settingKey: string
  value: T
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export type AdminAuditInput = {
  userId: string
  role: string
}

type SystemSettingRow = {
  setting_key: string
  setting_value: Record<string, unknown>
  updated_by: string | null
  created_at: Date | string
  updated_at: Date | string
} & Record<string, unknown>

export function canUseSystemSettingsStore(): boolean {
  return isDbConfigured()
}

export async function getSystemSetting<T extends Record<string, unknown> = Record<string, unknown>>(
  settingKey: string,
): Promise<SystemSettingRecord<T> | null> {
  if (!isDbConfigured()) return null

  const row = await queryOne<SystemSettingRow>(
    `
    SELECT setting_key, setting_value, updated_by, created_at, updated_at
    FROM system_settings
    WHERE setting_key = $1
    `,
    [settingKey],
  )

  return row ? mapSettingRow<T>(row) : null
}

export async function upsertSystemSettingWithAudit<T extends Record<string, unknown>>(input: {
  settingKey: string
  value: T
  updatedBy: string
  audit: AdminAuditInput
  beforeData: Record<string, unknown> | null
  afterData: Record<string, unknown>
  metadata: Record<string, unknown>
}): Promise<SystemSettingRecord<T>> {
  return withTransaction(async (client) => {
    const rows = await client.query<SystemSettingRow>(
      `
      INSERT INTO system_settings (setting_key, setting_value, updated_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (setting_key)
      DO UPDATE SET
        setting_value = EXCLUDED.setting_value,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING setting_key, setting_value, updated_by, created_at, updated_at
      `,
      [input.settingKey, input.value, input.updatedBy],
    )

    const row = rows.rows[0]
    if (!row) throw new Error('System setting was not saved')

    await insertSettingsAuditLog(client, input)

    return mapSettingRow<T>(row)
  })
}

async function insertSettingsAuditLog(
  client: PoolClient,
  input: {
    settingKey: string
    audit: AdminAuditInput
    beforeData: Record<string, unknown> | null
    afterData: Record<string, unknown>
    metadata: Record<string, unknown>
  },
) {
  await client.query(
    `
    INSERT INTO admin_audit_logs
      (actor_user_id, actor_role, action, resource_type, resource_id, before_data, after_data, metadata)
    VALUES ($1, $2, 'system_setting.update', 'system_setting', $3, $4, $5, $6)
    `,
    [input.audit.userId, input.audit.role, input.settingKey, input.beforeData, input.afterData, input.metadata],
  )
}

function mapSettingRow<T extends Record<string, unknown>>(row: SystemSettingRow): SystemSettingRecord<T> {
  return {
    settingKey: row.setting_key,
    value: row.setting_value as T,
    updatedBy: row.updated_by,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
