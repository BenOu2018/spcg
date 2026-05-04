import type { TestCase } from '@spcg/shared/types'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import { createLessonPlanVersion, listLessonPlans } from '@/lib/repositories/lesson-plan-repository'
import {
  getLessonPlanProblemSet,
  type AdminAuditContext,
  type LessonPlanProblem,
  type LessonPlanProblemSet,
} from '@/lib/repositories/problem-set-repository'
import {
  generateLessonPlanMarkdownWithAi,
  getAiLessonPlanConfig,
} from '@/lib/services/ai-lesson-plan-client'
import { ServiceError } from '@/lib/services/errors'
import { ensureProblemSetCanGenerateLessonPlan } from '@/lib/services/problem-set-service'

export { getAiLessonPlanConfig }

export async function listAdminLessonPlans(problemSetId: string) {
  if (!isDatabaseConfigured()) return []
  return listLessonPlans(problemSetId)
}

export async function generateLessonPlanForProblemSet(problemSetId: string, audit: AdminAuditContext) {
  ensureDbConfigured()
  await ensureProblemSetCanGenerateLessonPlan(problemSetId)

  const set = await getLessonPlanProblemSet(problemSetId)
  if (!set) throw new ServiceError('not_found', '题单不存在。', 404)

  const inputSnapshot = buildInputSnapshot(set)
  const title = buildLessonPlanTitle(set)
  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(inputSnapshot)
  const generated = await generateLessonPlanMarkdownWithAi({ systemPrompt, userPrompt })

  return createLessonPlanVersion(
    {
      problemSetId,
      title,
      markdown: generated.markdown,
      source: 'ai',
      model: generated.model,
      promptSnapshot: `${systemPrompt}\n\n--- USER ---\n\n${userPrompt}`,
      inputSnapshot,
    },
    audit,
  )
}

export async function saveManualLessonPlanEdit(
  input: { problemSetId: string; markdown: string },
  audit: AdminAuditContext,
) {
  ensureDbConfigured()
  const markdown = input.markdown.trim()
  if (!input.problemSetId) throw new ServiceError('bad_request', '题单不能为空。', 400)
  if (!markdown) throw new ServiceError('bad_request', '教案 Markdown 不能为空。', 400)

  const set = await getLessonPlanProblemSet(input.problemSetId)
  if (!set) throw new ServiceError('not_found', '题单不存在。', 404)

  return createLessonPlanVersion(
    {
      problemSetId: input.problemSetId,
      title: buildLessonPlanTitle(set),
      markdown,
      source: 'manual_edit',
      model: null,
      promptSnapshot: null,
      inputSnapshot: buildInputSnapshot(set),
    },
    audit,
  )
}

function buildLessonPlanTitle(set: Pick<LessonPlanProblemSet, 'spcgLevel' | 'stageNo' | 'track' | 'title'>): string {
  if (set.spcgLevel && set.stageNo && set.track) {
    return `SPCG ${set.spcgLevel}级 第${set.stageNo}关 ${set.track}线教案`
  }
  return `${set.title} 教案`
}

function buildInputSnapshot(set: LessonPlanProblemSet): Record<string, unknown> {
  return {
    problemSet: {
      id: set.id,
      title: set.title,
      description: set.description,
      spcgLevel: set.spcgLevel,
      stageNo: set.stageNo,
      track: set.track,
      lessonFocus: set.lessonFocus,
      itemCount: set.items.length,
    },
    problems: set.items.map(sanitizeProblemForAi),
  }
}

function sanitizeProblemForAi(problem: LessonPlanProblem): Record<string, unknown> {
  return {
    levelId: problem.levelId,
    title: problem.title,
    position: problem.position,
    label: problem.label,
    required: problem.required,
    chapterId: problem.chapterId,
    order: problem.order,
    knowledgePoint: problem.knowledgePoint,
    difficulty: problem.difficulty,
    algorithmFamily: problem.algorithmFamily,
    algorithms: problem.algorithms,
    teacherNotes: truncate(problem.teacherNotes ?? '待补充', 1800),
    statement: truncate(problem.description, 2400),
    inputFormat: truncate(problem.inputFormat, 800),
    outputFormat: truncate(problem.outputFormat, 800),
    publicCases: problem.publicCases.map(sanitizePublicCase),
    solution: {
      explanation: truncate(problem.solution.explanation, 1800),
      keyPoints: problem.solution.keyPoints.map((point) => truncate(point, 700)),
      complexity: problem.solution.complexity,
    },
    sourceType: problem.source?.type ?? null,
  }
}

function sanitizePublicCase(test: TestCase): Record<string, unknown> {
  return {
    id: test.id,
    input: truncate(test.input, 600),
    expectedOutput: truncate(test.expectedOutput, 600),
    note: test.note ? truncate(test.note, 300) : null,
  }
}

function buildSystemPrompt(): string {
  return [
    '你是 SPCG 的资深算法课程教研老师。',
    '请基于用户提供的题单 JSON 生成中文 Markdown 教案草稿。',
    '只能使用输入 JSON 中的信息；缺失内容写“待补充”，不要编造题目、测试点或外部出处。',
    '数学变量、数组、复杂度和比较式必须使用 LaTeX，例如 `$n$`、`$a_i$`、`$O(n \\log n)$`。',
    '不要输出 hidden 测试点、不要暗示隐藏数据规模细节。',
    '直接输出 Markdown，不要用代码围栏包裹。',
  ].join('\n')
}

function buildUserPrompt(inputSnapshot: Record<string, unknown>): string {
  return `请按以下固定结构生成教案：

# {SPCG N级 第M关 A/B线} 教案
## 课程信息
## 教学目标
## 基础语法 / 前置知识
## 算法教学
## 课堂流程
## 题目列表
## 分题讲解
每题包含：题目、关卡、难度、知识点、题意模型、基本解法、算法题解、易错点、课堂提问。
## 课后练习与延伸
## 教师备注

题单数据 JSON：

${JSON.stringify(inputSnapshot, null, 2)}
`
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n...（已截断）` : value
}

function ensureDbConfigured() {
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
}
