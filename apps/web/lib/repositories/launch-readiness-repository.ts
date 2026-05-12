import type { Difficulty, Hint, Solution, TestCase } from '@spcg/shared/types'
import { query } from '@/lib/db'

export type LaunchReadinessProblemSetStatus = 'draft' | 'review' | 'published' | 'archived'
export type LaunchReadinessProblemSetVisibility = 'admin' | 'student'

export type LaunchReadinessProblem = {
  levelId: string
  title: string | null
  status: LaunchReadinessProblemSetStatus | null
  chapterId: string | null
  order: number | null
  knowledgePoint: string | null
  difficulty: Difficulty | null
  description: string | null
  inputFormat: string | null
  outputFormat: string | null
  testCases: TestCase[] | null
  hints: Hint[] | null
  solution: Solution | null
  officialCode: string | null
  starterCode: string | null
  position: number
  required: boolean
  displayMode: string
}

export type LaunchReadinessProblemSet = {
  id: string
  title: string
  status: LaunchReadinessProblemSetStatus
  visibility: LaunchReadinessProblemSetVisibility
  spcgLevel: number
  stageNo: number
  track: 'A'
  lessonFocus: string | null
  items: LaunchReadinessProblem[]
}

type LaunchReadinessProblemSetRow = {
  problem_set_id: string
  problem_set_title: string
  problem_set_status: LaunchReadinessProblemSetStatus
  problem_set_visibility: LaunchReadinessProblemSetVisibility
  spcg_level: number
  stage_no: number
  lesson_focus: string | null
  level_id: string | null
  level_title: string | null
  level_status: LaunchReadinessProblemSetStatus | null
  chapter_id: string | null
  order: number | null
  knowledge_point: string | null
  difficulty: Difficulty | null
  description: string | null
  input_format: string | null
  output_format: string | null
  test_cases: TestCase[] | null
  hints: Hint[] | null
  solution: Solution | null
  official_code: string | null
  starter_code: string | null
  position: number | null
  required: boolean | null
  display_mode: string | null
} & Record<string, unknown>

export async function listLaunchReadinessLessonSets(spcgLevels: readonly number[]): Promise<LaunchReadinessProblemSet[]> {
  if (spcgLevels.length === 0) return []

  const rows = await query<LaunchReadinessProblemSetRow>(
    `
    SELECT
      ps.id AS problem_set_id,
      ps.title AS problem_set_title,
      ps.status AS problem_set_status,
      ps.visibility AS problem_set_visibility,
      ps.spcg_level,
      ps.stage_no,
      ps.lesson_focus,
      psi.level_id,
      l.title AS level_title,
      l.status AS level_status,
      l.chapter_id,
      l."order",
      l.knowledge_point,
      l.difficulty,
      l.description,
      l.input_format,
      l.output_format,
      l.test_cases,
      l.hints,
      l.solution,
      l.official_code,
      l.starter_code,
      psi.position,
      COALESCE(psi.required, FALSE) AS required,
      COALESCE(psi.metadata->>'displayMode', 'primary') AS display_mode
    FROM problem_sets ps
    LEFT JOIN problem_set_items psi ON psi.problem_set_id = ps.id
    LEFT JOIN levels l ON l.id = psi.level_id
    WHERE
      ps.type = 'lesson'
      AND ps.track = 'A'
      AND ps.status <> 'archived'
      AND ps.spcg_level = ANY($1::int[])
    ORDER BY ps.spcg_level ASC, ps.stage_no ASC, ps.id ASC, psi.position ASC NULLS LAST, psi.level_id ASC NULLS LAST
    `,
    [spcgLevels],
  )

  const setById = new Map<string, LaunchReadinessProblemSet>()

  for (const row of rows) {
    let set = setById.get(row.problem_set_id)
    if (!set) {
      set = {
        id: row.problem_set_id,
        title: row.problem_set_title,
        status: row.problem_set_status,
        visibility: row.problem_set_visibility,
        spcgLevel: Number(row.spcg_level),
        stageNo: Number(row.stage_no),
        track: 'A',
        lessonFocus: row.lesson_focus,
        items: [],
      }
      setById.set(row.problem_set_id, set)
    }

    if (!row.level_id) continue

    set.items.push({
      levelId: row.level_id,
      title: row.level_title,
      status: row.level_status,
      chapterId: row.chapter_id,
      order: row.order,
      knowledgePoint: row.knowledge_point,
      difficulty: row.difficulty,
      description: row.description,
      inputFormat: row.input_format,
      outputFormat: row.output_format,
      testCases: row.test_cases,
      hints: row.hints,
      solution: row.solution,
      officialCode: row.official_code,
      starterCode: row.starter_code,
      position: row.position ?? 0,
      required: Boolean(row.required),
      displayMode: row.display_mode ?? 'primary',
    })
  }

  return [...setById.values()]
}
