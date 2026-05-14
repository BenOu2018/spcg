import type { TodayNewsArticleCard, TodayNewsArticleStatus } from '@spcg/shared/types'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  listAdminTodayNewsArticleRecords,
  listAdminTodayNewsReactionRecords,
  listPublishedTodayNewsArticleRecords,
  setAdminTodayNewsArticlePublicationRecord,
  updateAdminTodayNewsArticleRecord,
  updateTodayNewsArticleReactionRecord,
  type AdminTodayNewsArticleRecord,
  type AdminTodayNewsReactionRecord,
  type SetAdminTodayNewsArticlePublicationRecordInput,
  type TodayNewsArticleRecord,
  type TodayNewsArticleReactionRecord,
  type UpdateAdminTodayNewsArticleRecordInput,
} from '@/lib/repositories/today-news-repository'
import { ServiceError } from '@/lib/services/errors'

export type TodayNewsAuthor = {
  key: string
  nameZh: string
  nameEn: string
}

export type TodayNewsArticleDraft = {
  slug: string
  status: TodayNewsArticleStatus
  topicZh: string
  topicEn: string
  bodyZh: string
  bodyEn: string
  imageUrl: string
  imageAltZh: string
  imageAltEn: string
  author: TodayNewsAuthor
  publishedAt: string | null
}

export type AdminTodayNewsArticle = AdminTodayNewsArticleRecord & {
  publishedAtLabel: string
  createdAtLabel: string
  updatedAtLabel: string
}

export type AdminTodayNewsReaction = AdminTodayNewsReactionRecord & {
  createdAtLabel: string
  updatedAtLabel: string
}

export type AdminTodayNewsDashboard = {
  articles: AdminTodayNewsArticle[]
  reactions: AdminTodayNewsReaction[]
}

export type AdminTodayNewsArticleUpdate = Omit<
  UpdateAdminTodayNewsArticleRecordInput,
  'authorNameZh' | 'authorNameEn' | 'audit'
> & {
  audit: UpdateAdminTodayNewsArticleRecordInput['audit']
}

export type AdminTodayNewsArticlePublicationUpdate = SetAdminTodayNewsArticlePublicationRecordInput

export const todayNewsAuthorPool: TodayNewsAuthor[] = [
  { key: 'xingyin-desk', nameZh: '星隐编辑部', nameEn: 'SPCG Desk' },
  { key: 'mist-town-wire', nameZh: '雾镇通讯社', nameEn: 'Mist Town Wire' },
  { key: 'algorithm-herald', nameZh: '算法先导报', nameEn: 'Algorithm Herald' },
]

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const webpImagePattern = /^\/(?:assets|uploads\/today-news)\/.+\.webp$/
const articleBodyMinLength = 1
const articleBodyMaxLength = 1000

export type ListPublishedTodayNewsArticlesInput = {
  limit?: number
  slugs?: string[]
  userId?: string | null
}

export async function listPublishedTodayNewsArticles(
  input: ListPublishedTodayNewsArticlesInput = {},
): Promise<TodayNewsArticleCard[]> {
  if (!isDatabaseConfigured()) return []

  const slugFilter = input.slugs?.filter((slug) => slugPattern.test(slug))
  const records = await listPublishedTodayNewsArticleRecords({
    ...input,
    limit: input.limit ?? (slugFilter?.length ? 24 : undefined),
  })
  const articles = records.filter(isValidPublishedArticleRecord).map(mapArticleCard)
  if (!slugFilter?.length) return articles

  const articleBySlug = new Map(articles.map((article) => [article.slug, article]))
  return slugFilter.flatMap((slug) => {
    const article = articleBySlug.get(slug)
    return article ? [article] : []
  })
}

export async function setTodayNewsArticleReaction(input: {
  slug: string
  userId?: string | null
  liked: boolean
  bookmarked: boolean
}): Promise<TodayNewsArticleReactionRecord> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', 'Database is not configured.', 503)
  if (!slugPattern.test(input.slug)) throw new ServiceError('bad_request', 'Invalid article slug.', 400)

  const result = await updateTodayNewsArticleReactionRecord({
    slug: input.slug,
    userId: input.userId,
    liked: input.liked,
    bookmarked: input.bookmarked,
  })
  if (!result) throw new ServiceError('not_found', 'Today news article not found.', 404)
  return result
}

