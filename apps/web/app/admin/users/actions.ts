'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { UserRole } from '@spcg/shared/types'
import type { PoolClient } from 'pg'
import { requireAdmin, type AdminContext } from '@/lib/admin-auth'
import type { UserAccountStatus } from '@/lib/admin-data'
import { isDbConfigured, withTransaction } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { isValidUsername, normalizeUsername } from '@/lib/user-identity'
import { isStudentUserType, setStudentUserType } from '@/lib/services/entitlement-service'

const validStatuses = new Set<UserAccountStatus>(['active', 'suspended', 'deleted'])
const validAdminRoles = new Set(['owner', 'admin', 'editor', 'reviewer', 'support'])
const validUserRoles = new Set<UserRole>(['admin', 'teacher', 'student', 'parent'])

type AdminRoleFormValue = 'none' | 'owner' | 'admin' | 'editor' | 'reviewer' | 'support'

export async function createAdminUser(formData: FormData) {
  const username = normalizeUsername(readRequired(formData, 'username'))
  const email = readOptionalEmail(formData, 'email')
  const displayName = readRequired(formData, 'displayName')
  const password = readRequired(formData, 'password')
  const parentEmail = readOptionalEmail(formData, 'parentEmail')
  const age = readOptionalInteger(formData, 'age')
  const realName = readOptional(formData, 'realName')
  const idCardNumber = normalizeIdCardNumber(readOptional(formData, 'idCardNumber'))
  const status = readStatus(formData)
  const isTestAccount = readBoolean(formData, 'isTestAccount')
  const notes = readOptional(formData, 'notes')
  const role = readRole(formData)
  const userRole = readUserRole(formData)
  const adminActive = readBoolean(formData, 'adminActive')

  if (!isValidUsername(username) || (email && !isEmail(email)) || !displayName || password.length < 8) {
    throw new Error('Invalid user create request')
  }

  const context = await requireAdmin('admin')
  if (context.preview || !isDbConfigured()) {
    revalidatePath('/admin/users')
    redirect('/admin/users')
  }

  const passwordHash = await hashPassword(password)
  let userId = ''

  await withTransaction(async (client) => {
    const user = await client.query<{ id: string }>(
      `
      INSERT INTO users (username, email, password_hash, display_name)
      VALUES ($1, $2, $3, $4)
      RETURNING id
      `,
      [username, email, passwordHash, displayName],
    )
    userId = user.rows[0]?.id ?? ''
    if (!userId) throw new Error('Failed to create user')

    await upsertProfile(client, userId, displayName, parentEmail, age, realName, idCardNumber)
    await upsertAdminState(client, userId, status, isTestAccount, notes, context.userId)
    await upsertAdminRole(client, userId, role, adminActive, displayName, context.userId)
    await upsertUserRole(client, userId, userRole, context.userId)

    const after = await readUserAuditSnapshot(client, userId)
    await writeAudit(client, context, 'user.create', userId, null, after, { username, email, isTestAccount, role, userRole })
  })

  revalidateUserPaths(userId)
  redirect(`/admin/users/${userId}`)
}

export async function updateAdminUser(formData: FormData) {
  const userId = readRequired(formData, 'userId')
  const username = normalizeUsername(readRequired(formData, 'username'))
  const email = readOptionalEmail(formData, 'email')
  const displayName = readRequired(formData, 'displayName')
  const password = readRequired(formData, 'password')
  const parentEmail = readOptionalEmail(formData, 'parentEmail')
  const age = readOptionalInteger(formData, 'age')
  const realName = readOptional(formData, 'realName')
  const idCardNumber = normalizeIdCardNumber(readOptional(formData, 'idCardNumber'))
  const status = readStatus(formData)
  const isTestAccount = readBoolean(formData, 'isTestAccount')
  const notes = readOptional(formData, 'notes')
  const role = readRole(formData)
  const userRole = readUserRole(formData)
  const adminActive = readBoolean(formData, 'adminActive')

  if (!userId || !isValidUsername(username) || (email && !isEmail(email)) || !displayName || (password && password.length < 8)) {
    throw new Error('Invalid user update request')
  }

  const context = await requireAdmin('admin')
  if (context.preview || !isDbConfigured()) {
    revalidateUserPaths(userId)
    return
  }

  if (context.userId === userId && status !== 'active') {
    throw new Error('You cannot suspend, delete, or deactivate your own account.')
  }

  const passwordHash = password ? await hashPassword(password) : null

  await withTransaction(async (client) => {
    const before = await readUserAuditSnapshot(client, userId)
    if (!before) throw new Error('User not found')

    await assertOwnerChangeIsSafe(client, userId, role, adminActive)

    await client.query(
      `
      UPDATE users
      SET username = $2,
          email = $3,
          display_name = $4,
          password_hash = COALESCE($5, password_hash)
      WHERE id = $1
      `,
      [userId, username, email, displayName, passwordHash],
    )
    await upsertProfile(client, userId, displayName, parentEmail, age, realName, idCardNumber)
    await upsertAdminState(client, userId, status, isTestAccount, notes, context.userId)
    await upsertAdminRole(client, userId, role, adminActive, displayName, context.userId)
    await upsertUserRole(client, userId, userRole, context.userId)

    const after = await readUserAuditSnapshot(client, userId)
    await writeAudit(client, context, 'user.update', userId, before, after, {
      username,
      email,
      displayName,
      status,
      isTestAccount,
      role,
      userRole,
      passwordChanged: Boolean(passwordHash),
    })
  })

  revalidateUserPaths(userId)
}

