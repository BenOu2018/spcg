'use client'

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Search, Sparkles, Target, X, ZoomIn, ZoomOut } from 'lucide-react'
import type {
  KnowledgeProgress,
  KnowledgeTreeLink,
  KnowledgeTreeNode,
  KnowledgeTreePayload,
  KnowledgeTreeProgressStatus,
} from '@spcg/shared/types'
import styles from './knowledge-tree.module.css'

type KnowledgeTreeClientProps = {
  tree: KnowledgeTreePayload
}

type NodeView = KnowledgeTreeNode & {
  progress: KnowledgeProgress
  isVisible: boolean
  isSearchMatch: boolean
  isSelected: boolean
  isRecent: boolean
}

type DragState = {
  pointerId: number
  startX: number
  startY: number
  scrollLeft: number
  scrollTop: number
}

const allLevel = '全部'
const zoomStep = 0.15
const minZoom = 0.5
const maxZoom = 1.85

const statusLabels: Record<KnowledgeTreeProgressStatus, string> = {
  unstarted: '未开始',
  unlocked: '已解锁',
  practicing: '练习中',
  mastered: '已掌握',
}

const statusClasses: Record<KnowledgeTreeProgressStatus, string> = {
  unstarted: styles.nodeUnstarted ?? '',
  unlocked: styles.nodeUnlocked ?? '',
  practicing: styles.nodePracticing ?? '',
  mastered: styles.nodeMastered ?? '',
}

