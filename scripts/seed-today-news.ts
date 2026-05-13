import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'

const { Pool } = pg

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')

  const migrationSql = await readFile(resolve('db/migrations/044_today_news_articles.sql'), 'utf8')
  const pool = new Pool({ connectionString: databaseUrl })

  try {
    await pool.query(migrationSql)
    const result = await pool.query<{ slug: string; topic_zh: string; updated_at: Date | string }>(
      `
      SELECT slug, topic_zh, updated_at
      FROM today_news_articles
      WHERE slug = 'spcg-online-launch'
      `,
    )
    const article = result.rows[0]
    if (!article) throw new Error('spcg-online-launch article was not imported')
    console.log(`Imported SPCG weekly article: ${article.slug} (${article.topic_zh})`)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