export async function deleteAdminUser(formData: FormData) {
  const userId = readRequired(formData, 'userId')
  const confirm = readRequired(formData, 'confirm').toUpperCase()

  if (!userId || confirm !== 'DELETE') {
    throw new Error('请输入 DELETE 确认删除用户。')
  }

  const context = await requireAdmin('admin')
  if (context.preview || !isDbConfigured()) {
    revalidatePath('/admin/users')
    redirect('/admin/users')
  }

  if (context.userId === userId) {
    throw new Error('You cannot delete your own account.')
  }

  await withTransaction(async (client) => {
    await assertOwnerChangeIsSafe(client, userId, 'none', false)
    const before = await readUserAuditSnapshot(client, userId)
    if (!before) throw new Error('User not found')

    await writeAudit(client, context, 'user.delete', userId, before, null, { hardDelete: true })
    await client.query('DELETE FROM users WHERE id = $1', [userId])
  })

  revalidatePath('/admin')
  revalidatePath('/admin/users')
  revalidatePath('/admin/audit-logs')
  redirect('/admin/users')
}

export async function setUserStatus(formData: FormData) {
  const userId = String(formData.get('userId') ?? '')
  const status = String(formData.get('status') ?? '') as UserAccountStatus
  const note = String(formData.get('note') ?? '').trim() || null

  if (!userId || !validStatuses.has(status)) {
    throw new Error('Invalid user status request')
  }

  const context = await requireAdmin('admin')
  if (context.preview || !isDbConfigured()) {
    revalidateUserPaths(userId)
    return
  }

  if (context.userId === userId && status !== 'active') {
    throw new Error('You cannot suspend, delete, or deactivate your own account.')
  }

  await withTransaction(async (client) => {
    if (status !== 'active') {
      await assertOwnerChangeIsSafe(client, userId, 'none', false)
    }
    const before = await client.query('SELECT to_jsonb(s) AS data FROM user_admin_states s WHERE s.user_id = $1', [
      userId,
    ])
    await client.query(
      `
      INSERT INTO user_admin_states (user_id, account_status, notes, updated_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id)
      DO UPDATE SET
        account_status = EXCLUDED.account_status,
        notes = COALESCE(EXCLUDED.notes, user_admin_states.notes),
        updated_by = EXCLUDED.updated_by
      `,
      [userId, status, note, context.userId],
    )
    await writeUserAudit(client, context, 'user.set_status', userId, before.rows[0]?.data ?? null, {
      status,
      note,
    })
  })

  revalidateUserPaths(userId)
}

export async function setUserTestAccount(formData: FormData) {
  const userId = String(formData.get('userId') ?? '')
  const isTestAccount = String(formData.get('isTestAccount') ?? '') === 'true'
  const note = String(formData.get('note') ?? '').trim() || null

  if (!userId) {
    throw new Error('Invalid user test-account request')
  }

  const context = await requireAdmin('admin')
  if (context.preview || !isDbConfigured()) {
    revalidateUserPaths(userId)
    return
  }

  await withTransaction(async (client) => {
    const before = await client.query('SELECT to_jsonb(s) AS data FROM user_admin_states s WHERE s.user_id = $1', [
      userId,
    ])
    await client.query(
      `
      INSERT INTO user_admin_states (user_id, is_test_account, notes, updated_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id)
      DO UPDATE SET
        is_test_account = EXCLUDED.is_test_account,
        notes = COALESCE(EXCLUDED.notes, user_admin_states.notes),
        updated_by = EXCLUDED.updated_by
      `,
      [userId, isTestAccount, note, context.userId],
    )
    await writeUserAudit(client, context, 'user.set_test_account', userId, before.rows[0]?.data ?? null, {
      isTestAccount,
      note,
    })
  })

  revalidateUserPaths(userId)
}

