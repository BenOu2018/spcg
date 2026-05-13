import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import {
  getAdminTodayNewsDashboard,
  todayNewsAuthorPool,
  type AdminTodayNewsArticle,
  type AdminTodayNewsReaction,
} from '@/lib/services/today-news-service'
import { AdminDrawer, AdminEmpty, AdminPageHeader, AdminPanel, AdminStatCard } from '../components/AdminChrome'
import { setTodayNewsArticlePublicationAction, updateTodayNewsArticleAction } from './actions'

export const dynamic = 'force-dynamic'

type AdminTodayNewsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

export default async function AdminTodayNewsPage({ searchParams }: AdminTodayNewsPageProps) {
  await requireAdmin('support')
  const resolvedSearchParams = await searchParams
  const editArticleId = readStringParam(resolvedSearchParams?.edit)
  const { articles, reactions } = await getAdminTodayNewsDashboard()
  const publishedCount = articles.filter((article) => article.status === 'published').length
  const iPhoneArticles = articles
    .filter((article) => article.status === 'published' && article.showInTodayNews)
    .sort((left, right) => left.displayOrder - right.displayOrder || compareNullableDateDesc(left.publishedAt, right.publishedAt))
  const totalStoredLikes = articles.reduce((total, article) => total + article.likeCount, 0)
  const activeLikedCount = articles.reduce((total, article) => total + article.likedCount, 0)
  const activeBookmarkCount = articles.reduce((total, article) => total + article.bookmarkedCount, 0)
  const activeReactionCount = reactions.filter((reaction) => reaction.liked || reaction.bookmarked).length
  const editArticle = editArticleId ? articles.find((article) => article.id === editArticleId) : null

  return (
    <section className="admin-stack">
      <AdminPageHeader
        description="编辑 SPCG 每周资讯文章，并用“上线”控制它是否出现在地图页 iPhone 每周资讯弹窗。"
        eyebrow="SPCG Weekly"
        meta={<span className="admin-count">{articles.length} articles</span>}
        title="SPCG 每周资讯"
      />

      <section className="admin-metrics admin-metrics-wide">
        <AdminStatCard detail="all statuses" label="Articles" value={articles.length} />
        <AdminStatCard detail="published status" label="Published" tone="good" value={publishedCount} />
        <AdminStatCard detail="shown in iPhone" label="Online" tone="good" value={iPhoneArticles.length} />
        <AdminStatCard detail={`${activeLikedCount} active rows`} label="Likes" value={totalStoredLikes} />
        <AdminStatCard detail="bookmarked rows" label="Bookmarks" value={activeBookmarkCount} />
        <AdminStatCard detail={`${reactions.length} saved rows`} label="Interactions" value={activeReactionCount} />
      </section>

      <nav className="admin-tabs" aria-label="SPCG 每周资讯页面导航">
        <a className="active" href="#articles">
          <span>文章列表</span>
          <strong>{articles.length}</strong>
        </a>
        <a href="#iphone-feed">
          <span>iPhone 上线</span>
          <strong>{iPhoneArticles.length}</strong>
        </a>
        <a href="#reactions">
          <span>点赞收藏记录</span>
          <strong>{reactions.length}</strong>
        </a>
      </nav>

      <section className="admin-table" id="articles" aria-label="SPCG 每周资讯文章列表">
        <div className="admin-table-head admin-today-news-grid">
          <span>Cover</span>
          <span>Article</span>
          <span>Status</span>
          <span>Author</span>
          <span>Metrics</span>
          <span>Updated</span>
          <span>Actions</span>
        </div>
        {articles.map((article) => (
          <article className="admin-table-row admin-today-news-grid" key={article.id}>
            <div>
              <img className="admin-news-thumb" src={article.imageUrl} alt={article.imageAltZh} loading="lazy" />
            </div>
            <div className="admin-news-body">
              <strong>{article.topicZh}</strong>
              <small>{article.topicEn}</small>
              <code>{article.slug}</code>
              <p>{formatPreview(article.bodyZh)}</p>
            </div>
            <div className="admin-status-stack">
              <AdminStatus status={article.status} />
              <em className={`admin-status ${article.showInTodayNews ? 'admin-status-published' : 'admin-status-ignored'}`}>
                {article.showInTodayNews ? 'iPhone on' : 'iPhone off'}
              </em>
              <small>{article.publishedAtLabel}</small>
            </div>
            <span>
              {article.authorNameZh}
              <small>{article.authorNameEn}</small>
            </span>
            <span>
              {article.likeCount} stored likes
              <small>{article.likedCount} active likes</small>
              <small>{article.bookmarkedCount} bookmarks</small>
              <small>{article.reactionCount} rows</small>
            </span>
            <span>
              {article.updatedAtLabel}
              <small>order {article.displayOrder}</small>
            </span>
            <div className="admin-row-actions">
              <Link className="admin-small-button" href={`/admin/today-news?edit=${article.id}`}>
                Edit
              </Link>
              {article.showInTodayNews ? (
                <PublicationButton articleId={article.id} label="下线" mode="offline" />
              ) : (
                <PublicationButton articleId={article.id} label="上线" mode="online" />
              )}
              <PublicationButton articleId={article.id} disabled={article.status === 'draft'} label="Draft" mode="draft" />
              <PublicationButton articleId={article.id} disabled={article.status === 'archived'} label="Archive" mode="archive" />
            </div>
          </article>
        ))}
        {articles.length === 0 ? <AdminEmpty>暂无 SPCG 每周资讯文章。请先运行数据库迁移或导入模板文章。</AdminEmpty> : null}
      </section>

      <AdminPanel description="这些文章会出现在 /map 的 iPhone 每周资讯首页，按 display order 从小到大排序。" title="iPhone 当前上线队列">
        <div className="admin-list" id="iphone-feed">
          {iPhoneArticles.map((article) => (
            <div className="admin-list-row admin-list-row-stacked" key={article.id}>
              <strong>{article.topicZh}</strong>
              <small>
                order {article.displayOrder} / {article.publishedAtLabel} / {article.slug}
              </small>
            </div>
          ))}
          {iPhoneArticles.length === 0 ? <AdminEmpty>暂无已上线到 iPhone 弹窗的文章。</AdminEmpty> : null}
        </div>
      </AdminPanel>

      <section className="admin-table" id="reactions" aria-label="SPCG 每周资讯点赞收藏记录">
        <div className="admin-table-head admin-today-news-reaction-grid">
          <span>User</span>
          <span>Article</span>
          <span>State</span>
          <span>Updated</span>
          <span>Created</span>
        </div>
        {reactions.map((reaction) => (
          <article className="admin-table-row admin-today-news-reaction-grid" key={`${reaction.articleId}:${reaction.userId}`}>
            <div>
              <Link className="admin-title-link" href={`/admin/users/${reaction.userId}`}>
                {reaction.displayName ?? reaction.username ?? reaction.email ?? reaction.userId}
              </Link>
              <small>{reaction.username ? `@${reaction.username}` : reaction.email ?? reaction.userId}</small>
            </div>
            <div>
              <strong>{reaction.articleTopicZh}</strong>
              <small>{reaction.articleSlug}</small>
            </div>
            <ReactionBadges reaction={reaction} />
            <span>{reaction.updatedAtLabel}</span>
            <span>{reaction.createdAtLabel}</span>
          </article>
        ))}
        {reactions.length === 0 ? <AdminEmpty>暂无点赞或收藏记录。</AdminEmpty> : null}
      </section>

      {editArticle ? <ArticleEditDrawer article={editArticle} /> : null}
    </section>
  )
}

