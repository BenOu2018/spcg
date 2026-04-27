# 01 · 前端主界面

> 负责：TBD
> 起跑日：Day 2（等 02 工作流的 types.ts 就绪）
> 交付：Next.js 应用，部署到 Vercel

---

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 14（App Router）+ TypeScript |
| 样式 | Tailwind CSS（无 shadcn 也行，按需用） |
| 编辑器 | Monaco Editor（`@monaco-editor/react`） |
| 状态 | Zustand |
| 后端通信 | Supabase JS SDK（包含 Realtime） |
| 开发期假数据 | MSW（Mock Service Worker） |
| 动效 | CSS transitions + `transform`（不上 Framer Motion） |
| 部署 | Vercel |

---

## 页面结构

```
/                    → 落地页 + "开始学习" 按钮
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
| `<CodeEditor />` | Monaco 包装，C++ 模式 | 未来支持 Python 切换 |
| `<TestResults />` | verdict 展示 + 童化文案 | 接受 `personalityKey?: string` |
| `<ProgressBar />` | 12 关进度条 | 升级为三星制时改 prop |

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
- Day 2：Next.js 脚手架 + Tailwind + Vercel 部署 + Supabase 客户端配置
- Day 3：Monaco 集成 + 4 个页面骨架（暂用 MSW Mock 数据）
- Day 4-5：地图页节点布局（按 node-positions.json） + 主角位移动效

### Week 2
- Day 6-7：IDE 页完整流程（写代码 → 提交 → 等待 → 显示结果）
- Day 8：Realtime 订阅接入（替换轮询）
- Day 9：进度页 + 路由守卫（未登录跳 /auth/sign-in）
- Day 10：MSW Mock 切真 API，端到端跑通

### Week 3
- Day 11-12：素材入库（PNG 全部就位） + UI 美化
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
| Monaco 首次加载 | ≤ 800KB（动态 import） |
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

- [ ] 12 节点正确显示 + 状态切换无 bug
- [ ] C++ 代码可编辑 + 提交 + 看到 verdict
- [ ] 通关后主角自动位移到下一节点
- [ ] 进度持久化（刷新不丢失）
- [ ] 5 个内测孩子能独立完成第 1 关
- [ ] LCP ≤ 2.5s
- [ ] 移动端不报错（不要求适配）