export async function resetUserProgress(formData: FormData) {
  const userId = String(formData.get('userId') ?? '')
  const levelIdValue = String(formData.get('levelId') ?? '').trim()
  const levelId = levelIdValue.length > 0 ? levelIdValue : null

  if (!userId) {
    throw new Error('Invalid user progress reset request')
  }

  const context = await requireAdmin('admin')
  if (context.preview || !isDbConfigured()) {
    revalidateUserPaths(userId)
    return
  }

  await withTransaction(async (client) => {
    const before = await client.query(
      `
      SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) AS data
      FROM progress p
      WHERE p.user_id = $1 AND ($2::text IS NULL OR p.level_id = $2)
      `,
      [userId, levelId],
    )
    await client.query(
      `
      DELETE FROM progress p
      WHERE p.user_id = $1 AND ($2::text IS NULL OR p.level_id = $2)
      `,
      [userId, levelId],
    )
    await client.query(
      `
      INSERT INTO admin_audit_logs
        (actor_user_id, actor_role, action, resource_type, resource_id, before_data, after_data, metadata)
      VALUES ($1, $2, 'user.reset_progress', 'user', $3, $4, '[]'::jsonb, $5)
      `,
      [context.userId, context.role, userId, before.rows[0]?.data ?? [], { levelId }],
    )
  })

  revalidateUserPaths(userId)
}

export async function setAdminStudentUserType(formData: FormData) {
  const userId = readRequired(formData, 'userId')
  const userType = readRequired(formData, 'userType')
  const note = readOptional(formData, 'note')
  if (!userId || !isStudentUserType(userType)) throw new Error('Invalid user type request')

  const context = await requireAdmin('support')
  await setStudentUserType({
    actorUserId: context.userId,
    studentUserId: userId,
    userType,
    note,
  })

  revalidateUserPaths(userId)
}

async function writeUserAudit(
  client: PoolClient,
  context: AdminContext,
  action: string,
  userId: string,
  before: unknown,
  metadata: Record<string, unknown>,
) {
  const after = await client.query('SELECT to_jsonb(s) AS data FROM user_admin_states s WHERE s.user_id = $1', [userId])
  await client.query(
    `
    INSERT INTO admin_audit_logs
      (actor_user_id, actor_role, action, resource_type, resource_id, before_data, after_data, metadata)
    VALUES ($1, $2, $3, 'user', $4, $5, $6, $7)
    `,
    [context.userId, context.role, action, userId, before, after.rows[0]?.data ?? null, metadata],
  )
}

