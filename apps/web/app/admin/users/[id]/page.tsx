import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAdminUser } from '@/lib/admin-data'
import { requireUserInventory } from '@/lib/services/inventory-service'
import { getAdminSubmissionHistory } from '@/lib/services/submission-service'
import { requireRewardHistory, requireWalletSummary } from '@/lib/services/wallet-service'
import { getUserEntitlement, STUDENT_USER_TYPE_OPTIONS } from '@/lib/services/entitlement-service'
import { AdminDrawer, AdminPageHeader, AdminTabs } from '../../components/AdminChrome'
import { AdminSubmissionTable } from '../../components/AdminSubmissionTable'
import { deleteAdminUser, resetUserProgress, setAdminStudentUserType, setUserStatus, setUserTestAccount, updateAdminUser } from '../actions'

type AdminUserDetailPageProps = {
  params: Promise<{ id: string }> | { id: string }
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

const VALID_TABS = new Set(['profile', 'progress', 'submissions', 'rewards', 'settings'])

export default async function AdminUserDetailPage({ params, searchParams }: AdminUserDetailPageProps) {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const tab = normalizeTab(readStringParam(resolvedSearchParams?.tab))
  const drawer = readStringParam(resolvedSearchParams?.drawer)
  const selectedSubmissionId = readStringParam(resolvedSearchParams?.submissionId) ?? null
  const [user, wallet, inventory, rewards, submissions, entitlement] = await Promise.all([
    getAdminUser(id),
    requireWalletSummary(id).catch(() => null),
    requireUserInventory(id).catch(() => []),
    requireRewardHistory(id).catch(() => []),
    getAdminSubmissionHistory({ userId: id, limit: 50 }),
    getUserEntitlement(id).catch(() => null),
  ])

  if (!user) notFound()

  return (
    <section className="admin-stack">
      <AdminPageHeader
        actions={
          <>
            <Link className="admin-secondary-link" href="/admin/users">
              Back
            </Link>
            <Link className="admin-button" href={buildHref(`/admin/users/${user.id}`, resolvedSearchParams, { drawer: 'edit' })}>
              Edit user
            </Link>
          </>
        }
        description={
          <>
            @{user.username} · {user.userRole} · {user.lastSignInAt ? `last sign in ${new Date(user.lastSignInAt).toLocaleString()}` : 'no sign-in record'}
          </>
        }
        eyebrow="User Detail"
        meta={
          <div className="admin-status-stack">
            <em className={`admin-status admin-status-${user.accountStatus}`}>{user.accountStatus}</em>
            {user.isTestAccount ? <em className="admin-status admin-status-validated">test</em> : null}
          </div>
        }
        title={user.displayName ?? user.username ?? user.id}
      />

      <section className="admin-grid-3">
        <AdminFact label="Passed Levels" value={user.passedCount} />
        <AdminFact label="Submissions" value={user.submissionCount} />
        <AdminFact label="Progress Rows" value={user.progress.length} />
        <AdminFact label="Coins" value={wallet?.coinTotal ?? 0} />
        <AdminFact label="Garlic" value={wallet?.garlicBalance ?? 0} />
        <AdminFact label="Rank" value={wallet?.rankLabel ?? '黑铁'} />
        <AdminFact label="Inventory" value={inventory.length} />
        <AdminFact label="User Type" value={user.userRole === 'student' ? entitlement?.label ?? '体验用户' : '-'} />
        <AdminFact label="Created" value={user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'} />
      </section>

      <AdminTabs
        items={[
          { href: buildHref(`/admin/users/${user.id}`, resolvedSearchParams, { tab: 'profile', drawer: null }), label: 'Profile', active: tab === 'profile' },
          {
            href: buildHref(`/admin/users/${user.id}`, resolvedSearchParams, { tab: 'progress', drawer: null }),
            label: 'Progress',
            active: tab === 'progress',
            count: user.progress.length,
          },
          {
            href: buildHref(`/admin/users/${user.id}`, resolvedSearchParams, { tab: 'submissions', drawer: null }),
            label: 'Submissions',
            active: tab === 'submissions',
            count: submissions.length,
          },
          {
            href: buildHref(`/admin/users/${user.id}`, resolvedSearchParams, { tab: 'rewards', drawer: null }),
            label: 'Rewards',
            active: tab === 'rewards',
            count: rewards.length,
          },
          { href: buildHref(`/admin/users/${user.id}`, resolvedSearchParams, { tab: 'settings', drawer: null }), label: 'Settings', active: tab === 'settings' },
        ]}
      />

      {tab === 'profile' ? (
        <section className="admin-detail-grid">
          <article className="admin-panel">
            <div className="admin-panel-head">
              <h2>Profile</h2>
              <Link className="admin-small-button" href={buildHref(`/admin/users/${user.id}`, resolvedSearchParams, { drawer: 'edit' })}>
                Edit
              </Link>
            </div>
            <dl className="admin-dl">
              <dt>User ID</dt>
              <dd>{user.id}</dd>
              <dt>Username</dt>
              <dd>@{user.username}</dd>
              <dt>Email</dt>
              <dd>{user.email ?? '-'}</dd>
              <dt>Phone</dt>
              <dd>{user.phoneVerifiedAt ? '已认证' : user.phoneNumber ? '待认证' : '-'}</dd>
              <dt>Display Name</dt>
              <dd>{user.displayName ?? '-'}</dd>
              <dt>Real Name</dt>
              <dd>{user.realName ?? '-'}</dd>
              <dt>ID Card</dt>
              <dd>{maskIdCardNumber(user.idCardNumber)}</dd>
              <dt>Age</dt>
              <dd>{user.age ?? '-'}</dd>
              <dt>Parent Email</dt>
              <dd>{user.parentEmail ?? '-'}</dd>
              <dt>Admin Role</dt>
              <dd>{user.adminRole ? `${user.adminRole}${user.adminActive ? '' : ' inactive'}` : '-'}</dd>
              <dt>User Role</dt>
              <dd>{user.userRole}</dd>
              <dt>User Type</dt>
              <dd>{user.userRole === 'student' ? entitlement?.label ?? '体验用户' : '-'}</dd>
              <dt>Teacher Owner</dt>
              <dd>
                {user.teacherOwnerId ? (
                  <>
                    <Link className="admin-title-link" href={`/admin/users/${user.teacherOwnerId}`}>
                      {user.teacherOwnerName ?? user.teacherOwnerUsername ?? user.teacherOwnerId}
                    </Link>
                    {user.teacherOwnerUsername ? <small>@{user.teacherOwnerUsername}</small> : null}
                  </>
                ) : user.userRole === 'student' ? (
                  '未绑定'
                ) : (
                  '-'
                )}
              </dd>
              <dt>Notes</dt>
              <dd>{user.notes ?? '-'}</dd>
            </dl>
          </article>

          <article className="admin-panel">
            <h2>Account State</h2>
            <div className="admin-list">
              <div className="admin-list-row">
                <span>Status</span>
                <em className={`admin-status admin-status-${user.accountStatus}`}>{user.accountStatus}</em>
              </div>
              <div className="admin-list-row">
                <span>Test account</span>
                <small>{user.isTestAccount ? 'yes' : 'no'}</small>
              </div>
              <div className="admin-list-row">
                <span>Admin active</span>
                <small>{user.adminActive ? 'yes' : 'no'}</small>
              </div>
            </div>
          </article>
        </section>
      ) : null}

      {tab === 'progress' ? (
        <section className="admin-table">
          <div className="admin-table-head admin-user-progress-grid">
            <span>Level</span>
            <span>Status</span>
            <span>Attempts</span>
            <span>Best Runtime</span>
            <span>Last Submitted</span>
          </div>
          {user.progress.map((progress) => (
            <article className="admin-table-row admin-user-progress-grid" key={progress.levelId}>
              <span>
                {progress.levelTitle}
                <small>{progress.levelId}</small>
              </span>
              <span>{progress.passed ? 'passed' : 'not passed'}</span>
              <span>{progress.attemptCount}</span>
              <span>{progress.bestRuntimeMs === null ? '-' : `${progress.bestRuntimeMs}ms`}</span>
              <span>{progress.lastSubmittedAt ? new Date(progress.lastSubmittedAt).toLocaleString() : '-'}</span>
            </article>
          ))}
          {user.progress.length === 0 ? <p className="admin-empty">No progress records yet.</p> : null}
        </section>
      ) : null}

      {tab === 'submissions' ? (
        <AdminSubmissionTable
          submissions={submissions}
          selectedSubmissionId={selectedSubmissionId}
          emptyText="This student has no submissions yet."
        />
      ) : null}

      {tab === 'rewards' ? (
        <section className="admin-detail-grid">
          <article className="admin-panel">
            <h2>Reward Wallet</h2>
            <dl className="admin-dl">
              <dt>Title</dt>
              <dd>{wallet?.title ?? '黑铁晨雾算力学徒'}</dd>
              <dt>Coins</dt>
              <dd>{wallet?.coinTotal ?? 0}</dd>
              <dt>Garlic</dt>
              <dd>{wallet?.garlicBalance ?? 0}</dd>
              <dt>Rank</dt>
              <dd>{wallet?.rankLabel ?? '黑铁'}</dd>
            </dl>
          </article>

          <article className="admin-panel">
            <h2>Recent Rewards</h2>
            <div className="admin-list">
              {rewards.slice(0, 10).map((reward) => (
                <div className="admin-list-row" key={reward.id}>
                  <span>{reward.source}</span>
                  <small>
                    coin {reward.coinDelta} / garlic {reward.garlicDelta} / item {reward.itemQuantity}
                  </small>
                </div>
              ))}
              {rewards.length === 0 ? <p className="admin-empty">No reward ledger entries yet.</p> : null}
            </div>
          </article>
        </section>
      ) : null}

      {tab === 'settings' ? (
        <section className="admin-detail-grid">
          <article className="admin-panel">
            <div className="admin-panel-head">
              <h2>Operations</h2>
              <Link className="admin-small-button" href={buildHref(`/admin/users/${user.id}`, resolvedSearchParams, { drawer: 'edit' })}>
                Edit profile
              </Link>
            </div>
            <div className="admin-action-stack">
              <StatusButton userId={user.id} status="active" label="Activate" disabled={user.accountStatus === 'active'} />
              <StatusButton userId={user.id} status="suspended" label="Suspend" disabled={user.accountStatus === 'suspended'} />
              <StatusButton userId={user.id} status="deleted" label="Mark deleted" disabled={user.accountStatus === 'deleted'} />
              <TestButton userId={user.id} isTestAccount={!user.isTestAccount} label={user.isTestAccount ? 'Unset test account' : 'Mark test account'} />
              <ResetProgressButton userId={user.id} />
              {user.userRole === 'student' ? (
                <Link className="admin-button" href={buildHref(`/admin/users/${user.id}`, resolvedSearchParams, { drawer: 'user-type' })}>
                  Set user type
                </Link>
              ) : null}
            </div>
          </article>

          <article className="admin-panel admin-danger-panel">
            <div className="admin-panel-head">
              <div>
                <h2>Delete User</h2>
                <p className="admin-help-text">Hard delete removes account data and should only be used for mistakes.</p>
              </div>
              <Link className="admin-button admin-danger-button" href={buildHref(`/admin/users/${user.id}`, resolvedSearchParams, { drawer: 'delete' })}>
                Delete
              </Link>
            </div>
          </article>
        </section>
      ) : null}

      {drawer === 'edit' ? (
        <AdminDrawer closeHref={buildHref(`/admin/users/${user.id}`, resolvedSearchParams, { drawer: null })} title="Edit user" width="xl">
          <form action={updateAdminUser} className="admin-form-grid">
            <input name="userId" type="hidden" value={user.id} />
            <label>
              <span>Username</span>
              <input name="username" required defaultValue={user.username} minLength={3} maxLength={24} />
            </label>
            <label>
              <span>Display name</span>
              <input name="displayName" required defaultValue={user.displayName ?? ''} />
            </label>
            <label>
              <span>Real name</span>
              <input name="realName" defaultValue={user.realName ?? ''} />
            </label>
            <label>
              <span>ID card number</span>
              <input name="idCardNumber" defaultValue={user.idCardNumber ?? ''} placeholder="15 or 18 characters" />
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" defaultValue={user.email ?? ''} />
            </label>
            <label>
              <span>Parent email</span>
              <input name="parentEmail" type="email" defaultValue={user.parentEmail ?? ''} />
            </label>
            <label>
              <span>New password</span>
              <input name="password" type="password" minLength={8} placeholder="Leave blank to keep current" />
            </label>
            <label>
              <span>Age</span>
              <input name="age" type="number" min={0} max={120} defaultValue={user.age ?? ''} />
            </label>
            <label>
              <span>Status</span>
              <select name="status" defaultValue={user.accountStatus}>
                <option value="active">active</option>
                <option value="suspended">suspended</option>
                <option value="deleted">deleted</option>
              </select>
            </label>
            <label>
              <span>User role</span>
              <select name="userRole" defaultValue={user.userRole}>
                <option value="student">student</option>
                <option value="teacher">teacher</option>
                <option value="parent">parent</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <label>
              <span>Admin role</span>
              <select name="adminRole" defaultValue={user.adminRole ?? 'none'}>
                <option value="none">none</option>
                <option value="support">support</option>
                <option value="reviewer">reviewer</option>
                <option value="editor">editor</option>
                <option value="admin">admin</option>
                <option value="owner">owner</option>
              </select>
            </label>
            <label>
              <span>Notes</span>
              <textarea name="notes" defaultValue={user.notes ?? ''} rows={3} />
            </label>
            <label className="admin-checkbox">
              <input name="isTestAccount" type="checkbox" value="true" defaultChecked={user.isTestAccount} />
              <span>Test account</span>
            </label>
            <label className="admin-checkbox">
              <input name="adminActive" type="checkbox" value="true" defaultChecked={user.adminActive} />
              <span>Admin role active</span>
            </label>
            <button className="admin-button" type="submit">
              Save changes
            </button>
          </form>
        </AdminDrawer>
      ) : null}

      {drawer === 'delete' ? (
        <AdminDrawer
          closeHref={buildHref(`/admin/users/${user.id}`, resolvedSearchParams, { drawer: null })}
          description="Type DELETE to confirm hard deletion. This action cascades related user data."
          title="Delete user"
          width="md"
        >
          <form action={deleteAdminUser} className="admin-form-grid">
            <input name="userId" type="hidden" value={user.id} />
            <label className="admin-form-wide">
              <span>Type DELETE</span>
              <input
                name="confirm"
                placeholder="DELETE"
                required
                autoComplete="off"
                pattern="[Dd][Ee][Ll][Ee][Tt][Ee]"
                title="Type DELETE to confirm user deletion."
              />
            </label>
            <button className="admin-button admin-danger-button" type="submit">
              Delete user
            </button>
          </form>
        </AdminDrawer>
      ) : null}

      {drawer === 'user-type' && user.userRole === 'student' ? (
        <AdminDrawer
          closeHref={buildHref(`/admin/users/${user.id}`, resolvedSearchParams, { drawer: null })}
          description="User type controls student entitlements only. It does not change account role."
          title="Set student user type"
          width="md"
        >
          <form action={setAdminStudentUserType} className="admin-form-grid">
            <input name="userId" type="hidden" value={user.id} />
            <label>
              <span>User type</span>
              <select name="userType" defaultValue={entitlement?.userType ?? 'experience'}>
                {STUDENT_USER_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Note</span>
              <textarea name="note" rows={3} placeholder="Payment note, test batch, or manual approval reason" />
            </label>
            <div className="admin-help-text">
              {STUDENT_USER_TYPE_OPTIONS.map((option) => (
                <p key={option.value}>
                  <strong>{option.label}</strong>: {option.description}
                </p>
              ))}
            </div>
            <button className="admin-button" type="submit">
              Save user type
            </button>
          </form>
        </AdminDrawer>
      ) : null}
    </section>
  )
}

function StatusButton({
  userId,
  status,
  label,
  disabled,
}: {
  userId: string
  status: string
  label: string
  disabled: boolean
}) {
  return (
    <form action={setUserStatus}>
      <input name="userId" type="hidden" value={userId} />
      <input name="status" type="hidden" value={status} />
      <button className="admin-button" type="submit" disabled={disabled}>
        {label}
      </button>
    </form>
  )
}

function TestButton({
  userId,
  isTestAccount,
  label,
}: {
  userId: string
  isTestAccount: boolean
  label: string
}) {
  return (
    <form action={setUserTestAccount}>
      <input name="userId" type="hidden" value={userId} />
      <input name="isTestAccount" type="hidden" value={String(isTestAccount)} />
      <button className="admin-button" type="submit">
        {label}
      </button>
    </form>
  )
}

function ResetProgressButton({ userId }: { userId: string }) {
  return (
    <form action={resetUserProgress}>
      <input name="userId" type="hidden" value={userId} />
      <button className="admin-button" type="submit">
        Reset all progress
      </button>
    </form>
  )
}

function AdminFact({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="admin-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function maskIdCardNumber(value?: string | null): string {
  const text = value?.trim() ?? ''
  if (!text) return '-'
  if (text.length <= 8) return text
  return `${text.slice(0, 3)}***********${text.slice(-4)}`
}

function normalizeTab(value: string | undefined) {
  if (value && VALID_TABS.has(value)) return value
  return 'profile'
}

function readStringParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function buildHref(
  path: string,
  searchParams: Record<string, string | string[] | undefined> | undefined,
  updates: Record<string, string | null>,
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    const raw = readStringParam(value)
    if (raw) params.set(key, raw)
  }
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
  }
  const query = params.toString()
  return query ? `${path}?${query}` : path
}