export async function getAdminTodayNewsDashboard(): Promise<AdminTodayNewsDashboard> {
  if (!isDatabaseConfigured()) return { articles: [], reactions: [] }

  const [articleRecords, reactionRecords] = await Promise.all([
    listAdminTodayNewsArticleRecords({ limit: 120 }),
    listAdminTodayNewsReactionRecords({ limit: 300 }),
  ])

  return {
    articles: articleRecords.map(mapAdminArticle),
    reactions: reactionRecords.map(mapAdminReaction),
  }
}

export async function updateAdminTodayNewsArticle(input: AdminTodayNewsArticleUpdate): Promise<AdminTodayNewsArticle> {
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', 'Database is not configured.', 503)

  const author = todayNewsAuthorPool.find((candidate) => candidate.key === input.authorKey)
  if (!author) throw new ServiceError('bad_request', 'Invalid SPCG weekly author.', 400)

  const normalized = {
    ...input,
    topicZh: input.topicZh.trim(),
    topicEn: input.topicEn.trim(),
    bodyZh: input.bodyZh.trim(),
    bodyEn: input.bodyEn.trim(),
    imageUrl: input.imageUrl.trim(),
    imageAltZh: input.imageAltZh.trim(),
    imageAltEn: input.imageAltEn.trim(),
    authorNameZh: author.nameZh,
    authorNameEn: author.nameEn,
  }
  const errors = validateTodayNewsArticleDraft({
    slug: 'admin-edit-placeholder',
    status: normalized.status,
    topicZh: normalized.topicZh,
    topicEn: normalized.topicEn,
    bodyZh: normalized.bodyZh,
    bodyEn: normalized.bodyEn,
    imageUrl: normalized.imageUrl,
    imageAltZh: normalized.imageAltZh,
    imageAltEn: normalized.imageAltEn,
    author,
    publishedAt: normalized.status === 'published' ? new Date().toISOString() : null,
  })
  if (normalized.showInTodayNews && normalized.status !== 'published') errors.push('showInTodayNews')
  if (!Number.isInteger(normalized.displayOrder) || normalized.displayOrder < 1 || normalized.displayOrder > 9999) {
    errors.push('displayOrder')
  }
  if (errors.length > 0) {
    throw new ServiceError('bad_request', formatTodayNewsValidationError(errors, normalized), 400)
  }

  const record = await updateAdminTodayNewsArticleRecord(normalized)
  if (!record) throw new ServiceError('not_found', 'SPCG weekly article not found.', 404)
  return mapAdminArticle(record)
}

export async function setAdminTodayNewsArticlePublication(
  input: AdminTodayNewsArticlePublicationUpdate,
): Promise<AdminTodayNewsArticle> {
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', 'Database is not configured.', 503)
  if (input.showInTodayNews && input.status !== 'published') {
    throw new ServiceError('bad_request', 'Only published articles can be shown in SPCG Weekly.', 400)
  }

  const record = await setAdminTodayNewsArticlePublicationRecord(input)
  if (!record) throw new ServiceError('not_found', 'SPCG weekly article not found.', 404)
  return mapAdminArticle(record)
}

export function pickRandomTodayNewsAuthor(): TodayNewsAuthor {
  const fallback = todayNewsAuthorPool[0]
  if (!fallback) throw new Error('Today news author pool is empty')
  return todayNewsAuthorPool[Math.floor(Math.random() * todayNewsAuthorPool.length)] ?? fallback
}

export function validateTodayNewsArticleDraft(input: TodayNewsArticleDraft): string[] {
  const errors: string[] = []

  if (!slugPattern.test(input.slug)) errors.push('slug')
  if (!['draft', 'published', 'archived'].includes(input.status)) errors.push('status')
  if (!isLengthBetween(input.topicZh, 1, 40)) errors.push('topicZh')
  if (!isLengthBetween(input.topicEn, 1, 40)) errors.push('topicEn')
  if (!isLengthBetween(input.bodyZh, articleBodyMinLength, articleBodyMaxLength)) errors.push('bodyZh')
  if (!isLengthBetween(input.bodyEn, articleBodyMinLength, articleBodyMaxLength)) errors.push('bodyEn')
  if (!webpImagePattern.test(input.imageUrl)) errors.push('imageUrl')
  if (!isLengthBetween(input.imageAltZh, 1, 80)) errors.push('imageAltZh')
  if (!isLengthBetween(input.imageAltEn, 1, 80)) errors.push('imageAltEn')
  if (!todayNewsAuthorPool.some((author) => author.key === input.author.key)) errors.push('author')
  if (input.status === 'published' && !input.publishedAt) errors.push('publishedAt')

  return errors
}

