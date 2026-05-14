'use client'

import { X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

export function PricingConsultButton() {
  const [open, setOpen] = useState(false)
  const titleId = useId()

  useEffect(() => {
    if (!open) return undefined

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  return (
    <>
      <button className="pricing-card-action" type="button" onClick={() => setOpen(true)}>
        咨询老师/管理员
      </button>
      {open ? (
        <div className="pricing-consult-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <section
            aria-labelledby={titleId}
            aria-modal="true"
            className="pricing-consult-dialog"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="pricing-consult-close" type="button" aria-label="关闭咨询二维码" onClick={() => setOpen(false)}>
              <X size={18} strokeWidth={2.4} />
            </button>
            <div>
              <span className="pricing-consult-kicker">SPCG 咨询</span>
              <h2 id={titleId}>添加客服微信</h2>
              <p>扫码咨询开通会员方案</p>
            </div>
            <img className="pricing-consult-qr" src="/assets/wechat-consult.png" alt="客服微信二维码" />
          </section>
        </div>
      ) : null}
    </>
  )
}
