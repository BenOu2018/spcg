import { cache } from 'react'
import type {
  Difficulty,
  Hint,
  ProblemImportMeta,
  ProblemSource,
  ResolvedLanguage,
  SisterProblem,
  Solution,
  StatementAsset,
  TestCase,
  UserRole,
} from '@spcg/shared/types'
import { isDbConfigured, query, queryOne } from '@/lib/db'
import { levels as mockLevels, progressRecords as mockProgressRecords } from '@/lib/mock-data'

export type AdminStatus = 'draft' | 'review' | 'published' | 'archived'
export type ImportBatchStatus = 'draft' | 'validated' | 'approved' | 'rejected' | 'imported'
export type UserAccountStatus = 'active' | 'suspended' | 'deleted'

export type AdminLevel = {
  id: string
  chapterId: string
  order: number
  title: string
  knowledgePoint: string
  difficulty: Difficulty
  status: AdminStatus
  description: string
  statementAssets: StatementAsset[]
  inputFormat: string
  outputFormat: string
  testCases: TestCase[]
  hints: Hint[]
  solution: Solution
  officialCode: string
  starterCode: string
  source: ProblemSource
  importMeta: ProblemImportMeta
  teacherNotes: string | null
  sisterProblem: SisterProblem | null
  publicCases: number
  hiddenCases: number
  hintsCount: number
  solutionVideoUrl: string | null
  timeLimitMs: number
  memoryLimitMb: number
  defaultLanguage: ResolvedLanguage | null
  officialCodeLanguage: ResolvedLanguage | null
  guardianId: string | null
  story: string | null
  passOutProblemId: string | null
  updatedAt: string | null
  publishedAt: string | null
}

export type ProblemSet = {
  id: string
  title: string
  description: string | null
  type: 'chapter' | 'practice' | 'review' | 'challenge' | 'import-review' | 'lesson'
  status: AdminStatus
  visibility: 'admin' | 'student'
  itemCount: number
  updatedAt: string | null
}

export type ProblemSetItem = {
  levelId: string
  title: string
  position: number
  label: string | null
  required: boolean
  displayMode: 'primary' | 'backup' | 'exam-only'
}

export type ProblemSetDetail = ProblemSet & {
  items: ProblemSetItem[]
}

export type ImportBatch = {
  id: string
  batchKey: string | null
  source: string
  status: ImportBatchStatus
  summary: Record<string, unknown>
  reviewNote: string | null
  targetSpcgLevel: number | null
  targetProblemSetId: string | null
  targetProblemSetTitle: string | null
  defaultItemMode: 'primary' | 'backup' | 'exam-only'
  itemCount: number
  createdAt: string | null
  reviewedAt: string | null
  importedAt: string | null
}

export type ImportBatchItem = {
  levelId: string
  title: string
  filePath: string | null
  validationStatus: 'pending' | 'passed' | 'failed'
  status: 'pending' | 'approved' | 'rejected' | 'imported'
  validationErrors: unknown[]
  displayMode: 'primary' | 'backup' | 'exam-only' | null
}

export type ImportBatchDetail = ImportBatch & {
  items: ImportBatchItem[]
}

export type AuditLog = {
  id: string
  action: string
  resourceType: string
  resourceId: string | null
  actorRole: string | null
  createdAt: string
}

export type AdminUser = {
  id: string
  email: string | null
  displayName: string | null
  parentEmail: string | null
  accountStatus: UserAccountStatus
  isTestAccount: boolean
  adminRole: string | null
  adminActive: boolean
  userRole: UserRole
  passedCount: number
  submissionCount: number
  createdAt: string | null
  lastSignInAt: string | null
}

export type AdminUserProgress = {
  levelId: string
  levelTitle: string
  passed: boolean
  attemptCount: number
  bestRuntimeMs: number | null
  lastSubmittedAt: string | null
}

export type AdminUserDetail = AdminUser & {
  age: number | null
  notes: string | null
  progress: AdminUserProgress[]
}

export type AdminLevelSetMembership = {
  levelId: string
  problemSetId: string
  problemSetTitle: string
  spcgLevel: number | null
  stageNo: number | null
  track: string | null
  displayMode: 'primary' | 'backup' | 'exam-only'
}

