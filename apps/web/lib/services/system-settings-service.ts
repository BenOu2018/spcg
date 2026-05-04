import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import {
  canUseSystemSettingsStore,
  getSystemSetting,
  upsertSystemSettingWithAudit,
} from '@/lib/repositories/system-settings-repository'
import { ServiceError } from '@/lib/services/errors'

export type MiniMaxCodeHelpApiMode = 'anthropic' | 'openai'

export type MiniMaxCodeHelpRuntimeConfig = {
  enabled: boolean
  configured: boolean
  apiMode: MiniMaxCodeHelpApiMode
  baseUrl: string
  model: string
  timeoutMs: number
  apiKey: string | null
}

export type MiniMaxCodeHelpAdminSettings = {
  enabled: boolean
  configured: boolean
  apiMode: MiniMaxCodeHelpApiMode
  baseUrl: string
  model: string
  timeoutMs: number
  hasStoredApiKey: boolean
  hasEnvApiKey: boolean
  updatedAt: string | null
  source: 'database' | 'environment' | 'defaults'
}

export type MiniMaxCodeHelpSettingsInput = {
  enabled: boolean
  apiMode: string
  baseUrl: string
  model: string
  timeoutMs: number
  apiKey?: string | null
  clearApiKey?: boolean
}

export type SettingsAdminContext = {
  userId: string
  role: string
}

export type BugReportSettings = {
  enabled: boolean
  updatedAt: string | null
  source: 'database' | 'defaults'
}

export type BugReportSettingsInput = {
  enabled: boolean
}

type EncryptedSecret = {
  algorithm: 'aes-256-gcm'
  iv: string
  tag: string
  ciphertext: string
}

type StoredMiniMaxCodeHelpSettings = {
  enabled?: unknown
  apiMode?: unknown
  baseUrl?: unknown
  model?: unknown
  timeoutMs?: unknown
  apiKeyEncrypted?: unknown
}

type NormalizedStoredMiniMaxCodeHelpSettings = {
  enabled: boolean
  apiMode: MiniMaxCodeHelpApiMode
  baseUrl: string
  model: string
  timeoutMs: number
  apiKeyEncrypted?: EncryptedSecret
}

const MINIMAX_CODE_HELP_SETTING_KEY = 'minimax_code_help'
const BUG_REPORT_SETTING_KEY = 'bug_report'
const DEFAULT_API_MODE: MiniMaxCodeHelpApiMode = 'anthropic'
const DEFAULT_BASE_URL = 'https://api.minimaxi.com/anthropic'
const DEFAULT_MODEL = 'MiniMax-M2.7'
const DEFAULT_TIMEOUT_MS = 45_000
const MIN_TIMEOUT_MS = 5_000
const MAX_TIMEOUT_MS = 3_000_000
const DEFAULT_BUG_REPORT_ENABLED = true

export async function getMiniMaxCodeHelpAdminSettings(): Promise<MiniMaxCodeHelpAdminSettings> {
  const storedRecord = await readStoredMiniMaxSettingsRecord()
  const stored = storedRecord ? normalizeStoredMiniMaxSettings(storedRecord.value) : null
  const env = readEnvMiniMaxSettings()
  const selected = stored ?? env
  const source = stored ? 'database' : env.fromEnv ? 'environment' : 'defaults'
  const apiKey = stored?.apiKeyEncrypted ? decryptSecret(stored.apiKeyEncrypted) : process.env.MINIMAX_API_KEY || null

  return {
    enabled: selected.enabled,
    configured: selected.enabled && Boolean(apiKey),
    apiMode: selected.apiMode,
    baseUrl: selected.baseUrl,
    model: selected.model,
    timeoutMs: selected.timeoutMs,
    hasStoredApiKey: Boolean(stored?.apiKeyEncrypted),
    hasEnvApiKey: Boolean(process.env.MINIMAX_API_KEY),
    updatedAt: storedRecord?.updatedAt ?? null,
    source,
  }
}

export async function getMiniMaxCodeHelpRuntimeConfig(): Promise<MiniMaxCodeHelpRuntimeConfig> {
  const storedRecord = await readStoredMiniMaxSettingsRecord()
  const stored = storedRecord ? normalizeStoredMiniMaxSettings(storedRecord.value) : null
  const env = readEnvMiniMaxSettings()
  const selected = stored ?? env
  const apiKey = stored?.apiKeyEncrypted ? decryptSecret(stored.apiKeyEncrypted) : process.env.MINIMAX_API_KEY || null

  return {
    enabled: selected.enabled,
    configured: selected.enabled && Boolean(apiKey),
    apiMode: selected.apiMode,
    baseUrl: selected.baseUrl,
    model: selected.model,
    timeoutMs: selected.timeoutMs,
    apiKey,
  }
}

