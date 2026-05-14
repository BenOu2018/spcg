import {
  ApiRequestError,
  bindStudent,
  clearStoredToken,
  getParentDashboard,
  getStoredToken,
  getStudentReportDetail,
  getStudentReports,
  registerParent,
  requestStudentReport,
  setStoredToken,
  signInParent,
  signOutParent,
  type GrowthReportDetail,
  type GrowthReportSummary,
  type ParentAuthResult,
  type ParentDashboard,
  type ParentStudentSummary,
  type ReportAvailability,
} from '../../utils/api'

type AuthMode = 'signIn' | 'register'
type ActiveView = 'auth' | 'dashboard' | 'reports' | 'reportDetail'

type StudentView = ParentStudentSummary & {
  displayNameText: string
  avatarInitial: string
  currentLevelText: string
  currentTitleText: string
  statsText: string
  lastSubmittedText: string
  lastSubmittedShortText: string
  latestReportText: string
  latestReportTitleText: string
  learningStatusText: string
  learningStatusClass: string
  learningStreakText: string
  activeDaysText: string
  reportActionText: string
  reportButtonText: string
  reportHintText: string
  reportCooling: boolean
}

type ReportView = GrowthReportSummary & {
  periodText: string
  statusText: string
  createdText: string
}

type ReportSection = {
  title: string
  items: string[]
}

type IndexData = {
  activeView: ActiveView
  authMode: AuthMode
  loading: boolean
  errorMessage: string
  parentName: string
  parentInitial: string
  token: string
  email: string
  password: string
  confirmPassword: string
  displayName: string
  inviteCode: string
  bindInviteCode: string
  students: StudentView[]
  selectedStudent: StudentView | null
  reports: ReportView[]
  reportAvailability: ReportAvailability | null
  selectedReport: GrowthReportDetail | null
  reportSections: ReportSection[]
}

type IndexMethods = {
  loadDashboard(): Promise<void>
  showSignIn(): void
  showRegister(): void
  onTextInput(event: WechatMiniprogram.Input): void
  submitAuth(): Promise<void>
  submitBindStudent(): Promise<void>
  signOut(): Promise<void>
  selectStudent(event: DatasetEvent): void
  openReports(event: DatasetEvent): Promise<void>
  requestReport(): Promise<void>
  openReportDetail(event: DatasetEvent): Promise<void>
  backToDashboard(): void
  backToReports(): void
  applyAuthResult(result: ParentAuthResult): void
  applyDashboard(dashboard: ParentDashboard, selectedStudentId?: string): void
  findStudent(studentId?: string): StudentView | null
}

type DatasetEvent = {
  currentTarget: {
    dataset: Record<string, string | undefined>
  }
}

