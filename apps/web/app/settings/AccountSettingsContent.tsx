import Link from 'next/link'
import { ArrowLeft, LogOut, ShieldCheck } from 'lucide-react'
import { signOutAction } from '@/app/auth/actions'
import {
  requestPhoneVerificationAction,
  updateAccountProfileAction,
  updatePasswordAction,
  updateUiLocaleAction,
  verifyPhoneCodeAction,
} from '@/app/settings/actions'
import { SettingsTabFrame } from '@/components/SettingsTabFrame'
import type { SettingsTabItem } from '@/components/SettingsTabs'
import { requireUser } from '@/lib/auth-guard'
import { getAccountSettings, getPhoneVerificationSummary } from '@/lib/services/account-settings-service'
import { getMyParentInviteSummary } from '@/lib/services/student-parent-invite-service'
import { getStudentUiMessages, SUPPORTED_UI_LOCALES } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'

export type SettingsSearchParams = Partial<
  Record<'tab' | 'profile' | 'password' | 'phone' | 'phoneNumber' | 'devCode' | 'language', string | string[]>
>

type SettingsTab = 'profile' | 'language' | 'phone' | 'parentBinding' | 'security'

type AccountSettingsContentProps = {
  mode?: 'page' | 'modal'
  searchParams?: SettingsSearchParams
}

