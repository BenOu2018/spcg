import type { WalletSummary } from '@spcg/shared/types'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import { getWallet, listRewardLedger, listUserTitleRecords } from '@/lib/repositories/reward-repository'
import { ServiceError } from '@/lib/services/errors'

export async function requireWalletSummary(userId?: string | null): Promise<WalletSummary> {
  if (!userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
  return getWallet(userId)
}

export async function requireRewardHistory(userId?: string | null) {
  if (!userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
  return listRewardLedger(userId)
}

export async function requireTitleHistory(userId?: string | null) {
  if (!userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
  return listUserTitleRecords(userId)
}
