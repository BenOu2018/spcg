import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getGameChapter } from '@spcg/shared/game-chapters'
import { ProgrammingLevel } from '@/components/ProgrammingLevel'
import { requireUser } from '@/lib/auth-guard'
import { getLessonStageMenu, getLevelById, getMainlineLevels, getProgressRecords } from '@/lib/level-data'

type LevelPageProps = {
  params: Promise<{ id: string }> | { id: string }
}

export default async function LevelPage({ params }: LevelPageProps) {
  const { id } = await params
  await requireUser(`/level/${id}`)
  const [level, levels, progressRecords, stageMenu] = await Promise.all([
    getLevelById(id),
    getMainlineLevels(),
    getProgressRecords(),
    getLessonStageMenu(id),
  ])

  if (!level) notFound()
  const chapter = getGameChapter(level.chapterId)
  const chapterLevels = levels.filter((item) => item.chapterId === level.chapterId)
  const stageLabel = stageMenu ? `第${stageMenu.stageNo}层 ${stageMenu.title}` : `第${level.order}层 ${level.title}`

  return (
    <main className="programming-scene">
      <header className="programming-topbar">
        <Link className="kit-logo" href={`/map?chapter=${chapter.chapterId}`} aria-label="返回地图">
          <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/logo-spcg.svg" alt="SPCG" />
        </Link>
        <div className="programming-level-context">
          <div className="chapter-pill">第{chapter.spcgLevel}级 {chapter.displayName}</div>
          <div className="chapter-pill">{stageLabel}</div>
          {stageMenu && stageMenu.items.length > 0 ? (
            <details className="programming-problem-menu">
              <summary>本层题目</summary>
              <div className="programming-problem-menu-panel">
                {stageMenu.items.map((item) => (
                  <Link
                    aria-current={item.levelId === level.id ? 'page' : undefined}
                    className={item.levelId === level.id ? 'active' : undefined}
                    href={`/level/${item.levelId}`}
                    key={item.levelId}
                  >
                    <span>{String(item.position).padStart(2, '0')}</span>
                    <strong>{item.title}</strong>
                    <em>{formatDisplayMode(item.displayMode)}</em>
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
        </div>
        <div className="level-progress-strip" aria-label="level progress">
          {chapterLevels.slice(0, 5).map((item, index) => {
            const passed = progressRecords.some((progress) => progress.levelId === item.id && progress.passed)
            const node =
              item.id === level.id
                ? 'level-node-current.svg'
                : passed
                  ? 'level-node-completed.svg'
                  : index === 4
                    ? 'level-node-destination.svg'
                    : 'level-node-locked.svg'
            return (
              <span className="progress-step" key={item.id}>
                <img src={`/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/${node}`} alt="" />
                {index < 4 ? <i /> : null}
              </span>
            )
          })}
        </div>
        <div className="programming-actions">
          <Link className="top-icon-button" href={`/map?chapter=${chapter.chapterId}`} aria-label="任务书">
            <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-book.svg" alt="" />
          </Link>
          <Link className="top-icon-button" href="/me" aria-label="设置">
            <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-settings.svg" alt="" />
          </Link>
        </div>
      </header>

      <section className="programming-main">
        <ProgrammingLevel level={level} />
      </section>
    </main>
  )
}

function formatDisplayMode(displayMode: string) {
  const labels: Record<string, string> = {
    primary: '主线',
    backup: '备用',
    'exam-only': '段位赛',
  }

  return labels[displayMode] ?? displayMode
}
