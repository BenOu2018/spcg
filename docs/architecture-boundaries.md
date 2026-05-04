# SPCG Architecture Boundaries

SPCG remains a Next.js full-stack application for now, but code should be written as if the backend may later be extracted.

## Layers

- UI components: render props, collect interaction, and call approved actions. They must not import database, repositories, or services.
- App entrypoints: Server Actions and API Routes handle auth, validation, response shape, and revalidation. They call services.
- Services: own business workflows for levels, submissions, progress, users, and admin operations.
- Repositories: own SQL and transaction-facing data access.
- `db`: owns the PostgreSQL pool and low-level query helpers.

## Roles

- Platform admin access remains guarded by `admin_roles` and `requireAdmin()`.
- Product user roles live in `user_roles`: `admin`, `teacher`, and `student`.
- Teacher-student ownership lives in `teacher_students`; teacher-facing services must call `requireTeacher()` and `requireTeacherOwnsStudent()` before reading student data.
- Student-facing services may only read the current user's own data unless a teacher/admin service explicitly scopes access.

## Enforcement

`npm run check:architecture` runs `scripts/check-architecture-boundaries.ts`.

The checker blocks:

- UI components importing `@/lib/db`, `@/lib/repositories/*`, or `@/lib/services/*`.
- Server Actions and API Routes importing `@/lib/db` or repositories directly.
- Services importing app routes or UI components.
- Repositories importing auth, app routes, UI components, or services.
- Direct `@/lib/db` imports outside repositories and documented legacy adapters.

Some admin/auth files are temporarily allowlisted because they predate the service/repository split. New code should not expand that allowlist; migrate those legacy actions into services when touching them.
