import type { ProblemSetItemDisplayMode } from './curriculum.js'

export type Language = 'auto' | 'c' | 'cpp11' | 'cpp14' | 'cpp17' | 'cpp20' | 'cpp23' | 'python3'
export type ResolvedLanguage = Exclude<Language, 'auto'>

export type UserRole = 'admin' | 'teacher' | 'student' | 'parent'
export type UiLocale = 'zh-CN' | 'en-US'
export type PhoneVerificationStatus = 'unbound' | 'pending' | 'verified'
export type StudentEnrollmentType = 'online' | 'offline'
export type StudentUserType = 'experience' | 'invite_test' | 'paid_49' | 'paid_99'
export type FeatureKey = 'levels_all' | 'ranked_all' | 'hints' | 'ai_analysis' | 'parent_reports'

export type EntitlementSummary = {
  userId: string
  userType: StudentUserType
  storedUserType: StudentUserType
  effectiveUserType: StudentUserType
  entitlementSource: 'stored' | 'offline_enrollment'
  studentEnrollmentType: StudentEnrollmentType
  label: string
  note: string | null
  expiresAt: string | null
  updatedAt: string | null
}

export type AccessDecision = {
  allowed: boolean
  reason: string | null
  upgradeRequired: boolean
  requiredUserType: StudentUserType | null
  userType: StudentUserType | null
}

export type UserIdentitySummary = {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  phoneNumberMasked: string | null
  phoneVerified: boolean
}

export type ParentAccountSummary = {
  id: string
  username: string
  email: string | null
  displayName: string | null
  phoneNumberMasked: string | null
  phoneVerified: boolean
}

export type ParentStudentBinding = {
  parentUserId: string
  studentUserId: string
  status: 'active' | 'removed'
  note: string | null
  createdAt: string
  updatedAt: string
  parent: ParentAccountSummary
}

export type StudentParentInviteSummary = {
  studentUserId: string
  studentPhoneNumberMasked: string | null
  studentPhoneVerified: boolean
  inviteStatus: 'active' | 'missing' | 'revoked'
  inviteCode: string | null
  codePreview: string | null
  rotatedAt: string | null
  canRevealCode: boolean
  boundParentCount: number
}

export type StudentParentInviteResetResult = {
  studentUserId: string
  inviteCode: string
  codePreview: string
  rotatedAt: string
}

export type TestCaseVisibility = 'public' | 'hidden'
export type SpcgLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
export type DifficultyStars = 1 | 2 | 3 | 4 | 5
export type DifficultyLevelLabel = `SPCG ${SpcgLevel}级`
export type DifficultyLayerLabel = '入门' | '基础' | '提高' | '挑战' | '综合'

export type TestCaseDataRef = {
  type: 'file'
  path: string
  bytes: number
  sha256: string
}

