# 03 · 数据库

> 负责：TBD
> 起跑日：Day 1
> 交付：Postgres schema + RLS + seed 数据

---

## 技术栈

- Supabase Postgres 15
- Migrations：SQL 文件，建议 Supabase CLI 管理（`supabase migration new`）
- RLS 全表启用
- 备份：Supabase Pro 自带每日 PITR，v0.1 用免费每周备份也够

---

## v0.1 表结构（4 张）

### profiles（用户扩展）

> Supabase Auth 自带 `auth.users`，不要直接修改。我们另建 profile 扩展。

```sql
CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  age INT,
  parent_email TEXT,
  parent_consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### levels（关卡内容）

```sql
CREATE TABLE levels (
  id TEXT PRIMARY KEY,                          -- 'ch1-01'
  chapter_id TEXT NOT NULL,                     -- 'ch1-mist-town'
  "order" INT NOT NULL,
  title TEXT NOT NULL,
  knowledge_point TEXT NOT NULL,
  difficulty JSONB NOT NULL,                    -- spcgLevel / levelLabel / stars / label / lglevel
  description TEXT NOT NULL,                    -- 题面 markdown
  statement_assets JSONB NOT NULL DEFAULT '[]'::jsonb, -- 题面图片链接和元信息；图片文件不入库
  input_format TEXT NOT NULL,
  output_format TEXT NOT NULL,
  test_cases JSONB NOT NULL,                    -- 20 个 TestCase；public/hidden 由 visibility 区分
  hints JSONB NOT NULL,                         -- 三步提示
  solution JSONB NOT NULL,                      -- 最终题解，AC 后解锁
  official_code TEXT NOT NULL,                  -- 官方 C++ AC 代码，AC 后解锁
  solution_video_url TEXT,                      -- 题解视频链接；视频文件统一存 assets/video/solutions/
  time_limit_ms INT NOT NULL DEFAULT 1000,
  memory_limit_mb INT NOT NULL DEFAULT 64,
  starter_code TEXT NOT NULL,
  source JSONB NOT NULL DEFAULT '{}'::jsonb,    -- 题源/授权信息
  import_meta JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- v0.2 扩展点（v0.1 全部 NULL）
  guardian_id TEXT,
  story TEXT,
  pass_out_problem_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX levels_chapter_order_idx ON levels (chapter_id, "order");
```

### submissions（提交记录）

```sql
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL REFERENCES levels(id),
  code TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'cpp',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','judging','done','error')),
  verdict JSONB,

  -- v0.2 扩展点
  is_pass_out BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX submissions_user_level_idx
  ON submissions (user_id, level_id, created_at DESC);
```

### progress（每用户每关进度）

```sql
CREATE TABLE progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL REFERENCES levels(id),
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_count INT NOT NULL DEFAULT 0,
  best_runtime_ms INT,
  last_submitted_at TIMESTAMPTZ,

  -- v0.2 扩展点
  passed_out BOOLEAN NOT NULL DEFAULT FALSE,

  PRIMARY KEY (user_id, level_id)
);
```

### levels_public（保护视图）

> 关键：前端永远只查这个 view，**保证 hidden test cases 永不外泄**。

```sql
CREATE VIEW levels_public AS
SELECT
  id, chapter_id, "order", title, knowledge_point, description,
  input_format, output_format,
  -- 仅返回 visibility='public' 的测试样例
  public_cases,
  hidden_count,
  hints,
  solution_unlocked,
  time_limit_ms, memory_limit_mb, starter_code,
  source, guardian_id, story, pass_out_problem_id
FROM levels;

GRANT SELECT ON levels_public TO authenticated, anon;
```

---

## RLS 策略

```sql
-- profiles：自己看自己
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "self" ON profiles FOR ALL USING (user_id = auth.uid());