function isValidPublishedArticleRecord(record: TodayNewsArticleRecord): boolean {
  return (
    record.status === 'published' &&
    Boolean(record.publishedAt) &&
    slugPattern.test(record.slug) &&
    isLengthBetween(record.topicZh, 1, 40) &&
    isLengthBetween(record.topicEn, 1, 40) &&
    isLengthBetween(record.bodyZh, articleBodyMinLength, articleBodyMaxLength) &&
    isLengthBetween(record.bodyEn, articleBodyMinLength, articleBodyMaxLength) &&
    webpImagePattern.test(record.imageUrl) &&
    isLengthBetween(record.imageAltZh, 1, 80) &&
    isLengthBetween(record.imageAltEn, 1, 80) &&
    isLengthBetween(record.authorKey, 1, 40) &&
    isLengthBetween(record.authorNameZh, 1, 40) &&
    isLengthBetween(record.authorNameEn, 1, 40) &&
    Number.isInteger(record.likeCount) &&
    record.likeCount >= 0
  )
}

function mapArticleCard(record: TodayNewsArticleRecord): TodayNewsArticleCard {
  return {
    id: record.id,
    slug: record.slug,
    topicZh: record.topicZh.trim(),
    topicEn: record.topicEn.trim(),
    bodyZh: record.bodyZh.trim(),
    bodyEn: record.bodyEn.trim(),
    imageUrl: record.imageUrl,
    imageAltZh: record.imageAltZh.trim(),
    imageAltEn: record.imageAltEn.trim(),
    authorKey: record.authorKey.trim(),
    authorNameZh: record.authorNameZh.trim(),
    authorNameEn: record.authorNameEn.trim(),
    likeCount: record.likeCount,
    viewerLiked: record.viewerLiked,
    viewerBookmarked: record.viewerBookmarked,
    publishedAt: record.publishedAt ?? record.createdAt,
    publishedAtLabel: formatDateLabel(record.publishedAt ?? record.createdAt),
  }
}

function mapAdminArticle(record: AdminTodayNewsArticleRecord): AdminTodayNewsArticle {
  return {
    ...record,
    publishedAtLabel: record.publishedAt ? formatDateLabel(record.publishedAt) : '-',
    createdAtLabel: formatDateLabel(record.createdAt),
    updatedAtLabel: formatDateLabel(record.updatedAt),
  }
}

function mapAdminReaction(record: AdminTodayNewsReactionRecord): AdminTodayNewsReaction {
  return {
    ...record,
    createdAtLabel: formatDateLabel(record.createdAt),
    updatedAtLabel: formatDateLabel(record.updatedAt),
  }
}

function isLengthBetween(value: string, min: number, max: number): boolean {
  const length = value.trim().length
  return length >= min && length <= max
}

function formatDateLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function formatTodayNewsValidationError(
  errors: string[],
  input: {
    topicZh: string
    topicEn: string
    bodyZh: string
    bodyEn: string
    imageUrl: string
    displayOrder: number
  },
): string {
  const details = errors.map((error) => {
    if (error === 'bodyZh') return `中文正文需为 1-1000 字，当前 ${input.bodyZh.trim().length} 字`
    if (error === 'bodyEn') return `英文正文需为 1-1000 字，当前 ${input.bodyEn.trim().length} 字`
    if (error === 'topicZh') return `中文标题需为 1-40 字，当前 ${input.topicZh.trim().length} 字`
    if (error === 'topicEn') return `英文标题需为 1-40 字，当前 ${input.topicEn.trim().length} 字`
    if (error === 'imageUrl') return '图片必须是 /assets/... 或 /uploads/today-news/... 下的 .webp'
    if (error === 'displayOrder') return `排序需为 1-9999 的整数，当前 ${input.displayOrder}`
    if (error === 'showInTodayNews') return '只有 published 状态才能上线到 iPhone 每周资讯'
    return error
  })

  return `SPCG weekly article validation failed: ${details.join('；')}`
}
