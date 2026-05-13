import type { PoolClient } from 'pg'
import { query, withTransaction } from '@/lib/db'

export type TodayNewsArticleStatus = 'draft' | 'published' | 'archived'

export type TodayNewsArticleRecord = {
  id: string
  slug: string
  status: TodayNewsArticleStatus
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
  showInTodayNews: boolean
  displayOrder: number
  viewerLiked: boolean
  viewerBookmarked: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type TodayNewsArticleReactionRecord = {
  slug: string
  liked: boolean
  bookmarked: boolean
  likeCount: number
}

export type AdminTodayNewsArticleRecord = TodayNewsArticleRecord & {
  reactionCount: number
  likedCount: number
  bookmarkedCount: number
}

export type AdminTodayNewsReactionRecord = {
  articleId: string
  articleSlug: string
  articleTopicZh: string
  articleTopicEn: string
  userId: string
  username: string | null
  email: string | null
  displayName: string | null
  liked: boolean
  bookmarked: boolean
  createdAt: string
  updatedAt: string
}

export type UpdateAdminTodayNewsArticleRecordInput = {
  id: string
  status: TodayNewsArticleStatus
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
  showInTodayNews: boolean
  displayOrder: number
  audit: TodayNewsAdminAudit
}

export type SetAdminTodayNewsArticlePublicationRecordInput = {
  id: string
  status: TodayNewsArticleStatus
  showInTodayNews: boolean
  audit: TodayNewsAdminAudit
}

type TodayNewsAdminAudit = {
  userId: string
  role: string
}

type TodayNewsArticleRow = {
  id: string
  slug: string
  status: TodayNewsArticleStatus
  topic_zh: string
  topic_en: string
  body_zh: string
  body_en: string
  image_url: string
  image_alt_zh: string
  image_alt_en: string
  author_key: string
  author_name_zh: string
  author_name_en: string
  like_count: number | string | null
  show_in_today_news: boolean | null
  display_order: number | string | null
  viewer_liked: boolean | null
  viewer_bookmarked: boolean | null
  published_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
}

type AdminTodayNewsArticleRow = TodayNewsArticleRow & {
  reaction_count: number | string | null
  liked_count: number | string | null
  bookmarked_count: number | string | null
}

type TodayNewsArticleRowWithId = {
  id: string
  slug: string
  like_count: number | string
}

type TodayNewsArticleReactionRow = {
  liked: boolean | null
  bookmarked: boolean | null
}

type LikeCountRow = {
  like_count: number | string
}

type AdminTodayNewsReactionRow = {
  article_id: string
  article_slug: string
  article_topic_zh: string
  article_topic_en: string
  user_id: string
  username: string | null
  email: string | null
  display_name: string | null
  liked: boolean | null
  bookmarked: boolean | null
  created_at: Date | string
  updated_at: Date | string
}

type ListPublishedTodayNewsArticleRecordsInput = {
  limit?: number
  userId?: string | null
}

export async function listPublishedTodayNewsArticleRecords(
  input: ListPublishedTodayNewsArticleRecordsInput = {},
): Promise<TodayNewsArticleRecord[]> {
  let rows: TodayNewsArticleRow[]
  const limit = Math.max(1, Math.min(input.limit ?? 24, 24))

  try {
    rows = await query<TodayNewsArticleRow>(
      `
      SELECT
        article.id,
        article.slug,
        article.status,
        article.topic_zh,
        article.topic_en,
        article.body_zh,
        article.body_en,
        article.image_url,
        article.image_alt_zh,
        article.image_alt_en,
        article.author_key,
        article.author_name_zh,
        article.author_name_en,
        article.like_count,
        article.show_in_today_news,
        article.display_order,
        COALESCE(viewer_reaction.liked, FALSE) AS viewer_liked,
        COALESCE(viewer_reaction.bookmarked, FALSE) AS viewer_bookmarked,
        article.published_at,
        article.created_at,
        article.updated_at
      FROM today_news_articles article
      LEFT JOIN today_news_article_reactions viewer_reaction
        ON viewer_reaction.article_id = article.id
       AND viewer_reaction.user_id = $2::uuid
      WHERE article.status = 'published'
        AND article.show_in_today_news = TRUE
        AND article.published_at IS NOT NULL
        AND article.published_at <= NOW()
      ORDER BY article.display_order ASC, article.published_at DESC, article.created_at DESC
      LIMIT $1
      `,
      [limit, input.userId ?? null],
    )
  } catch (error) {
    if (isUndefinedTable(error)) return []
    throw error
  }

  return rows.map(mapTodayNewsArticleRow)
}

export async function listAdminTodayNewsArticleRecords(input: { limit?: number } = {}): Promise<AdminTodayNewsArticleRecord[]> {
  let rows: AdminTodayNewsArticleRow[]
  const limit = Math.max(1, Math.min(input.limit ?? 100, 200))

  try {
    rows = await query<AdminTodayNewsArticleRow>(
      `
      SELECT
        article.id,
        article.slug,
        article.status,
        article.topic_zh,
        article.topic_en,
        article.body_zh,
        article.body_en,
        article.image_url,
        article.image_alt_zh,
        article.image_alt_en,
        article.author_key,
        article.author_name_zh,
        article.author_name_en,
        article.like_count,
        article.show_in_today_news,
        article.display_order,
        FALSE AS viewer_liked,
        FALSE AS viewer_bookmarked,
        article.published_at,
        article.created_at,
        article.updated_at,
        COUNT(reaction.user_id)::int AS reaction_count,
        COUNT(*) FILTER (WHERE reaction.liked = TRUE)::int AS liked_count,
        COUNT(*) FILTER (WHERE reaction.bookmarked = TRUE)::int AS bookmarked_count
      FROM today_news_articles article
      LEFT JOIN today_news_article_reactions reaction
        ON reaction.article_id = article.id
      GROUP BY article.id
      ORDER BY article.show_in_today_news DESC, article.display_order ASC, article.published_at DESC NULLS LAST, article.created_at DESC
      LIMIT $1
      `,
      [limit],
    )
  } catch (error) {
    if (isUndefinedTable(error)) return []
    throw error
  }

  return rows.map(mapAdminTodayNewsArticleRow)
}

export async function listAdminTodayNewsReactionRecords(input: { limit?: number } = {}): Promise<AdminTodayNewsReactionRecord[]> {
  let rows: AdminTodayNewsReactionRow[]
  const limit = Math.max(1, Math.min(input.limit ?? 200, 500))

  try {
    rows = await query<AdminTodayNewsReactionRow>(
      `
      SELECT
        reaction.article_id,
        article.slug AS article_slug,
        article.topic_zh AS article_topic_zh,
        article.topic_en AS article_topic_en,
        reaction.user_id,
        users.username,
        users.email,
        COALESCE(profiles.display_name, users.display_name, users.username, users.email) AS display_name,
        reaction.liked,
        reaction.bookmarked,
        reaction.created_at,
        reaction.updated_at
      FROM today_news_article_reactions reaction
      INNER JOIN today_news_articles article
        ON article.id = reaction.article_id
      INNER JOIN users
        ON users.id = reaction.user_id
      LEFT JOIN profiles
        ON profiles.user_id = users.id
      ORDER BY reaction.updated_at DESC, reaction.created_at DESC
      LIMIT $1
      `,
      [limit],
    )
  } catch (error) {
    if (isUndefinedTable(error)) return []
    throw error
  }

  return rows.map(mapAdminTodayNewsReactionRow)
}

export async function updateAdminTodayNewsArticleRecord(
  input: UpdateAdminTodayNewsArticleRecordInput,
): Promise<AdminTodayNewsArticleRecord | null> {
  return withTransaction(async (client) => {
    const before = await client.query<{ data: Record<string, unknown> | null }>(
      'SELECT to_jsonb(article) AS data FROM today_news_articles article WHERE article.id = $1 FOR UPDATE',
      [input.id],
    )
    if (!before.rows[0]?.data) return null

    const rows = await client.query<AdminTodayNewsArticleRow>(
      `
      UPDATE today_news_articles
      SET
        status = $2,
        topic_zh = $3,
        topic_en = $4,
        body_zh = $5,
        body_en = $6,
        image_url = $7,
        image_alt_zh = $8,
        image_alt_en = $9,
        author_key = $10,
        author_name_zh = $11,
        author_name_en = $12,
        show_in_today_news = $13,
        display_order = $14,
        published_at = CASE WHEN $2 = 'published' THEN COALESCE(published_at, NOW()) ELSE published_at END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        slug,
        status,
        topic_zh,
        topic_en,
        body_zh,
        body_en,
        image_url,
        image_alt_zh,
        image_alt_en,
        author_key,
        author_name_zh,
        author_name_en,
        like_count,
        show_in_today_news,
        display_order,
        FALSE AS viewer_liked,
        FALSE AS viewer_bookmarked,
        published_at,
        created_at,
        updated_at,
        0::int AS reaction_count,
        0::int AS liked_count,
        0::int AS bookmarked_count
      `,
      [
        input.id,
        input.status,
        input.topicZh,
        input.topicEn,
        input.bodyZh,
        input.bodyEn,
        input.imageUrl,
        input.imageAltZh,
        input.imageAltEn,
        input.authorKey,
        input.authorNameZh,
        input.authorNameEn,
        input.showInTodayNews,
        input.displayOrder,
      ],
    )
    const row = rows.rows[0]
    if (!row) return null

    const after = await client.query<{ data: Record<string, unknown> | null }>(
      'SELECT to_jsonb(article) AS data FROM today_news_articles article WHERE article.id = $1',
      [input.id],
    )
    await insertTodayNewsAuditLog(client, {
      audit: input.audit,
      action: 'today_news_article.update',
      articleId: input.id,
      beforeData: before.rows[0].data,
      afterData: after.rows[0]?.data ?? null,
      metadata: { status: input.status, showInTodayNews: input.showInTodayNews },
    })

    return mapAdminTodayNewsArticleRow(row)
  })
}

export async function setAdminTodayNewsArticlePublicationRecord(
  input: SetAdminTodayNewsArticlePublicationRecordInput,
): Promise<AdminTodayNewsArticleRecord | null> {
  return withTransaction(async (client) => {
    const before = await client.query<{ data: Record<string, unknown> | null }>(
      'SELECT to_jsonb(article) AS data FROM today_news_articles article WHERE article.id = $1 FOR UPDATE',
      [input.id],
    )
    if (!before.rows[0]?.data) return null

    const showInTodayNews = input.status === 'published' ? input.showInTodayNews : false
    const rows = await client.query<AdminTodayNewsArticleRow>(
      `
      UPDATE today_news_articles
      SET
        status = $2,
        show_in_today_news = $3,
        published_at = CASE WHEN $2 = 'published' THEN COALESCE(published_at, NOW()) ELSE published_at END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        slug,
        status,
        topic_zh,
        topic_en,
        body_zh,
        body_en,
        image_url,
        image_alt_zh,
        image_alt_en,
        author_key,
        author_name_zh,
        author_name_en,
        like_count,
        show_in_today_news,
        display_order,
        FALSE AS viewer_liked,
        FALSE AS viewer_bookmarked,
        published_at,
        created_at,
        updated_at,
        0::int AS reaction_count,
        0::int AS liked_count,
        0::int AS bookmarked_count
      `,
      [input.id, input.status, showInTodayNews],
    )
    const row = rows.rows[0]
    if (!row) return null

    const after = await client.query<{ data: Record<string, unknown> | null }>(
      'SELECT to_jsonb(article) AS data FROM today_news_articles article WHERE article.id = $1',
      [input.id],
    )
    await insertTodayNewsAuditLog(client, {
      audit: input.audit,
      action: 'today_news_article.set_publication',
      articleId: input.id,
      beforeData: before.rows[0].data,
      afterData: after.rows[0]?.data ?? null,
      metadata: { status: input.status, showInTodayNews },
    })

    return mapAdminTodayNewsArticleRow(row)
  })
}

export async function updateTodayNewsArticleReactionRecord(input: {
  slug: string
  userId: string
  liked: boolean
  bookmarked: boolean
}): Promise<TodayNewsArticleReactionRecord | null> {
  return withTransaction(async (client) => {
    const articles = await client.query<TodayNewsArticleRowWithId>(
      `
      SELECT id, slug, like_count
      FROM today_news_articles
      WHERE slug = $1
        AND status = 'published'
        AND show_in_today_news = TRUE
        AND published_at IS NOT NULL
        AND published_at <= NOW()
      FOR UPDATE
      `,
      [input.slug],
    )
    const article = articles.rows[0]
    if (!article) return null

    const previousReactions = await client.query<TodayNewsArticleReactionRow>(
      `
      SELECT liked, bookmarked
      FROM today_news_article_reactions
      WHERE article_id = $1 AND user_id = $2
      `,
      [article.id, input.userId],
    )
    const previousLiked = Boolean(previousReactions.rows[0]?.liked)
    const currentLikeCount = Number(article.like_count ?? 0)
    const likeDelta = input.liked === previousLiked ? 0 : input.liked ? 1 : -1
    const nextLikeCount = Math.max(0, currentLikeCount + likeDelta)

    await client.query(
      `
      INSERT INTO today_news_article_reactions (article_id, user_id, liked, bookmarked)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (article_id, user_id) DO UPDATE
      SET
        liked = EXCLUDED.liked,
        bookmarked = EXCLUDED.bookmarked,
        updated_at = NOW()
      `,
      [article.id, input.userId, input.liked, input.bookmarked],
    )
    const likeCounts = await client.query<LikeCountRow>(
      `
      UPDATE today_news_articles
      SET like_count = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING like_count
      `,
      [article.id, nextLikeCount],
    )

    return {
      slug: article.slug,
      liked: input.liked,
      bookmarked: input.bookmarked,
      likeCount: Number(likeCounts.rows[0]?.like_count ?? nextLikeCount),
    }
  })
}

async function insertTodayNewsAuditLog(
  client: PoolClient,
  input: {
    audit: TodayNewsAdminAudit
    action: string
    articleId: string
    beforeData: Record<string, unknown> | null
    afterData: Record<string, unknown> | null
    metadata: Record<string, unknown>
  },
) {
  await client.query(
    `
    INSERT INTO admin_audit_logs
      (actor_user_id, actor_role, action, resource_type, resource_id, before_data, after_data, metadata)
    VALUES ($1, $2, $3, 'today_news_article', $4, $5, $6, $7)
    `,
    [
      input.audit.userId,
      input.audit.role,
      input.action,
      input.articleId,
      input.beforeData,
      input.afterData,
      input.metadata,
    ],
  )
}

function isUndefinedTable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '42P01'
  )
}

