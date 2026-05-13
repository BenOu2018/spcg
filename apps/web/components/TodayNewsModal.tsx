'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Bookmark, Heart, X } from 'lucide-react'
import type { UiLocale } from '@spcg/shared/types'
import type { TodayNewsArticleCard } from '@/lib/services/today-news-service'

type TodayNewsModalProps = {
  articles: TodayNewsArticleCard[]
  uiLocale: UiLocale
  onReactionChange?: (reaction: TodayNewsArticleReactionState) => void
  onClose: () => void
}

type TodayNewsArticleReactionState = {
  slug: string
  liked: boolean
  bookmarked: boolean
  likeCount: number
}

type ArticleReactionState = {
  liked: boolean
  bookmarked: boolean
  likeCount: number
  pending: boolean
}

type ArticleReactionStateBySlug = Record<string, ArticleReactionState>

type NewsFilterKey = 'all' | 'launch' | 'gear'

type NewsFilter = {
  key: NewsFilterKey
  label: string
}

type ReactionApiResponse =
  | {
      ok: true
      data: {
        reaction: {
          slug: string
          liked: boolean
          bookmarked: boolean
          likeCount: number
        }
      }
    }
  | {
      ok: false
      error?: unknown
    }

export function TodayNewsModal({ articles, uiLocale, onReactionChange, onClose }: TodayNewsModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const detailImageRef = useRef<HTMLImageElement | null>(null)
  const [activeArticleSlug, setActiveArticleSlug] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<NewsFilterKey>('all')
  const [articleReactions, setArticleReactions] = useState<ArticleReactionStateBySlug>(() => createArticleReactionState(articles))
  const [reactionError, setReactionError] = useState<string | null>(null)
  const [phoneTime, setPhoneTime] = useState(() => formatPhoneTime(new Date()))
  const activeArticle = activeArticleSlug ? articles.find((article) => article.slug === activeArticleSlug) ?? null : null
  const copy = uiLocale === 'en-US' ? enUsCopy : zhCnCopy
  const visibleArticles = articles.filter((article) => matchesArticleFilter(article, activeFilter))
  const activeArticleReaction = activeArticle
    ? articleReactions[activeArticle.slug] ?? getInitialArticleReaction(activeArticle)
    : null

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    const updatePhoneTime = () => setPhoneTime(formatPhoneTime(new Date()))
    updatePhoneTime()
    const timer = window.setInterval(updatePhoneTime, 1000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    setArticleReactions(createArticleReactionState(articles))
  }, [articles])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0
  }, [activeArticleSlug, activeFilter])

  useEffect(() => {
    if (!activeArticleSlug) return undefined

    const updatePan = () => updateDetailImagePan(detailImageRef.current)
    const frame = window.requestAnimationFrame(updatePan)
    window.addEventListener('resize', updatePan)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updatePan)
    }
  }, [activeArticleSlug])

  async function updateArticleReaction(article: TodayNewsArticleCard, next: { liked: boolean; bookmarked: boolean }) {
    const previous = articleReactions[article.slug] ?? getInitialArticleReaction(article)
    const likeDelta = next.liked === previous.liked ? 0 : next.liked ? 1 : -1
    const optimistic = {
      ...previous,
      liked: next.liked,
      bookmarked: next.bookmarked,
      likeCount: Math.max(0, previous.likeCount + likeDelta),
      pending: true,
    }

    setReactionError(null)
    setArticleReactions((current) => ({
      ...current,
      [article.slug]: optimistic,
    }))

    try {
      const response = await fetch(`/api/today-news/articles/${encodeURIComponent(article.slug)}/reaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          liked: optimistic.liked,
          bookmarked: optimistic.bookmarked,
        }),
      })
      const payload = (await response.json().catch(() => null)) as ReactionApiResponse | null
      if (!response.ok || !payload?.ok) throw new Error('reaction-save-failed')

      setArticleReactions((current) => ({
        ...current,
        [article.slug]: {
          liked: payload.data.reaction.liked,
          bookmarked: payload.data.reaction.bookmarked,
          likeCount: payload.data.reaction.likeCount,
          pending: false,
        },
      }))
      onReactionChange?.(payload.data.reaction)
    } catch {
      setArticleReactions((current) => ({
        ...current,
        [article.slug]: {
          ...previous,
          pending: false,
        },
      }))
      setReactionError(copy.saveFailed)
    }
  }

  return createPortal(
    <div
      className="today-news-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        aria-label={copy.title}
        aria-modal="true"
        className="today-news-phone"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="today-news-device-bar" aria-hidden="true">
          <span className="today-news-time">{phoneTime}</span>
          <div className="today-news-dynamic-island">
            <span className="today-news-music-art" />
            <span className="today-news-music-text">{copy.playingLabel}</span>
            <span className="today-news-music-wave">
              <i />
              <i />
              <i />
            </span>
          </div>
          <div className="today-news-status-icons">
            <span className="today-news-wifi">
              <i />
              <i />
              <i />
            </span>
            <span className="today-news-battery">
              <i />
            </span>
          </div>
        </div>
        <button className="today-news-close" type="button" aria-label={copy.closeLabel} onClick={onClose}>
          <X size={17} strokeWidth={2.5} />
        </button>
        <header className={activeArticle ? 'today-news-head today-news-head-reading' : 'today-news-head'}>
          {activeArticle ? (
            <>
              <button className="today-news-back-button" type="button" aria-label={copy.backLabel} onClick={() => setActiveArticleSlug(null)}>
                <ArrowLeft size={17} strokeWidth={2.5} />
              </button>
              <h2>{copy.title}</h2>
            </>
          ) : (
            <>
              <h2>{copy.title}</h2>
              <div className="today-news-filters" aria-label={copy.filterLabel}>
                {copy.filters.map((filter) => (
                  <button
                    className={filter.key === activeFilter ? 'today-news-filter-button active' : 'today-news-filter-button'}
                    type="button"
                    key={filter.key}
                    aria-pressed={filter.key === activeFilter}
                    onClick={() => setActiveFilter(filter.key)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </header>
        <div className="today-news-list" ref={listRef}>
          {activeArticle ? (
            <article className="today-news-detail" lang={uiLocale}>
              <div className="today-news-detail-hero">
                <img
                  ref={detailImageRef}
                  src={activeArticle.imageUrl}
                  alt={getArticleImageAlt(activeArticle, uiLocale)}
                  onLoad={(event) => updateDetailImagePan(event.currentTarget)}
                />
              </div>
              <div className="today-news-detail-post">
                <div className="today-news-detail-author">
                  <span className="today-news-author-avatar" aria-hidden="true">
                    {getArticleAuthor(activeArticle, uiLocale).slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{getArticleAuthor(activeArticle, uiLocale)}</strong>
                    <span>@{activeArticle.authorKey}</span>
                  </div>
                </div>
                <h1>{getArticleTopic(activeArticle, uiLocale)}</h1>
                <p>{getArticleBody(activeArticle, uiLocale)}</p>
                <div className="today-news-detail-time">
                  <time dateTime={activeArticle.publishedAt}>{activeArticle.publishedAtLabel}</time>
                </div>
                <div className="today-news-detail-stats">
                  <strong>{activeArticleReaction?.likeCount ?? 0}</strong>
                  <span>{copy.likesLabel}</span>
                </div>
                <div className="today-news-detail-actions" aria-label={copy.actionsLabel}>
                  <button
                    className={
                      activeArticleReaction?.liked
                        ? 'today-news-social-button today-news-social-button-liked'
                        : 'today-news-social-button'
                    }
                    type="button"
                    aria-label={activeArticleReaction?.liked ? copy.unlikeLabel : copy.likeLabel}
                    aria-pressed={Boolean(activeArticleReaction?.liked)}
                    disabled={Boolean(activeArticleReaction?.pending)}
                    onClick={() => {
                      if (!activeArticleReaction) return
                      void updateArticleReaction(activeArticle, {
                        liked: !activeArticleReaction.liked,
                        bookmarked: activeArticleReaction.bookmarked,
                      })
                    }}
                  >
                    <Heart size={18} strokeWidth={2.3} />
                    <span>{copy.likeLabel}</span>
                  </button>
                  <button
                    className={
                      activeArticleReaction?.bookmarked
                        ? 'today-news-social-button today-news-social-button-saved'
                        : 'today-news-social-button'
                    }
                    type="button"
                    aria-label={activeArticleReaction?.bookmarked ? copy.bookmarkedLabel : copy.bookmarkLabel}
                    aria-pressed={Boolean(activeArticleReaction?.bookmarked)}
                    disabled={Boolean(activeArticleReaction?.pending)}
                    onClick={() => {
                      if (!activeArticleReaction) return
                      void updateArticleReaction(activeArticle, {
                        liked: activeArticleReaction.liked,
                        bookmarked: !activeArticleReaction.bookmarked,
                      })
                    }}
                  >
                    <Bookmark size={18} strokeWidth={2.3} />
                    <span>{activeArticleReaction?.bookmarked ? copy.bookmarkedLabel : copy.bookmarkLabel}</span>
                  </button>
                </div>
                {reactionError ? <p className="today-news-detail-error">{reactionError}</p> : null}
              </div>
            </article>
          ) : visibleArticles.length > 0 ? (
            visibleArticles.map((article) => (
              <button
                className="today-news-card"
                type="button"
                key={article.id}
                aria-label={copy.openArticleLabel(getArticleTopic(article, uiLocale))}
                onClick={() => setActiveArticleSlug(article.slug)}
              >
                <div className="today-news-image">
                  <img src={article.imageUrl} alt={getArticleImageAlt(article, uiLocale)} />
                  <div className="today-news-copy">
                    <h3>{getArticleTopic(article, uiLocale)}</h3>
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="today-news-empty">
              <strong>{articles.length > 0 ? copy.emptyFilterTitle : copy.emptyTitle}</strong>
              <span>{articles.length > 0 ? copy.emptyFilterBody : copy.emptyBody}</span>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  )
}

const zhCnCopy = {
  title: 'SPCG 每周资讯',
  closeLabel: '关闭 SPCG 每周资讯',
  backLabel: '返回 SPCG 每周资讯',
  filterLabel: '资讯分类',
  filters: [
    { key: 'all', label: '本周' },
    { key: 'launch', label: '上线' },
    { key: 'gear', label: '装备' },
  ] satisfies NewsFilter[],
  playingLabel: '播放中',
  emptyTitle: '本周暂无资讯',
  emptyBody: '稍后再来看看新的 SPCG 动态。',
  emptyFilterTitle: '这个分类暂无内容',
  emptyFilterBody: '换个分类看看本周其他 SPCG 动态。',
  actionsLabel: '文章操作',
  likeLabel: '点赞',
  unlikeLabel: '取消点赞',
  likesLabel: '点赞',
  bookmarkLabel: '收藏',
  bookmarkedLabel: '已收藏',
  saveFailed: '保存失败，请稍后再试。',
  openArticleLabel: (title: string) => `打开文章：${title}`,
}

const enUsCopy = {
  title: 'SPCG Weekly',
  closeLabel: 'Close SPCG Weekly',
  backLabel: 'Back to SPCG Weekly',
  filterLabel: 'News categories',
  filters: [
    { key: 'all', label: 'Weekly' },
    { key: 'launch', label: 'Launch' },
    { key: 'gear', label: 'Gear' },
  ] satisfies NewsFilter[],
  playingLabel: 'Playing',
  emptyTitle: 'No weekly updates',
  emptyBody: 'Check back soon for new SPCG updates.',
  emptyFilterTitle: 'Nothing in this category',
  emptyFilterBody: 'Try another category for more SPCG updates.',
  actionsLabel: 'Article actions',
  likeLabel: 'Like',
  unlikeLabel: 'Unlike',
  likesLabel: 'Likes',
  bookmarkLabel: 'Bookmark',
  bookmarkedLabel: 'Bookmarked',
  saveFailed: 'Save failed. Please try again.',
  openArticleLabel: (title: string) => `Open article: ${title}`,
}

function getArticleTopic(article: TodayNewsArticleCard, uiLocale: UiLocale): string {
  return uiLocale === 'en-US' ? article.topicEn : article.topicZh
}

function getArticleBody(article: TodayNewsArticleCard, uiLocale: UiLocale): string {
  return uiLocale === 'en-US' ? article.bodyEn : article.bodyZh
}

function getArticleImageAlt(article: TodayNewsArticleCard, uiLocale: UiLocale): string {
  return uiLocale === 'en-US' ? article.imageAltEn : article.imageAltZh
}

function getArticleAuthor(article: TodayNewsArticleCard, uiLocale: UiLocale): string {
  return uiLocale === 'en-US' ? article.authorNameEn : article.authorNameZh
}

function matchesArticleFilter(article: TodayNewsArticleCard, filter: NewsFilterKey): boolean {
  if (filter === 'all') return true
  const searchable = [
    article.slug,
    article.topicZh,
    article.topicEn,
    article.bodyZh,
    article.bodyEn,
    article.imageUrl,
  ]
    .join(' ')
    .toLowerCase()

  if (filter === 'launch') {
    return /上线|发布|开放|launch|online|live/.test(searchable)
  }

  return /装备|兵器|武器|weapon|weapons|blade|gear|rank-weapons/.test(searchable)
}

function formatPhoneTime(date: Date): string {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
}

function updateDetailImagePan(image: HTMLImageElement | null) {
  const frame = image?.parentElement
  if (!image || !(frame instanceof HTMLElement)) return

  const imageHeight = image.getBoundingClientRect().height
  const frameHeight = frame.getBoundingClientRect().height
  const panDistance = Math.max(0, imageHeight - frameHeight)
  frame.style.setProperty('--today-news-detail-pan-distance', `${panDistance}px`)
  frame.classList.toggle('today-news-detail-hero-pan', panDistance > 2)
}

function createArticleReactionState(articles: TodayNewsArticleCard[]): ArticleReactionStateBySlug {
  return Object.fromEntries(articles.map((article) => [article.slug, getInitialArticleReaction(article)]))
}

function getInitialArticleReaction(article: TodayNewsArticleCard): ArticleReactionState {
  return {
    liked: article.viewerLiked,
    bookmarked: article.viewerBookmarked,
    likeCount: article.likeCount,
    pending: false,
  }
}
