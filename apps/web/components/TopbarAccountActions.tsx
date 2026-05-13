'use client'

import Link from 'next/link'
import type { UiLocale } from '@spcg/shared/types'
import type { Session } from 'next-auth'
import { useEffect, useState } from 'react'
import { Map, Newspaper } from 'lucide-react'
import { TodayNewsModal } from '@/components/TodayNewsModal'
import { getStudentUiMessages, type StudentUiMessages } from '@/lib/student-ui'
import type { TodayNewsArticleCard } from '@/lib/services/today-news-service'

type TopbarAccountActionsProps = {
  session: Session | null
  mapHref?: string
  showMapButton?: boolean
  showTodayNews?: boolean
  todayNewsArticles?: TodayNewsArticleCard[]
  uiLocale?: UiLocale
  messages?: StudentUiMessages
}

const fallbackMessages = getStudentUiMessages('zh-CN')
const emptyTodayNewsArticles: TodayNewsArticleCard[] = []

export function TopbarAccountActions({
  session,
  mapHref = '/map',
  showMapButton = false,
  showTodayNews = false,
  todayNewsArticles = emptyTodayNewsArticles,
  uiLocale = 'zh-CN',
  messages = fallbackMessages,
}: TopbarAccountActionsProps) {
  const [currentSession, setCurrentSession] = useState<Session | null>(session)
  const [isTodayNewsOpen, setIsTodayNewsOpen] = useState(false)
  const [newsArticles, setNewsArticles] = useState<TodayNewsArticleCard[]>(todayNewsArticles)
  const user = currentSession?.user
  const displayName = user?.name || user?.username || user?.email || user?.id || 'SPCG'
  const avatarUrl = user?.avatarUrl || user?.image || null
  const todayNewsLabel = uiLocale === 'en-US' ? 'SPCG Weekly' : 'SPCG 每周资讯'

  useEffect(() => {
    setNewsArticles(todayNewsArticles)
  }, [todayNewsArticles])

  useEffect(() => {
    let cancelled = false

    async function refreshSession() {
      try {
        const response = await fetch(`/api/auth/session?t=${Date.now()}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        })
        if (cancelled || !response.ok) return
        const nextSession = (await response.json()) as Session | null
        if (!cancelled) setCurrentSession(nextSession)
      } catch {
        if (!cancelled) setCurrentSession(session)
      }
    }

    void refreshSession()

    const handleFocus = () => {
      void refreshSession()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      cancelled = true
      window.removeEventListener('focus', handleFocus)
    }
  }, [session])

  return (
    <nav className="topbar-account-actions" aria-label={messages.common.settings}>
      {showMapButton ? (
        <Link className="topbar-action-button" href={mapHref} aria-label={messages.common.backToMap} title={messages.common.backToMap}>
          <Map size={14} strokeWidth={2.4} />
        </Link>
      ) : null}
      <Link className="topbar-action-button" href="/me" aria-label={messages.common.progress} title={messages.common.progress}>
        <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-star.svg" alt="" />
      </Link>
      {showTodayNews ? (
        <>
          <button
            className="topbar-action-button"
            type="button"
            aria-label={todayNewsLabel}
            title={todayNewsLabel}
            onClick={() => setIsTodayNewsOpen(true)}
          >
            <Newspaper size={14} strokeWidth={2.4} />
          </button>
          {isTodayNewsOpen ? (
            <TodayNewsModal
              articles={newsArticles}
              uiLocale={uiLocale}
              onReactionChange={(reaction) => {
                setNewsArticles((current) =>
                  current.map((article) =>
                    article.slug === reaction.slug
                      ? {
                          ...article,
                          likeCount: reaction.likeCount,
                          viewerLiked: reaction.liked,
                          viewerBookmarked: reaction.bookmarked,
                        }
                      : article,
                  ),
                )
              }}
              onClose={() => setIsTodayNewsOpen(false)}
            />
          ) : null}
        </>
      ) : null}
      <Link
        className="topbar-avatar-button topbar-user-button"
        href="/settings?tab=profile"
        aria-label={`${messages.common.settings}: ${displayName}`}
        title={displayName}
      >
        <span className="topbar-user-avatar" aria-hidden="true">
          {avatarUrl ? <img src={avatarUrl} alt="" /> : displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="topbar-user-name">{displayName}</span>
      </Link>
    </nav>
  )
}
