# 02 · 中间层 / API

> 负责：TBD
> 起跑日：Day 1
> 交付：Supabase Edge Functions + 全部 API 契约

---

## 技术栈

- Supabase 云（自带 Postgres、Auth、Realtime、Edge Functions、Storage）
- Edge Functions：Deno + TypeScript
- Auth：Supabase Auth（邮箱注册）
- 国内访问：Supabase 中国大陆访问偶有抖动，可前置一个 Vercel Edge 代理（按需）

---

## 共享类型契约（同步源）

> ⚠️ **本节是所有工作流的同步源**。改动必须广播全员。
> 实际文件位置：`shared/types.ts`（项目启动后建）。

```typescript
// shared/types.ts

export type Level = {
  id: string                          // 'ch1-01'
  chapterId: string                   // 'ch1-mist-town'
  order: number                       // 1..12
  title: string                       // '早安雾镇'
  knowledgePoint: string              // '输出 cout'
  difficulty: Difficulty              // SPCG 等级 / 等级标签 / 层级 / 洛谷参考难度
  description: string                 // 题面 markdown
  statementAssets: StatementAsset[]    // 题面图片链接和 alt/caption，文件不入库
  inputFormat: string
  outputFormat: string
  publicCases: TestCase[]             // 公开样例 2-3 个
  hiddenCount: number                 // 隐藏用例个数（不返回内容）
  hints: Hint[]                       // 三步提示，随时可看
  solutionUnlocked: boolean           // AC 后为 true
  solution?: Solution                 // AC 后由解锁 API 返回
  officialCode?: string               // AC 后由解锁 API 返回
  solutionVideoUrl?: string | null     // AC 后由解锁 API 返回；DB 只存链接
  timeLimitMs: number                 // 默认 1000
  memoryLimitMb: number               // 默认 64
  starterCode: string                 // C++ 起始模板
  source: ProblemSource               // 题源与授权记录

  // ── v0.2 扩展点（v0.1 全部 null）──
  guardianId: string | null
  story: string | null
  passOutProblemId: string | null
}

export type TestCase = {
  id: string
  input: string
  expectedOutput: string
  visibility: 'public' | 'hidden'
}

export type Hint = {
  step: 1 | 2 | 3
  title: string
  content: string
}

export type Solution = {
  explanation: string
  keyPoints: string[]
  complexity: { time: string; memory: string }
}

export type Difficulty = {
  spcgLevel: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  levelLabel: `SPCG ${number}级`
  stars: 1 | 2 | 3 | 4 | 5
  label: '入门' | '基础' | '提高' | '挑战' | '综合'
  lglevel: string | null
}

export type Submission = {
  id: string                          // UUID
  userId: string
  levelId: string
  code: string
  language: 'cpp'                     // v0.1 锁定
  status: 'pending' | 'judging' | 'done' | 'error'
  verdict: Verdict | null             // status='done' 时非空
  createdAt: string                   // ISO

  // ── v0.2 扩展点 ──
  isPassOut: boolean                  // v0.1 永远 false
}

export type Verdict = {
  result: 'AC' | 'WA' | 'TLE' | 'RE' | 'CE'
  passedCases: number                 // 通过的用例数
  totalCases: number                  // 总用例数
  maxRuntimeMs: number                // 最长用例耗时
  failedCaseIndex: number | null
  childFriendlyMessage: string        // 童化反馈，必有
  errorDetail?: string                // 编译/运行错误原文（折叠）
}

export type Progress = {
  userId: string
  levelId: string
  passed: boolean                     // v0.1 二态；v0.2 升级为 stars 0-3
  attemptCount: number
  bestRuntimeMs: number | null
  lastSubmittedAt: string

  // ── v0.2 扩展点 ──
  passedOut: boolean                  // v0.1 永远 false
}
```

---

## HTTP 端点（v0.1 共 5 个）