function ArticleEditDrawer({ article }: { article: AdminTodayNewsArticle }) {
  return (
    <AdminDrawer closeHref="/admin/today-news" description={`${article.slug} / ${article.updatedAtLabel}`} title="编辑 SPCG 每周资讯文章" width="xl">
      <form action={updateTodayNewsArticleAction} className="admin-form-grid admin-form-grid-today-news">
        <input name="articleId" type="hidden" value={article.id} />
        <label>
          <span>Status</span>
          <select name="status" defaultValue={article.status}>
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="archived">archived</option>
          </select>
        </label>
        <label>
          <span>Display order</span>
          <input name="displayOrder" type="number" min={1} max={9999} defaultValue={article.displayOrder} />
        </label>
        <label className="admin-checkbox">
          <input name="showInTodayNews" type="checkbox" value="true" defaultChecked={article.showInTodayNews} />
          <span>上线到 iPhone 每周资讯</span>
        </label>
        <label>
          <span>Author</span>
          <select name="authorKey" defaultValue={article.authorKey}>
            {todayNewsAuthorPool.map((author) => (
              <option key={author.key} value={author.key}>
                {author.nameZh} / {author.nameEn}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-form-span-2">
          <span>中文标题</span>
          <input name="topicZh" required maxLength={40} defaultValue={article.topicZh} />
        </label>
        <label className="admin-form-span-2">
          <span>English title</span>
          <input name="topicEn" required maxLength={40} defaultValue={article.topicEn} />
        </label>
        <label className="admin-form-span-2">
          <span>中文正文 1000 字内</span>
          <textarea name="bodyZh" required maxLength={1000} rows={8} defaultValue={article.bodyZh} />
        </label>
        <label className="admin-form-span-2">
          <span>English body within 1000 chars</span>
          <textarea name="bodyEn" required maxLength={1000} rows={8} defaultValue={article.bodyEn} />
        </label>
        <label className="admin-form-full">
          <span>Image URL (.webp)</span>
          <input name="imageUrl" required defaultValue={article.imageUrl} />
        </label>
        <label className="admin-form-span-2">
          <span>中文图片说明</span>
          <input name="imageAltZh" required maxLength={80} defaultValue={article.imageAltZh} />
        </label>
        <label className="admin-form-span-2">
          <span>English image alt</span>
          <input name="imageAltEn" required maxLength={80} defaultValue={article.imageAltEn} />
        </label>
        <div className="admin-news-edit-preview admin-form-full">
          <img src={article.imageUrl} alt={article.imageAltZh} />
          <p>
            只有 `status = published` 且勾选“上线到 iPhone 每周资讯”的文章会显示在地图页弹窗。人工编辑和数据库允许中英文各 1-1000 字；AI 自动生成仍限制 100 字内。
          </p>
        </div>
        <div className="admin-table-actions admin-form-full">
          <Link className="admin-small-button" href="/admin/today-news">
            Cancel
          </Link>
          <button className="admin-button" type="submit">
            Save article
          </button>
        </div>
      </form>
    </AdminDrawer>
  )
}

function PublicationButton({
  articleId,
  disabled = false,
  label,
  mode,
}: {
  articleId: string
  disabled?: boolean
  label: string
  mode: 'online' | 'offline' | 'draft' | 'archive'
}) {
  return (
    <form action={setTodayNewsArticlePublicationAction}>
      <input name="articleId" type="hidden" value={articleId} />
      <input name="mode" type="hidden" value={mode} />
      <button className="admin-small-button" type="submit" disabled={disabled}>
        {label}
      </button>
    </form>
  )
}

function AdminStatus({ status }: { status: AdminTodayNewsArticle['status'] }) {
  return <em className={`admin-status admin-status-${status}`}>{status}</em>
}

function ReactionBadges({ reaction }: { reaction: AdminTodayNewsReaction }) {
  return (
    <div className="admin-status-stack">
      <em className={reaction.liked ? 'admin-status admin-status-validated' : 'admin-status admin-status-ignored'}>
        {reaction.liked ? 'liked' : 'not liked'}
      </em>
      <em className={reaction.bookmarked ? 'admin-status admin-status-review' : 'admin-status admin-status-ignored'}>
        {reaction.bookmarked ? 'bookmarked' : 'not saved'}
      </em>
    </div>
  )
}

function formatPreview(value: string): string {
  const trimmed = value.trim()
  return trimmed.length > 64 ? `${trimmed.slice(0, 64)}...` : trimmed
}

function readStringParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function compareNullableDateDesc(left: string | null, right: string | null): number {
  return new Date(right ?? 0).getTime() - new Date(left ?? 0).getTime()
}
