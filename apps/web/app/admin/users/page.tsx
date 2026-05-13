import Link from 'next/link'
import { listAdminUsers, type AdminUser } from '@/lib/admin-data'
import {
  AdminDrawer,
  AdminEmpty,
  AdminFilterBar,
  AdminPageHeader,
  AdminStatCard,
  AdminTabs,
} from '../components/AdminChrome'
import { createAdminUser, setUserStatus, setUserTestAccount } from './actions'

type AdminUsersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

const PAGE_SIZE = 20

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const resolvedSearchParams = await searchParams
  const users = await listAdminUsers()
  const q = readStringParam(resolvedSearchParams?.q)?.trim() ?? ''
  const role = readStringParam(resolvedSearchParams?.role) ?? ''
  const status = readStringParam(resolvedSearchParams?.status) ?? ''
  const page = Math.max(1, readOptionalNumberParam(resolvedSearchParams?.page) ?? 1)
  const drawer = readStringParam(resolvedSearchParams?.drawer)

  const filteredUsers = users.filter((user) => matchesUser(user, { q, role, status }))
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageUsers = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <section className="admin-stack">
      <AdminPageHeader
        actions={
          <Link className="admin-button" href={buildHref('/admin/users', resolvedSearchParams, { drawer: 'create' })}>
            New user
          </Link>
        }
        description="列表优先管理账号、角色和老师归属。创建与高风险操作收进右侧工作抽屉。"
        eyebrow="Accounts"
        meta={<span className="admin-count">{filteredUsers.length} shown</span>}
        title="Users"
      />

      <section className="admin-metrics admin-metrics-wide">
        <AdminStatCard detail="all accounts" label="Total" value={users.length} />
        <AdminStatCard detail="student role" label="Students" value={users.filter((user) => user.userRole === 'student').length} />
        <AdminStatCard detail="teacher role" label="Teachers" value={users.filter((user) => user.userRole === 'teacher').length} />
        <AdminStatCard
          detail="suspended/deleted"
          label="Restricted"
          tone="warn"
          value={users.filter((user) => user.accountStatus !== 'active').length}
        />
      </section>

      <AdminTabs
        items={[
          { href: '/admin/users', label: 'All', active: !role, count: users.length },
          {
            href: buildHref('/admin/users', resolvedSearchParams, { role: 'student', page: null, drawer: null }),
            label: 'Students',
            active: role === 'student',
            count: users.filter((user) => user.userRole === 'student').length,
          },
          {
            href: buildHref('/admin/users', resolvedSearchParams, { role: 'teacher', page: null, drawer: null }),
            label: 'Teachers',
            active: role === 'teacher',
            count: users.filter((user) => user.userRole === 'teacher').length,
          },
          {
            href: buildHref('/admin/users', resolvedSearchParams, { role: 'parent', page: null, drawer: null }),
            label: 'Parents',
            active: role === 'parent',
            count: users.filter((user) => user.userRole === 'parent').length,
          },
          {
            href: buildHref('/admin/users', resolvedSearchParams, { role: 'admin', page: null, drawer: null }),
            label: 'Admins',
            active: role === 'admin',
            count: users.filter((user) => user.userRole === 'admin').length,
          },
        ]}
      />

      <form action="/admin/users" className="admin-panel" method="get">
        <AdminFilterBar>
          <label>
            <span>Search</span>
            <input name="q" placeholder="username, name, id, teacher" defaultValue={q} />
          </label>
          <label>
            <span>Role</span>
            <select name="role" defaultValue={role}>
              <option value="">All roles</option>
              <option value="student">student</option>
              <option value="teacher">teacher</option>
              <option value="parent">parent</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select name="status" defaultValue={status}>
              <option value="">All status</option>
              <option value="active">active</option>
              <option value="suspended">suspended</option>
              <option value="deleted">deleted</option>
            </select>
          </label>
          <button className="admin-button" type="submit">
            Filter
          </button>
        </AdminFilterBar>
      </form>

      <section className="admin-table">
        <div className="admin-table-head admin-user-grid">
          <span>User</span>
          <span>Status</span>
          <span>User Role</span>
          <span>Teacher</span>
          <span>Role</span>
          <span>Progress</span>
          <span>Actions</span>
        </div>
        {pageUsers.map((user) => (
          <article className="admin-table-row admin-user-grid" key={user.id}>
            <div>
              <Link className="admin-title-link" href={`/admin/users/${user.id}`}>
                {user.displayName ?? user.username ?? user.id}
              </Link>
              <small>{user.username}</small>
              {user.phoneVerifiedAt ? <small>手机号已认证</small> : null}
            </div>
            <div className="admin-status-stack">
              <AdminStatus status={user.accountStatus} />
              {user.isTestAccount ? <em className="admin-status admin-status-validated">test</em> : null}
            </div>
            <span>{user.userRole}</span>
            <span>
              {user.teacherOwnerId ? (
                <>
                  <Link className="admin-title-link" href={`/admin/users/${user.teacherOwnerId}`}>
                    {user.teacherOwnerName ?? user.teacherOwnerUsername ?? user.teacherOwnerId}
                  </Link>
                  <small>{user.teacherOwnerUsername ? `@${user.teacherOwnerUsername}` : user.teacherOwnerId}</small>
                </>
              ) : user.userRole === 'student' ? (
                '未绑定'
              ) : (
                '-'
              )}
            </span>
            <span>{user.adminRole ? `${user.adminRole}${user.adminActive ? '' : ' inactive'}` : '-'}</span>
            <span>
              {user.passedCount} passed
              <small>{user.submissionCount} submissions</small>
            </span>
            <div className="admin-row-actions">
              <Link className="admin-small-button" href={`/admin/users/${user.id}`}>
                Detail
              </Link>
              <StatusButton userId={user.id} status="active" label="Activate" disabled={user.accountStatus === 'active'} />
              <StatusButton userId={user.id} status="suspended" label="Suspend" disabled={user.accountStatus === 'suspended'} />
              <TestButton userId={user.id} isTestAccount={!user.isTestAccount} label={user.isTestAccount ? 'Unset test' : 'Mark test'} />
            </div>
          </article>
        ))}
        {pageUsers.length === 0 ? <AdminEmpty>No users match the current filters.</AdminEmpty> : null}
      </section>

      <Pagination
        basePath="/admin/users"
        page={safePage}
        pageCount={pageCount}
        searchParams={resolvedSearchParams}
        total={filteredUsers.length}
      />

      {drawer === 'create' ? (
        <AdminDrawer closeHref={buildHref('/admin/users', resolvedSearchParams, { drawer: null })} title="Create user" width="xl">
          <form action={createAdminUser} className="admin-form-grid admin-form-grid-users">
            <label>
              <span>Display name</span>
              <input name="displayName" required placeholder="Toby" />
            </label>
            <label>
              <span>Username</span>
              <input name="username" required placeholder="toby01" minLength={3} maxLength={24} />
            </label>
            <label>
              <span>Password</span>
              <input name="password" type="password" required minLength={8} placeholder="At least 8 chars" />
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" placeholder="optional@example.com" />
            </label>
            <label>
              <span>Parent email</span>
              <input name="parentEmail" type="email" placeholder="optional parent contact" />
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
                <option value="parent">parent</option>
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
        </AdminDrawer>
      ) : null}
    </section>
  )
}

