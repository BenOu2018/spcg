import type { BehaviorEventType } from '@spcg/shared/types'

export type BehaviorClientEventInput = {
  type: BehaviorEventType
  levelId?: string | null
  submissionId?: string | null
  assessmentAttemptId?: string | null
  durationMs?: number | null
  count?: number | null
  result?: string | null
  metadata?: Record<string, unknown>
}

export function emitBehaviorEvent(event: BehaviorClientEventInput): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<BehaviorClientEventInput>('spcg:behavior', { detail: event }))
}
