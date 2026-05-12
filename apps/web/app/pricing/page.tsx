import Link from 'next/link'
import { auth } from '@/auth'
import { TopbarAccountActions } from '@/components/TopbarAccountActions'
import { getUserEntitlement, STUDENT_USER_TYPE_LABELS } from '@/lib/services/entitlement-service'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'
import { requestUpgradeAction } from './actions'

const PLANS = [
  {
    key: 'experience',
    name: '体验版',
    price: '0元',
    badge: '默认注册',
    description: '适合首次体验 SPCG 做题流程。',
    features: ['第 1 级第 1-5 关', '第 1 级段位赛前 2 题', '基础做题、提交、成长页'],
    action: '当前默认权益',
  },
  {
    key: 'invite_test',
    name: '邀请测试',
    price: '内测开放',
    badge: '老师/管理员开通',
    description: '适合参与 1-2 级测试的内部学员。',
    features: ['第 1-2 级全部关卡', '第 1-2 级完整段位赛', '适合课程试运行反馈'],
    action: '申请测试权限',
  },
  {
    key: 'paid_49',
    name: '完整课程版',
    price: '49元',
    badge: '完整课程',
    description: '开放全部关卡和段位赛，适合持续学习。',
    features: ['全部级别关卡', '全部段位赛', '地图推进、金币、段位、背包'],
    action: '申请 49 元档',
  },
  {
    key: 'paid_99',
    name: '高级学习版',
    price: '99元',
    badge: '高级辅助',
    description: '在完整课程基础上增加学习辅助能力。',
    features: ['包含 49 元档全部权益', '题目提示', 'AI 错误分析', '家长成长报告'],
    action: '申请 99 元档',
  },
] as const

export default async function PricingPage() {
  const session = await auth()
  const messages = getStudentUiMessages(await getRequestUiLocale(session?.user?.id))
  const entitlement = session?.user?.id ? await getUserEntitlement(session.user.id) : null

  return (
    <main className="pricing-page">
      <header className="pricing-topbar">
        <Link className="kit-logo" href="/map" aria-label="返回地图">
          <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/logo-spcg.svg" alt="SPCG" />
        </Link>
        <div>
          <strong>升级方案</strong>
        </div>
        <TopbarAccountActions session={session} mapHref="/map" showMapButton messages={messages} />
      </header>

      <section className="pricing-hero">
        {entitlement ? (
          <strong className="pricing-current">当前权益：{entitlement.label}</strong>
        ) : (
          <Link className="pricing-current" href="/auth/sign-in?next=/pricing">
            登录后可提交升级申请
          </Link>
        )}
      </section>

      <section className="pricing-grid">
        {PLANS.map((plan) => {
          const isCurrent = entitlement?.userType === plan.key
          const canRequest = Boolean(session?.user?.id && plan.key !== 'experience' && !isCurrent)
          return (
            <article className={plan.key === 'paid_99' ? 'pricing-card featured' : 'pricing-card'} key={plan.key}>
              <div className="pricing-card-head">
                <span>{plan.badge}</span>
                <h2>{plan.name}</h2>
                <strong>{plan.price}</strong>
                <p>{plan.description}</p>
              </div>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              {canRequest ? (
                <form action={requestUpgradeAction} className="pricing-request-form">
                  <input name="targetPlan" type="hidden" value={plan.key} />
                  <input
                    name="message"
                    placeholder="可填写开通说明，例如班级、老师或付款备注"
                    aria-label="升级申请备注"
                  />
                  <button type="submit">{plan.action}</button>
                </form>
              ) : (
                <button type="button" disabled>
                  {isCurrent ? `当前为${STUDENT_USER_TYPE_LABELS[plan.key]}` : plan.action}
                </button>
              )}
            </article>
          )
        })}
      </section>
    </main>
  )
}
