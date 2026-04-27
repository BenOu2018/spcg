# Workstreams · 5 条并行开发线

每条线由一位负责人（或小组）独立推进。每条线有自己的 `plan.md`，含技术栈、周计划、API 契约、验收标准、v0.2 扩展点。

主线计划见根目录 [plan.md](../plan.md)。

---

## 一览

| # | 名称 | 路径 | 启动日 | 依赖 |
|---|---|---|---|---|
| 01 | 前端主界面 | [01-frontend/plan.md](01-frontend/plan.md) | Day 2 | 02 (API 契约) |
| 02 | 中间层 / API | [02-backend-api/plan.md](02-backend-api/plan.md) | Day 1 | 03 (DB) |
| 03 | 数据库 | [03-database/plan.md](03-database/plan.md) | Day 1 | 无 |
| 04 | OJ 判题 | [04-oj-judging/plan.md](04-oj-judging/plan.md) | Day 3 | 02, 03 |
| 05 | 内容生产 | [05-content-production/plan.md](05-content-production/plan.md) | Day 1 | 03 |

---

## 协作规则

### 1. API 契约是唯一同步点

`workstreams/02-backend-api/plan.md` 顶部的 `types.ts` 是**所有工作流的同步源**。

- 任何人改 types.ts 必须**全员广播**
- 改动必须**向后兼容**（v0.2 加字段允许，v0.1 删/改字段禁止）
- 前后端通过 `shared/types.ts` 共享同一份类型

### 2. 每周五同步会

各线展示当周进度、Demo 一段功能、暴露卡点。会议时长 ≤ 30 分钟。

### 3. 卡点立即喊

任何工作流卡点超过 1 天，立即在群里喊。不要憋一周才说。

### 4. 不跨线动代码

工作流之间通过契约通信。不要"我顺便改一下隔壁的代码"——改了等于破坏契约。

### 5. 每周五硬 demo

每周五前必须有可演示的进度。任何延期立即砍范围（先砍美化、内容次要部分；不砍核心功能）。

---

## 并行启动建议

```
Day 1    [03-DB] 建项目 + 4 张表
         [02-API] types.ts 定稿 + 5 端点骨架
         [05-内容] 老师定 12 关知识点 + 关卡名

Day 2    [01-前端] Next.js 脚手架 + Tailwind + Mock 数据
         [03-DB] seed 1 关样例
         [05-内容] 第 1 关老师亲笔写

Day 3    [04-OJ] 申请 RapidAPI key + Judge0 调通
         [02-API] Edge Function 框架（先返回假 verdict）

Day 4-5  各线并行推进，Day 5 拉群同步进度
```

---

## 文件命名约定

每条工作流目录下：

```
workstreams/0X-name/
├── plan.md          ← 该线总规划（必有）
├── notes/           ← 开发笔记 / 决策记录（可选）
└── docs/            ← 该线的技术文档（可选）
```

不在工作流目录里放代码。代码统一在 `app/` 或 `apps/{frontend,backend}/` 下（项目正式启动时建）。