Page<IndexData, IndexMethods>({
  data: {
    activeView: 'auth',
    authMode: 'signIn',
    loading: false,
    errorMessage: '',
    parentName: '',
    parentInitial: '家',
    token: '',
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
    inviteCode: '',
    bindInviteCode: '',
    students: [],
    selectedStudent: null,
    reports: [],
    reportAvailability: null,
    selectedReport: null,
    reportSections: [],
  },

  async onLoad() {
    const token = getStoredToken()
    if (!token) return
    this.setData({ token, loading: true })
    try {
      await this.loadDashboard()
    } catch (error) {
      clearStoredToken()
      this.setData({ activeView: 'auth', token: '', errorMessage: getErrorMessage(error) })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadDashboard() {
    if (!this.data.token) return
    const dashboard = await getParentDashboard(this.data.token)
    this.applyDashboard(dashboard, this.data.selectedStudent?.studentUserId)
  },

  showSignIn() {
    this.setData({ authMode: 'signIn', errorMessage: '' })
  },

  showRegister() {
    this.setData({ authMode: 'register', errorMessage: '' })
  },

  onTextInput(event: WechatMiniprogram.Input) {
    const field = event.currentTarget.dataset.field
    if (typeof field !== 'string') return
    this.setData({ [field]: event.detail.value } as Partial<IndexData>)
  },

  async submitAuth() {
    if (this.data.loading) return
    this.setData({ loading: true, errorMessage: '' })
    try {
      const result =
        this.data.authMode === 'register'
          ? await registerParent({
              email: this.data.email,
              displayName: this.data.displayName,
              password: this.data.password,
              confirmPassword: this.data.confirmPassword,
              inviteCode: this.data.inviteCode,
            })
          : await signInParent({
              email: this.data.email,
              password: this.data.password,
            })
      this.applyAuthResult(result)
      wx.showToast({ title: '已登录', icon: 'success' })
    } catch (error) {
      this.setData({ errorMessage: getErrorMessage(error) })
    } finally {
      this.setData({ loading: false })
    }
  },

  async submitBindStudent() {
    if (!this.data.token || this.data.loading) return
    this.setData({ loading: true, errorMessage: '' })
    try {
      const dashboard = await bindStudent(this.data.token, this.data.bindInviteCode)
      this.applyDashboard(dashboard, this.data.selectedStudent?.studentUserId)
      this.setData({ bindInviteCode: '' })
      wx.showToast({ title: '已绑定', icon: 'success' })
    } catch (error) {
      this.setData({ errorMessage: getErrorMessage(error) })
    } finally {
      this.setData({ loading: false })
    }
  },

  async signOut() {
    const token = this.data.token
    clearStoredToken()
    this.setData({
      activeView: 'auth',
      token: '',
      parentName: '',
      parentInitial: '家',
      students: [],
      selectedStudent: null,
      reports: [],
      selectedReport: null,
      reportSections: [],
      errorMessage: '',
    })
    if (token) {
      await signOutParent(token).catch(() => undefined)
    }
  },

  selectStudent(event: DatasetEvent) {
    const student = this.findStudent(event.currentTarget.dataset.id)
    if (student) this.setData({ selectedStudent: student, activeView: 'dashboard', errorMessage: '' })
  },

  async openReports(event: DatasetEvent) {
    const student = this.findStudent(event.currentTarget.dataset.id) ?? this.data.selectedStudent
    if (!student || !this.data.token) return
    this.setData({ loading: true, selectedStudent: student, errorMessage: '' })
    try {
      const result = await getStudentReports(this.data.token, student.studentUserId)
      this.setData({
        activeView: 'reports',
        reports: result.reports.map(decorateReport),
        reportAvailability: result.reportAvailability,
      })
    } catch (error) {
      this.setData({ errorMessage: getErrorMessage(error) })
    } finally {
      this.setData({ loading: false })
    }
  },

  async requestReport() {
    const student = this.data.selectedStudent
    if (!student || !this.data.token || this.data.loading) return
    this.setData({ loading: true, errorMessage: '' })
    try {
      const result = await requestStudentReport(this.data.token, student.studentUserId)
      wx.showToast({ title: '已提交', icon: 'success' })
      this.setData({ reportAvailability: result.reportAvailability })
      await this.loadDashboard()
      await this.openReports({ currentTarget: { dataset: { id: student.studentUserId } } })
    } catch (error) {
      this.setData({ errorMessage: getErrorMessage(error) })
    } finally {
      this.setData({ loading: false })
    }
  },

  async openReportDetail(event: DatasetEvent) {
    const student = this.data.selectedStudent
    const reportId = event.currentTarget.dataset.reportId
    if (!student || !reportId || !this.data.token) return
    this.setData({ loading: true, errorMessage: '' })
    try {
      const result = await getStudentReportDetail(this.data.token, student.studentUserId, reportId)
      this.setData({
        activeView: 'reportDetail',
        selectedReport: result.report,
        reportSections: buildReportSections(result.report),
      })
    } catch (error) {
      this.setData({ errorMessage: getErrorMessage(error) })
    } finally {
      this.setData({ loading: false })
    }
  },

  backToDashboard() {
    this.setData({ activeView: 'dashboard', errorMessage: '' })
  },

  backToReports() {
    this.setData({ activeView: 'reports', errorMessage: '' })
  },

  applyAuthResult(result: ParentAuthResult) {
    setStoredToken(result.token)
    this.setData({ token: result.token })
    this.applyDashboard(result)
  },

  applyDashboard(dashboard: ParentDashboard, selectedStudentId?: string) {
    const students = dashboard.students.map(decorateStudent)
    const selectedStudent =
      students.find((student) => student.studentUserId === selectedStudentId) ?? students[0] ?? null
    this.setData({
      activeView: 'dashboard',
      parentName: dashboard.parent.displayName || dashboard.parent.username,
      parentInitial: firstInitial(dashboard.parent.displayName || dashboard.parent.username || '家长'),
      students,
      selectedStudent,
      reports: [],
      selectedReport: null,
      reportSections: [],
      errorMessage: '',
    })
  },

  findStudent(studentId?: string) {
    if (!studentId) return null
    return this.data.students.find((student) => student.studentUserId === studentId) ?? null
  },
})

function decorateStudent(student: ParentStudentSummary): StudentView {
  const reportCooling = !student.reportAvailability.canRequestReport
  const displayNameText = student.displayName || student.username
  const learningStatus = getLearningStatus(student.lastSubmittedAt, student.submissionCount)
  return {
    ...student,
    displayNameText,
    avatarInitial: firstInitial(displayNameText),
    currentLevelText: student.currentLevelTitle
      ? `${student.currentLevelTitle}${student.currentSpcgLevel ? ` · SPCG ${student.currentSpcgLevel}级` : ''}`
      : '暂未开始关卡',
    currentTitleText: student.currentSpcgLevel ? `SPCG ${student.currentSpcgLevel}级` : '成长观察中',
    statsText: `已通过 ${student.passedCount} 题 · 提交 ${student.submissionCount} 次`,
    lastSubmittedText: student.lastSubmittedAt ? `最近学习 ${formatDate(student.lastSubmittedAt)}` : '暂无提交记录',
    lastSubmittedShortText: student.lastSubmittedAt ? formatShortDate(student.lastSubmittedAt) : '暂无',
    latestReportText: student.latestReport ? `${student.latestReport.title} · ${formatDate(student.latestReport.createdAt)}` : '暂无报告',
    latestReportTitleText: student.latestReport ? student.latestReport.title : '等待生成第一份报告',
    learningStatusText: learningStatus.text,
    learningStatusClass: learningStatus.className,
    learningStreakText: student.learningStreakDays > 0 ? `${student.learningStreakDays}天` : '观察中',
    activeDaysText: student.activeDaysLast14 > 0 ? `${student.activeDaysLast14}天` : '暂无',
    reportActionText: reportCooling
      ? `下次可申请 ${formatDate(student.reportAvailability.nextAvailableAt)}`
      : '可申请新报告',
    reportButtonText: reportCooling ? '查看学习报告' : '申请生成学习报告',
    reportHintText: reportCooling
      ? `最近 14 天内已申请，${formatDate(student.reportAvailability.nextAvailableAt)} 后可再次申请。`
      : '系统会结合闯关、提交和调试过程生成 AI 学习报告。',
    reportCooling,
  }
}

function decorateReport(report: GrowthReportSummary): ReportView {
  return {
    ...report,
    periodText: `${report.periodStart} 至 ${report.periodEnd}`,
    statusText: formatReportStatus(report.status),
    createdText: formatDate(report.createdAt),
  }
}

function buildReportSections(report: GrowthReportDetail): ReportSection[] {
  const summary = report.summary
  const sections = [
    sectionFromValue('概览', summary.overview ?? summary.practiceHabitSummary),
    sectionFromValue('掌握情况', summary.mastery ?? summary.knowledgePoints),
    sectionFromValue('练习习惯', summary.practiceHabits),
    sectionFromValue('调试修错', summary.debugging ?? summary.repairSummary),
    sectionFromValue('下一步', summary.parentActions ?? summary.nextActions),
    sectionFromValue('数据说明', summary.dataNotes ?? summary.dataQualityNotes),
  ].filter((section): section is ReportSection => Boolean(section))

  if (sections.length > 0) return sections
  return markdownToSections(report.markdown)
}

function sectionFromValue(title: string, value: unknown): ReportSection | null {
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item).trim()).filter(Boolean)
    return items.length > 0 ? { title, items } : null
  }
  if (typeof value === 'string' && value.trim()) {
    return { title, items: [value.trim()] }
  }
  return null
}

function markdownToSections(markdown: string): ReportSection[] {
  const lines = markdown
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
  return lines.length > 0 ? [{ title: '报告内容', items: lines }] : []
}

function formatReportStatus(status: GrowthReportSummary['status']): string {
  switch (status) {
    case 'pending':
      return '生成中'
    case 'generated':
      return '已生成'
    case 'failed':
      return '生成失败'
    case 'revoked':
      return '已撤销'
    default:
      return status
  }
}

function formatDate(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatShortDate(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(5, 10)
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function getLearningStatus(lastSubmittedAt: string | null, submissionCount: number): { text: string; className: string } {
  if (!lastSubmittedAt || submissionCount === 0) return { text: '待开始', className: 'quiet' }
  const date = new Date(lastSubmittedAt)
  if (Number.isNaN(date.getTime())) return { text: '学习中', className: 'steady' }
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 1) return { text: '状态活跃', className: 'active' }
  if (days <= 7) return { text: '稳定推进', className: 'steady' }
  return { text: '需要关注', className: 'watch' }
}

function firstInitial(value: string): string {
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '家'
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message
  return error instanceof Error ? error.message : '请求失败，请稍后再试。'
}