function revalidateUserPaths(userId: string) {
  revalidatePath('/admin')
  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${userId}`)
  revalidatePath('/admin/audit-logs')
}

function readRequired(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function readOptional(formData: FormData, key: string): string | null {
  const value = readRequired(formData, key)
  return value.length > 0 ? value : null
}

function readOptionalEmail(formData: FormData, key: string): string | null {
  const value = readOptional(formData, key)
  return value ? value.toLowerCase() : null
}

function readBoolean(formData: FormData, key: string): boolean {
  return formData.get(key) === 'true' || formData.get(key) === 'on'
}

function readOptionalInteger(formData: FormData, key: string): number | null {
  const value = readOptional(formData, key)
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 120) {
    throw new Error(`${key} must be an integer from 0 to 120`)
  }
  return parsed
}

function readStatus(formData: FormData): UserAccountStatus {
  const status = readRequired(formData, 'status') as UserAccountStatus
  if (!validStatuses.has(status)) throw new Error('Invalid account status')
  return status
}

function readRole(formData: FormData): AdminRoleFormValue {
  const role = readRequired(formData, 'adminRole') || 'none'
  if (role !== 'none' && !validAdminRoles.has(role)) throw new Error('Invalid admin role')
  return role as AdminRoleFormValue
}

function readUserRole(formData: FormData): UserRole {
  const role = (readRequired(formData, 'userRole') || 'student') as UserRole
  if (!validUserRoles.has(role)) throw new Error('Invalid user role')
  return role
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function normalizeIdCardNumber(value: string | null): string | null {
  const text = value?.trim().toUpperCase() ?? ''
  if (!text) return null
  if (!/^[0-9X]{15,18}$/.test(text)) throw new Error('Invalid id card number')
  return text
}

async function upsertProfile(
  client: PoolClient,
  userId: string,
  displayName: string,
  parentEmail: string | null,
  age: number | null,
  realName: string | null,
  idCardNumber: string | null,
) {
  await client.query(
    `
    INSERT INTO profiles (user_id, display_name, parent_email, age, real_name, id_card_number)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (user_id)
    DO UPDATE SET
      display_name = EXCLUDED.display_name,
      parent_email = EXCLUDED.parent_email,
      age = EXCLUDED.age,
      real_name = EXCLUDED.real_name,
      id_card_number = EXCLUDED.id_card_number
    `,
    [userId, displayName, parentEmail, age, realName, idCardNumber],
  )
}

async function upsertAdminState(
  client: PoolClient,
  userId: string,
  status: UserAccountStatus,
  isTestAccount: boolean,
  notes: string | null,
  actorUserId: string,
) {
  await client.query(
    `
    INSERT INTO user_admin_states (user_id, account_status, is_test_account, notes, updated_by)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id)
    DO UPDATE SET
      account_status = EXCLUDED.account_status,
      is_test_account = EXCLUDED.is_test_account,
      notes = EXCLUDED.notes,
      updated_by = EXCLUDED.updated_by
    `,
    [userId, status, isTestAccount, notes, actorUserId],
  )
}

async function upsertAdminRole(
  client: PoolClient,
  userId: string,
  role: AdminRoleFormValue,
  active: boolean,
  displayName: string,
  actorUserId: string,
) {
  if (role === 'none') {
    await client.query('DELETE FROM admin_roles WHERE user_id = $1', [userId])
    return
  }

  await client.query(
    `
    INSERT INTO admin_roles (user_id, role, active, display_name, created_by)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id)
    DO UPDATE SET
      role = EXCLUDED.role,
      active = EXCLUDED.active,
      display_name = EXCLUDED.display_name
    `,
    [userId, role, active, displayName, actorUserId],
  )
}

async function upsertUserRole(client: PoolClient, userId: string, role: UserRole, actorUserId: string) {
  await client.query(
    `
    INSERT INTO user_roles (user_id, role, assigned_by)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id)
    DO UPDATE SET
      role = EXCLUDED.role,
      assigned_by = EXCLUDED.assigned_by
    `,
    [userId, role, actorUserId],
  )
}

async function assertOwnerChangeIsSafe(
  client: PoolClient,
  userId: string,
  nextRole: AdminRoleFormValue,
  nextActive: boolean,
) {
  const current = await client.query<{ role: string; active: boolean }>(
    'SELECT role, active FROM admin_roles WHERE user_id = $1',
    [userId],
  )
  const isCurrentActiveOwner = current.rows[0]?.role === 'owner' && current.rows[0]?.active === true
  const remainsActiveOwner = nextRole === 'owner' && nextActive
  if (!isCurrentActiveOwner || remainsActiveOwner) return

  const owners = await client.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM admin_roles WHERE role = 'owner' AND active = TRUE AND user_id <> $1",
    [userId],
  )
  if (Number(owners.rows[0]?.count ?? 0) === 0) {
    throw new Error('At least one active owner admin must remain.')
  }
}

async function readUserAuditSnapshot(client: PoolClient, userId: string): Promise<unknown | null> {
  const result = await client.query<{ data: unknown }>(
    `
    SELECT jsonb_build_object(
      'user', to_jsonb(u),
      'profile', to_jsonb(p),
      'adminState', to_jsonb(uas),
      'adminRole', to_jsonb(ar),
      'userRole', to_jsonb(ur)
    ) AS data
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN user_admin_states uas ON uas.user_id = u.id
    LEFT JOIN admin_roles ar ON ar.user_id = u.id
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.id = $1
    `,
    [userId],
  )
  return result.rows[0]?.data ?? null
}

async function writeAudit(
  client: PoolClient,
  context: AdminContext,
  action: string,
  userId: string,
  before: unknown,
  after: unknown,
  metadata: Record<string, unknown>,
) {
  await client.query(
    `
    INSERT INTO admin_audit_logs
      (actor_user_id, actor_role, action, resource_type, resource_id, before_data, after_data, metadata)
    VALUES ($1, $2, $3, 'user', $4, $5, $6, $7)
    `,
    [context.userId, context.role, action, userId, before, after, metadata],
  )
}
