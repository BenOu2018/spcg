# Level API Contract

## levels_public

前端读取题目列表/题目详情时使用 PostgreSQL view `levels_public`。响应包含：

```ts
{
  description: '# 任务描述\n...\n\n![题目图片](/assets/problems/ch1-mist-town/ch1-01/statement-main.png)',
  difficulty: {
    spcgLevel: 1,
    levelLabel: 'SPCG 1级',
    stars: 1,
    label: '入门',
    lglevel: null,
  },
  sister_problem: {
    levelId: 'ch1-04-s1',
    title: '雾灯记秒',
    relation: 'same-pattern',
    note: '同类时间换算题，用秒作为统一单位复测掌握情况。',
  },
  statement_assets: [
    {
      id: 'statement-main',
      type: 'image',
      url: '/assets/problems/ch1-mist-town/ch1-01/statement-main.png',
      alt: '早安雾镇题目图片',
      caption: null,
    },
  ],
}
```

`levels_public` 只暴露 `published` 题目、公开样例、提示和 starter code。完整测试点、题解、官方代码只允许服务端/worker 查询 `levels`。

题目基础难度系数由服务端按 `difficulty.spcgLevel * difficulty.stars` 计算；普通题首次 AC 金币奖励等于该系数。

## submit-code

前端调用 server action：

```ts
submitCodeAction({ levelId: 'ch1-01', code, languageMode: 'auto' })
```

返回：

```ts
{
  mode: 'remote',
  submissionId: 'submission-uuid',
  status: 'pending',
  language: 'auto',
  resolvedLanguage: 'cpp14'
}
```

处理流程：

1. server action 校验 NextAuth session
2. 写入 `submissions(status='pending')`
3. `scripts/judge-worker.ts` 领取 pending submission
4. worker 调用本地 Judge0
5. worker 更新 `submissions.verdict/status`
6. AC 后 upsert `progress`

前端继续轮询：

```ts
getSubmissionVerdictAction(submissionId)
```

编译器 stdout 输出区实时显示的状态集合：

```ts
type CompilerStatus = 'pending' | 'AC' | 'WA' | 'TLE' | 'CE' | 'RE' | 'Judge Error'
```

其中本地队列的 `pending` / `judging` 都显示为 `pending`；Judge0 `Internal Error(status=13)` 显示为 `Judge Error`。

## unlock solution

题解解锁由服务端通过 `progress.passed = true` 判断。未登录或未 AC 时不返回 `solution`、`official_code`、`solution_video_url`。

## Judge0

本地 Judge0 使用 HTTP API：

```text
POST /submissions?base64_encoded=true&wait=true
GET /languages
```

配置：

```text
JUDGE0_BASE_URL=http://localhost:2358
JUDGE0_AUTH_TOKEN=
SPCG_DEFAULT_LANGUAGE=auto
SPCG_DEFAULT_CPP_STANDARD=c++14
JUDGE0_C_LANGUAGE_ID=50
JUDGE0_CPP_LANGUAGE_ID=54
JUDGE0_PYTHON3_LANGUAGE_ID=71
JUDGE0_DISABLE_CGROUPS=true
JUDGE0_MIN_MEMORY_LIMIT_KB=512000
```

`JUDGE0_DISABLE_CGROUPS=true` and `JUDGE0_MIN_MEMORY_LIMIT_KB=512000` are local Docker Desktop/Mac compatibility settings. On a native Linux judge host with working Judge0 cgroup support, they can be unset or lowered after a real submission health check passes.

SPCG 编辑器默认 `Auto · C++14 first`。Auto 只做轻量语言识别：明显 Python 使用 Python3，明显 C 使用 C，其余使用 C++14；编译错误直接返回 CE，不自动尝试其他语言。

## mobile / external REST API

移动端和外部 H5 先复用当前 Next.js 单体，不拆独立后端。API Routes 只负责鉴权、参数校验和 JSON 返回，核心逻辑复用 service 层。

```text
GET  /api/mobile/levels
GET  /api/mobile/levels/:id
GET  /api/mobile/me/progress
GET  /api/mobile/me/wallet
GET  /api/mobile/me/inventory
GET  /api/mobile/me/rewards
GET  /api/mobile/submissions?levelId=ch1-01
POST /api/mobile/submissions
GET  /api/mobile/submissions/:id
POST /api/mobile/assessments/:id/attempts
POST /api/mobile/assessment-attempts/:id/finish
GET  /api/mobile/admin/judge-queue
```

成功响应：

```ts
{
  ok: true,
  data: {}
}
```

错误响应：

```ts
{
  ok: false,
  error: {
    code: 'bad_request' | 'unauthorized' | 'not_found' | 'db_unconfigured' | 'rate_limited' | 'internal_error',
    message: string,
    retryAfterSeconds?: number,
  },
}
```

`POST /api/mobile/submissions` body：

```ts
{
  levelId: string,
  code: string,
}
```

提交接口默认同一用户每 3 秒最多提交一次，由 `SUBMISSION_RATE_LIMIT_SECONDS` 控制。Web Server Action 与 mobile API 共用同一限流逻辑。

## rewards / growth

奖励系统使用可审计账本：

- `user_wallets` 保存金币累计、蒜粒余额、段位和称谓。
- `reward_ledger` 保存所有奖励流水；同一用户同一来源只结算一次。
- `inventory_items` / `user_inventory` 保存算法装备和用户背包。
- `assessment_sessions` / `assessment_attempts` 统一承载段位赛和竞赛。

普通做题首次 AC 发金币和装备；重复 AC 不重复发主奖励。隐藏蒜粒只在首次 AC 时用确定性哈希判定，盐值由 `REWARD_SALT` 控制。段位赛/竞赛完成后通过 assessment attempt 结算蒜粒和段位赛奖励。