type LevelRow = {
  id: string
  chapter_id: string
  order: number
  title: string
  knowledge_point: string
  difficulty: Difficulty
  status: AdminStatus
  description: string
  statement_assets: StatementAsset[] | null
  input_format: string
  output_format: string
  test_cases: TestCase[] | null
  hints: Hint[] | null
  solution: Solution
  official_code: string
  starter_code: string
  source: ProblemSource
  import_meta: ProblemImportMeta | null
  teacher_notes: string | null
  sister_problem: SisterProblem | null
  solution_video_url: string | null
  time_limit_ms: number
  memory_limit_mb: number
  guardian_id: string | null
  story: string | null
  pass_out_problem_id: string | null
  updated_at: string | null
  published_at: string | null
} & Record<string, unknown>

type ProblemSetRow = {
  id: string
  title: string
  description: string | null
  type: ProblemSet['type']
  status: AdminStatus
  visibility: ProblemSet['visibility']
  item_count: string | number
  updated_at: string | null
} & Record<string, unknown>

type AdminUserRow = {
  id: string
  email: string | null
  display_name: string | null
  parent_email: string | null
  account_status: UserAccountStatus | null
  is_test_account: boolean | null
  admin_role: string | null
  admin_active: boolean | null
  user_role: UserRole | null
  passed_count: string | number
  submission_count: string | number
  created_at: string | null
  last_sign_in_at: string | null
} & Record<string, unknown>

type UserProgressRow = {
  level_id: string
  level_title: string
  passed: boolean
  attempt_count: number
  best_runtime_ms: number | null
  last_submitted_at: string | null
} & Record<string, unknown>

type ImportBatchRow = {
  id: string
  batch_key: string | null
  source: string
  status: ImportBatchStatus
  summary: Record<string, unknown> | null
  review_note: string | null
  target_spcg_level: number | null
  target_problem_set_id: string | null
  target_problem_set_title: string | null
  default_item_mode: 'primary' | 'backup' | 'exam-only' | null
  item_count: string | number
  created_at: string | null
  reviewed_at: string | null
  imported_at: string | null
} & Record<string, unknown>

export const listAdminLevels = cache(async (): Promise<AdminLevel[]> => {
  if (!isDbConfigured()) return fallbackLevels()

  try {
    const rows = await query<LevelRow>(
      `
      SELECT id, chapter_id, "order", title, knowledge_point, difficulty, status, description,
             statement_assets, input_format, output_format, test_cases, hints, solution, official_code,
             starter_code, source, import_meta, teacher_notes, sister_problem, solution_video_url,
             time_limit_ms, memory_limit_mb, guardian_id, story, pass_out_problem_id, updated_at, published_at
      FROM levels
      ORDER BY chapter_id ASC, "order" ASC
      `,
    )
    return rows.map(mapLevelRow)
  } catch {
    return fallbackLevels()
  }
})

export async function getAdminLevel(id: string): Promise<AdminLevel | null> {
  if (!isDbConfigured()) {
    const levels = await listAdminLevels()
    return levels.find((level) => level.id === id) ?? null
  }

  const row = await queryOne<LevelRow>(
    `
    SELECT id, chapter_id, "order", title, knowledge_point, difficulty, status, description,
           statement_assets, input_format, output_format, test_cases, hints, solution, official_code,
           starter_code, source, import_meta, teacher_notes, sister_problem, solution_video_url,
           time_limit_ms, memory_limit_mb, guardian_id, story, pass_out_problem_id, updated_at, published_at
    FROM levels
    WHERE id = $1
    `,
    [id],
  )
  return row ? mapLevelRow(row) : null
}

export const listAdminLevelSetMemberships = cache(async (): Promise<AdminLevelSetMembership[]> => {
  if (!isDbConfigured()) return []

  try {
    const rows = await query<
      {
        level_id: string
        problem_set_id: string
        problem_set_title: string
        spcg_level: number | null
        stage_no: number | null
        track: string | null
        display_mode: 'primary' | 'backup' | 'exam-only' | null
      } & Record<string, unknown>
    >(
      `
      SELECT
        psi.level_id,
        ps.id AS problem_set_id,
        ps.title AS problem_set_title,
        ps.spcg_level,
        ps.stage_no,
        ps.track,
        COALESCE(psi.metadata->>'displayMode', 'primary') AS display_mode
      FROM problem_set_items psi
      JOIN problem_sets ps ON ps.id = psi.problem_set_id
      ORDER BY ps.spcg_level ASC NULLS LAST, ps.stage_no ASC NULLS LAST, psi.position ASC
      `,
    )

    return rows.map((row) => ({
      levelId: row.level_id,
      problemSetId: row.problem_set_id,
      problemSetTitle: row.problem_set_title,
      spcgLevel: row.spcg_level,
      stageNo: row.stage_no,
      track: row.track,
      displayMode: isDisplayMode(row.display_mode) ? row.display_mode : 'primary',
    }))
  } catch {
    return []
  }
})