export async function updateMiniMaxCodeHelpAdminSettings(
  input: MiniMaxCodeHelpSettingsInput,
  admin: SettingsAdminContext,
): Promise<MiniMaxCodeHelpAdminSettings> {
  if (!canUseSystemSettingsStore()) {
    throw new ServiceError('db_unconfigured', '数据库未配置，无法保存系统设置。', 503)
  }

  const storedRecord = await readStoredMiniMaxSettingsRecord()
  const current = storedRecord ? normalizeStoredMiniMaxSettings(storedRecord.value) : null
  const apiMode = normalizeApiMode(input.apiMode)
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const model = normalizeModel(input.model)
  const timeoutMs = normalizeTimeoutMs(input.timeoutMs)
  const trimmedApiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : ''

  const next: NormalizedStoredMiniMaxCodeHelpSettings = {
    enabled: input.enabled,
    apiMode,
    baseUrl,
    model,
    timeoutMs,
  }

  if (input.clearApiKey) {
    delete next.apiKeyEncrypted
  } else if (trimmedApiKey) {
    next.apiKeyEncrypted = encryptSecret(trimmedApiKey)
  } else if (current?.apiKeyEncrypted) {
    next.apiKeyEncrypted = current.apiKeyEncrypted
  }

  await upsertSystemSettingWithAudit({
    settingKey: MINIMAX_CODE_HELP_SETTING_KEY,
    value: serializeStoredMiniMaxSettings(next),
    updatedBy: admin.userId,
    audit: admin,
    beforeData: current ? redactStoredMiniMaxSettings(current) : null,
    afterData: redactStoredMiniMaxSettings(next),
    metadata: {
      enabled: next.enabled,
      apiMode: next.apiMode,
      baseUrl: next.baseUrl,
      model: next.model,
      timeoutMs: next.timeoutMs,
      apiKeyChanged: Boolean(trimmedApiKey || input.clearApiKey),
    },
  })

  return getMiniMaxCodeHelpAdminSettings()
}

export async function getBugReportAdminSettings(): Promise<BugReportSettings> {
  return readBugReportSettings()
}

export async function getBugReportRuntimeSettings(): Promise<BugReportSettings> {
  return readBugReportSettings()
}

export async function updateBugReportAdminSettings(
  input: BugReportSettingsInput,
  admin: SettingsAdminContext,
): Promise<BugReportSettings> {
  if (!canUseSystemSettingsStore()) {
    throw new ServiceError('db_unconfigured', '数据库未配置，无法保存系统设置。', 503)
  }

  const before = await readBugReportSettings()
  const after = {
    enabled: input.enabled,
  }

  await upsertSystemSettingWithAudit({
    settingKey: BUG_REPORT_SETTING_KEY,
    value: after,
    updatedBy: admin.userId,
    audit: admin,
    beforeData: { enabled: before.enabled },
    afterData: after,
    metadata: { enabled: after.enabled },
  })

  return getBugReportAdminSettings()
}

function readEnvMiniMaxSettings(): NormalizedStoredMiniMaxCodeHelpSettings & { fromEnv: boolean } {
  const hasEnvConfig = Boolean(
    process.env.MINIMAX_API_MODE ||
      process.env.MINIMAX_BASE_URL ||
      process.env.MINIMAX_MODEL ||
      process.env.MINIMAX_CODE_HELP_ENABLED ||
      process.env.MINIMAX_CODE_HELP_TIMEOUT_MS,
  )

  return {
    enabled: process.env.MINIMAX_CODE_HELP_ENABLED !== 'false',
    apiMode: normalizeApiMode(process.env.MINIMAX_API_MODE || DEFAULT_API_MODE),
    baseUrl: normalizeBaseUrl(process.env.MINIMAX_BASE_URL || DEFAULT_BASE_URL),
    model: normalizeModel(process.env.MINIMAX_MODEL || DEFAULT_MODEL),
    timeoutMs: normalizeTimeoutMs(Number(process.env.MINIMAX_CODE_HELP_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)),
    fromEnv: hasEnvConfig,
  }
}

