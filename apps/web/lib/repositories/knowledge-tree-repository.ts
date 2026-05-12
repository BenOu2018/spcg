import type { KnowledgeTagClassification } from '@spcg/shared/types'
import { query } from '@/lib/db'

export type KnowledgePointRegistryRow = {
  id: string
  tag_id: string
  classification: KnowledgeTagClassification
  zh_name: string
  en_name: string
  domain: string
  band_or_level: string
  common_problem_types: string
  recommendation: string
  source_file: string
  source_section: string
  sort_order: number
  metadata: Record<string, unknown>
}

export type UserKnowledgeProgressRow = {
  level_id: string
  passed: boolean
  attempt_count: number
  last_submitted_at: Date | string | null
  knowledge_point: string
  import_meta: Record<string, unknown>
}

export type UserKnowledgeUsageRow = {
  tag_id: string
  classification: KnowledgeTagClassification
  zh_name: string
  en_name: string
  domain: string
  band_or_level: string
  usage_count: number
  passed_level_count: number
  last_used_at: Date | string | null
}

export async function listKnowledgePointRegistryRows(
  classification: KnowledgeTagClassification,
): Promise<KnowledgePointRegistryRow[]> {
  return query<KnowledgePointRegistryRow>(
    `
    SELECT
      id,
      tag_id,
      classification,
      zh_name,
      en_name,
      domain,
      band_or_level,
      common_problem_types,
      recommendation,
      source_file,
      source_section,
      sort_order,
      metadata
    FROM knowledge_points
    WHERE classification = $1
    ORDER BY sort_order ASC, tag_id ASC
    `,
    [classification],
  )
}

export async function listUserKnowledgeProgressRows(userId: string): Promise<UserKnowledgeProgressRow[]> {
  return query<UserKnowledgeProgressRow>(
    `
    SELECT
      p.level_id,
      p.passed,
      p.attempt_count,
      p.last_submitted_at,
      l.knowledge_point,
      l.import_meta
    FROM progress p
    JOIN levels l ON l.id = p.level_id
    WHERE p.user_id = $1
      AND p.attempt_count > 0
    ORDER BY p.last_submitted_at DESC NULLS LAST, p.updated_at DESC
    `,
    [userId],
  )
}

export async function listUserKnowledgeUsageRows(
  userId: string,
  classification: KnowledgeTagClassification,
): Promise<UserKnowledgeUsageRow[]> {
  return query<UserKnowledgeUsageRow>(
    `
    SELECT
      tag_id,
      classification,
      zh_name,
      en_name,
      domain,
      band_or_level,
      usage_count,
      passed_level_count,
      last_used_at
    FROM user_knowledge_usage
    WHERE user_id = $1
      AND classification = $2
      AND usage_count > 0
    ORDER BY last_used_at DESC, usage_count DESC, tag_id ASC
    `,
    [userId, classification],
  )
}
