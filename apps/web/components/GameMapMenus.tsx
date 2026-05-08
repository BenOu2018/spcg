'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { GameChapter } from '@spcg/shared/game-chapters'
import type { Level } from '@spcg/shared/types'

type GameMapMenusProps = {
  chapters: GameChapter[]
  currentChapter: GameChapter
  levels: Level[]
  testLevels: Level[]
  currentLevelId?: string
}

type OpenMenu = 'chapter' | 'level' | 'test' | null

export function GameMapMenus({ chapters, currentChapter, levels, testLevels, currentLevelId }: GameMapMenusProps) {
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
          <span>级别</span>
          <strong>第{currentChapter.spcgLevel}级 · {currentChapter.displayName}</strong>
        </button>
        {openMenu === 'chapter' ? (
          <div className="village-chapter-menu-panel" id="village-chapter-menu-panel">
            {chapters.map((item) => (
              <Link
                aria-current={item.chapterId === currentChapter.chapterId ? 'page' : undefined}
                className={item.chapterId === currentChapter.chapterId ? 'active' : undefined}
                href={`/map?chapter=${item.chapterId}`}
                key={item.chapterId}
                onClick={closeMenus}
              >
                <span>第{item.spcgLevel}级</span>
                <strong>{item.displayName}</strong>
                <em>{item.coreConcept}</em>
              </Link>
            ))}
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
          <span>当前层目录</span>
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
              >
                <span>第{level.order}层</span>
                <strong>{level.title}</strong>
                <em>{level.knowledgePoint}</em>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="village-test-menu">
        <button
          aria-controls="village-test-menu-panel"
          aria-expanded={openMenu === 'test'}
          className="village-test-trigger"
          onClick={() => setOpenMenu(openMenu === 'test' ? null : 'test')}
          type="button"
        >
          <span>TEST</span>
          <strong>{testLevels.length}</strong>
        </button>
        {openMenu === 'test' ? (
          <div className="village-test-menu-panel" id="village-test-menu-panel">
            {testLevels.map((level, index) => (
              <Link
                aria-current={level.id === currentLevelId ? 'page' : undefined}
                className={level.id === currentLevelId ? 'active' : undefined}
                href={`/level/${level.id}`}
                key={level.id}
                onClick={closeMenus}
              >
                <span>{index + 1}</span>
                <strong>{level.title}</strong>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
