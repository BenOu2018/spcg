export type Language = 'auto' | 'c' | 'cpp11' | 'cpp14' | 'cpp17' | 'cpp20' | 'cpp23' | 'python3'
export type ResolvedLanguage = Exclude<Language, 'auto'>

export type UserRole = 'admin' | 'teacher' | 'student'

export type TestCaseVisibility = 'public' | 'hidden'
export type SpcgLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
export type DifficultyStars = 1 | 2 | 3 | 4 | 5
export type DifficultyLevelLabel = `SPCG ${SpcgLevel}级`
export type DifficultyLayerLabel = '入门' | '基础' | '提高' | '挑战' | '综合'

export type TestCase = {
  id: string
  input: string
  expectedOutput: string
  visibility: TestCaseVisibility
  note?: string
}

export type Hint = {
  step: 1 | 2 | 3
  title: string
  content: string
}

export type Solution = {
  explanation: string
  keyPoints: string[]
  complexity: {
    time: string
    memory: string
  }
}

export type Difficulty = {
  spcgLevel: SpcgLevel
  levelLabel: DifficultyLevelLabel
  stars: DifficultyStars
  label: DifficultyLayerLabel
  lglevel: string | null
}

export type ProblemAlgorithmFamily =
  | 'implementation'
  | 'math'
  | 'greedy'
  | 'search'
  | 'dp'
  | 'graph'
  | 'string'
  | 'data-structure'
  | 'divide-conquer'
  | 'geometry'
  | 'combinatorics'
  | 'constructive'
  | 'simulation'
  | 'other'

export type ProblemAlgorithmRole = 'primary' | 'secondary' | 'supporting'

export type ProblemAlgorithm = {
  id: string
  name: string
  family: ProblemAlgorithmFamily
  role: ProblemAlgorithmRole
  note: string | null
}

export type ProblemSource = {
  type: 'original' | 'authorized' | 'adapted'
  name: string
  url: string | null
  author: string | null
  license: string | null
  attribution: string | null
  notes: string | null
  originalPublicSamples?: Array<{
    input: string
    expectedOutput: string
  }> | null
}

export type ProblemImportMeta = {
  templateVersion: string
  importedAt: string | null
  importBatch: string | null
  checksum: string | null
  validationStatus: 'pending' | 'passed' | 'failed'
  validationErrors: string[]
  sourceFormat?: 'spcg-level-v0.1' | 'problem-package-v1.1'
  packagePath?: string | null
  packageChecksum?: string | null
  schemaVersion?: string | null
  algorithmFamily?: ProblemAlgorithmFamily | null
  algorithms?: ProblemAlgorithm[]
  parentOrder?: number | null
  defaultDisplayMode?: 'primary' | 'backup' | 'exam-only' | null
  mapVisible?: boolean | null
}

export type StatementAsset = {
  id: string
  type: 'image'
  url: string
  alt: string
  caption: string | null
}

export type SisterProblem = {
  levelId: string
  title: string
  relation: 'same-pattern' | 'same-knowledge' | 'review'
  note: string | null
}

export type Level = {
  id: string
  chapterId: string
  order: number
  title: string
  knowledgePoint: string
  difficulty: Difficulty
  sisterProblem: SisterProblem | null
  description: string
  statementAssets: StatementAsset[]
  inputFormat: string
  outputFormat: string
  publicCases: TestCase[]
  hiddenCount: number
  hints: Hint[]
  solutionUnlocked: boolean
  solution?: Solution
  officialCode?: string
  solutionVideoUrl?: string | null
  timeLimitMs: number
  memoryLimitMb: number
  starterCode: string
  source: ProblemSource
  teacherNotes?: string | null

  guardianId: string | null
  story: string | null
  passOutProblemId: string | null
}

export type LevelRecord = Omit<
  Level,
  'publicCases' | 'hiddenCount' | 'solutionUnlocked' | 'solution' | 'officialCode' | 'solutionVideoUrl'
> & {
  defaultLanguage: ResolvedLanguage
  officialCodeLanguage: ResolvedLanguage
  testCases: TestCase[]
  solution: Solution
  officialCode: string
  solutionVideoUrl: string | null
  importMeta: ProblemImportMeta
}

export type Submission = {
  id: string
  userId: string
  levelId: string
  code: string
  language: Language
  resolvedLanguage: ResolvedLanguage | null
  status: 'pending' | 'judging' | 'done' | 'error'
  verdict: Verdict | null
  createdAt: string
  isPassOut: boolean
}

export type Verdict = {
  result: 'AC' | 'WA' | 'TLE' | 'RE' | 'CE' | 'Judge Error'
  passedCases: number
  totalCases: number
  maxRuntimeMs: number
  failedCaseIndex: number | null
  childFriendlyMessage: string
  errorDetail?: string
}

export type CodeErrorAnalysis = {
  whereWrong?: string
  summary: string
  likelyCause: string
  reasonList?: string[]
  lineHints: string[]
  nextSteps: string[]
  fixedConcept: string
}

export type SubmissionErrorAnalysis = {
  id: string
  submissionId: string
  provider: 'minimax'
  model: string
  verdictResult: Exclude<Verdict['result'], 'AC'>
  analysis: CodeErrorAnalysis
  rawError: string | null
  promptHash: string
  createdAt: string
}

export type Progress = {
  userId: string
  levelId: string
  passed: boolean
  attemptCount: number
  bestRuntimeMs: number | null
  lastSubmittedAt: string
  passedOut: boolean
}

export type RewardRank = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'stellar'

export type RewardSource =
  | 'level_first_ac'
  | 'hidden_garlic_drop'
  | 'assessment_complete'
  | 'assessment_rank_bonus'
  | 'admin_adjustment'

export type InventoryRarity = 'common' | 'rare' | 'epic' | 'legendary'

export type WalletSummary = {
  userId: string
  coinTotal: number
  garlicBalance: number
  rank: RewardRank
  rankLabel: string
  title: string
  updatedAt: string
}

export type InventoryItem = {
  id: string
  name: string
  description: string
  algorithmTag: string
  rarity: InventoryRarity
  icon: string | null
  stackable: boolean
}

export type UserInventoryItem = {
  item: InventoryItem
  quantity: number
  firstAcquiredAt: string
  lastAcquiredAt: string
}

export type RewardGrantResult = {
  coinDelta: number
  garlicDelta: number
  items: Array<{
    itemId: string
    name: string
    quantity: number
  }>
  rankBefore: RewardRank
  rankAfter: RewardRank
  title: string
  ledgerIds: string[]
}

export type RewardLedgerEntry = {
  id: string
  userId: string
  source: RewardSource
  sourceRef: string
  coinDelta: number
  garlicDelta: number
  itemId: string | null
  itemQuantity: number
  metadata: Record<string, unknown>
  createdAt: string
}

export type AssessmentType = 'exam' | 'contest'
export type AssessmentAttemptStatus = 'in_progress' | 'completed' | 'expired' | 'abandoned'

export type AssessmentSession = {
  id: string
  type: AssessmentType
  title: string
  problemSetId: string | null
  durationSeconds: number
  coinReward: number
  garlicReward: number
  status: 'draft' | 'published' | 'archived'
}

export type AssessmentAttempt = {
  id: string
  sessionId: string
  userId: string
  status: AssessmentAttemptStatus
  startedAt: string
  finishedAt: string | null
  score: number
  acceptedCount: number
  totalCount: number
  reward: RewardGrantResult | null
}
