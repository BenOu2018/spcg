'use client'

import Link from 'next/link'
import type { TodayNewsArticleCard, UiLocale } from '@spcg/shared/types'
import type { Session } from 'next-auth'
import { useEffect, useState } from 'react'
import { Map, Newspaper } from 'lucide-react'
import { TodayNewsModal } from '@/components/TodayNewsModal'
import { UserAccountMenu } from '@/components/UserAccountMenu'
import { getStudentUiMessages, type StudentUiMessages } from '@/lib/student-ui'

type TopbarAccountActionsProps = {
  session: Session | null
  mapHref?: string
  showMapButton?: boolean
  showTodayNews?: boolean
  showProgressButton?: boolean
  todayNewsArticles?: TodayNewsArticleCard[]
  uiLocale?: UiLocale
  messages?: StudentUiMessages
  canShowPricingMenu?: boolean
}

const fallbackMessages = getStudentUiMessages('zh-CN')
const emptyTodayNewsArticles: TodayNewsArticleCard[] = []

export function TopbarAccountActions({
  session,
  mapHref = '/map',
  showMapButton = false,
  showTodayNews = false,
  showProgressButton = true,
  todayNewsArticles = emptyTodayNewsArticles,
  uiLocale = 'zh-CN',
  messages = fallbackMessages,
  canShowPricingMenu = false,
}: TopbarAccountActionsProps) {
  const [isTodayNewsOpen, setIsTodayNewsOpen] = useState(false)
  const [newsArticles, setNewsArticles] = useState<TodayNewsArticleCard[]>(todayNewsArticles)
  const todayNewsLabel = uiLocale === 'en-US' ? 'SPCG Weekly' : 'SPCG 每周资讯'

  useEffect(() => {
    setNewsArticles(todayNewsArticles)
  }, [todayNewsArticles])

  return (
    <nav className="topbar-account-actions" aria-label={messages.common.settings}>
      {showMapButton ? (
        <Link
          className="topbar-action-button"
          data-tooltip={messages.common.backToMap}
          href={mapHref}
          aria-label={messages.common.backToMap}
          title={messages.common.backToMap}
        >
          <Map size={14} strokeWidth={2.4} />
        </Link>
      ) : null}
      {showProgressButton ? (
        <Link
          className="topbar-action-button"
          data-tooltip={messages.common.progress}
          href="/me"
          aria-label={messages.common.progress}
          title={messages.common.progress}
        >
          <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-star.svg" alt="" />
        </Link>
      ) : null}
      {showTodayNews ? (
        <>
          <button
            className="topbar-action-button"
            type="button"
            data-tooltip={todayNewsLabel}
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
      <UserAccountMenu session={session} canShowPricingMenu={canShowPricingMenu} variant="topbar" />
    </nav>
  )
}
