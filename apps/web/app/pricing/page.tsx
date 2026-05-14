import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { StudentUserType } from '@spcg/shared/types'
import { PricingConsultButton } from '@/components/PricingConsultButton'
import { requireUser } from '@/lib/auth-guard'
import { getUserRole } from '@/lib/repositories/user-repository'
import { getUserEntitlement } from '@/lib/services/entitlement-service'

export const dynamic = 'force-dynamic'

type PricingPlan = {
  id: StudentUserType
  name: string
  badge: string
  price: string
  originalPrice?: string
  summary: string
  features: string[]
  featured?: boolean
}

type CapabilityRow = {
  label: string
  values: Record<StudentUserType, string>
}

const PRICING_USER_TYPE_LABELS: Record<StudentUserType, string> = {
  experience: '体验用户',
  invite_test: '邀请测试用户',
  paid_49: '49元完整课程',
  paid_99: '99元高级学习',
}

const plans: PricingPlan[] = [
  {
    id: 'experience',
    name: '体验用户',
    badge: '默认权益',
    price: '¥0',
    summary: '适合初次体验 SPCG 的学生，保留基础学习路径和段位赛入口。',
    features: ['第一级前 5 关', '段位赛前 2 题', '基础地图与成长记录'],
  },
  {
    id: 'invite_test',
    name: '邀请用户',
    badge: '邀请开通',
    price: '邀请开通',
    summary: '适合受邀测试学生，完整体验前两级课程节奏。',
    features: ['前 2 级关卡开放', '前 2 级段位赛开放', '保留基础学习数据'],
  },
  {
    id: 'paid_49',
    name: '完整课程',
    badge: '高性价比',
    price: '¥49',
    originalPrice: '原价 ¥99',
    summary: '开放全部关卡和段位赛，适合持续刷题提升。',
    features: ['全部关卡开放', '全部段位赛开放', '完整学习进度记录'],
  },
  {
    id: 'paid_99',
    name: '高级学习',
    badge: '全功能',
    price: '¥99',
    originalPrice: '原价 ¥199',
    summary: '完整开放学习、AI 分析、家长报告和学员学习管理。',
    features: ['全部关卡与段位赛', 'AI 分析与提示能力', '家长报告与学习管理'],
    featured: true,
  },
]

const capabilityRows: CapabilityRow[] = [
  {
    label: '关卡开放',
    values: {
      experience: '第一级前 5 关',
      invite_test: '前 2 级',
      paid_49: '全部开放',
      paid_99: '全部开放',
    },
  },
  {
    label: '段位赛',
    values: {
      experience: '前 2 题',
      invite_test: '前 2 级',
      paid_49: '全部开放',
      paid_99: '全部开放',
    },
  },
  {
    label: 'AI 分析',
    values: {
      experience: '—',
      invite_test: '—',
      paid_49: '—',
      paid_99: '✓',
    },
  },
  {
    label: '家长报告',
    values: {
      experience: '—',
      invite_test: '—',
      paid_49: '—',
      paid_99: '✓',
    },
  },
  {
    label: '学员学习管理',
    values: {
      experience: '—',
      invite_test: '—',
      paid_49: '—',
      paid_99: '✓',
    },
  },
]

export default function PricingPage() {
  return <PricingContent />
}

async function PricingContent() {
  const session = await requireUser('/pricing')
  const [role, entitlement] = await Promise.all([
    getUserRole(session.user.id),
    getUserEntitlement(session.user.id),
  ])

  const canPreviewPricing = role === 'admin'
  if (!canPreviewPricing && (role !== 'student' || entitlement.studentEnrollmentType !== 'online')) {
    redirect('/map')
  }

  const currentUserType = role === 'student' ? entitlement.storedUserType ?? entitlement.userType : null
  const currentPlanLabel = currentUserType ? PRICING_USER_TYPE_LABELS[currentUserType] : '管理员预览'

  return (
    <main className="pricing-page">
      <section className="pricing-shell">
        <header className="pricing-page-head">
          <div>
            <span className="pricing-kicker">SPCG Membership</span>
            <h1>SPCG 会员方案</h1>
            <p>选择适合当前阶段的学习权益。价格页仅用于展示方案，请联系老师或管理员开通。</p>
          </div>
          <div className="pricing-head-actions">
            <span className="pricing-current-badge">{currentPlanLabel}</span>
            <Link className="pricing-back-link" href="/map">返回地图</Link>
          </div>
        </header>

        <section className="pricing-grid" aria-label="会员套餐">
          {plans.map((plan) => {
            const isCurrent = currentUserType === plan.id
            return (
              <article className={`pricing-card${plan.featured ? ' featured' : ''}${isCurrent ? ' current' : ''}`} key={plan.id}>
                <div className="pricing-card-head">
                  <span>{isCurrent ? '当前权益' : plan.badge}</span>
                  <h2>{plan.name}</h2>
                  <strong>{plan.price}</strong>
                  {plan.originalPrice ? <em>{plan.originalPrice}</em> : null}
                </div>
                <p>{plan.summary}</p>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                {isCurrent ? <span className="pricing-card-action current">当前权益</span> : <PricingConsultButton />}
              </article>
            )
          })}
        </section>

        <section className="pricing-compare-panel">
          <div className="pricing-compare-head">
            <div>
              <h2>能力对比</h2>
              <span>按当前线上会员权益展示，不包含线下学员专属安排。</span>
            </div>
          </div>
          <div className="pricing-compare-table" role="table" aria-label="会员能力对比">
            <div className="pricing-compare-row heading" role="row">
              <span role="columnheader">能力</span>
              {plans.map((plan) => (
                <strong role="columnheader" key={plan.id}>{plan.name}</strong>
              ))}
            </div>
            {capabilityRows.map((row) => (
              <div className="pricing-compare-row" role="row" key={row.label}>
                <span role="rowheader">{row.label}</span>
                {plans.map((plan) => (
                  <strong className={row.values[plan.id] === '✓' ? 'available' : undefined} role="cell" key={plan.id}>
                    {row.values[plan.id]}
                  </strong>
                ))}
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}
