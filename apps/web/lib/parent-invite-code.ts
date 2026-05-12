import { createHash, randomBytes } from 'node:crypto'

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

function getParentInviteSecret() {
  return process.env.PARENT_INVITE_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'spcg-parent-invite-dev-secret'
}