export const listProblemSets = cache(async (): Promise<ProblemSet[]> => {
  if (!isDbConfigured()) return [fallbackProblemSet()]

  try {
    const rows = await query<ProblemSetRow>(
      `
      SELECT ps.id, ps.title, ps.description, ps.type, ps.status, ps.visibility, ps.updated_at,
             COUNT(psi.level_id) AS item_count
      FROM problem_sets ps
      LEFT JOIN problem_set_items psi ON psi.problem_set_id = ps.id
      GROUP BY ps.id
      ORDER BY ps.updated_at DESC
      `,
    )
    return rows.map(mapProblemSetRow)
  } catch {
    return [fallbackProblemSet()]
  }
})

export const listAdminUsers = cache(async (): Promise<AdminUser[]> => {
  if (!isDbConfigured()) return fallbackUsers()

  try {
    const rows = await query<AdminUserRow>(
      `
      SELECT
        u.id,
        u.email,
        COALESCE(p.display_name, u.display_name) AS display_name,
        p.parent_email,
        COALESCE(uas.account_status, 'active') AS account_status,
        COALESCE(uas.is_test_account, FALSE) AS is_test_account,
        ar.role AS admin_role,
        COALESCE(ar.active, FALSE) AS admin_active,
        COALESCE(ur.role, 'student') AS user_role,
        COUNT(DISTINCT pr.level_id) FILTER (WHERE pr.passed = TRUE) AS passed_count,
        COUNT(DISTINCT s.id) AS submission_count,
        u.created_at,
        u.last_sign_in_at
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN user_admin_states uas ON uas.user_id = u.id
      LEFT JOIN admin_roles ar ON ar.user_id = u.id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN progress pr ON pr.user_id = u.id
      LEFT JOIN submissions s ON s.user_id = u.id
      GROUP BY u.id, p.display_name, p.parent_email, uas.account_status, uas.is_test_account, ar.role, ar.active, ur.role
      ORDER BY u.created_at DESC
      `,
    )
    return rows.map(mapAdminUserRow)
  } catch {
    return fallbackUsers()
  }
})

export async function getAdminUser(id: string): Promise<AdminUserDetail | null> {
  const users = await listAdminUsers()
  const user = users.find((item) => item.id === id)
  if (!user) return null

  if (!isDbConfigured()) {
    return {
      ...user,
      age: null,
      notes: user.isTestAccount ? '本地预览测试账号' : null,
      progress: fallbackUserProgress(),
    }
  }

  const profile = await queryOne<{ age: number | null; notes: string | null } & Record<string, unknown>>(
    `
    SELECT p.age, uas.notes
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN user_admin_states uas ON uas.user_id = u.id
    WHERE u.id = $1
    `,
    [id],
  )

  const progressRows = await query<UserProgressRow>(
    `
    SELECT pr.level_id, l.title AS level_title, pr.passed, pr.attempt_count, pr.best_runtime_ms, pr.last_submitted_at
    FROM progress pr
    LEFT JOIN levels l ON l.id = pr.level_id
    WHERE pr.user_id = $1
    ORDER BY pr.updated_at DESC
    `,
    [id],
  )

  return {
    ...user,
    age: profile?.age ?? null,
    notes: profile?.notes ?? null,
    progress: progressRows.map((progress) => ({
      levelId: progress.level_id,
      levelTitle: progress.level_title ?? progress.level_id,
      passed: progress.passed,
      attemptCount: progress.attempt_count,
      bestRuntimeMs: progress.best_runtime_ms,
      lastSubmittedAt: progress.last_submitted_at,
    })),
  }
}

