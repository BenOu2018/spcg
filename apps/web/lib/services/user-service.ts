import type { UserRole } from '@spcg/shared/types'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import { getUserRole, upsertUserRole } from '@/lib/repositories/user-repository'
import { ServiceError } from '@/lib/services/errors'

export async function requireUserRole(userId?: string | null): Promise<UserRole> {
  if (!userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
  return getUserRole(userId)
}

export async function setUserRole(input: {
  userId: string
  role: UserRole
  assignedBy?: string | null
}): Promise<void> {
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
  await upsertUserRole(input)
}
