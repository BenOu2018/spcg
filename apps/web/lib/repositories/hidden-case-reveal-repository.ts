import { withTransaction } from '@/lib/db'

export type HiddenCaseRevealRecord = {
  userId: string
  levelId: string
  testCaseId: string
  caseIndex: number
  submissionId: string | null
  createdAt: string
}

type HiddenCaseRevealRow = {
  user_id: string
  level_id: string
  test_case_id: string
  case_index: number
  submission_id: string | null
  created_at: Date | string
}

export async function listHiddenCaseReveals(input: {
  userId: string
  levelId: string
}): Promise<HiddenCaseRevealRecord[]> {
  return withTransaction(async (client) => {
    const rows = await client.query<HiddenCaseRevealRow>(
      `
      SELECT user_id, level_id, test_case_id, case_index, submission_id, created_at
      FROM hidden_case_reveals
      WHERE user_id = $1 AND level_id = $2
      ORDER BY created_at ASC, case_index ASC
      `,
      [input.userId, input.levelId],
    )

    return rows.rows.map(mapHiddenCaseRevealRow)
  })
}

export async function claimHiddenCaseReveal(input: {
  userId: string
  levelId: string
  testCaseId: string
  caseIndex: number
  submissionId: string
  maxReveals: number
}): Promise<{
  records: HiddenCaseRevealRecord[]
  created: boolean
  limitReached: boolean
}> {
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [input.userId, input.levelId])

    const existingRows = await client.query<HiddenCaseRevealRow>(
      `
      SELECT user_id, level_id, test_case_id, case_index, submission_id, created_at
      FROM hidden_case_reveals
      WHERE user_id = $1 AND level_id = $2
      ORDER BY created_at ASC, case_index ASC
      FOR UPDATE
      `,
      [input.userId, input.levelId],
    )

    const existingRecords = existingRows.rows.map(mapHiddenCaseRevealRow)
    if (existingRecords.some((record) => record.testCaseId === input.testCaseId)) {
      return { records: existingRecords, created: false, limitReached: false }
    }

    if (existingRecords.length >= input.maxReveals) {
      return { records: existingRecords, created: false, limitReached: true }
    }

    const insertedRows = await client.query<HiddenCaseRevealRow>(
      `
      INSERT INTO hidden_case_reveals (user_id, level_id, test_case_id, case_index, submission_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, level_id, test_case_id) DO NOTHING
      RETURNING user_id, level_id, test_case_id, case_index, submission_id, created_at
      `,
      [input.userId, input.levelId, input.testCaseId, input.caseIndex, input.submissionId],
    )

    const inserted = insertedRows.rows[0] ? [mapHiddenCaseRevealRow(insertedRows.rows[0])] : []
    return {
      records: [...existingRecords, ...inserted],
      created: inserted.length > 0,
      limitReached: false,
    }
  })
}

function mapHiddenCaseRevealRow(row: HiddenCaseRevealRow): HiddenCaseRevealRecord {
  return {
    userId: row.user_id,
    levelId: row.level_id,
    testCaseId: row.test_case_id,
    caseIndex: Number(row.case_index),
    submissionId: row.submission_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }
}