export function KnowledgeTreeClient({ tree }: KnowledgeTreeClientProps) {
  const [activeLevel, setActiveLevel] = useState(allLevel)
  const [selectedDomains, setSelectedDomains] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [selectedTagId, setSelectedTagId] = useState(tree.nodes[0]?.tagId ?? '')
  const [zoom, setZoom] = useState(1)
  const [usePreviewProgress, setUsePreviewProgress] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)

  const previewProgress = useMemo(() => buildPreviewProgress(tree.nodes), [tree.nodes])
  const progress = usePreviewProgress ? previewProgress : tree.progress
  const progressMap = useMemo(() => new Map(progress.map((item) => [item.tagId, item])), [progress])
  const selectedDomainSet = useMemo(() => new Set(selectedDomains), [selectedDomains])
  const normalizedQuery = query.trim().toLowerCase()

  const nodeViews = useMemo(
    () =>
      tree.nodes.map((node) => {
        const nodeProgress = progressMap.get(node.tagId) ?? emptyProgress(node.tagId)
        const matchesLevel = activeLevel === allLevel || node.bandOrLevel === activeLevel
        const matchesDomain = selectedDomains.length === 0 || selectedDomainSet.has(node.domain)
        const isSearchMatch =
          normalizedQuery.length === 0 ||
          [node.zhName, node.enName, node.tagId, node.domain, node.algorithmFamily]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery)
        const isVisible = matchesLevel && matchesDomain && isSearchMatch

        return {
          ...node,
          progress: nodeProgress,
          isVisible,
          isSearchMatch: normalizedQuery.length > 0 && isSearchMatch,
          isSelected: node.tagId === selectedTagId,
          isRecent: isRecentProgress(nodeProgress.lastPracticedAt),
        }
      }),
    [activeLevel, normalizedQuery, progressMap, selectedDomainSet, selectedDomains.length, selectedTagId, tree.nodes],
  )

  const visibleNodeCount = nodeViews.filter((node) => node.isVisible).length
  const masteredCount = nodeViews.filter((node) => node.progress.status === 'mastered').length
  const coloredCount = nodeViews.filter((node) => node.progress.status !== 'unstarted').length
  const selectedNode = nodeViews.find((node) => node.tagId === selectedTagId) ?? nodeViews.find((node) => node.isVisible) ?? nodeViews[0]
  const selectedParent = selectedNode ? findParent(selectedNode.tagId, tree.links, nodeViews) : null
  const selectedChildren = selectedNode ? findChildren(selectedNode.tagId, tree.links, nodeViews) : []
  const links = useMemo(() => buildLinkViews(tree.links, nodeViews), [nodeViews, tree.links])
  const treeGuides = useMemo(() => buildTreeGuides(tree.asset.width, tree.asset.height), [tree.asset.height, tree.asset.width])
  const canvasStyle = {
    '--tree-aspect': `${tree.asset.width} / ${tree.asset.height}`,
    '--tree-width': `${Math.round(tree.asset.width * zoom)}px`,
    '--tree-zoom': String(zoom),
  } as CSSProperties

  useEffect(() => {
    scrollToRoot(scrollerRef.current, 'auto')
  }, [])

  function changeZoom(direction: 1 | -1) {
    setZoom((current) => clampZoom(current + direction * zoomStep))
  }

  function resetView() {
    setZoom(1)
    setActiveLevel(allLevel)
    setSelectedDomains([])
    setQuery('')
    setUsePreviewProgress(false)
    setSelectedTagId(tree.nodes[0]?.tagId ?? '')
    scrollToRoot(scrollerRef.current, 'smooth')
  }

  function toggleDomain(domain: string) {
    setSelectedDomains((current) =>
      current.includes(domain) ? current.filter((item) => item !== domain) : [...current, domain],
    )
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return
    const scroller = scrollerRef.current
    if (!scroller) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const scroller = scrollerRef.current
    if (!drag || !scroller || drag.pointerId !== event.pointerId) return
    scroller.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX)
    scroller.scrollTop = drag.scrollTop - (event.clientY - drag.startY)
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <img src="/assets/art/ui/knowledge-tree/svg/crest-cpp.svg" alt="" />
          <div>
            <span>SPCG Knowledge Map</span>
            <h1>编程算法知识树</h1>
          </div>
        </div>
        <nav className={styles.levelTabs} aria-label="SPCG 级别">
          <span>SPCG 级别</span>
          <div>
            {[allLevel, ...tree.levels.map((level) => level.value)].map((level) => (
              <button
                key={level}
                type="button"
                className={level === activeLevel ? styles.activeLevel : undefined}
                onClick={() => setActiveLevel(level)}
                aria-current={level === activeLevel ? 'page' : undefined}
              >
                {level === allLevel ? 'All' : level.replace('级', '')}
              </button>
            ))}
          </div>
        </nav>
        <div className={styles.headerStats} aria-label="知识树统计">
          <Metric label="知识点" value={String(tree.nodes.length)} />
          <Metric label="已点亮" value={String(coloredCount)} tone="lit" />
          <Metric label="已掌握" value={String(masteredCount)} tone="mastered" />
          <Metric label="筛选命中" value={String(visibleNodeCount)} />
        </div>
      </header>

      <section className={styles.workspace}>
        <aside className={styles.controlPanel} aria-label="知识树筛选">
          <div className={styles.panelBanner}>
            <img src="/assets/art/ui/leaderboard-rpg/svg/scroll-pass.svg" alt="" />
            <strong>知识检索</strong>
          </div>
          <div className={styles.searchBox}>
            <Search size={18} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索中文 / English / tag"
              aria-label="搜索知识点"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="清空搜索">
                <X size={16} />
              </button>
            ) : null}
          </div>

          <section className={styles.filterBlock}>
            <div className={styles.panelTitle}>
              <Target size={16} aria-hidden="true" />
              <strong>知识类别</strong>
            </div>
            <div className={styles.domainChecks} aria-label="知识类别多选">
              <label className={selectedDomains.length === 0 ? styles.activeCheck : undefined}>
                <input
                  type="checkbox"
                  checked={selectedDomains.length === 0}
                  onChange={() => setSelectedDomains([])}
                />
                <i style={{ '--legend-color': '#f5d784' } as CSSProperties} />
                <span>All</span>
                <strong>{tree.nodes.length}</strong>
              </label>
              {tree.domains.map((domain) => (
                <label
                  key={domain.value}
                  className={selectedDomainSet.has(domain.value) ? styles.activeCheck : undefined}
                  title={`${domain.value} (${domain.count})`}
                >
                  <input
                    type="checkbox"
                    checked={selectedDomainSet.has(domain.value)}
                    onChange={() => toggleDomain(domain.value)}
                  />
                  <i style={{ '--legend-color': domain.color } as CSSProperties} />
                  <span>{compactDomainLabel(domain.value)}</span>
                  <strong>{domain.count}</strong>
                </label>
              ))}
            </div>
          </section>

          <section className={styles.inlineDetail} aria-label="知识点详情">
            <div className={styles.inlineDetailTitle}>
              <img src="/assets/art/ui/leaderboard-rpg/svg/level-gem.svg" alt="" />
              <strong>节点详情</strong>
            </div>
            {selectedNode ? (
              <>
                <div className={styles.detailHero}>
                  <span style={{ '--detail-color': selectedNode.color } as CSSProperties} />
                  <div>
                    <small>{selectedNode.bandOrLevel} · {selectedNode.domain}</small>
                    <h2>{selectedNode.zhName}</h2>
                    <p>{selectedNode.enName}</p>
                  </div>
                </div>

                <div className={styles.masteryBlock}>
                  <div
                    className={styles.masteryOrb}
                    style={
                      {
                        '--node-color': selectedNode.color,
                        '--mastery': `${selectedNode.progress.mastery}%`,
                      } as CSSProperties
                    }
                  >
                    <strong>{selectedNode.progress.mastery}</strong>
                    <span>%</span>
                  </div>
                  <div>
                    <strong>{statusLabels[selectedNode.progress.status]}</strong>
                    <span>
                      {selectedNode.progress.attemptCount} 次使用 · 通过 {selectedNode.progress.correctCount} 题
                    </span>
                    <small>{formatDate(selectedNode.progress.lastPracticedAt)}</small>
                  </div>
                </div>

                <dl className={styles.detailList}>
                  <div>
                    <dt>tag</dt>
                    <dd>{selectedNode.tagId}</dd>
                  </div>
                  <div>
                    <dt>family</dt>
                    <dd>{selectedNode.algorithmFamily}</dd>
                  </div>
                  <div>
                    <dt>上游</dt>
                    <dd>{selectedParent?.zhName ?? '树根节点'}</dd>
                  </div>
                  <div>
                    <dt>下游</dt>
                    <dd>{selectedChildren.length > 0 ? `${selectedChildren.length} 个关联节点` : '叶子节点'}</dd>
                  </div>
                </dl>

                <section className={styles.nextStep}>
                  <strong>下一步建议</strong>
                  <p>{selectedNode.recommendation || '完成相关题目后，这个节点会根据掌握度逐步点亮。'}</p>
                </section>
              </>
            ) : (
              <div className={styles.emptyDetail}>
                <Sparkles size={28} />
                <strong>选择一个知识节点</strong>
              </div>
            )}
          </section>
        </aside>

        <section className={styles.treePanel} aria-label="编程算法知识树">
          <div className={styles.boardRibbon}>
            <span />
            <strong>算法成长树</strong>
            <span />
          </div>
          <div className={styles.treeToolbar}>
            <div className={styles.toolbarGroup}>
              <button type="button" onClick={() => changeZoom(-1)} aria-label="缩小知识树" disabled={zoom <= minZoom}>
                <ZoomOut size={17} />
              </button>
              <strong>{Math.round(zoom * 100)}%</strong>
              <button type="button" onClick={() => changeZoom(1)} aria-label="放大知识树" disabled={zoom >= maxZoom}>
                <ZoomIn size={17} />
              </button>
            </div>
            <button
              type="button"
              className={usePreviewProgress ? styles.previewActive : undefined}
              onClick={() => setUsePreviewProgress((value) => !value)}
            >
              <Sparkles size={17} />
              <span>预览成长</span>
            </button>
            <button type="button" onClick={resetView}>
              <RotateCcw size={17} />
              <span>重置</span>
            </button>
          </div>

          <div
            ref={scrollerRef}
            className={styles.mapScroller}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            <div className={styles.treeCanvas} style={canvasStyle}>
              <svg className={styles.linkLayer} viewBox={`0 0 ${tree.asset.width} ${tree.asset.height}`} aria-hidden="true">
                {treeGuides.roots.map((path, index) => (
                  <path key={`root-${index}`} className={styles.rootGuide} d={path} />
                ))}
                <path className={styles.trunkLine} d={treeGuides.trunk} />
                {treeGuides.branches.map((path, index) => (
                  <path key={`branch-${index}`} className={styles.branchGuide} d={path} />
                ))}
                {links.map((link) => (
                  <path
                    key={`${link.from.tagId}-${link.to.tagId}`}
                    className={[styles.treeLink, link.isActive ? styles.activeLink : '', link.isVisible ? '' : styles.hiddenLink]
                      .filter(Boolean)
                      .join(' ')}
                    d={buildPath(link.from, link.to, tree.asset.width, tree.asset.height)}
                    style={{ '--link-color': link.to.color } as CSSProperties}
                  />
                ))}
              </svg>
              <div className={styles.nodeLayer}>
                {nodeViews.map((node) => (
                  <button
                    key={node.tagId}
                    type="button"
                    className={[
                      styles.treeNode,
                      statusClasses[node.progress.status],
                      nodeShapeRegion(node.bandOrLevel) === 'root' ? styles.rootNode : '',
                      nodeShapeRegion(node.bandOrLevel) === 'trunk' ? styles.trunkNode : '',
                      nodeShapeRegion(node.bandOrLevel) === 'crown' ? styles.leafNode : '',
                      node.isVisible ? '' : styles.hiddenNode,
                      node.isSelected ? styles.selectedNode : '',
                      node.isSearchMatch ? styles.searchMatchNode : '',
                      node.isRecent && node.progress.status !== 'unstarted' ? styles.recentNode : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={
                      {
                        '--node-x': `${node.x * 100}%`,
                        '--node-y': `${node.y * 100}%`,
                        '--node-color': node.color,
                        '--mastery': `${Math.max(0, Math.min(100, node.progress.mastery))}%`,
                      } as CSSProperties
                    }
                    data-tooltip={`${node.zhName} · ${node.bandOrLevel} · ${statusLabels[node.progress.status]} · 使用 ${node.progress.attemptCount} 次`}
                    aria-label={`${node.zhName}，${node.bandOrLevel}，${statusLabels[node.progress.status]}，使用 ${node.progress.attemptCount} 次`}
                    onClick={() => setSelectedTagId(node.tagId)}
                  >
                    <span className={styles.nodeBadge}>{nodeLevelNumber(node.bandOrLevel)}</span>
                    <span className={styles.nodeTitle}>{compactKnowledgeName(node.zhName)}</span>
                    <span className={styles.nodeProgress} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

      </section>

      <section className={styles.growthDock} aria-label="当前知识点进度">
        <div className={styles.dockRank}>
          <span>当前</span>
          <strong>{selectedNode ? nodeLevelNumber(selectedNode.bandOrLevel) : '—'}</strong>
        </div>
        <div className={styles.dockProfile}>
          <img src="/assets/art/ui/leaderboard-rpg/svg/ak-star.svg" alt="" />
          <div>
            <strong>{selectedNode?.zhName ?? '选择一个知识节点'}</strong>
            <span>{selectedNode ? `${selectedNode.bandOrLevel} · ${selectedNode.domain}` : '点击树上的节点查看掌握状态'}</span>
          </div>
        </div>
        <Summary label="掌握度" value={`${selectedNode?.progress.mastery ?? 0}%`} positive={(selectedNode?.progress.mastery ?? 0) >= 100} />
        <Summary label="使用次数" value={`${selectedNode?.progress.attemptCount ?? 0} 次`} positive={(selectedNode?.progress.attemptCount ?? 0) > 0} />
        <div className={styles.dockProgress}>
          <span>{statusLabels[selectedNode?.progress.status ?? 'unstarted']}</span>
          <div>
            <i style={{ width: `${selectedNode?.progress.mastery ?? 0}%` }} />
          </div>
          <strong>{selectedNode ? formatDate(selectedNode.progress.lastPracticedAt) : '尚无练习记录'}</strong>
        </div>
        <div className={styles.dockReward}>
          <img src="/assets/art/ui/leaderboard-rpg/svg/treasure-chest.svg" alt="" />
          <span>筛选命中</span>
          <strong>{visibleNodeCount} / {tree.nodes.length}</strong>
        </div>
      </section>
    </main>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'lit' | 'mastered' }) {
  return (
    <div className={[styles.metric, tone ? styles[tone] : ''].filter(Boolean).join(' ')}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Summary({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className={styles.summary}>
      <span>{label}</span>
      <strong className={positive ? styles.positive : undefined}>{value}</strong>
    </div>
  )
}

function compactDomainLabel(domain: string): string {
  const labels: Record<string, string> = {
    algorithm: 'algo',
    'control-flow': 'flow',
    'data-structure': 'data',
    engineering: 'eng',
    math: 'math',
    syntax: 'syn',
  }

  return labels[domain] ?? domain
}

function emptyProgress(tagId: string): KnowledgeProgress {
  return {
    tagId,
    status: 'unstarted',
    mastery: 0,
    attemptCount: 0,
    correctCount: 0,
    lastPracticedAt: null,
  }
}

function buildPreviewProgress(nodes: KnowledgeTreeNode[]): KnowledgeProgress[] {
  const now = Date.now()
  return nodes.slice(0, 72).map((node, index) => {
    if (index < 26) {
      return {
        tagId: node.tagId,
        status: 'mastered',
        mastery: 100,
        attemptCount: 3 + (index % 5),
        correctCount: 1 + (index % 3),
        lastPracticedAt: new Date(now - index * 36 * 60 * 60 * 1000).toISOString(),
      }
    }

    if (index < 54) {
      const mastery = 34 + ((index * 7) % 43)
      return {
        tagId: node.tagId,
        status: 'practicing',
        mastery,
        attemptCount: 1 + (index % 6),
        correctCount: 0,
        lastPracticedAt: new Date(now - index * 20 * 60 * 60 * 1000).toISOString(),
      }
    }

    return {
      tagId: node.tagId,
      status: 'unlocked',
      mastery: 12,
      attemptCount: 0,
      correctCount: 0,
      lastPracticedAt: null,
    }
  })
}

function buildLinkViews(links: KnowledgeTreeLink[], nodes: NodeView[]) {
  const nodeMap = new Map(nodes.map((node) => [node.tagId, node]))
  return links
    .map((link) => {
      const from = nodeMap.get(link.fromTagId)
      const to = nodeMap.get(link.toTagId)
      if (!from || !to) return null
      return {
        from,
        to,
        isActive: from.progress.status !== 'unstarted' && to.progress.status !== 'unstarted',
        isVisible: from.isVisible && to.isVisible,
      }
    })
    .filter((link): link is NonNullable<typeof link> => Boolean(link))
}

function buildPath(from: KnowledgeTreeNode, to: KnowledgeTreeNode, width: number, height: number): string {
  const x1 = from.x * width
  const y1 = from.y * height
  const x2 = to.x * width
  const y2 = to.y * height
  const midY = y1 + (y2 - y1) * 0.5
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x1.toFixed(1)} ${midY.toFixed(1)} L ${x2.toFixed(1)} ${midY.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

function buildTreeGuides(width: number, height: number): { trunk: string; branches: string[]; roots: string[] } {
  const x = width / 2
  const crownTop = height * 0.08
  const crownMid = height * 0.35
  const trunkTop = height * 0.52
  const trunkBottom = height * 0.78
  const rootBottom = height * 0.95

  return {
    trunk: `M ${x} ${trunkTop} C ${x - 34} ${height * 0.61}, ${x + 32} ${height * 0.69}, ${x} ${trunkBottom}`,
    branches: [
      `M ${x} ${trunkTop} C ${x - 260} ${height * 0.45}, ${x - 610} ${height * 0.34}, ${x - 880} ${crownMid}`,
      `M ${x} ${trunkTop} C ${x + 250} ${height * 0.43}, ${x + 640} ${height * 0.32}, ${x + 900} ${crownMid}`,
      `M ${x} ${height * 0.49} C ${x - 130} ${height * 0.34}, ${x - 260} ${height * 0.22}, ${x - 360} ${crownTop}`,
      `M ${x} ${height * 0.49} C ${x + 140} ${height * 0.34}, ${x + 290} ${height * 0.22}, ${x + 390} ${crownTop}`,
    ],
    roots: [
      `M ${x} ${trunkBottom} C ${x - 190} ${height * 0.84}, ${x - 480} ${height * 0.9}, ${x - 820} ${rootBottom}`,
      `M ${x} ${trunkBottom} C ${x + 190} ${height * 0.84}, ${x + 480} ${height * 0.9}, ${x + 820} ${rootBottom}`,
      `M ${x} ${trunkBottom} C ${x - 70} ${height * 0.86}, ${x - 150} ${height * 0.91}, ${x - 230} ${rootBottom}`,
      `M ${x} ${trunkBottom} C ${x + 70} ${height * 0.86}, ${x + 150} ${height * 0.91}, ${x + 230} ${rootBottom}`,
    ],
  }
}

function findParent(tagId: string, links: KnowledgeTreeLink[], nodes: NodeView[]): NodeView | null {
  const parentTagId = links.find((link) => link.toTagId === tagId)?.fromTagId
  return nodes.find((node) => node.tagId === parentTagId) ?? null
}

function findChildren(tagId: string, links: KnowledgeTreeLink[], nodes: NodeView[]): NodeView[] {
  const childIds = new Set(links.filter((link) => link.fromTagId === tagId).map((link) => link.toTagId))
  return nodes.filter((node) => childIds.has(node.tagId))
}

function clampZoom(value: number): number {
  return Math.min(maxZoom, Math.max(minZoom, Math.round(value * 100) / 100))
}

function nodeLevelNumber(value: string): number {
  const match = value.match(/(\d+)/)
  return match ? Number(match[1]) : 0
}

function nodeShapeRegion(bandOrLevel: string): 'root' | 'trunk' | 'crown' {
  const level = nodeLevelNumber(bandOrLevel)
  if (level <= 1) return 'root'
  if (level === 2) return 'trunk'
  return 'crown'
}

function compactKnowledgeName(value: string): string {
  const normalized = value
    .replace(/[（(].*?[）)]/g, '')
    .replace(/\s+/g, '')
    .replace(/基础/g, '')
    .replace(/语句/g, '')
    .replace(/算法/g, '')
  const chars = Array.from(normalized)
  return chars.length > 6 ? chars.slice(0, 6).join('') : normalized
}

function scrollToRoot(scroller: HTMLDivElement | null, behavior: ScrollBehavior) {
  if (!scroller) return
  requestAnimationFrame(() => {
    scroller.scrollTo({
      left: Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2),
      top: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
      behavior,
    })
  })
}

function isInteractiveTarget(target: EventTarget): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('button, input, select, a'))
}

function isRecentProgress(value: string | null): boolean {
  if (!value) return false
  return Date.now() - new Date(value).getTime() < 1000 * 60 * 60 * 24 * 3
}

function formatDate(value: string | null): string {
  if (!value) return '尚无练习记录'
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  )
}
