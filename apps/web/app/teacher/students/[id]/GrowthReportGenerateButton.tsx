'use client'

import { useFormStatus } from 'react-dom'

export function GrowthReportGenerateButton() {
  const { pending } = useFormStatus()

  return (
    <>
      <button className="teacher-button" disabled={pending} type="submit">
        {pending ? '生成中...' : '生成报告'}
      </button>
      {pending ? (
        <p aria-live="polite" className="teacher-form-note">
          正在生成家长学习报告。你可以先退出此面板，生成完成后会出现在家长报告列表中。
        </p>
      ) : null}
    </>
  )
}
