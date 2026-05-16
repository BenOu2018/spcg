'use client'

import Link from 'next/link'
import { useState } from 'react'
import { TeacherDrawer } from '../../components/TeacherChrome'

type CurrentLevelDrawerLinkProps = {
  href: string
  closeHref: string
}

export function CurrentLevelDrawerLink({ href, closeHref }: CurrentLevelDrawerLinkProps) {
  const [pending, setPending] = useState(false)

  return (
    <>
      <Link
        className="teacher-button secondary"
        href={href}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
          setPending(true)
        }}
      >
        设置当前关卡
      </Link>
      {pending ? (
        <TeacherDrawer title="设置当前关卡" description="正在加载可选关卡数据..." closeHref={closeHref}>
          <div className="teacher-drawer-loading" role="status" aria-live="polite">
            <span aria-hidden="true" />
            <strong>正在加载关卡数据...</strong>
            <p>稍等一下，表单会自动出现。</p>
          </div>
        </TeacherDrawer>
      ) : null}
    </>
  )
}
