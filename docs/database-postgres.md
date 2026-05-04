# PostgreSQL Database Setup

## Migration

当前主 schema：

```text
db/migrations/001_initial_schema.sql
```

执行：

```bash
npm run db:migrate
```

确认以下对象存在：

```text
users
profiles
levels
submissions
progress
admin_roles
admin_audit_logs
problem_sets
problem_set_items
lesson_plans
level_import_batches
level_import_items
user_admin_states
levels_public
```

课程教案相关 schema 从 `010_lesson_problem_sets.sql` 开始，`011_lesson_problem_sets_constraints.sql` 补齐 lesson 字段的 `NULL` 约束：

- `problem_sets.type='lesson'` 增加 `spcg_level / stage_no / track / lesson_focus`
- `levels.teacher_notes` 保存教师版说明
- `lesson_plans` 保存 AI 生成和人工编辑的 Markdown 快照版本

## Security Boundary

- 浏览器不直接连接数据库
- Next.js server actions 校验 NextAuth session
- 后台操作通过 `requireAdmin()` 校验 `admin_roles`
- 判题写入由 `scripts/judge-worker.ts` 执行
- 完整 20 个测试点只在服务端和 worker 读取
- `levels_public` 只公开 `published` 题目和公开样例
- 题目图片文件不入库，只保存 `/assets/problems/...` 链接
- 题解视频文件不入库，只保存 `/video/solutions/...` 链接
- 教案只在 admin 后台读取；hidden 测试点不进入 AI prompt

## Content Import

正式内容导入：

```bash
npm run import:levels
```

题库导入区：

```bash
npm run problem-bank:validate:incoming
npm run problem-bank:sync-import-batch
npm run problem-bank:import:incoming
npm run db:seed
```

`problem-bank:sync-import-batch` 会把 `problem-bank/reports/incoming-validation.json` 同步到 `level_import_batches` / `level_import_items`，供 `/admin/imports` 审核。

需要环境变量：

```text
DATABASE_URL
```
