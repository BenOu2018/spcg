# Admin Lesson Plans

SPCG 课程教案第一版复用 `problem_sets` 作为课程题单主体，并用 `lesson_plans` 保存可审计 Markdown 快照。

## Data Model

- `problem_sets.type='lesson'` 表示课程题单。
- 课程题单必须填写 `spcg_level`、`stage_no`、`track`、`lesson_focus`。
- `track` 只允许 `A` 或 `B`。
- 同一个未归档课程位置只能有一个 active 题单：`spcg_level + stage_no + track`。
- `problem_set_items` 保存题单中的题目，发布或生成教案时必须有 5-10 题。
- `levels.teacher_notes` 保存题包里的 `statement_teacher.md` 或旧 Markdown frontmatter `teacherNotes`。
- `lesson_plans` 每次 AI 生成或人工编辑都会创建新版本，不覆盖旧版本。

## Admin Flow

1. 在 `/admin/problem-sets` 创建课程题单。
2. 进入题单详情页，添加 5-10 道题并调整顺序。
3. 配置 AI 环境变量后点击 `Generate AI Lesson Plan`。
4. 系统读取题单、题目、教师说明、题解和算法标签，生成 Markdown 教案快照。
5. 管理员可编辑 Markdown 并保存为新版本。

## AI Configuration

使用 OpenAI-compatible Chat Completions HTTP 接口，不额外引入 SDK。

```text
LESSON_PLAN_AI_BASE_URL=https://api.openai.com/v1
LESSON_PLAN_AI_API_KEY=
LESSON_PLAN_AI_MODEL=
LESSON_PLAN_AI_TIMEOUT_MS=60000
```

AI 未配置或调用失败时不会保存教案。

## Safety Rules

- 教案只在 admin 后台可见。
- Prompt 只传公开题面、公开样例、题解、教师说明和算法标签。
- Hidden case 明细不会传给 AI。
- AI 被要求只基于输入内容生成；缺失内容写“待补充”。
- 数学变量、数组、复杂度和比较式统一要求使用 LaTeX。