export async function AccountSettingsContent({ mode = 'page', searchParams = {} }: AccountSettingsContentProps) {
  const params = normalizeSearchParams(searchParams)
  const session = await requireUser('/settings')
  const activeTab = normalizeSettingsTab(params.tab)
  const [account, locale, parentInvite] = await Promise.all([
    getAccountSettings(session.user.id),
    getRequestUiLocale(session.user.id),
    getMyParentInviteSummary(session.user.id).catch(() => null),
  ])
  const messages = getStudentUiMessages(locale)
  const displayName = account?.displayName ?? session.user.name ?? 'SPCG 学员'
  const avatarUrl = account?.avatarUrl ?? ''
  const phone = getPhoneVerificationSummary(account)
  const pendingPhoneNumber = params.phoneNumber ?? phone.phoneNumber ?? ''
  const identityLabel = account?.username ?? session.user.username ?? session.user.email ?? session.user.id
  const tabs: Array<SettingsTabItem & { value: SettingsTab }> = [
    { value: 'profile', label: messages.settings.tabProfile, body: messages.settings.profileBody },
    { value: 'language', label: messages.settings.tabLanguage, body: messages.settings.languageBody },
    { value: 'phone', label: messages.settings.tabPhone, body: messages.settings.phoneBody },
    { value: 'parentBinding', label: messages.settings.tabParentBinding, body: messages.settings.parentBindingBody },
    { value: 'security', label: messages.settings.tabSecurity, body: messages.settings.passwordBody },
  ]
  const replaceTabNavigation = mode === 'modal'
  const layoutClassName = [
    'settings-layout',
    mode === 'modal' ? 'settings-layout-modal' : '',
    mode === 'modal' ? `settings-layout-tab-${activeTab}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      {mode === 'page' ? (
        <Link className="profile-back-button" href="/map" aria-label="返回地图">
          <ArrowLeft size={18} />
          <span>{messages.common.backToMap}</span>
        </Link>
      ) : null}

      <section className={layoutClassName}>
        <header className="settings-hero">
          <div className="settings-avatar-preview" aria-label="当前头像">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{displayName.slice(0, 1).toUpperCase()}</span>}
          </div>
          <div>
            <span className="eyebrow">{messages.settings.eyebrow}</span>
            <h1>{messages.settings.title}</h1>
            <p>
              {identityLabel}
              {phone.phoneVerified ? <span className="settings-verified-badge">{messages.settings.phoneVerified}</span> : null}
            </p>
          </div>
        </header>

        <SettingsTabFrame
          initialTab={activeTab}
          label={messages.settings.title}
          replaceTabNavigation={replaceTabNavigation}
          tabs={tabs}
        >
          <div className="settings-tab-panel" data-settings-tab-panel="profile">
            <form className="settings-panel" action={updateAccountProfileAction}>
              <div>
                <h2>{messages.settings.profileTitle}</h2>
                <p>{messages.settings.profileBody}</p>
              </div>
              {profileMessage(params.profile, messages)}
              <input name="currentAvatarUrl" type="hidden" value={avatarUrl} />
              <label>
                <span>{messages.settings.displayName}</span>
                <input name="displayName" defaultValue={displayName} minLength={2} maxLength={24} required />
              </label>
              <label className="settings-file-field">
                <span>{messages.settings.avatarFile}</span>
                <input name="avatarFile" type="file" accept="image/png,image/jpeg,image/gif" />
                <small>{messages.settings.avatarHelp}</small>
              </label>
              <button className="game-start-button" type="submit">
                {messages.settings.saveProfile}
              </button>
            </form>
          </div>

          <div className="settings-tab-panel" data-settings-tab-panel="language">
            <form className="settings-panel" action={updateUiLocaleAction}>
              <div>
                <h2>{messages.settings.languageTitle}</h2>
                <p>{messages.settings.languageBody}</p>
              </div>
              {languageMessage(params.language, messages)}
              <label>
                <span>{messages.settings.languageLabel}</span>
                <select name="uiLocale" defaultValue={account?.uiLocale ?? locale}>
                  {SUPPORTED_UI_LOCALES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.nativeLabel}
                    </option>
                  ))}
                </select>
              </label>
              <button className="game-start-button" type="submit">
                {messages.settings.saveLanguage}
              </button>
            </form>
          </div>

          <div className="settings-tab-panel" data-settings-tab-panel="phone">
            <section className="settings-panel">
              <div>
                <h2>{messages.settings.phoneTitle}</h2>
                <p>{messages.settings.phoneBody}</p>
              </div>
              {phoneMessage(params.phone, messages)}
              {params.devCode ? (
                <p className="settings-dev-code">
                  开发验证码：<strong>{params.devCode}</strong>
                </p>
              ) : null}
              <form className="settings-inline-form" action={requestPhoneVerificationAction}>
                <label>
                  <span>{messages.settings.phoneNumber}</span>
                  <input name="phoneNumber" defaultValue={pendingPhoneNumber} placeholder="13800138000" required />
                </label>
                <button className="game-start-button" type="submit">
                  {messages.settings.sendCode}
                </button>
              </form>
              <form className="settings-inline-form" action={verifyPhoneCodeAction}>
                <input name="phoneNumber" type="hidden" value={pendingPhoneNumber} />
                <label>
                  <span>{messages.settings.code}</span>
                  <input name="code" inputMode="numeric" minLength={6} maxLength={6} placeholder="6位数字" required />
                </label>
                <button className="game-start-button" type="submit">
                  {messages.settings.verifyPhone}
                </button>
              </form>
              <div className="settings-session-card">
                <ShieldCheck size={22} />
                <span>
                  {phone.phoneVerified
                    ? messages.settings.phoneVerified
                    : phone.status === 'pending'
                      ? messages.settings.phonePending
                      : messages.settings.phoneUnboundShort}
                </span>
                <strong>{phone.phoneNumberMasked ?? messages.settings.phoneUnbound}</strong>
              </div>
            </section>
          </div>

          <div className="settings-tab-panel" data-settings-tab-panel="parentBinding">
            <section className="settings-panel">
              <div>
                <h2>{messages.settings.parentBindingTitle}</h2>
                <p>{messages.settings.parentBindingBody}</p>
              </div>
              <div className="settings-invite-card">
                <div>
                  <span>{messages.settings.parentInvite}</span>
                  <strong>{inviteStatusText(parentInvite, messages)}</strong>
                </div>
                {(parentInvite?.boundParentCount ?? 0) > 0 ? (
                  <p>{messages.settings.inviteBoundBody}</p>
                ) : parentInvite?.inviteCode ? (
                  <p>
                    {messages.settings.invitePreview}：<b>{parentInvite.inviteCode}</b>
                  </p>
                ) : (
                  <p>
                    {messages.settings.inviteUnavailable} {messages.settings.askTeacherResetInvite}
                  </p>
                )}
                {parentInvite?.rotatedAt ? <small>{new Date(parentInvite.rotatedAt).toLocaleString()}</small> : null}
              </div>
              <div className="settings-session-card">
                <ShieldCheck size={22} />
                <span>{messages.settings.boundParentCount}</span>
                <strong>{parentInvite?.boundParentCount ?? 0}</strong>
              </div>
            </section>
          </div>

          <div className="settings-tab-panel" data-settings-tab-panel="security">
            <div className="settings-security-grid">
              <form className="settings-panel" action={updatePasswordAction}>
                <div>
                  <h2>{messages.settings.passwordTitle}</h2>
                  <p>{messages.settings.passwordBody}</p>
                </div>
                {passwordMessage(params.password, messages)}
                <label>
                  <span>{messages.settings.currentPassword}</span>
                  <input name="currentPassword" type="password" autoComplete="current-password" required />
                </label>
                <label>
                  <span>{messages.settings.nextPassword}</span>
                  <input name="nextPassword" type="password" autoComplete="new-password" minLength={8} required />
                </label>
                <label>
                  <span>{messages.settings.confirmPassword}</span>
                  <input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
                </label>
                <button className="game-start-button" type="submit">
                  {messages.settings.updatePassword}
                </button>
              </form>

              <section className="settings-panel settings-session-panel">
                <div>
                  <h2>{messages.settings.sessionTitle}</h2>
                  <p>{messages.settings.sessionBody}</p>
                </div>
                <div className="settings-session-card">
                  <ShieldCheck size={22} />
                  <span>{messages.settings.signedIn}</span>
                  <strong>{identityLabel}</strong>
                </div>
                <form action={signOutAction}>
                  <button className="settings-logout-button" type="submit">
                    <LogOut size={17} />
                    {messages.common.signOut}
                  </button>
                </form>
              </section>
            </div>
          </div>
        </SettingsTabFrame>
      </section>
    </>
  )
}

function normalizeSearchParams(searchParams: SettingsSearchParams) {
  return {
    tab: firstParam(searchParams.tab),
    profile: firstParam(searchParams.profile),
    password: firstParam(searchParams.password),
    phone: firstParam(searchParams.phone),
    phoneNumber: firstParam(searchParams.phoneNumber),
    devCode: firstParam(searchParams.devCode),
    language: firstParam(searchParams.language),
  }
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function normalizeSettingsTab(value: string | undefined): SettingsTab {
  if (value === 'language' || value === 'phone' || value === 'parentBinding' || value === 'security') return value
  return 'profile'
}

function inviteStatusText(
  invite: Awaited<ReturnType<typeof getMyParentInviteSummary>>,
  messages: ReturnType<typeof getStudentUiMessages>,
) {
  if ((invite?.boundParentCount ?? 0) > 0) return messages.settings.inviteBound
  const status = invite?.inviteStatus ?? 'missing'
  if (status === 'active') return messages.settings.inviteActive
  if (status === 'revoked') return messages.settings.inviteRevoked
  return messages.settings.inviteMissing
}

function profileMessage(code: string | undefined, messages: ReturnType<typeof getStudentUiMessages>) {
  if (!code) return null
  const messageMap: Record<string, string> = {
    saved: '资料已保存。',
    'invalid-name': '显示昵称需要 2-24 个字符。',
    'invalid-avatar': '头像路径异常，请重新上传图片。',
    'avatar-type': '头像只支持 PNG、JPG 或 GIF。',
    'avatar-compress-failed': '头像压缩失败，请换一张图片再试。',
    'avatar-save-failed': '头像保存失败，请稍后再试。',
  }
  return <p className={code === 'saved' ? 'settings-message' : 'settings-error'}>{messageMap[code] ?? messages.settings.profileFailed}</p>
}

function passwordMessage(code: string | undefined, messages: ReturnType<typeof getStudentUiMessages>) {
  if (!code) return null
  const messageMap: Record<string, string> = {
    saved: '密码已更新。',
    'too-short': '新密码至少需要 8 位。',
    mismatch: '两次输入的新密码不一致。',
    'wrong-current': '当前密码不正确。',
  }
  return <p className={code === 'saved' ? 'settings-message' : 'settings-error'}>{messageMap[code] ?? messages.settings.passwordFailed}</p>
}

function phoneMessage(code: string | undefined, messages: ReturnType<typeof getStudentUiMessages>) {
  if (!code) return null
  const messageMap: Record<string, string> = {
    sent: '验证码已生成，请使用下方开发验证码完成验证。',
    verified: '手机号已验证。',
    'invalid-phone': '手机号格式不正确。',
    'phone-taken': '这个手机号已经绑定到其他账号。',
    'code-missing': '请先发送验证码。',
    'code-expired': '验证码已过期，请重新发送。',
    'code-invalid': '验证码不正确。',
    'too-many-attempts': '错误次数太多，请重新发送验证码。',
  }
  return (
    <p className={code === 'sent' || code === 'verified' ? 'settings-message' : 'settings-error'}>
      {messageMap[code] ?? messages.settings.phoneFailed}
    </p>
  )
}

function languageMessage(code: string | undefined, messages: ReturnType<typeof getStudentUiMessages>) {
  if (!code) return null
  const text = code === 'saved' ? messages.settings.saved : messages.settings.languageFailed
  return <p className={code === 'saved' ? 'settings-message' : 'settings-error'}>{text}</p>
}
