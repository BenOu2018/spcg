# 04 · OJ 判题

> 负责：TBD
> 起跑日：Day 3（依赖 02 API 框架就绪）
> 交付：Judge0 集成 + verdict 生成逻辑

---

## 方案

**v0.1 用 Judge0 SaaS（RapidAPI 托管）**——不自建。

理由：
- 申请到能跑只需 1 小时
- 月费 $30 起，能扛 50 内测用户
- 自建 Docker + isolate 沙盒至少 2 周开发，v0.1 不值得

未来：v0.3+ 视用户增长情况再考虑自建。

---

## Judge0 配置

```typescript
const JUDGE0 = {
  baseURL: 'https://judge0-ce.p.rapidapi.com',
  headers: {
    'X-RapidAPI-Key': Deno.env.get('JUDGE0_KEY')!,
    'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
    'Content-Type': 'application/json',
  },
  languageId: 54,             // C++ (GCC 9.2.0)
  cpuTimeLimit: 1.0,          // 秒
  memoryLimit: 65536,         // KB = 64MB
}
```

申请：https://rapidapi.com/judge0-official/api/judge0-ce
推荐套餐：**Pro $30/月**（300 提交/天 → 够 50 内测用户每天 6 次提交）

---

## 数据流

```
Edge Function `submit-code` 内部：

  ┌─────────────────────────┐
  │ 1. 拉 test_cases         │ ← from DB (完整 20 个 case)
  └─────────┬───────────────┘
            │
  ┌─────────▼───────────────┐
  │ 2. 循环每个 case 调      │
  │    Judge0 /submissions   │
  │    (batch 接口可选)      │
  └─────────┬───────────────┘
            │
  ┌─────────▼───────────────┐
  │ 3. 聚合所有 case 结果    │
  │    - 全过 → AC           │
  │    - 任一超时 → TLE      │
  │    - 编译挂 → CE         │
  │    - 任一运行挂 → RE     │
  │    - 任一答案不对 → WA   │
  └─────────┬───────────────┘
            │
  ┌─────────▼───────────────┐
  │ 4. 抽童化文案            │
  │    pickFromTemplate(     │
  │      result, level)      │
  └─────────┬───────────────┘
            │
  ┌─────────▼───────────────┐
  │ 5. UPDATE submissions    │
  │    set verdict + done    │
  │    (Realtime 自动推送)   │
  └─────────────────────────┘
```

---

## verdict 聚合逻辑

当前本地可回归实现：

- `shared/judge.ts`：Node/前端通用的 verdict 聚合与 mock 判题
- `scripts/check-judge.ts`：覆盖 AC / WA / CE / RE / TLE、输出 trim、CE errorDetail
- `supabase/functions/_shared/judge0.ts`：Edge Function 内的 Judge0 调用、mock 模式、429 retry、verdict 聚合
- 验证命令：`npm run judge:check`

```typescript
type CaseResult = {
  status: { id: number; description: string }  // Judge0 返回
  time: string                                  // 秒，字符串
  stdout: string | null
  stderr: string | null
  compile_output: string | null
}

function aggregateVerdict(
  cases: CaseResult[],
  expected: TestCase[],
  timeLimitMs: number
): Verdict {
  let passed = 0
  let failedCaseIndex: number | null = null
  let maxTime = 0
  let result: Verdict['result'] = 'AC'
  let errorDetail: string | undefined

  for (let i = 0; i < expected.length; i++) {
    const c = cases[i]
    if (!c) {
      result = 'RE'
      errorDetail = 'Judge result missing for test case'
      failedCaseIndex = i
      break
    }
    const ms = Math.round(parseFloat(c.time) * 1000)
    maxTime = Math.max(maxTime, ms)

    // Judge0 status id：3=Accepted, 4=WA, 5=TLE, 6=CE, others=RE
    if (c.status.id === 6) {
      result = 'CE'
      errorDetail = c.compile_output ?? undefined
      failedCaseIndex = i
      break
    }
    if (c.status.id === 5 || ms > timeLimitMs) {
      result = 'TLE'
      failedCaseIndex = i
      break
    }
    if (c.status.id !== 3) {
      result = 'RE'
      errorDetail = c.stderr ?? undefined
      failedCaseIndex = i
      break
    }
    if ((c.stdout ?? '').trim() !== expected[i].expectedOutput.trim()) {
      result = 'WA'
      failedCaseIndex = i
      break
    }
    passed++
  }

  return {
    result,
    passedCases: passed,
    totalCases: expected.length,
    maxRuntimeMs: maxTime,
    failedCaseIndex,
    childFriendlyMessage: '',  // 下一步填
    errorDetail,
  }
}
```

