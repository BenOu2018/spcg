# Legacy Supabase Reference

This directory is kept only as historical reference for the previous hosted Supabase implementation.

Current runtime code does not import, deploy, or execute anything from this directory. Use the local stack instead:

- PostgreSQL schema: `db/migrations/001_initial_schema.sql`
- Database access: `apps/web/lib/db.ts`
- Auth: `apps/web/auth.ts`
- Judge worker: `scripts/judge-worker.ts`
- Judge0 adapter: `shared/judge0-client.ts`

Do not run these migrations or Edge Functions for the current SPCG local PostgreSQL + NextAuth + Judge0 runtime.