function mapAdminTodayNewsArticleRow(row: AdminTodayNewsArticleRow): AdminTodayNewsArticleRecord {
  return {
    ...mapTodayNewsArticleRow(row),
    reactionCount: Number(row.reaction_count ?? 0),
    likedCount: Number(row.liked_count ?? 0),
    bookmarkedCount: Number(row.bookmarked_count ?? 0),
  }
}

function mapAdminTodayNewsReactionRow(row: AdminTodayNewsReactionRow): AdminTodayNewsReactionRecord {
  return {
    articleId: row.article_id,
    articleSlug: row.article_slug,
    articleTopicZh: row.article_topic_zh,
    articleTopicEn: row.article_topic_en,
    userId: row.user_id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    liked: Boolean(row.liked),
    bookmarked: Boolean(row.bookmarked),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

function mapTodayNewsArticleRow(row: TodayNewsArticleRow): TodayNewsArticleRecord {
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    topicZh: row.topic_zh,
    topicEn: row.topic_en,
    bodyZh: row.body_zh,
    bodyEn: row.body_en,
    imageUrl: row.image_url,
    imageAltZh: row.image_alt_zh,
    imageAltEn: row.image_alt_en,
    authorKey: row.author_key,
    authorNameZh: row.author_name_zh,
    authorNameEn: row.author_name_en,
    likeCount: Number(row.like_count ?? 0),
    showInTodayNews: Boolean(row.show_in_today_news),
    displayOrder: Number(row.display_order ?? 1000),
    viewerLiked: Boolean(row.viewer_liked),
    viewerBookmarked: Boolean(row.viewer_bookmarked),
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}
