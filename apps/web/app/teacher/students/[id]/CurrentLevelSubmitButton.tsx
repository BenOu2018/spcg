'use client'

import { useFormStatus } from 'react-dom'

export function CurrentLevelSubmitButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus()

  return (
    <button className="teacher-button" disabled={disabled || pending} type="submit">
      {pending ? '保存中...' : '保存当前关卡'}
    </button>
  )
}
