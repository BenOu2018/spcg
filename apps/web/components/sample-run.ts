import type { Verdict } from '@spcg/shared/types'

export type SampleRunStatus = 'idle' | 'judging' | Verdict['result']

export type SampleRunResult = {
  status: SampleRunStatus
  passed: boolean
}

export type SampleRunResultMap = Record<string, SampleRunResult>
