import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export type GeneratedParentInviteCode = {
  code: string
  hash: string
  preview: string
}

export function generateParentInviteCode(): GeneratedParentInviteCode {
  const raw = randomBytes(6).toString('hex').toUpperCase()
  const code = `SPCG-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
  return {
    code,
    hash: hashParentInviteCode(code),
    preview: code.slice(-4),
  }
}

export function normalizeParentInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]+/g, '')
}

export function hashParentInviteCode(code: string): string {
  return createHash('sha256')
    .update(`${getParentInviteSecret()}:${normalizeParentInviteCode(code)}`)
    .digest('hex')
}

export type EncryptedParentInviteCode = {
  algorithm: 'aes-256-gcm'
  iv: string
  tag: string
  ciphertext: string
}

export function encryptParentInviteCode(code: string): EncryptedParentInviteCode {
  const key = getParentInviteEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

export function decryptParentInviteCode(value: Record<string, unknown> | null | undefined): string | null {
  if (!value) return null
  if (
    value.algorithm !== 'aes-256-gcm' ||
    typeof value.iv !== 'string' ||
    typeof value.tag !== 'string' ||
    typeof value.ciphertext !== 'string'
  ) {
    return null
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', getParentInviteEncryptionKey(), Buffer.from(value.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

function getParentInviteEncryptionKey(): Buffer {
  return createHash('sha256').update(getParentInviteSecret()).digest()
}

function getParentInviteSecret() {
  return process.env.PARENT_INVITE_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'spcg-parent-invite-dev-secret'
}