-- levels：登录用户可读（直接表禁止前端读，只允许通过 view）
ALTER TABLE levels ENABLE ROW LEVEL SECURITY;
-- 不创建任何前端可见 policy，前端用 levels_public 视图

-- submissions：自己看自己
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "self" ON submissions FOR ALL USING (user_id = auth.uid());

-- progress：自己看自己
ALTER TABLE progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "self" ON progress FOR ALL USING (user_id = auth.uid());

-- Edge Functions 用 service_role key，绕过 RLS
```

---

## v0.2 预留表（不创建，仅文档）

```sql
-- guardians 表（15 位关卡守护者）
-- stories 表（章节剧情段落）
-- pass_out_problems 表（跳级挑战题）
-- 增加时，levels 表的 guardian_id / pass_out_problem_id 转 FK 关联即可
```

不需要数据迁移，只加表加 FK。

---

## Seed 数据

`scripts/import-levels.ts`：

```typescript
// 读 content/chapters/ch1-mist-town/levels/*.md
// 校验 20 个 testCases + 3 个 hints + solution + officialCode + solutionVideoUrl + statement assets
// dry-run 通过后 UPSERT 到 levels 表

import { readdir, readFile } from 'node:fs/promises'
import matter from 'gray-matter'

const dir = 'content/chapters/ch1-mist-town/levels'
for (const file of await readdir(dir)) {
  const md = await readFile(`${dir}/${file}`, 'utf-8')
  const { data, content } = matter(md)
  await supabase.from('levels').upsert({
    id: data.levelId,
    chapter_id: data.chapterId,
    order: data.order,
    title: data.title,
    knowledge_point: data.knowledgePoint,
    difficulty: data.difficulty,
    description: content,
    statement_assets: data.assets,
    input_format: data.inputFormat,
    output_format: data.outputFormat,
    test_cases: data.testCases,
    hints: data.hints,
    solution: data.solution,
    official_code: data.officialCode,
    solution_video_url: data.solutionVideoUrl,
    time_limit_ms: data.timeLimitMs ?? 1000,
    memory_limit_mb: data.memoryLimitMb ?? 64,
    starter_code: data.starterCode,
  })
}
```

---

## 周计划

### Week 1
- Day 1：建 Supabase 项目 + 4 张表 + 1 个 view + RLS
- Day 2：第 1 关 seed 数据 → 配合 02 工作流验证 API
- Day 3：seed 脚本写完
- Day 4-5：监控 + 备份配置

### Week 2
- Day 6-10：配合 05 工作流批量入库 12 关；按 02/04 反馈调索引

### Week 3-4
- 按需调优 + 备份验证

---

## v0.2 扩展点

| 扩展 | 数据库改动 |
|---|---|
| 守护者 | 新增 `guardians` 表 + `levels.guardian_id` 转 FK |
| 故事剧情 | `levels.story` 开始填值（已有字段，无 schema 变更） |
| 跳级机制 | 新增 `pass_out_problems` 表 + `submissions.is_pass_out` 开始为 true |
| 三星制 | `progress.passed bool` → `progress.stars int(0..3)`（破坏性变更，需迁移） |
| 错误反馈个性化 | 新增 `error_message_templates` 表（按 guardian_id 索引） |

> 唯一破坏性变更：三星制升级时 progress.passed → stars。需写迁移脚本：
> ```sql
> ALTER TABLE progress ADD COLUMN stars INT NOT NULL DEFAULT 0;
> UPDATE progress SET stars = CASE WHEN passed THEN 1 ELSE 0 END;
> ALTER TABLE progress DROP COLUMN passed;
> ```

---

## 验收标准

- [ ] 4 张表 + 1 个 view 全部建好
- [ ] RLS 启用 + 跨用户访问被拒
- [ ] hidden test cases 通过 view 隔离，前端 select 不到
- [ ] 12 关数据入库
- [ ] seed 脚本能重复跑（UPSERT 而非 INSERT）
- [ ] 每日自动备份生效
