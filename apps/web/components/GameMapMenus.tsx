'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Trophy } from 'lucide-react'
import type { GameChapter } from '@spcg/shared/game-chapters'
import type { Level } from '@spcg/shared/types'
import { getStudentUiMessages, type StudentUiMessages } from '@/lib/student-ui'

export type ChapterMenuItem =
  | { type: 'chapter'; chapter: GameChapter }
  | { type: 'placeholder'; id: string; label: string; title: string; description: string }

type GameMapMenusProps = {
  chapterMenuItems: ChapterMenuItem[]
  currentChapter: GameChapter
  levels: Level[]
  currentLevelId?: string
  messages?: StudentUiMessages
}

type OpenMenu = 'chapter' | 'level' | null

const fallbackMessages = getStudentUiMessages('zh-CN')

export function GameMapMenus({
  chapterMenuItems,
  currentChapter,
  levels,
  currentLevelId,
  messages = fallbackMessages,
}: GameMapMenusProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenMenu(null)
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const closeMenus = () => setOpenMenu(null)

  return (
    <div className="village-map-menus" ref={rootRef}>
      <div className="village-chapter-menu">
        <button
          aria-controls="village-chapter-menu-panel"
          aria-expanded={openMenu === 'chapter'}
          className="village-chapter-trigger"
          onClick={() => setOpenMenu(openMenu === 'chapter' ? null : 'chapter')}
          type="button"
        >
          <span>{messages.map.chapter}</span>
          <strong>
            {messages.map.levelPrefix}
            {currentChapter.spcgLevel}
            {messages.map.levelSuffix} · {currentChapter.displayName}
          </strong>
        </button>
        {openMenu === 'chapter' ? (
          <div className="village-chapter-menu-panel" id="village-chapter-menu-panel">
            {chapterMenuItems.map((item) => {
              if (item.type === 'placeholder') {
                return (
                  <div
                    aria-disabled="true"
                    className="village-chapter-menu-placeholder"
                    key={item.id}
                  >
                    <span>{item.label}</span>
                    <strong>{item.title}</strong>
                    <em>{item.description}</em>
                  </div>
                )
              }

              const chapter = item.chapter
              return (
                <Link
                  aria-current={chapter.chapterId === currentChapter.chapterId ? 'page' : undefined}
                  className={chapter.chapterId === currentChapter.chapterId ? 'active' : undefined}
                  href={`/map?chapter=${chapter.chapterId}`}
                  key={chapter.chapterId}
                  onClick={closeMenus}
                >
                  <span>
                    {messages.map.levelPrefix}
                    {chapter.spcgLevel}
                    {messages.map.levelSuffix}
                  </span>
                  <strong>{chapter.displayName}</strong>
                  <em>{chapter.algorithmSummary ?? chapter.coreConcept}</em>
                </Link>
              )
            })}
          </div>
        ) : null}
      </div>

      <div className="village-level-menu">
        <button
          aria-controls="village-level-menu-panel"
          aria-expanded={openMenu === 'level'}
          className="village-level-trigger"
          onClick={() => setOpenMenu(openMenu === 'level' ? null : 'level')}
          type="button"
        >
          <span>{messages.map.currentDirectory}</span>
          <strong>{levels.length}</strong>
        </button>
        {openMenu === 'level' ? (
          <div className="village-level-menu-panel" id="village-level-menu-panel">
            {levels.map((level) => (
              <Link
                aria-current={level.id === currentLevelId ? 'page' : undefined}
                className={level.id === currentLevelId ? 'active' : undefined}
                href={`/level/${level.id}`}
                key={level.id}
                onClick={closeMenus}
                prefetch={false}
              >
                <span>
                  {messages.map.levelPrefix}
                  {level.order}
                  {messages.map.stageSuffix}
                </span>
                <strong>{level.title}</strong>
                <em>{level.knowledgePoint}</em>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <Link
        aria-label={`${currentChapter.spcgLevel}级排行榜`}
        className="village-leaderboard-link"
        href={`/leaderboard?level=${currentChapter.spcgLevel}`}
        prefetch={false}
        title={`${currentChapter.spcgLevel}级排行榜`}
      >
        <Trophy size={18} strokeWidth={2.6} aria-hidden="true" />
        <span>榜</span>
      </Link>
    </div>
  )
}
