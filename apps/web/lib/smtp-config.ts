export type SmtpConfig = {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  from: string
}

const requiredEnvKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD'] as const

export function getSmtpConfig(): SmtpConfig {
  const envConfig = getEnvSmtpConfig()
  if (envConfig) return envConfig

  throw new Error(
    `SMTP is not configured. Set ${requiredEnvKeys.join(', ')} in .env or server environment variables.`,
  )
}

function getEnvSmtpConfig(): SmtpConfig | null {
  const host = readEnv('SMTP_HOST')
  const user = readEnv('SMTP_USER')
  const password = readEnv('SMTP_PASSWORD')
  const rawPort = readEnv('SMTP_PORT')
  if (!host || !user || !password || !rawPort) return null

  const port = parsePort(rawPort)
  const secure = parseBoolean(readEnv('SMTP_SECURE')) ?? port === 465
  return {
    host,
    port,
    secure,
    user,
    password,
    from: readEnv('SMTP_FROM') || user,
  }
}

function readEnv(key: string): string {
  return process.env[key]?.trim() ?? ''
}

function parseBoolean(value: string): boolean | null {
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function parsePort(value: string | number): number {
  const match = String(value).match(/\d+/)
  const port = match ? Number(match[0]) : NaN
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('SMTP_PORT must be a valid TCP port.')
  }
  return port
}