export type TestCase = {
  id: string
  input: string
  expectedOutput: string
  inputRef?: TestCaseDataRef
  expectedOutputRef?: TestCaseDataRef
  inputPreview?: string
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

export type LevelLocalizedEntry = {
  title?: string | null
  description?: string | null
  inputFormat?: string | null
  outputFormat?: string | null
  teacherNotes?: string | null
  solution?: Solution | null
}

export type LevelLocalizedContent = {
  en?: LevelLocalizedEntry | null
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

export type KnowledgeTagClassification = '编程算法' | '数学'

export type ProblemKnowledgeTag = {
  tagId: string
  classification: KnowledgeTagClassification
  role: ProblemAlgorithmRole
  source: string
}

export type ProblemKnowledgePointSnapshot = ProblemKnowledgeTag & {
  zhName: string
  enName: string
  domain: string
  bandOrLevel: string
}

export type KnowledgeTreeProgressStatus = 'unstarted' | 'unlocked' | 'practicing' | 'mastered'

export type KnowledgeTreeNode = {
  slotId: string
  tagId: string
  classification: KnowledgeTagClassification
  zhName: string
  enName: string
  domain: string
  bandOrLevel: string
  sortOrder: number
  x: number
  y: number
  radius: number
  color: string
  algorithmFamily: ProblemAlgorithmFamily | 'unknown'
  sourceSection: string
  recommendation: string
}

export type KnowledgeProgress = {
  tagId: string
  status: KnowledgeTreeProgressStatus
  mastery: number
  attemptCount: number
  correctCount: number
  lastPracticedAt: string | null
}

export type KnowledgeTreeLinkKind = 'tree' | 'prerequisite' | 'related'

export type KnowledgeTreeLink = {
  fromTagId: string
  toTagId: string
  kind: KnowledgeTreeLinkKind
  strength: number
  label: string
}

export type KnowledgeTreePayload = {
  classification: KnowledgeTagClassification
  generatedAt: string
  asset: {
    image: string
    width: number
    height: number
    nodeCount: number
  }
  nodes: KnowledgeTreeNode[]
  links: KnowledgeTreeLink[]
  progress: KnowledgeProgress[]
  levels: Array<{ value: string; count: number }>
  domains: Array<{ value: string; count: number; color: string }>
}

export type AlgorithmGraphKind = 'graph' | 'tree' | 'dag' | 'state-transition' | 'table'
export type AlgorithmGraphLayout = 'auto' | 'manual' | 'circle' | 'tree' | 'grid'
export type AlgorithmGraphVisibility = 'always'

export type AlgorithmGraphNode = {
  id: string
  label: string
  x?: number | null
  y?: number | null
  role?: string | null
}

export type AlgorithmGraphEdge = {
  from: string
  to: string
  label?: string | null
  weight?: string | number | null
  directed?: boolean | null
}

export type AlgorithmGraph = {
  id: string
  title: string
  kind: AlgorithmGraphKind
  description: string | null
  layout: AlgorithmGraphLayout
  visibility: AlgorithmGraphVisibility
  nodes: AlgorithmGraphNode[]
  edges: AlgorithmGraphEdge[]
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
  knowledgeTags?: ProblemKnowledgeTag[]
  knowledgePointSnapshots?: ProblemKnowledgePointSnapshot[]
  parentOrder?: number | null
  stageItemIndex?: number | null
  defaultDisplayMode?: ProblemSetItemDisplayMode | null
  mapVisible?: boolean | null
  testCasePolicy?: {
    mode?: string
    publicCases?: number
    hiddenCases?: number
    reason?: string
  } | null
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
  algorithmGraphs: AlgorithmGraph[]
  localizedContent: LevelLocalizedContent
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
  assessmentAttemptId?: string | null
  assessmentPhase?: 'realtime' | 'final' | null
  judgeMode?: 'fast' | 'full' | null
  score?: number
  maxScore?: number | null
  createdAt: string
  isPassOut: boolean
}

export type VerdictCaseResult = {
  index: number
  visibility: TestCase['visibility']
  passed: boolean
  result: Verdict['result']
  runtimeMs: number
  memoryKb?: number | null
  stdout?: string | null
}

export type JudgeProgress = {
  phase: 'queued' | 'judging' | 'completed'
  currentCaseIndex: number | null
  runningCaseRange: {
    from: number
    to: number
  } | null
  completedCases: number
  totalCases: number
  updatedAt: string
}

export type Verdict = {
  result: 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'PE' | 'Judge Error'
  passedCases: number
  totalCases: number
  maxRuntimeMs: number
  failedCaseIndex: number | null
  childFriendlyMessage: string
  errorDetail?: string
  caseResults?: VerdictCaseResult[]
}

export type CodeErrorAnalysis = {
  rawResponse?: string
  nonStructured?: boolean
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

export type RewardRank =
  | 'scrap_iron'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'stellar'
  | 'king'
  | 'master'
  | 'grandmaster'
  | 'legend'
  | 'server'

export type RewardSource =
  | 'level_first_ac'
  | 'hidden_garlic_drop'
  | 'repair_ac'
  | 'assessment_complete'
  | 'assessment_rank_bonus'
  | 'daily_review_complete'
  | 'leaderboard_rank_award'
  | 'admin_adjustment'

export type InventoryRarity = 'common' | 'rare' | 'epic' | 'legendary'
export type InventoryCategory = 'knowledge' | 'rank' | 'reward'

export type WalletSummary = {
  userId: string
  coinTotal: number
  garlicBalance: number
  rank: RewardRank
  rankLabel: string
  title: string
  updatedAt: string
}

export type EarnedTitleAward = {
  titleKey: string
  titleLabel: string
  rankAtAward: RewardRank
  poolKey: string
  levelId: string | null
  submissionId: string | null
  awardedAt: string
}

export type UserTitleRecord = EarnedTitleAward & {
  userId: string
  source: 'level_first_ac' | 'rank_reached'
  sourceRef: string
  metadata: Record<string, unknown>
}

export type InventoryItem = {
  id: string
  name: string
  description: string
  algorithmTag: string
  category: InventoryCategory
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
  titleAward?: EarnedTitleAward | null
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

export type LevelLeaderboardEntry = {
  rank: number
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  title: string
  coinTotal: number
  rankScore: number
  passedCount: number
  firstScoredAt: string
  lastScoredAt: string
}

export type CurrentUserLeaderboardRank = LevelLeaderboardEntry | null

export type LevelLeaderboardSummary = {
  spcgLevel: SpcgLevel
  levelName: string
  hudTitle: string
  mapAsset: string
  levelTotal: number
  totalParticipants: number
  todayPassedCount: number
  totalCoins: number
  topEntries: LevelLeaderboardEntry[]
  podium: LevelLeaderboardEntry[]
  currentUser: CurrentUserLeaderboardRank
}

export type TodayNewsArticleStatus = 'draft' | 'published' | 'archived'

export type TodayNewsArticleCard = {
  id: string
  slug: string
  topicZh: string
  topicEn: string
  bodyZh: string
  bodyEn: string
  imageUrl: string
  imageAltZh: string
  imageAltEn: string
  authorKey: string
  authorNameZh: string
  authorNameEn: string
  likeCount: number
  viewerLiked: boolean
  viewerBookmarked: boolean
  publishedAt: string
  publishedAtLabel: string
}

export type GrowthReportStatus = 'pending' | 'generated' | 'failed' | 'revoked'
export type GrowthReportDeliveryChannel = 'email' | 'sms'
export type GrowthReportDeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped'

export type GrowthReportStructuredSummary = {
  periodStart: string
  periodEnd: string
  reportVersion?: string
  headline?: string
  confidence?: 'high' | 'medium' | 'low'
  confidenceReason?: string
  submissionCount: number
  acceptedCount: number
  passedProblemCount: number
  pendingRepairCount: number
  activeDays?: number
  practiceHabitSummary?: string[]
  repairSummary?: string[]
  dataQualityNotes?: string[]
  weakVerdicts: string[]
  knowledgePoints: string[]
  nextActions: string[]
  generationProvider?: 'local' | 'minimax'
  generationModel?: string
}

export type GrowthReportSummary = {
  id: string
  studentUserId: string
  title: string
  periodStart: string
  periodEnd: string
  status: GrowthReportStatus
  publicUrl: string | null
  errorMessage: string | null
  tokenExpiresAt: string
  createdAt: string
}

export type GrowthReportDetail = GrowthReportSummary & {
  markdown: string
  summary: GrowthReportStructuredSummary | Record<string, unknown>
}

export type GrowthReportDelivery = {
  id: string
  reportId: string
  parentUserId: string
  channel: GrowthReportDeliveryChannel
  target: string
  status: GrowthReportDeliveryStatus
  failureReason: string | null
  createdAt: string
}

export type GrowthReportSettings = {
  enabled: boolean
  triggerMode: 'manual' | 'scheduled'
  frequency: 'weekly' | 'monthly'
  periodDays: number
  tokenTtlDays: number
  channels: GrowthReportDeliveryChannel[]
}

export type BehaviorEventType =
  | 'page_view_start'
  | 'page_view_end'
  | 'click'
  | 'ide_session'
  | 'ide_edit_summary'
  | 'ide_run'
  | 'ide_submit'
  | 'ide_error'
  | 'repair_success'
  | 'history_load'
  | 'ai_error_analysis'
  | 'whiteboard'
  | 'hint'
  | 'solution_video'

export type BehaviorAnalysisProvider = 'minimax' | 'local'
export type BehaviorAnalysisStatus = 'generated' | 'failed'
export type BehaviorFocusLevel = 'high' | 'medium' | 'low' | 'unknown'

export type BehaviorFocusOnCoding = {
  level: BehaviorFocusLevel
  summary: string
  evidence: string[]
  risks: string[]
}

export type BehaviorAnalysisResult = {
  overview: string
  learningRhythm: string
  routeFindings: string[]
  ideHabits: string[]
  focusOnCoding: BehaviorFocusOnCoding
  debuggingPattern: string
  repairProgress: string
  stuckRisks: string[]
  nextActions: string[]
  confidence: string
}

export type BehaviorAnalysisReportSummary = {
  id: string
  studentUserId: string
  periodStart: string
  periodEnd: string
  provider: BehaviorAnalysisProvider
  model: string
  status: BehaviorAnalysisStatus
  analysis: BehaviorAnalysisResult
  markdown: string
  generatedBy: string | null
  errorMessage: string | null
  createdAt: string
}

export type AssessmentType = 'exam' | 'contest' | 'daily_review'
export type AssessmentAttemptStatus = 'in_progress' | 'scoring' | 'completed' | 'expired' | 'abandoned'

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

export type AssessmentAttemptMetadata = Record<string, unknown> & {
  selectedDurationSeconds?: number | null
  judgeMode?: string | null
  futureGarlicCost?: number | null
  videoMonitor?: {
    enabled?: boolean
    bonusCoins?: number
    verifiedAt?: string | null
  } | null
}

export type AssessmentAttempt = {
  id: string
  sessionId: string
  userId: string
  status: AssessmentAttemptStatus
  startedAt: string
  finishedAt: string | null
  durationSeconds: number
  score: number
  acceptedCount: number
  totalCount: number
  reward: RewardGrantResult | null
  metadata: AssessmentAttemptMetadata
}

export type AssessmentAttemptItem = {
  attemptId: string
  levelId: string
  position: number
  displayMode: string
  source: 'lesson' | 'exam-only' | 'daily-review'
  maxScore: number
  latestRealtimeSubmissionId: string | null
  finalSubmissionId: string | null
  status: 'pending' | 'scoring' | 'done'
  passedCases: number
  totalCases: number
  score: number
  verdict: Verdict | null
}