export async function getProblemSet(id: string): Promise<ProblemSetDetail | null> {
  if (!isDbConfigured()) {
    const fallback = fallbackProblemSet()
    return id === fallback.id ? { ...fallback, items: fallbackProblemSetItems() } : null
  }

  const setRow = await queryOne<ProblemSetRow>(
    `
    SELECT ps.id, ps.title, ps.description, ps.type, ps.status, ps.visibility, ps.updated_at,
           COUNT(psi.level_id) AS item_count
    FROM problem_sets ps
    LEFT JOIN problem_set_items psi ON psi.problem_set_id = ps.id
    WHERE ps.id = $1
    GROUP BY ps.id
    `,
    [id],
  )
  if (!setRow) return null

  const itemRows = await query<
    {
      level_id: string
      title: string | null
      position: number
      label: string | null
      required: boolean
      display_mode: 'primary' | 'backup' | 'exam-only' | null
    } & Record<string, unknown>
  >(
    `
    SELECT psi.level_id, l.title, psi.position, psi.label, psi.required,
           COALESCE(psi.metadata->>'displayMode', 'primary') AS display_mode
    FROM problem_set_items psi
    LEFT JOIN levels l ON l.id = psi.level_id
    WHERE psi.problem_set_id = $1
    ORDER BY psi.position ASC
    `,
    [id],
  )

  return {
    ...mapProblemSetRow(setRow),
    items: itemRows.map((row) => ({
      levelId: row.level_id,
      title: row.title ?? row.level_id,
      position: row.position,
      label: row.label,
      required: row.required,
      displayMode: isDisplayMode(row.display_mode) ? row.display_mode : 'primary',
    })),
  }
}

export const listImportBatches = cache(async (): Promise<ImportBatch[]> => {
  if (!isDbConfigured()) return [fallbackImportBatch()]

  try {
    const rows = await query<ImportBatchRow>(
      `
      SELECT lib.id, lib.batch_key, lib.source, lib.status, lib.summary, lib.review_note,
             lib.target_spcg_level, lib.target_problem_set_id, ps.title AS target_problem_set_title,
             lib.default_item_mode,
             COUNT(lii.id) AS item_count, lib.created_at, lib.reviewed_at, lib.imported_at
      FROM level_import_batches lib
      LEFT JOIN problem_sets ps ON ps.id = lib.target_problem_set_id
      LEFT JOIN level_import_items lii ON lii.batch_id = lib.id
      GROUP BY lib.id, ps.title
      ORDER BY lib.created_at DESC
      `,
    )
    return rows.map(mapImportBatchRow)
  } catch {
    return [fallbackImportBatch()]
  }
})

export async function getImportBatch(id: string): Promise<ImportBatchDetail | null> {
  if (!isDbConfigured()) {
    const fallback = fallbackImportBatch()
    return id === fallback.id ? { ...fallback, items: [] } : null
  }

  const batchRow = await queryOne<ImportBatchRow>(
    `
    SELECT lib.id, lib.batch_key, lib.source, lib.status, lib.summary, lib.review_note,
           lib.target_spcg_level, lib.target_problem_set_id, ps.title AS target_problem_set_title,
           lib.default_item_mode,
           COUNT(lii.id) AS item_count, lib.created_at, lib.reviewed_at, lib.imported_at
    FROM level_import_batches lib
    LEFT JOIN problem_sets ps ON ps.id = lib.target_problem_set_id
    LEFT JOIN level_import_items lii ON lii.batch_id = lib.id
    WHERE lib.id = $1
    GROUP BY lib.id, ps.title
    `,
    [id],
  )
  if (!batchRow) return null

  const itemRows = await query<
    {
      level_id: string
      title: string
      file_path: string | null
      validation_status: ImportBatchItem['validationStatus']
      validation_errors: unknown[] | null
      payload: Record<string, unknown> | null
      status: ImportBatchItem['status']
    } & Record<string, unknown>
  >(
    `
    SELECT level_id, title, file_path, validation_status, validation_errors, payload, status
    FROM level_import_items
    WHERE batch_id = $1
    ORDER BY created_at ASC
    `,
    [id],
  )

  return {
    ...mapImportBatchRow(batchRow),
    items: itemRows.map((row) => ({
      levelId: row.level_id,
      title: row.title,
      filePath: row.file_path,
      validationStatus: row.validation_status,
      status: row.status,
      validationErrors: Array.isArray(row.validation_errors) ? row.validation_errors : [],
      displayMode: isRecord(row.payload) && isDisplayMode(row.payload.displayMode) ? row.payload.displayMode : null,
    })),
  }
}