| Method | Path | 功能 | 实现 |
|---|---|---|---|
| GET | `/rest/v1/levels_public` | 列出所有关卡（含 `publicCases` / `hiddenCount`，不含隐藏样例） | Postgres view |
| GET | `/rest/v1/levels_public?id=eq.X` | 单关详情 | 同上 |
| POST/RPC | `get_level_unlockables` | AC 后返回题解 + 官方代码 + 题解视频链接 | Postgres function |
| POST | `/functions/v1/submit-code` | 提交代码 → 返回 `{id}` | Edge Function |
| GET | `/rest/v1/submissions?id=eq.X` | 查判题状态（备用，主用 Realtime） | Postgres select + RLS |
| GET | `/rest/v1/progress?user_id=eq.uid` | 我的进度 | Postgres select + RLS |

> Auth 端点全交给 Supabase Auth：`/auth/v1/signup` `/auth/v1/token` 等。

---

## Edge Function：`submit-code`

伪代码：

```typescript
// supabase/functions/submit-code/index.ts

export default async function (req: Request) {
  const { user } = await getAuthUser(req)
  if (!user) return new Response('unauthorized', { status: 401 })

  const { levelId, code } = await req.json()

  // 1. 写入 submissions（status=pending）
  const { id } = await supabase
    .from('submissions')
    .insert({ user_id: user.id, level_id: levelId, code, language: 'cpp' })
    .select('id')
    .single()

  // 2. 异步起判题流程（不阻塞响应）
  ;(async () => {
    await supabase.from('submissions').update({ status: 'judging' }).eq('id', id)

    const level = await supabase.from('levels').select('*').eq('id', levelId).single()
    const cases = level.test_cases as TestCase[] // 完整 20 个测试样例，只在 service role 环境读取

    const verdict = await runJudge0(code, cases, level.time_limit_ms)
    verdict.childFriendlyMessage = pickChildMessage(verdict.result)

    await supabase
      .from('submissions')
      .update({ status: 'done', verdict, updated_at: 'now()' })
      .eq('id', id)

    if (verdict.result === 'AC') {
      await upsertProgress(user.id, levelId, verdict.maxRuntimeMs)
    }
  })()

  return new Response(JSON.stringify({ id, status: 'pending' }))
}
```

详见 [../04-oj-judging/plan.md](../04-oj-judging/plan.md)。

---

## Realtime 订阅

前端订阅自己的 submission：

```typescript
supabase
  .channel(`sub:${id}`)
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'submissions', filter: `id=eq.${id}` },
    payload => onVerdict(payload.new))
  .subscribe()
```

延迟 < 200ms。RLS 自动保护（用户只能订阅自己的 submission）。

---

## 周计划

### Week 1
- Day 1：types.ts 定稿 + 全员同步 + Supabase 项目建好
- Day 2：5 个端点 Postgres view + RLS
- Day 3：Edge Function 骨架（先返回假 verdict）
- Day 4-5：与 03-DB 联调，能跑通"前端 Mock → 真接口"

### Week 2
- Day 6-7：接通 Judge0（与 04 工作流对接）
- Day 8：Realtime 推送验证
- Day 9-10：童化错误信息生成（从模板库随机抽）

### Week 3-4
- 联调 + 监控（Supabase Logs + Sentry）

---

## v0.2 扩展点

| 扩展 | 预留方式 |
|---|---|
| 守护者档案 API | 新增 `GET /rest/v1/guardians?id=eq.X`（不破坏 v0.1） |
| 故事剧情 | Level 响应里 `story` 开始非空 |
| 跳级机制 | 新增 `POST /functions/v1/submit-pass-out` |
| 三星制 | Verdict 结构增加 `stars: 0-3` 字段（向后兼容） |
| 个性化错误反馈 | Edge Function 按 `level.guardian_id` 选模板池 |
| 多语言 | Submission `language` 联合类型增加 `'python'` |

---

## 验收标准

- [ ] types.ts 在所有工作流共享，零冲突
- [ ] 5 个端点能正确返回（含 RLS 保护）
- [ ] 提交一段 C++ 代码，5 秒内拿到 verdict
- [ ] Realtime 推送延迟 < 200ms
- [ ] 错误情况下 verdict.errorDetail 有内容
- [ ] hidden test cases 永远不会泄漏到前端
