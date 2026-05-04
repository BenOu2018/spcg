import { Trophy } from 'lucide-react'
import type { Level, Progress } from '@spcg/shared/types'

type ProgressSummaryProps = {
  levels: Level[]
  progress: Progress[]
  compact?: boolean
}

export function ProgressSummary({ levels, progress, compact = false }: ProgressSummaryProps) {
  const passed = progress.filter((item) => item.passed).length
  const total = levels.length
  const ratio = total > 0 ? Math.round((passed / total) * 100) : 0

  return (
    <aside className={compact ? 'progress-summary compact' : 'progress-summary'}>
      <div className="summary-head">
        <Trophy size={20} />
        <span>{passed}/{total}</span>
      </div>
      <div className="progress-track">
        <span style={{ width: `${ratio}%` }} />
      </div>
      {!compact ? (
        <p>保持节奏，一次只处理当前关卡。</p>
      ) : null}
    </aside>
  )
}
