import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import { listUserInventory } from '@/lib/repositories/reward-repository'
import { ServiceError } from '@/lib/services/errors'

export async function requireUserInventory(userId?: string | null) {
  if (!userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
  return listUserInventory(userId)
}
