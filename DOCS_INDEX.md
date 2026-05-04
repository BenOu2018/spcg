# SPCG Document Index

> This file is the root-level entry point for important project documents.

## Core Progress And Roadmap

| 文档 | 位置 | 用途 |
|---|---|---|
| 项目进度 | [PROGRESS.md](./PROGRESS.md) | 当前完成状态、验证结果、Next Actions、长期产品路线 |
| v0.2 路线 | [docs/v0.2-roadmap.md](./docs/v0.2-roadmap.md) | 后续版本规划参考 |

## Architecture And Engineering

| 文档 | 位置 | 用途 |
|---|---|---|
| 架构边界 | [docs/architecture-boundaries.md](./docs/architecture-boundaries.md) | UI、Server Actions/API、service、repository/db 分层规则 |
| 关卡 API 契约 | [docs/api/level-api.md](./docs/api/level-api.md) | 关卡、提交、判题、奖励相关接口说明 |
| 后台课程题单与教案 | [docs/admin-lesson-plans.md](./docs/admin-lesson-plans.md) | 每级每关 A/B 线题单、AI 教案生成、Markdown 快照和后台流程 |
| PostgreSQL 数据库 | [docs/database-postgres.md](./docs/database-postgres.md) | 数据库迁移、导入、本地 PostgreSQL 使用说明 |
| 部署检查清单 | [docs/deploy-checklist.md](./docs/deploy-checklist.md) | 本地和生产部署 smoke test/checklist |

## Curriculum And Problem Bank

| 文档 | 位置 | 用途 |
|---|---|---|
| 1-10 级算法课程大纲 | [problem-bank/ALGORITHM_SYLLABUS_LEVELS_1_10.md](./problem-bank/ALGORITHM_SYLLABUS_LEVELS_1_10.md) | 后续固定所有算法关卡的核心依据 |
| 游戏化关卡规划 | [problem-bank/GAME_LEVEL_PLAN_LEVELS_1_8.md](./problem-bank/GAME_LEVEL_PLAN_LEVELS_1_8.md) | 关卡地图、游戏化路径、章节安排参考 |
| 题库总说明 | [problem-bank/README.md](./problem-bank/README.md) | 题库目录、导入流程、规则入口 |
| 题库结构规范 | [problem-bank/STRUCTURE.md](./problem-bank/STRUCTURE.md) | 题库文件夹和题目文件组织方式 |
| 题目生成规则 | [problem-bank/AGENT_BRIEF.md](./problem-bank/AGENT_BRIEF.md) | 给题目生成/导入 agent 的工作规则 |
| 题目模板 | [problem-bank/templates/spcg-level-v0.1.md](./problem-bank/templates/spcg-level-v0.1.md) | 新题目 Markdown 模板 |
| 题目图片与视频字段规则 | [problem-bank/STRUCTURE.md](./problem-bank/STRUCTURE.md) | 题目图片、题解视频链接、frontmatter 字段规范 |
| 题解视频生成规则 | [problem-bank/manim_rule.md](./problem-bank/manim_rule.md) | Manim 题解动画、旁白、音视频合成和交付规则 |
| 长片教学演示规则 | [lesson/manim_lesson_rule.md](./lesson/manim_lesson_rule.md) | 算法 lesson 长片、MST 模板教学、代码同步和镜头规则 |
| 改编来源索引 | [problem-bank/ADAPTED_SOURCE_INDEX.md](./problem-bank/ADAPTED_SOURCE_INDEX.md) | 改编题来源和公开样例避重记录 |
| 题库 Manifest | [problem-bank/MANIFEST.md](./problem-bank/MANIFEST.md) | 题库批次和资源清单 |

## Story, World And Characters

| 文档 | 位置 | 用途 |
|---|---|---|
| 内容目录说明 | [content/README.md](./content/README.md) | 剧情、角色、章节内容入口 |
| 小说大纲 v3 | [docs/spcg-novel-outline-v3.md](./docs/spcg-novel-outline-v3.md) | 当前较新的世界观和主线大纲 |
| 小说章节 1-3 | [docs/spcg-novel-chapters-v3-01-03.md](./docs/spcg-novel-chapters-v3-01-03.md) | v3 小说正文前 3 章 |
| 小说章节 4-6 | [docs/spcg-novel-chapters-v3-04-06.md](./docs/spcg-novel-chapters-v3-04-06.md) | v3 小说正文第 4-6 章 |
| 小说生成提示 | [docs/spcg-novel-prompts.md](./docs/spcg-novel-prompts.md) | 生成/续写小说时的提示词参考 |
| 主角犬虎设定 | [content/characters/protagonist-dog-tiger.md](./content/characters/protagonist-dog-tiger.md) | 主角定位、性格和叙事规则 |
| 守护者设定入口 | [content/guardians/README.md](./content/guardians/README.md) | 后续各地图守护者/角色设定入口 |
| 第一章主线任务 | [content/chapters/ch1-mist-town/main-quest.md](./content/chapters/ch1-mist-town/main-quest.md) | 雾镇主线剧情和任务 |
| 第一章小说正文 | [content/novel/ch01-初始村的笨小孩.md](./content/novel/ch01-初始村的笨小孩.md) | 当前第一章小说内容 |
| 章节题目模板 | [content/chapters/_template-level.md](./content/chapters/_template-level.md) | 内容章节内的题目写作模板 |

## Product And UI Design

| 文档 | 位置 | 用途 |
|---|---|---|
| 编程关卡 UI 规则 | [docs/programming-level-ui-design-rules.md](./docs/programming-level-ui-design-rules.md) | 普通编程关卡页面设计和交互规则 |
| 段位赛 UI 规则 | [docs/exam-coding-ui-design-rules.md](./docs/exam-coding-ui-design-rules.md) | 考试/段位赛编程界面设计规则 |
| 健康游戏化投入系统 | [docs/healthy-engagement-system.md](./docs/healthy-engagement-system.md) | 学习留存、健康投入、防沉迷边界和游戏化机制白/灰/黑名单 |
| SPCG 设计建议 v0.1 | [docs/SPCG_设计建议_v0.1.md](./docs/SPCG_设计建议_v0.1.md) | 早期产品视觉和设计方向 |
| 工程资产审查 | [docs/engineering-asset-review.md](./docs/engineering-asset-review.md) | 资产工程化和可维护性审查 |
| 素材目录说明 | [assets/README.md](./assets/README.md) | 项目图片、视频、UI 素材目录入口 |

## Legacy And Reference

| 文档 | 位置 | 用途 |
|---|---|---|
| Supabase legacy 说明 | [supabase/README.md](./supabase/README.md) | 旧 Supabase 目录，仅作历史参考 |
| Workstreams 说明 | [workstreams/README.md](./workstreams/README.md) | 早期 workstream 拆分参考 |