export const listAuditLogs = cache(async (): Promise<AuditLog[]> => {
  if (!isDbConfigured()) return []

  try {
    return await query<AuditLogRow>(
      `
      SELECT id, action, resource_type, resource_id, actor_role, created_at
      FROM admin_audit_logs
      ORDER BY created_at DESC
      LIMIT 100
      `,
    ).then((rows) =>
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        actorRole: row.actor_role,
        createdAt: row.created_at,
      })),
    )
  } catch {
    return []
  }
})

type AuditLogRow = {
  id: string
  action: string
  resource_type: string
  resource_id: string | null
  actor_role: string | null
  created_at: string
} & Record<string, unknown>

function mapLevelRow(row: LevelRow): AdminLevel {
  const testCases = row.test_cases ?? []
  const importMetaRecord: Record<string, unknown> = isRecord(row.import_meta) ? row.import_meta : {}
  const importMeta = row.import_meta ?? {
    templateVersion: 'unknown',
    importedAt: null,
    importBatch: null,
    checksum: null,
    validationStatus: 'pending' as const,
    validationErrors: [],
  }
  return {
    id: row.id,
    chapterId: row.chapter_id,
    order: row.order,
    title: row.title,
    knowledgePoint: row.knowledge_point,
    difficulty: row.difficulty,
    status: row.status,
    description: row.description,
    statementAssets: row.statement_assets ?? [],
    inputFormat: row.input_format,
    outputFormat: row.output_format,
    testCases,
    hints: row.hints ?? [],
    solution: row.solution,
    officialCode: row.official_code,
    starterCode: row.starter_code,
    source: row.source,
    importMeta,
    teacherNotes: row.teacher_notes ?? null,
    sisterProblem: row.sister_problem ?? null,
    publicCases: testCases.filter((test) => test.visibility === 'public').length,
    hiddenCases: testCases.filter((test) => test.visibility === 'hidden').length,
    hintsCount: row.hints?.length ?? 0,
    solutionVideoUrl: row.solution_video_url ?? null,
    timeLimitMs: row.time_limit_ms,
    memoryLimitMb: row.memory_limit_mb,
    defaultLanguage: isResolvedLanguage(importMetaRecord.defaultLanguage) ? importMetaRecord.defaultLanguage : null,
    officialCodeLanguage: isResolvedLanguage(importMetaRecord.officialCodeLanguage)
      ? importMetaRecord.officialCodeLanguage
      : null,
    guardianId: row.guardian_id ?? null,
    story: row.story ?? null,
    passOutProblemId: row.pass_out_problem_id ?? null,
    updatedAt: row.updated_at ?? null,
    publishedAt: row.published_at ?? null,
  }
}

function mapProblemSetRow(row: ProblemSetRow): ProblemSet {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    status: row.status,
    visibility: row.visibility,
    itemCount: Number(row.item_count),
    updatedAt: row.updated_at,
  }
}

function mapAdminUserRow(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    parentEmail: row.parent_email,
    accountStatus: row.account_status ?? 'active',
    isTestAccount: Boolean(row.is_test_account),
    adminRole: row.admin_role,
    adminActive: Boolean(row.admin_active),
    userRole: row.user_role ?? 'student',
    passedCount: Number(row.passed_count),
    submissionCount: Number(row.submission_count),
    createdAt: row.created_at,
    lastSignInAt: row.last_sign_in_at,
  }
}

function mapImportBatchRow(row: ImportBatchRow): ImportBatch {
  return {
    id: row.id,
    batchKey: row.batch_key,
    source: row.source,
    status: row.status,
    summary: isRecord(row.summary) ? row.summary : {},
    reviewNote: row.review_note,
    targetSpcgLevel: row.target_spcg_level,
    targetProblemSetId: row.target_problem_set_id,
    targetProblemSetTitle: row.target_problem_set_title,
    defaultItemMode: isDisplayMode(row.default_item_mode) ? row.default_item_mode : 'primary',
    itemCount: Number(row.item_count),
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    importedAt: row.imported_at,
  }
}

