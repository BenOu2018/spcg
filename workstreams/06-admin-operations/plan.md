# Workstream 06 - Admin Operations

## Goal

Build the operator-facing backend management surface for SPCG without weakening the student-facing runtime boundary.

The admin system owns:

- user and role management
- level lifecycle management
- problem set management
- import batch review
- publish / unpublish operations
- audit logs for every privileged write

## V1 Scope

V1 is intentionally small and operational:

- Admin route shell at `/admin`
- Route protection through Supabase user token plus `admin_roles`
- Development preview mode through `SPCG_ADMIN_PREVIEW=true`
- Read-only level list and level detail
- Problem set list and detail
- Import batch list and detail
- Publish / unpublish levels
- Publish / archive problem sets
- Approve / reject / mark-imported import batches
- Audit logs for all admin write operations

## Out Of Scope For V1

- Full visual form editor for problem statements
- Hidden test case editing in the browser
- User impersonation
- Bulk destructive actions
- Asset upload UI
- Judge0 operations dashboard
- Rich role invitation workflow

## Security Model

- Browser clients never receive `SUPABASE_SERVICE_ROLE_KEY`.
- Admin pages are server-rendered.
- Admin write operations go through server actions or Edge Functions.
- Every privileged operation checks `admin_roles`.
- Every privileged operation writes to `admin_audit_logs`.
- RLS still blocks direct browser writes.

## Roles

| Role | Intended Access |
|---|---|
| `owner` | all admin operations and role management |
| `admin` | all content operations |
| `editor` | content publish workflow |
| `reviewer` | import review and read-only checks |
| `support` | read-only support view |

## Data Model

New tables:

- `admin_roles`
- `admin_audit_logs`
- `problem_sets`
- `problem_set_items`
- `level_import_batches`
- `level_import_items`

Existing table extensions:

- `levels.status`
- `levels.published_at`
- `levels.published_by`

## Frontend Routes

```text
/admin
/admin/levels
/admin/levels/[id]
/admin/problem-sets
/admin/problem-sets/[id]
/admin/imports
/admin/imports/[batchId]
/admin/audit-logs
```

## Implementation Order

1. Add database migration and initial schema updates.
2. Add admin auth helpers and Supabase service client helpers.
3. Add `/admin` layout and route protection.
4. Add dashboard, levels list, and level detail.
5. Add problem set list and detail.
6. Add import batch list and detail.
7. Add publish/review server actions with audit logs.

## Acceptance Checks

- `npm run check`
- `npm run web:build`
- `npm run problem-bank:validate:incoming`
- `git diff --check`
- `/admin` routes build successfully
- non-admin access redirects unless `SPCG_ADMIN_PREVIEW=true`
