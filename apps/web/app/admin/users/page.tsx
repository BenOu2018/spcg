import Link from 'next/link'
import { listAdminUsers } from '@/lib/admin-data'
import { createAdminUser, setUserStatus, setUserTestAccount } from './actions'

export default async function AdminUsersPage() {
  const users = await listAdminUsers()

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Accounts</span>
          <h1>Users</h1>
        </div>
        <span className="admin-count">{users.length} total</span>
      </header>

      <section className="admin-panel">
        <h2>Create User</h2>
        <form action={createAdminUser} className="admin-form-grid admin-form-grid-users">
          <label>
            <span>Display name</span>
            <input name="displayName" required placeholder="Toby" />
          </label>
          <label>
            <span>Email</span>
            <input name="email" type="email" required placeholder="toby@spcg.local" />
          </label>
          <label>
            <span>Password</span>
            <input name="password" type="password" required minLength={8} placeholder="At least 8 chars" />
          </label>
          <label>
            <span>Parent email</span>
            <input name="parentEmail" type="email" placeholder="parent@example.com" />
          </label>
          <label>
            <span>Age</span>
            <input name="age" type="number" min={0} max={120} placeholder="10" />
          </label>
          <label>
            <span>Status</span>
            <select name="status" defaultValue="active">
              <option value="active">active</option>
              <option value="suspended">suspended</option>
              <option value="deleted">deleted</option>
            </select>
          </label>
          <label>
            <span>User role</span>
            <select name="userRole" defaultValue="student">
              <option value="student">student</option>
              <option value="teacher">teacher</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <label>
            <span>Admin role</span>
            <select name="adminRole" defaultValue="none">
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
            <input name="notes" placeholder="Internal note" />
          </label>
          <label className="admin-checkbox">
            <input name="isTestAccount" type="checkbox" value="true" />
            <span>Test account</span>
          </label>
          <label className="admin-checkbox">
            <input name="adminActive" type="checkbox" value="true" defaultChecked />
            <span>Admin role active</span>
          </label>
          <button className="admin-button" type="submit">
            Create user
          </button>
        </form>
      </section>

      <section className="admin-table">
        <div className="admin-table-head admin-user-grid">
          <span>User</span>
          <span>Status</span>
          <span>User Role</span>
          <span>Role</span>
          <span>Progress</span>
          <span>Actions</span>
        </div>
        {users.map((user) => (
          <article className="admin-table-row admin-user-grid" key={user.id}>
            <div>
              <Link className="admin-title-link" href={`/admin/users/${user.id}`}>
                {user.displayName ?? user.email ?? user.id}
              </Link>
              <small>{user.email ?? user.id}</small>
            </div>
            <div className="admin-status-stack">
              <AdminStatus status={user.accountStatus} />
              {user.isTestAccount ? <em className="admin-status admin-status-validated">test</em> : null}
            </div>
            <span>{user.userRole}</span>
            <span>{user.adminRole ? `${user.adminRole}${user.adminActive ? '' : ' inactive'}` : '-'}</span>
            <span>
              {user.passedCount} passed
              <small>{user.submissionCount} submissions</small>
            </span>
            <div className="admin-row-actions">
              <StatusButton userId={user.id} status="active" label="Activate" disabled={user.accountStatus === 'active'} />
              <StatusButton userId={user.id} status="suspended" label="Suspend" disabled={user.accountStatus === 'suspended'} />
              <TestButton userId={user.id} isTestAccount={!user.isTestAccount} label={user.isTestAccount ? 'Unset test' : 'Mark test'} />
            </div>
          </article>
        ))}
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
      <button className="admin-small-button" type="submit" disabled={disabled}>
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
      <button className="admin-small-button" type="submit">
        {label}
      </button>
    </form>
  )
}

function AdminStatus({ status }: { status: string }) {
  return <em className={`admin-status admin-status-${status}`}>{status}</em>
}
