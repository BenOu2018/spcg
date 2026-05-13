'use client'

import { useFormStatus } from 'react-dom'

export function BehaviorAnalysisGenerateButton() {
  const { pending } = useFormStatus()

  return (
    <button className="teacher-button" disabled={pending} type="submit">
      {pending ? '生成中...' : '生成分析'}
    </button>
  )
}
