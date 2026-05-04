import type { Progress } from '@spcg/shared/types'
import { progressRecords as mockProgressRecords } from '@/lib/mock-data'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import { listUserProgress } from '@/lib/repositories/progress-repository'
import { ServiceError } from '@/lib/services/errors'

export async function getProgressForUser(input: {
  userId?: string | null
  allowMockFallback?: boolean
}): Promise<Progress[]> {
  const allowMockFallback = input.allowMockFallback ?? false
  if (!input.userId) return allowMockFallback ? mockProgressRecords : []
  if (!isDatabaseConfigured()) {
    if (allowMockFallback) return mockProgressRecords
    throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
  }

  try {
    return await listUserProgress(input.userId)
  } catch (error) {
    if (allowMockFallback) {
      console.warn(`Failed to load progress, using mock progress: ${error instanceof Error ? error.message : String(error)}`)
      return mockProgressRecords
    }

    throw error
  }
}
