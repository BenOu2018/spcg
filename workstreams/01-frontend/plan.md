# 01 · 前端主界面

> 负责：TBD
> 起跑日：Day 2（等 02 工作流的 types.ts 就绪）
> 交付：Next.js 应用，部署到 Vercel

---

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 16.2 + React 19 + TypeScript |
| 样式 | v0.1 先用全局 CSS；Tailwind 可在 UI 稳定后再引入 |
| 编辑器 | v0.1 先用 textarea 包装；Monaco 在真实提交流程稳定后接入 |
| 状态 | React 本地状态；跨页复杂状态出现后再加 Zustand |
| 后端通信 | Supabase JS SDK（包含 Realtime） |
| 开发期假数据 | `apps/web/lib/mock-data.ts` + `shared/judge.ts` |
| 动效 | CSS transitions + `transform`（不上 Framer Motion） |
| 部署 | Vercel |

说明：原计划中的 Next.js 14 在 2026-04-27 的 npm audit 中存在高危 advisory；实际实现升到 Next 16.2.4，并用 npm override 固定 `postcss@8.5.10`，当前生产依赖 audit 为 0 漏洞。

---

## 页面结构

```
/                    → 训练台首页 + 当前关入口 + 地图概览
/auth/sign-in        → Supabase Auth UI
/auth/sign-up        → Supabase Auth UI（含家长邮箱字段）
/map                 → 雾镇地图（12 节点）
/level/[id]          → IDE + 任务卡 + 测试结果
/me                  → 进度页（哪些关通过了）
```

---

## 关键组件

| 组件 | 职责 | v0.2 扩展点 |
|---|---|---|
| `<MapBackground />` | 加载主地图 PNG，`object-fit: cover` | 接受 `cinematicOverlay?: ReactNode`（章节过场） |
| `<LevelNode />` | 单个 SVG 节点，支持 locked / unlocked / current / completed 星级状态 | 已支持 `passedOut?: boolean` |
| `<MascotAvatar />` | 犬虎主角 SVG，CSS `transform: translate(x, y)` 位移 | 未来可换 Lottie 或骨骼动画 |
| `<TaskCard />` | IDE 左侧任务卡 | 接受 `guardian?: Guardian`（v0.1 为 null） |
| `<CodeWorkspace />` | C++ 输入区 + 提交按钮 + 本地 verdict 展示 | 后续替换为 Monaco + 真 `submit-code` |
| `<TestResults />` | verdict 展示 + 童化文案 | 接受 `personalityKey?: string` |
| `<ProgressBar />` | 12 关进度条 | 升级为三星制时改 prop |

## 当前实现

- `apps/web` 已建立 Next.js App Router 应用
- `/`、`/map`、`/level/[id]`、`/me`、`/auth/sign-in`、`/auth/sign-up` 已有首版页面
- `/level/[id]` 当前使用 `shared/judge.ts` 的 mock verdict，支持 AC / WA / CE / RE / TLE 前端反馈
- 地图使用 `assets/art/backgrounds/ch1-mist-town/main-review-v1.png`、犬虎角色 SVG、12 个 node positions
- 当前仍未接 Supabase Auth / Realtime；下一步替换 mock 数据源

---

## 数据流

```
进入 /level/[id]
  ↓ 拉关卡内容
Supabase: GET levels_public (id=?)
  ↓ 用户写代码（仅前端状态）
点"提交"
  ↓
POST /api/submissions  →  { id, status: 'pending' }
  ↓ 订阅 Realtime channel
Supabase Realtime: submissions where id=?
  ↓ 收到 verdict（约 1-3s）
更新 UI（显示 AC/WA/TLE/...）
  ↓ 如果 AC
跳回 /map，主角 transform 位移到下一节点
```

---

## 周计划

### Week 1
- Day 1：等 02 工作流出 types.ts
- Day 2：Next.js 脚手架 + 依赖安全审计 + 基础页面骨架
- Day 3：textarea 版 C++ 输入区 + 本地 mock verdict
- Day 4-5：地图页节点布局（按 node-positions.json） + 主角位移动效

### Week 2
- Day 6-7：IDE 页替换为真 `submit-code` 调用（写代码 → 提交 → 等待 → 显示结果）
- Day 8：Realtime 订阅接入（替换轮询）
- Day 9：进度页 + 路由守卫（未登录跳 /auth/sign-in）
- Day 10：mock 数据切真 API，端到端跑通

### Week 3
- Day 11-12：Monaco 动态加载 + UI 美化
- Day 13-14：文案接入（错误反馈、UI 字符串）
- Day 15：联调 + 修 bug

### Week 4
- Day 16-20：内测 + 修 bug + 上线

---

## API 消费（仅这些）

```typescript
// 通过 Supabase JS SDK
supabase.from('levels_public').select('*').order('order')
supabase.from('levels_public').select('*').eq('id', levelId).single()
supabase.from('progress').select('*').eq('user_id', uid)

// Edge Function
supabase.functions.invoke('submit-code', { body: { levelId, code } })

// Realtime
supabase
  .channel(`submission:${id}`)
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'submissions', filter: `id=eq.${id}` },
    payload => setVerdict(payload.new.verdict))
  .subscribe()
```

详见 [../02-backend-api/plan.md](../02-backend-api/plan.md)

---

## 性能预算

| 指标 | 目标 |
|---|---|
| LCP（首屏最大内容） | ≤ 2.5s |
| TTI（可交互） | ≤ 3.5s |
| 主地图 PNG | ≤ 1.5MB（用 main-web.png） |
| Monaco 首次加载 | ≤ 800KB（动态 import，接入后再测） |
| 总 JS 首屏 | ≤ 300KB（gzipped） |

---

## v0.2 扩展点（不实现，仅预留）

| 扩展 | 预留方式 |
|---|---|
| 守护者出场 | `<TaskCard guardian={...} />` 已留 prop，v0.1 传 null 时不渲染守护者区块 |
| 故事场景 | `/level/[id]` 顶部已留 `<StoryScene story={level.story} />` 槽 |
| 跳级机制 | `<LevelNode passedOut />` 已留状态 |
| 章节过场 | `<MapBackground cinematicOverlay={<...>} />` 已留 |
| 算法可视化 | IDE 页右侧已留 `<VisualizerPanel />` 槽（v0.1 隐藏） |
| 三星制 | `<ProgressBar />` 内部已用 `stars: 0|1|2|3` 而非简单 `passed: bool`，v0.1 永远 0 或 1 |

---

## 验收标准

- [x] 12 节点首版显示 + 状态切换规则落地
- [x] C++ 代码可编辑 + 本地 mock 提交 + 看到 verdict
- [ ] 通关后主角自动位移到下一节点
- [ ] 进度持久化（刷新不丢失；需 Supabase progress）
- [ ] 5 个内测孩子能独立完成第 1 关
- [ ] LCP ≤ 2.5s
- [ ] 移动端不报错（不要求适配）