async function readBugReportSettings(): Promise<BugReportSettings> {
  if (!canUseSystemSettingsStore()) {
    return {
      enabled: DEFAULT_BUG_REPORT_ENABLED,
      updatedAt: null,
      source: 'defaults',
    }
  }

  try {
    const record = await getSystemSetting<{ enabled?: unknown } & Record<string, unknown>>(BUG_REPORT_SETTING_KEY)
    if (!record) {
      return {
        enabled: DEFAULT_BUG_REPORT_ENABLED,
        updatedAt: null,
        source: 'defaults',
      }
    }

    return {
      enabled: typeof record.value.enabled === 'boolean' ? record.value.enabled : DEFAULT_BUG_REPORT_ENABLED,
      updatedAt: record.updatedAt,
      source: 'database',
    }
  } catch {
    return {
      enabled: DEFAULT_BUG_REPORT_ENABLED,
      updatedAt: null,
      source: 'defaults',
    }
  }
}

async function readStoredMiniMaxSettingsRecord() {
  if (!canUseSystemSettingsStore()) return null

  try {
    return await getSystemSetting<StoredMiniMaxCodeHelpSettings & Record<string, unknown>>(MINIMAX_CODE_HELP_SETTING_KEY)
  } catch {
    return null
  }
}

function normalizeStoredMiniMaxSettings(value: StoredMiniMaxCodeHelpSettings): NormalizedStoredMiniMaxCodeHelpSettings {
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : process.env.MINIMAX_CODE_HELP_ENABLED !== 'false',
    apiMode: normalizeApiMode(value.apiMode),
    baseUrl: normalizeBaseUrl(value.baseUrl),
    model: normalizeModel(value.model),
    timeoutMs: normalizeTimeoutMs(value.timeoutMs),
    apiKeyEncrypted: normalizeEncryptedSecret(value.apiKeyEncrypted) ?? undefined,
  }
}

function serializeStoredMiniMaxSettings(
  value: NormalizedStoredMiniMaxCodeHelpSettings,
): StoredMiniMaxCodeHelpSettings & Record<string, unknown> {
  return {
    enabled: value.enabled,
    apiMode: value.apiMode,
    baseUrl: value.baseUrl,
    model: value.model,
    timeoutMs: value.timeoutMs,
    ...(value.apiKeyEncrypted ? { apiKeyEncrypted: value.apiKeyEncrypted } : {}),
  }
}

function redactStoredMiniMaxSettings(value: NormalizedStoredMiniMaxCodeHelpSettings): Record<string, unknown> {
  return {
    enabled: value.enabled,
    apiMode: value.apiMode,
    baseUrl: value.baseUrl,
    model: value.model,
    timeoutMs: value.timeoutMs,
    hasApiKey: Boolean(value.apiKeyEncrypted),
  }
}

function normalizeApiMode(value: unknown): MiniMaxCodeHelpApiMode {
  return value === 'openai' ? 'openai' : DEFAULT_API_MODE
}

function normalizeBaseUrl(value: unknown): string {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_BASE_URL

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new ServiceError('bad_request', 'MiniMax Base URL 格式不正确。', 400)
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ServiceError('bad_request', 'MiniMax Base URL 只支持 http 或 https。', 400)
  }

  return raw.replace(/\/+$/, '')
}

function normalizeModel(value: unknown): string {
  const model = typeof value === 'string' ? value.trim() : ''
  if (!model) return DEFAULT_MODEL
  if (model.length > 120) throw new ServiceError('bad_request', 'MiniMax Model 名称过长。', 400)
  return model
}

function normalizeTimeoutMs(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? DEFAULT_TIMEOUT_MS)
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(parsed)))
}

function normalizeEncryptedSecret(value: unknown): EncryptedSecret | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (
    record.algorithm !== 'aes-256-gcm' ||
    typeof record.iv !== 'string' ||
    typeof record.tag !== 'string' ||
    typeof record.ciphertext !== 'string'
  ) {
    return null
  }

  return {
    algorithm: 'aes-256-gcm',
    iv: record.iv,
    tag: record.tag,
    ciphertext: record.ciphertext,
  }
}

function encryptSecret(secret: string): EncryptedSecret {
  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

function decryptSecret(secret: EncryptedSecret): string | null {
  try {
    const key = getEncryptionKey()
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(secret.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(secret.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(secret.ciphertext, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

function getEncryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new ServiceError('bad_request', '保存 MiniMax API Key 前需要先配置 AUTH_SECRET。', 400)
  }

  return createHash('sha256').update(secret).digest()
}
