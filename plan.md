# SPCG v0.1 主线计划

> 极简内核版 · 1 个月上线 · 5 条并行开发线
> 最后更新：2026-04-26

---

## 一、v0.1 范围（已冻结）

### 做

- **GESP 1 级 12 关**完整教学内容（题面 + 测试用例 + 童化错误反馈）
- **地图主页**：PNG 静态背景 + 12 个 SVG 关卡节点 + 主角 SVG 在节点间位移
- **C++ Monaco 编辑器**：双主题、语法高亮、基础提示
- **Judge0 OJ 判题**：仅评估正确性 + 时间
- **用户系统**：注册/登录、关卡进度持久化
- **基础童化错误反馈**：通用模板（不分关）

### 不做（推迟到 v0.2+）

详见 [docs/v0.2-roadmap.md](docs/v0.2-roadmap.md)：

- 守护者 / 故事剧情 / 章节过场
- Lottie 动画 / 复杂 SVG / 算法可视化
- 跳级机制 / 三星制
- GESP 2 级及以后的关卡
- 移动端适配 / 家长后台 / 老师后台
- 多语言（v0.1 仅 C++）
- 营销物料 / 完整法务套件

---

## 二、架构总览

```
┌──────────────────────────────────────┐
│  浏览器（Chrome / Safari / Edge）     │
│  Next.js 14 + Monaco + Tailwind      │
│  Supabase Client SDK                 │
└──────────┬───────────────────────────┘
           │ HTTPS / WebSocket
┌──────────▼───────────────────────────┐
│  Supabase 云服务                      │
│  ├─ Postgres（DB：users/levels/...）  │
│  ├─ Auth（邮箱注册）                  │
│  ├─ Edge Functions（Deno + TS）       │
│  ├─ Realtime（判题结果推送）          │
│  └─ Storage（备用，PNG 走 CDN）       │
└──────────┬───────────────────────────┘
           │ HTTPS
┌──────────▼───────────────────────────┐
│  Judge0 SaaS（RapidAPI 托管）         │
│  C++ 编译 + 运行 + 测试用例判断        │
└──────────────────────────────────────┘

部署：
  前端 → Vercel
  后端 → Supabase 云
  判题 → Judge0 SaaS
  零自运维
```

---

## 三、5 条并行开发线

| # | 工作流 | 路径 | 启动日 | 依赖 |
|---|---|---|---|---|
| 01 | 前端主界面 | [workstreams/01-frontend/](workstreams/01-frontend/plan.md) | Day 2 | 02 (API 契约) |
| 02 | 中间层 / API | [workstreams/02-backend-api/](workstreams/02-backend-api/plan.md) | Day 1 | 03 (DB 表) |
| 03 | 数据库 | [workstreams/03-database/](workstreams/03-database/plan.md) | Day 1 | 无 |
| 04 | OJ 判题 | [workstreams/04-oj-judging/](workstreams/04-oj-judging/plan.md) | Day 3 | 02, 03 |
| 05 | 内容生产 | [workstreams/05-content-production/](workstreams/05-content-production/plan.md) | Day 1 | 03 |

每条线独立有 plan.md，包含技术栈、周计划、API 契约、验收标准、v0.2 扩展点。

---

## 四、4 周时间表

```
Week 1：地基
  03-DB    █████░    schema 定 + RLS + seed 1 关
  02-API   ████░░    types.ts 定 + 5 端点骨架（Mock 数据）
  05-内容  ████░░    模板定 + 第 1 关老师亲写 + AI 模板调通
  01-前端  ░██░░░    Day 2 起 Next.js 脚手架 + Mock 数据跑壳
  04-OJ    ░░██░░    Day 3 起 RapidAPI 申请 + Judge0 调通

Week 2：跑通
  03-DB    ░░░██░    seed 12 关 + 索引调整
  02-API   ████░░    Edge Function `submit-code` 完成 + Realtime
  05-内容  ██████    AI 批量生 12 关 + 老师每天 review 2-3 关
  01-前端  ██████    地图节点交互 + IDE + 提交流程 + Realtime 接入
  04-OJ    █████░    完整 verdict 聚合 + 童化错误信息

Week 3：联调与美化
  全线联调，前端接真 API
  PNG/SVG 素材入库
  内测 5-10 个孩子（家人、朋友圈）

Week 4：打磨
  Bug fix
  内测发现的内容修正
  上线 + 第一批 30 人
```

---

## 五、关键契约（同步源）

所有工作流以这份 TypeScript 类型为准：

```typescript
// shared/types.ts （详见 workstreams/02-backend-api/plan.md）

export type Level = { ... }
export type Submission = { ... }
export type Verdict = { ... }
export type Progress = { ... }
```

**契约变更规则**：
- 任何人改 types.ts 必须**全员广播**
- 改动必须**向后兼容**（v0.2 加字段允许，删/改字段禁止）

---

## 六、扩展点（v0.2 预留，绝不在 v0.1 实现）

每条工作流的 plan.md 末尾都有"v0.2 扩展点"。汇总：

| v0.2 功能 | 预留方式 |
|---|---|
| 守护者 | `levels.guardian_id` 字段已留 + Level 接口已留 `guardian` 可选字段 |
| 故事剧情 | `levels.story` 字段已留 + Level 接口已留 `story` 可选字段 |
| 跳级机制 | `levels.pass_out_problem_id` + `submissions.is_pass_out` + `progress.passed_out` 已留 |
| 三星制 | `progress.passed` 升级为 `progress.stars: 0-3`，无破坏性 |
| 个性化错误反馈 | 童化模板按 `guardian_id` key 检索，模板表可扩 |
| 算法可视化 | 前端 IDE 页面已留可视化面板插槽 |
| 章节过场 | 前端 `<MapBackground />` 已留 `cinematicOverlay` prop |

---

## 七、风险

| 风险 | 应对 |
|---|---|
| Judge0 SaaS 限流（50 内测同时跑） | 升级 Pro 套餐 $30/月 + Edge Function 加 retry |
| AI 生成的关卡题目教学瑕疵 | 老师**必须**每关亲审 ≥ 30 分钟，不能省 |
| 主地图 PNG 在 4K 屏模糊 | 出 3840×2160 源图 + 1920×1080 `main-web.png`，前端用 `srcset` 自适应 |
| 1 个月节奏破防 | 每周五硬性 demo，发现延期立即砍范围（先砍美化、不砍内容） |
| 内测孩子 < 10 个无法验证 | 提前列名单，4 月底前发邀请 |

---

## 八、相关文档索引

- [docs/SPCG_设计建议_v0.1.md](docs/SPCG_设计建议_v0.1.md) — 初始设计文档（理念层）
- [docs/v0.2-roadmap.md](docs/v0.2-roadmap.md) — 完整版功能（v0.2+ 再做）
- [TODO.md](TODO.md) — Stephen 的素材准备清单
- [idea.md](idea.md) — 开发过程中的想法记录簿
- [workstreams/](workstreams/) — 5 条并行开发线