---

## 童化错误信息（v0.1 简版）

模板存于 `content/copy/error-messages.md`，Edge Function 启动时加载到内存。

```yaml
CE:
  - "犬虎还没看懂这段代码哎——是不是哪里少了符号？"
  - "代码读不通呢，再看看是不是括号或分号忘了？"
  - "好像有个字写错了，再仔细瞧瞧第 {line} 行附近？"
RE:
  - "代码跑到一半绊了一跤——可能是数字算超了，或者数组越界了？"
  - "中途出了点意外，看看是不是除以了 0？"
TLE:
  - "想得很到位，但走得有点慢——还能更巧妙一些吗？"
  - "代码方向对了，但花了太久——有更快的办法吗？"
WA:
  - "差一点点。再仔细看看样例，相信你能找到的。"
  - "几乎要对了——再想想是不是漏了某种情况？"
  - "{passed}/{total} 个用例通过了，剩下的再加把劲。"
```

```typescript
function pickChildMessage(verdict: Verdict): string {
  const pool = TEMPLATES[verdict.result]
  const tpl = pool[Math.floor(Math.random() * pool.length)]
  return tpl
    .replace('{passed}', String(verdict.passedCases))
    .replace('{total}', String(verdict.totalCases))
}
```

**v0.2 后**：模板按 `level.guardian_id` 分池，每个守护者自己的语气。

---

## 错误处理

| 情况 | 处理 |
|---|---|
| Judge0 限流 429 | Edge Function retry 3 次，间隔 2s |
| Judge0 网络超时 | 返回 status='error' + verdict.errorDetail |
| 用户代码死循环 | Judge0 自带 timeout，最长 5s |
| RapidAPI key 失效 | Sentry 报警 + Edge Function 返回 503 |
| 单 case 长时间无响应 | 跳过该 case，标 RE |

---

## 周计划

### Week 1
- Day 3：申请 RapidAPI key + curl 跑通一段 C++ Hello World
- Day 4-5：Edge Function 接入 Judge0（先单 case 跑通）；本地 mock/verdict 回归先行完成

### Week 2
- Day 6-7：批量 case 跑通 + verdict 聚合
- Day 8：童化模板加载 + 抽样
- Day 9-10：错误处理 + retry + Sentry 接入

### Week 3-4
- 联调 + 边界 case 测试（死循环、巨量输出、特殊字符）

---

## v0.2 扩展点

| 扩展 | 改动方式 |
|---|---|
| 个性化错误反馈 | `pickChildMessage` 加参数 `guardianId`，从对应模板池抽 |
| 跳级挑战题 | 新增 Edge Function `submit-pass-out`，case 集换 `pass_out_problem.cases` |
| 三星制 | `aggregateVerdict` 增加 `stars` 字段（基于 maxTime / 代码长度） |
| 代码质量评分 | 新增 `evaluateCodeQuality` 函数，调 Claude API |
| 算法识别 | 同上，识别后写入 `verdict.algorithmTag` |
| Python 支持 | 增加 `language_id: 71`（Python 3.8）分支 |
| 自建沙盒迁移 | Edge Function 内 swap `runJudge0` 实现，外部 API 不变 |

---

## 验收标准

- [ ] 提交一段简单 C++ 代码（如 1+2 = 3），3 秒内拿到真实 Judge0 AC
- [x] mock/verdict 层能正确报 CE / WA / TLE / RE / AC
- [ ] hidden test cases 内容只在 Edge Function 内可见，前端拿不到
- [x] Judge0 429 retry 逻辑已在 Edge Function 中实现
- [ ] 童化文案随机变化，不是每次同一句
- [ ] 内测期间无判题误判（特别是浮点精度问题）
