import { notFound } from 'next/navigation'
import { getAdminUser } from '@/lib/admin-data'
import { requireUserInventory } from '@/lib/services/inventory-service'
import { getAdminSubmissionHistory } from '@/lib/services/submission-service'
import { requireRewardHistory, requireWalletSummary } from '@/lib/services/wallet-service'
import { AdminSubmissionTable } from '../../components/AdminSubmissionTable'
import { deleteAdminUser, resetUserProgress, setUserStatus, setUserTestAccount, updateAdminUser } from '../actions'

type AdminUserDetailPageProps = {
  params: Promise<{ id: string }> | { id: string }
}

export default async function AdminUserDetailPage({ params }: AdminUserDetailPageProps) {
  const { id } = await params
  const [user, wallet, inventory, rewards, submissions] = await Promise.all([
    getAdminUser(id),
    requireWalletSummary(id).catch(() => null),
    requireUserInventory(id).catch(() => []),
    requireRewardHistory(id).catch(() => []),
    getAdminSubmissionHistory({ userId: id, limit: 50 }),
  ])

  if (!user) notFound()

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">User Detail</span>
          <h1>{user.displayName ?? user.email ?? user.id}</h1>
        </div>
        <div className="admin-status-stack">
          <em className={`admin-status admin-status-${user.accountStatus}`}>{user.accountStatus}</em>
          {user.isTestAccount ? <em className="admin-status admin-status-validated">test</em> : null}
        </div>
      </header>

      <section className="admin-detail-grid">
        <article className="admin-panel">
          <h2>Profile</h2>
          <dl className="admin-dl">
            <dt>User ID</dt>
            <dd>{user.id}</dd>
            <dt>Email</dt>
            <dd>{user.email ?? '-'}</dd>
            <dt>Display Name</dt>
            <dd>{user.displayName ?? '-'}</dd>
            <dt>Age</dt>
            <dd>{user.age ?? '-'}</dd>
            <dt>Parent Email</dt>
            <dd>{user.parentEmail ?? '-'}</dd>
            <dt>Admin Role</dt>
            <dd>{user.adminRole ? `${user.adminRole}${user.adminActive ? '' : ' inactive'}` : '-'}</dd>
            <dt>User Role</dt>
            <dd>{user.userRole}</dd>
            <dt>Last Sign In</dt>
            <dd>{user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : '-'}</dd>
            <dt>Notes</dt>
            <dd>{user.notes ?? '-'}</dd>
          </dl>
        </article>

        <article className="admin-panel">
          <h2>Edit User</h2>
          <form action={updateAdminUser} className="admin-form-grid">
            <input name="userId" type="hidden" value={user.id} />
            <label>
              <span>Display name</span>
              <input name="displayName" required defaultValue={user.displayName ?? ''} />
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" required defaultValue={user.email ?? ''} />
            </label>
            <label>
              <span>New password</span>
              <input name="password" type="password" minLength={8} placeholder="Leave blank to keep current" />
            </label>
            <label>
              <span>Parent email</span>
              <input name="parentEmail" type="email" defaultValue={user.parentEmail ?? ''} />
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
        </article>
      </section>

      <section className="admin-detail-grid">
        <article className="admin-panel">
          <h2>Operations</h2>
          <div className="admin-action-stack">
            <StatusButton userId={user.id} status="active" label="Activate" disabled={user.accountStatus === 'active'} />
            <StatusButton userId={user.id} status="suspended" label="Suspend" disabled={user.accountStatus === 'suspended'} />
            <StatusButton userId={user.id} status="deleted" label="Mark deleted" disabled={user.accountStatus === 'deleted'} />
            <TestButton userId={user.id} isTestAccount={!user.isTestAccount} label={user.isTestAccount ? 'Unset test account' : 'Mark test account'} />
            <ResetProgressButton userId={user.id} />
          </div>
        </article>

        <article className="admin-panel admin-danger-panel">
          <h2>Delete User</h2>
          <p className="admin-help-text">Hard delete removes the account and cascades progress, submissions, wallet, and admin role rows.</p>
          <form action={deleteAdminUser} className="admin-action-stack">
            <input name="userId" type="hidden" value={user.id} />
            <label className="admin-inline-field">
              <span>Type DELETE</span>
              <input name="confirm" placeholder="DELETE" />
            </label>
            <button className="admin-button admin-danger-button" type="submit">
              Delete user
            </button>
          </form>
        </article>
      </section>

      <section className="admin-grid-3">
        <AdminFact label="Passed Levels" value={user.passedCount} />
        <AdminFact label="Submissions" value={user.submissionCount} />
        <AdminFact label="Progress Rows" value={user.progress.length} />
        <AdminFact label="Created" value={user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'} />
        <AdminFact label="Coins" value={wallet?.coinTotal ?? 0} />
        <AdminFact label="Garlic" value={wallet?.garlicBalance ?? 0} />
        <AdminFact label="Rank" value={wallet?.rankLabel ?? '青铜'} />
        <AdminFact label="Inventory" value={inventory.length} />
      </section>

      <section className="admin-detail-grid">
        <article className="admin-panel">
          <h2>Reward Wallet</h2>
          <dl className="admin-dl">
            <dt>Title</dt>
            <dd>{wallet?.title ?? '晨雾算力学徒'}</dd>
            <dt>Coins</dt>
            <dd>{wallet?.coinTotal ?? 0}</dd>
            <dt>Garlic</dt>
            <dd>{wallet?.garlicBalance ?? 0}</dd>
            <dt>Rank</dt>
            <dd>{wallet?.rankLabel ?? '青铜'}</dd>
          </dl>
        </article>

        <article className="admin-panel">
          <h2>Recent Rewards</h2>
          <div className="admin-list">
            {rewards.slice(0, 5).map((reward) => (
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

      <section className="admin-stack">
        <header className="admin-page-head">
          <div>
            <span className="admin-eyebrow">Student Work</span>
            <h1>Recent Submissions</h1>
          </div>
          <span className="admin-count">{submissions.length} shown</span>
        </header>
        <AdminSubmissionTable submissions={submissions} emptyText="This student has no submissions yet." />
      </section>

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