function Pagination({
  basePath,
  page,
  pageCount,
  searchParams,
  total,
}: {
  basePath: string
  page: number
  pageCount: number
  searchParams?: Record<string, string | string[] | undefined>
  total: number
}) {
  return (
    <div className="admin-pagination">
      <span>
        Page {page} / {pageCount} · {total} records
      </span>
      <div>
        <Link className="admin-small-button" href={buildHref(basePath, searchParams, { page: String(Math.max(1, page - 1)), drawer: null })}>
          Prev
        </Link>
        <Link
          className="admin-small-button"
          href={buildHref(basePath, searchParams, { page: String(Math.min(pageCount, page + 1)), drawer: null })}
        >
          Next
        </Link>
      </div>
    </div>
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

function matchesUser(user: AdminUser, filters: { q: string; role: string; status: string }) {
  if (filters.role && user.userRole !== filters.role) return false
  if (filters.status && user.accountStatus !== filters.status) return false
  if (!filters.q) return true

  const haystack = [
    user.id,
    user.username,
    user.email,
    user.displayName,
    user.teacherOwnerUsername,
    user.teacherOwnerName,
    user.phoneNumber,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(filters.q.toLowerCase())
}

function readStringParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function readOptionalNumberParam(value: string | string[] | undefined): number | null {
  const raw = readStringParam(value)
  if (!raw) return null
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? numeric : null
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
