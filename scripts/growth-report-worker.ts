import { createHash, randomBytes } from 'crypto'
import { Pool } from 'pg'

type StudentRow = {
  student_user_id: string
  display_name: string | null
  username: string | null
}

type StatsRow = {
  submissions: string | number
  accepted: string | number
  pending_repair: string | number
  coins: string | number | null
}

type ReportRow = {
  id: string
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run growth-report-worker.')
}

const args = new Map(
  process.argv
    .slice(2)
    .map((arg) => {
      const [rawKey = '', ...rest] = arg.replace(/^--/, '').split('=')
      const key = rawKey.trim()
      return [key, rest.join('=') || 'true'] as const
    })
    .filter(([key]) => key.length > 0),
)

const studentId = args.get('student-id') ?? null
const periodDays = Math.max(1, Math.min(Number(args.get('period-days') ?? 7), 31))
const dryRun = args.get('dry-run') === 'true'
const end = new Date()
const start = new Date(end)
start.setUTCDate(end.getUTCDate() - periodDays + 1)
const periodStart = toDateOnly(start)
const periodEnd = toDateOnly(end)
const tokenExpiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString()

const pool = new Pool({ connectionString: databaseUrl })

try {
  const students = await loadStudents()
  console.log(`Growth report worker: ${students.length} student(s), period ${periodStart}..${periodEnd}, dryRun=${dryRun}`)

  for (const student of students) {
    const stats = await loadStats(student.student_user_id)
    const markdown = buildMarkdown(student, stats)
    if (dryRun) {
      console.log(`- would create report for ${student.display_name ?? student.username ?? student.student_user_id}`)
      continue
    }
    const token = randomBytes(32).toString('base64url')
    const reportId = await createReport(student.student_user_id, markdown, token)
    await createDeliveries(reportId, student.student_user_id)
    console.log(`- created report ${reportId} for ${student.display_name ?? student.username ?? student.student_user_id}`)
  }
} finally {
  await pool.end()
}

async function loadStudents(): Promise<StudentRow[]> {
  const params: unknown[] = []
  const filters = ["ps.status = 'active'"]
  if (studentId) {
    params.push(studentId)
    filters.push(`ps.student_user_id = $${params.length}`)
  }
  const result = await pool.query<StudentRow>(
    `
    SELECT DISTINCT ps.student_user_id, p.display_name, u.username
    FROM parent_students ps
    JOIN users u ON u.id = ps.student_user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE ${filters.join(' AND ')}
    ORDER BY p.display_name NULLS LAST, u.username NULLS LAST
    `,
    params,
  )
  return result.rows
}

async function loadStats(targetStudentId: string): Promise<StatsRow> {
  const result = await pool.query<StatsRow>(
    `
    SELECT
      (SELECT COUNT(*) FROM submissions s WHERE s.user_id = $1 AND s.created_at::date BETWEEN $2::date AND $3::date) AS submissions,
      (SELECT COUNT(*) FROM submissions s WHERE s.user_id = $1 AND s.result = 'AC' AND s.created_at::date BETWEEN $2::date AND $3::date) AS accepted,
      (SELECT COUNT(*) FROM progress pr WHERE pr.user_id = $1 AND pr.passed = FALSE AND pr.attempt_count > 0) AS pending_repair,
      (SELECT COALESCE(SUM(coin_delta), 0) FROM reward_ledger rl WHERE rl.user_id = $1 AND rl.created_at::date BETWEEN $2::date AND $3::date) AS coins
    `,
    [targetStudentId, periodStart, periodEnd],
  )
  return result.rows[0] ?? { submissions: 0, accepted: 0, pending_repair: 0, coins: 0 }
}

async function createReport(targetStudentId: string, markdown: string, token: string) {
  const summary = {
    periodStart,
    periodEnd,
    submissionCount: toNumber((await loadStats(targetStudentId)).submissions),
  }
  const result = await pool.query<ReportRow>(
    `
    INSERT INTO growth_reports
      (student_user_id, period_start, period_end, title, markdown, summary, token_hash, token_expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
    `,
    [
      targetStudentId,
      periodStart,
      periodEnd,
      '成长报告',
      markdown,
      JSON.stringify(summary),
      createHash('sha256').update(token).digest('hex'),
      tokenExpiresAt,
    ],
  )
  const id = result.rows[0]?.id
  if (!id) throw new Error('Failed to create growth report.')
  return id
}

async function createDeliveries(reportId: string, targetStudentId: string) {
  await pool.query(
    `
    INSERT INTO growth_report_deliveries (report_id, parent_user_id, channel, target)
    SELECT $1, ps.parent_user_id, 'email', u.email
    FROM parent_students ps
    JOIN users u ON u.id = ps.parent_user_id
    WHERE ps.student_user_id = $2 AND ps.status = 'active' AND u.email IS NOT NULL AND u.email <> ''
    ON CONFLICT (report_id, parent_user_id, channel, target) DO NOTHING
    `,
    [reportId, targetStudentId],
  )
  await pool.query(
    `
    INSERT INTO growth_report_deliveries (report_id, parent_user_id, channel, target)
    SELECT $1, ps.parent_user_id, 'sms', p.phone_number
    FROM parent_students ps
    JOIN profiles p ON p.user_id = ps.parent_user_id
    WHERE ps.student_user_id = $2 AND ps.status = 'active' AND p.phone_number IS NOT NULL AND p.phone_number <> ''
    ON CONFLICT (report_id, parent_user_id, channel, target) DO NOTHING
    `,
    [reportId, targetStudentId],
  )
}

function buildMarkdown(student: StudentRow, stats: StatsRow) {
  const name = student.display_name ?? student.username ?? student.student_user_id
  return [
    `# ${name} 成长报告`,
    '',
    `- 周期：${periodStart} 至 ${periodEnd}`,
    `- 提交次数：${toNumber(stats.submissions)}`,
    `- AC 次数：${toNumber(stats.accepted)}`,
    `- 待修错题：${toNumber(stats.pending_repair)}`,
    `- 金币变化：${toNumber(stats.coins)}`,
    '',
    '## 下一步建议',
    '',
    '- 优先把待修错题修到 AC。',
    '- 保持短时、高质量练习，避免单纯堆在线时长。',
  ].join('\n')
}

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0) || 0
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}