function fallbackLevels(): AdminLevel[] {
  return mockLevels.map((level) => ({
    id: level.id,
    chapterId: level.chapterId,
    order: level.order,
    title: level.title,
    knowledgePoint: level.knowledgePoint,
    difficulty: level.difficulty,
    status: 'published',
    description: level.description,
    statementAssets: level.statementAssets,
    inputFormat: level.inputFormat,
    outputFormat: level.outputFormat,
    testCases: [...level.publicCases],
    hints: level.hints,
    solution: level.solution ?? {
      explanation: '',
      keyPoints: [],
      complexity: { time: '', memory: '' },
    },
    officialCode: level.officialCode ?? '',
    starterCode: level.starterCode,
    source: level.source,
    importMeta: {
      templateVersion: 'mock',
      importedAt: null,
      importBatch: null,
      checksum: null,
      validationStatus: 'passed',
      validationErrors: [],
    },
    teacherNotes: level.teacherNotes ?? null,
    sisterProblem: level.sisterProblem,
    publicCases: level.publicCases.length,
    hiddenCases: level.hiddenCount,
    hintsCount: level.hints.length,
    solutionVideoUrl: level.solutionVideoUrl ?? null,
    timeLimitMs: level.timeLimitMs,
    memoryLimitMb: level.memoryLimitMb,
    defaultLanguage: null,
    officialCodeLanguage: null,
    guardianId: level.guardianId,
    story: level.story,
    passOutProblemId: level.passOutProblemId,
    updatedAt: null,
    publishedAt: null,
  }))
}

function fallbackProblemSet(): ProblemSet {
  return {
    id: 'ch1-mainline',
    title: '第一章主线关卡',
    description: '本地 mock 题单；连接 PostgreSQL 后读取 problem_sets。',
    type: 'chapter',
    status: 'published',
    visibility: 'student',
    itemCount: mockLevels.filter((level) => level.order < 100).length,
    updatedAt: null,
  }
}

function fallbackProblemSetItems(): ProblemSetItem[] {
  return mockLevels
    .filter((level) => level.order < 100)
    .map((level) => ({
      levelId: level.id,
      title: level.title,
      position: level.order,
      label: level.knowledgePoint,
      required: true,
      displayMode: 'primary',
    }))
}

function fallbackImportBatch(): ImportBatch {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    batchKey: 'local-incoming-preview',
    source: 'problem-bank',
    status: 'validated',
    summary: { mode: 'local fallback' },
    reviewNote: null,
    targetSpcgLevel: null,
    targetProblemSetId: null,
    targetProblemSetTitle: null,
    defaultItemMode: 'primary',
    itemCount: 0,
    createdAt: null,
    reviewedAt: null,
    importedAt: null,
  }
}

function fallbackUsers(): AdminUser[] {
  return [
    {
      id: 'demo-user',
      email: 'student-preview@spcg.local',
      displayName: '预览学生',
      parentEmail: 'parent-preview@spcg.local',
      accountStatus: 'active',
      isTestAccount: true,
      adminRole: null,
      adminActive: false,
      userRole: 'student',
      passedCount: mockProgressRecords.filter((progress) => progress.passed).length,
      submissionCount: 0,
      createdAt: null,
      lastSignInAt: null,
    },
    {
      id: 'admin-preview',
      email: 'admin-preview@spcg.local',
      displayName: '后台预览管理员',
      parentEmail: null,
      accountStatus: 'active',
      isTestAccount: true,
      adminRole: 'owner',
      adminActive: true,
      userRole: 'admin',
      passedCount: 0,
      submissionCount: 0,
      createdAt: null,
      lastSignInAt: null,
    },
  ]
}

function fallbackUserProgress(): AdminUserProgress[] {
  return mockProgressRecords.map((progress) => ({
    levelId: progress.levelId,
    levelTitle: mockLevels.find((level) => level.id === progress.levelId)?.title ?? progress.levelId,
    passed: progress.passed,
    attemptCount: progress.attemptCount,
    bestRuntimeMs: progress.bestRuntimeMs,
    lastSubmittedAt: progress.lastSubmittedAt,
  }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDisplayMode(value: unknown): value is 'primary' | 'backup' | 'exam-only' {
  return value === 'primary' || value === 'backup' || value === 'exam-only'
}

function isResolvedLanguage(value: unknown): value is ResolvedLanguage {
  return (
    value === 'c' ||
    value === 'cpp11' ||
    value === 'cpp14' ||
    value === 'cpp17' ||
    value === 'cpp20' ||
    value === 'cpp23' ||
    value === 'python3'
  )
}
