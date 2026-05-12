import { createHash } from 'node:crypto'
import { getActivePasswordResetToken } from '@/lib/repositories/password-reset-repository'

export async function getPasswordResetTokenStatus(token: string): Promise<'valid' | 'invalid' | 'expired'> {
  const normalized = token.trim()
  if (!normalized) return 'invalid'
  const record = await getActivePasswordResetToken(hashResetToken(normalized))
  if (!record) return 'invalid'
  if (new Date(record.expiresAt).getTime() <= Date.now()) return 'expired'
  return 'valid'
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
