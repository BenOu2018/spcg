'use client'

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { GitBranch, Maximize2, Minimize2, RotateCcw, Search, Sparkles, Target, X, ZoomIn, ZoomOut } from 'lucide-react'
import type {
  KnowledgeProgress,
  KnowledgeTreeLink,
  KnowledgeTreeLinkKind,
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
  isInSelectionContext: boolean
  isUpstreamContext: boolean
  isDownstreamContext: boolean
  isContextDimmed: boolean
  isRecent: boolean
}

type DragState = {
  pointerId: number
  startX: number
  startY: number
  scrollLeft: number
  scrollTop: number
}

type RelationDisplayMode = 'trunk' | 'focused' | 'all' | 'hidden'

type SelectionContext = {
  all: Set<string>
  upstream: Set<string>
  downstream: Set<string>
  routeLinks: Set<string>
}

type LearningRoute = {
  prerequisites: NodeView[]
  nextNodes: NodeView[]
  relatedNodes: NodeView[]
}

const allLevel = '全部'
const treeBaseZoom = 0.6
const zoomStep = 0.1
const minZoom = 0.5
const maxZoom = 1.5

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
  const [relationMode, setRelationMode] = useState<RelationDisplayMode>('trunk')
  const [usePreviewProgress, setUsePreviewProgress] = useState(false)
  const [hasFocusHighlight, setHasFocusHighlight] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)

  const previewProgress = useMemo(() => buildPreviewProgress(tree.nodes), [tree.nodes])
  const progress = usePreviewProgress ? previewProgress : tree.progress
  const progressMap = useMemo(() => new Map(progress.map((item) => [item.tagId, item])), [progress])
  const selectedDomainSet = useMemo(() => new Set(selectedDomains), [selectedDomains])
  const selectedSourceNode = useMemo(
    () => tree.nodes.find((node) => node.tagId === selectedTagId) ?? tree.nodes[0],
    [selectedTagId, tree.nodes],
  )
  const selectedSourceLevel = selectedSourceNode ? nodeLevelNumber(selectedSourceNode.bandOrLevel) : 0
  const routeHighlightEnabled = hasFocusHighlight && selectedSourceLevel >= 3
  const selectionContext = useMemo(
    () => buildSelectionContext(tree.links, tree.nodes, selectedTagId, routeHighlightEnabled),
    [routeHighlightEnabled, selectedTagId, tree.links, tree.nodes],
  )
  const detailSelectionContext = useMemo(
    () => buildSelectionContext(tree.links, tree.nodes, selectedTagId, selectedSourceLevel >= 2),
    [selectedSourceLevel, selectedTagId, tree.links, tree.nodes],
  )
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
        const isInSelectionContext = selectionContext.all.has(node.tagId)
        const isContextDimmed = routeHighlightEnabled && isVisible && !isInSelectionContext

        return {
          ...node,
          progress: nodeProgress,
          isVisible,
          isSearchMatch: normalizedQuery.length > 0 && isSearchMatch,
          isSelected: node.tagId === selectedTagId,
          isInSelectionContext,
          isUpstreamContext: selectionContext.upstream.has(node.tagId),
          isDownstreamContext: selectionContext.downstream.has(node.tagId),
          isContextDimmed,
          isRecent: isRecentProgress(nodeProgress.lastPracticedAt),
        }
      }),
    [
      activeLevel,
      normalizedQuery,
      progressMap,
      routeHighlightEnabled,
      selectedDomainSet,
      selectedDomains.length,
      selectedTagId,
      selectionContext,
      tree.nodes,
    ],
  )

  const visibleNodeCount = nodeViews.filter((node) => node.isVisible).length
  const masteredCount = nodeViews.filter((node) => node.progress.status === 'mastered').length
  const coloredCount = nodeViews.filter((node) => node.progress.status !== 'unstarted').length
  const selectedNode = nodeViews.find((node) => node.tagId === selectedTagId) ?? nodeViews.find((node) => node.isVisible) ?? nodeViews[0]
  const selectedLearningRoute = selectedNode
    ? buildLearningRoute(selectedNode.tagId, tree.links, nodeViews, detailSelectionContext)
    : emptyLearningRoute()
  const selectedPrerequisites = selectedLearningRoute.prerequisites
  const selectedNextNodes = selectedLearningRoute.nextNodes
  const links = useMemo(
    () => buildLinkViews(tree.links, nodeViews, selectedTagId, relationMode, routeHighlightEnabled, selectionContext),
    [nodeViews, relationMode, routeHighlightEnabled, selectedTagId, selectionContext, tree.links],
  )
  const treeGuides = useMemo(() => buildTreeGuides(tree.asset.width, tree.asset.height), [tree.asset.height, tree.asset.width])
  const actualTreeZoom = treeBaseZoom * zoom
  const canvasStyle = {
    '--tree-aspect': `${tree.asset.width} / ${tree.asset.height}`,
    '--tree-width': `${Math.round(tree.asset.width * actualTreeZoom)}px`,
    '--tree-zoom': String(actualTreeZoom),
  } as CSSProperties

  useEffect(() => {
    scrollToRoot(scrollerRef.current, 'auto')
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setHasFocusHighlight(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
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
    setRelationMode('trunk')
    setHasFocusHighlight(false)
    setIsExpanded(false)
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
    <main className={[styles.page, isExpanded ? styles.expandedPage : ''].filter(Boolean).join(' ')}>
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
                <span title="全部 / All">全部</span>
                <strong>{tree.nodes.length}</strong>
              </label>
              {tree.domains.map((domain) => (
                <label
                  key={domain.value}
                  className={selectedDomainSet.has(domain.value) ? styles.activeCheck : undefined}
                  title={`${domainZhLabel(domain.value)} / ${domainEnLabel(domain.value)} (${domain.count})`}
                >
                  <input
                    type="checkbox"
                    checked={selectedDomainSet.has(domain.value)}
                    onChange={() => toggleDomain(domain.value)}
                  />
                  <i style={{ '--legend-color': domain.color } as CSSProperties} />
                  <span>{domainZhLabel(domain.value)}</span>
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
                    <small>{selectedNode.bandOrLevel} · {domainZhLabel(selectedNode.domain)}</small>
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
                      {selectedNode.progress.attemptCount} 次使用
                      <br />
                      通过 {selectedNode.progress.correctCount} 题
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
                    <dt>需要先会</dt>
                    <dd>{formatLinkedNodes(selectedPrerequisites, '暂无显式前置')}</dd>
                  </div>
                  <div>
                    <dt>可继续学</dt>
                    <dd>{formatLinkedNodes(selectedNextNodes, '暂无显式后续')}</dd>
                  </div>
                </dl>

                <section className={styles.learningRoute}>
                  <div className={styles.routeTitle}>
                    <strong>学习路线</strong>
                    <span>
                      {selectedPrerequisites.length} 前置 · {selectedNextNodes.length} 后续
                    </span>
                  </div>
                  <div className={styles.routeTrack}>
                    {selectedPrerequisites.map((node) => (
                      <span key={`pre-${node.tagId}`} style={{ '--route-color': node.color } as CSSProperties}>
                        {compactKnowledgeName(node.zhName)}
                        <small>{nodeLevelNumber(node.bandOrLevel)}</small>
                      </span>
                    ))}
                    <span className={styles.currentRouteNode} style={{ '--route-color': selectedNode.color } as CSSProperties}>
                      {compactKnowledgeName(selectedNode.zhName)}
                      <small>{nodeLevelNumber(selectedNode.bandOrLevel)}</small>
                    </span>
                    {selectedNextNodes.map((node) => (
                      <span key={`next-${node.tagId}`} style={{ '--route-color': node.color } as CSSProperties}>
                        {compactKnowledgeName(node.zhName)}
                        <small>{nodeLevelNumber(node.bandOrLevel)}</small>
                      </span>
                    ))}
                  </div>
                  {selectedLearningRoute.relatedNodes.length > 0 ? (
                    <p>相关：{formatLinkedNodes(selectedLearningRoute.relatedNodes, '')}</p>
                  ) : null}
                </section>

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

        <section
          className={[styles.treePanel, isExpanded ? styles.expandedTreePanel : ''].filter(Boolean).join(' ')}
          aria-label="编程算法知识树"
        >
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
            <div className={styles.relationModes} aria-label="关系显示模式">
              <GitBranch size={17} aria-hidden="true" />
              {([
                ['trunk', '树干'],
                ['focused', '仅当前'],
                ['all', '全部关系'],
                ['hidden', '隐藏关系'],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={relationMode === mode ? styles.relationModeActive : undefined}
                  onClick={() => setRelationMode(mode)}
                  aria-pressed={relationMode === mode}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" onClick={resetView}>
              <RotateCcw size={17} />
              <span>重置</span>
            </button>
            <button
              type="button"
              className={isExpanded ? styles.expandActive : undefined}
              onClick={() => setIsExpanded((value) => !value)}
              aria-label={isExpanded ? '恢复知识树尺寸' : '扩展知识树'}
              aria-pressed={isExpanded}
            >
              {isExpanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              <span>{isExpanded ? '恢复' : '扩展'}</span>
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
            <div
              className={[styles.treeCanvas, routeHighlightEnabled ? styles.focusCanvas : ''].filter(Boolean).join(' ')}
              style={canvasStyle}
            >
              <svg className={styles.linkLayer} viewBox={`0 0 ${tree.asset.width} ${tree.asset.height}`} aria-hidden="true">
                <defs>
                  <marker
                    id="knowledge-relation-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" />
                  </marker>
                </defs>
                {treeGuides.canopy.map((path, index) => (
                  <path key={`canopy-${index}`} className={styles.canopyGuide} d={path} />
                ))}
                {treeGuides.roots.map((path, index) => (
                  <path key={`root-${index}`} className={styles.rootGuide} d={path} />
                ))}
                <path className={styles.trunkLine} d={treeGuides.trunk} />
                {treeGuides.branches.map((path, index) => (
                  <path key={`branch-${index}`} className={styles.branchGuide} d={path} />
                ))}
                {links.map((link) => (
                  <path
                    key={`${link.kind}-${link.from.tagId}-${link.to.tagId}`}
                    className={[
                      styles.treeLink,
                      linkKindClass(link.kind),
                      link.isRootLift ? styles.rootLiftLink : '',
                      link.isCrownInternal ? styles.crownInternalLink : '',
                      link.isFocused ? styles.focusedLink : '',
                      link.isActive ? styles.activeLink : '',
                      link.isVisible ? '' : styles.hiddenLink,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    d={buildLinkPath(link, tree.asset.width, tree.asset.height)}
                    markerEnd={
                      link.kind === 'prerequisite' && link.isVisible && (!link.isCrownInternal || link.isFocused)
                        ? 'url(#knowledge-relation-arrow)'
                        : undefined
                    }
                    style={
                      {
                        '--link-color': link.kind === 'tree' ? 'rgba(88, 104, 101, 0.62)' : link.to.color,
                        '--link-strength': String(link.strength),
                      } as CSSProperties
                    }
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
                      node.isContextDimmed ? styles.contextDimmedNode : '',
                      node.isInSelectionContext && routeHighlightEnabled ? styles.contextHighlightedNode : '',
                      node.isUpstreamContext && routeHighlightEnabled ? styles.upstreamNode : '',
                      node.isDownstreamContext && routeHighlightEnabled ? styles.downstreamNode : '',
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
                    onClick={() => {
                      setSelectedTagId(node.tagId)
                      setHasFocusHighlight(nodeLevelNumber(node.bandOrLevel) >= 3)
                    }}
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
            <span>{selectedNode ? `${selectedNode.bandOrLevel} · ${domainZhLabel(selectedNode.domain)}` : '点击树上的节点查看掌握状态'}</span>
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

function domainZhLabel(domain: string): string {
  const labels: Record<string, string> = {
    algorithm: '算法',
    'control-flow': '流程控制',
    'data-structure': '数据结构',
    engineering: '工程能力',
    math: '数学',
    syntax: '语法',
  }

  return labels[domain] ?? domain
}

function domainEnLabel(domain: string): string {
  const labels: Record<string, string> = {
    algorithm: 'Algorithm',
    'control-flow': 'Control Flow',
    'data-structure': 'Data Structure',
    engineering: 'Engineering',
    math: 'Math',
    syntax: 'Syntax',
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

function buildLinkViews(
  links: KnowledgeTreeLink[],
  nodes: NodeView[],
  selectedTagId: string,
  relationMode: RelationDisplayMode,
  routeHighlightEnabled: boolean,
  selectionContext: SelectionContext,
) {
  const nodeMap = new Map(nodes.map((node) => [node.tagId, node]))
  return links
    .map((link) => {
      const from = nodeMap.get(link.fromTagId)
      const to = nodeMap.get(link.toTagId)
      if (!from || !to) return null
      const touchesSelectedNode = from.tagId === selectedTagId || to.tagId === selectedTagId
      const isRouteLink = routeHighlightEnabled && link.kind !== 'tree' && selectionContext.routeLinks.has(relationKey(link))
      const isFocused = link.kind !== 'tree' && (touchesSelectedNode || isRouteLink)
      const matchesMode = relationMode === 'all' || (relationMode === 'focused' && isFocused) || (relationMode === 'trunk' && isFocused)
      const isRootLift = nodeLevelNumber(from.bandOrLevel) <= 1 && nodeLevelNumber(to.bandOrLevel) > 1
      const isCrownInternal = nodeShapeRegion(from.bandOrLevel) === 'crown' && nodeShapeRegion(to.bandOrLevel) === 'crown'
      const isVisible = relationMode !== 'hidden' && matchesMode && from.isVisible && to.isVisible
      const shouldRender =
        isVisible &&
        (routeHighlightEnabled
          ? isFocused
          : relationMode === 'focused' || (relationMode === 'all' && (isFocused || isRootLift || !isCrownInternal)))

      if (!shouldRender) return null

      return {
        kind: link.kind,
        strength: link.strength,
        label: link.label,
        from,
        to,
        isFocused,
        isRootLift,
        isCrownInternal,
        isActive: isFocused || (from.progress.status !== 'unstarted' && to.progress.status !== 'unstarted'),
        isVisible,
      }
    })
    .filter((link): link is NonNullable<typeof link> => Boolean(link))
}

function buildSelectionContext(
  links: KnowledgeTreeLink[],
  nodes: KnowledgeTreeNode[],
  selectedTagId: string,
  routeEnabled: boolean,
): SelectionContext {
  const upstream = new Set<string>()
  const downstream = new Set<string>()
  const all = new Set<string>(selectedTagId ? [selectedTagId] : [])
  const routeLinks = new Set<string>()
  if (!routeEnabled) return { all, upstream, downstream, routeLinks }

  const incomingPrerequisites = new Map<string, KnowledgeTreeLink[]>()
  const outgoingPrerequisites = new Map<string, KnowledgeTreeLink[]>()

  for (const link of links) {
    if (link.kind !== 'prerequisite') continue
    appendMapList(incomingPrerequisites, link.toTagId, link)
    appendMapList(outgoingPrerequisites, link.fromTagId, link)
  }

  collectRelationSide(selectedTagId, incomingPrerequisites, upstream, all, routeLinks, 'upstream')
  collectRelationSide(selectedTagId, outgoingPrerequisites, downstream, all, routeLinks, 'downstream')

  for (const node of nodes) {
    if (nodeLevelNumber(node.bandOrLevel) !== 1 || node.tagId === selectedTagId) continue
    upstream.add(node.tagId)
    all.add(node.tagId)
  }

  for (const link of links) {
    if (link.kind !== 'related') continue
    if (link.toTagId === selectedTagId) {
      all.add(link.fromTagId)
      routeLinks.add(relationKey(link))
    }
    if (link.fromTagId === selectedTagId) {
      all.add(link.toTagId)
      routeLinks.add(relationKey(link))
    }
  }

  return { all, upstream, downstream, routeLinks }
}

function collectRelationSide(
  selectedTagId: string,
  map: Map<string, KnowledgeTreeLink[]>,
  side: Set<string>,
  all: Set<string>,
  routeLinks: Set<string>,
  direction: 'upstream' | 'downstream',
) {
  const queue = [selectedTagId]
  const visited = new Set<string>([selectedTagId])

  while (queue.length > 0) {
    const tagId = queue.shift()
    if (!tagId) continue
    for (const link of map.get(tagId) ?? []) {
      const nextTagId = direction === 'upstream' ? link.fromTagId : link.toTagId
      routeLinks.add(relationKey(link))
      if (visited.has(nextTagId)) continue
      visited.add(nextTagId)
      side.add(nextTagId)
      all.add(nextTagId)
      queue.push(nextTagId)
    }
  }
}

function appendMapList(map: Map<string, KnowledgeTreeLink[]>, key: string, value: KnowledgeTreeLink) {
  const current = map.get(key)
  if (current) {
    current.push(value)
    return
  }
  map.set(key, [value])
}

function relationKey(link: Pick<KnowledgeTreeLink, 'fromTagId' | 'toTagId' | 'kind'>): string {
  return `${link.kind}:${link.fromTagId}->${link.toTagId}`
}

function buildLinkPath(
  link: { from: KnowledgeTreeNode; to: KnowledgeTreeNode; isRootLift: boolean },
  width: number,
  height: number,
): string {
  if (link.isRootLift) return buildRootLiftPath(link.from, link.to, width, height)
  return buildArcPath(link.from, link.to, width, height)
}

function buildRootLiftPath(from: KnowledgeTreeNode, to: KnowledgeTreeNode, width: number, height: number): string {
  const x1 = from.x * width
  const y1 = from.y * height
  const x2 = to.x * width
  const y2 = to.y * height
  const trunkX = width / 2
  const rootJoinY = height * 0.78
  const crownJoinY = height * 0.55
  const forkY = Math.max(height * 0.18, Math.min(crownJoinY - 80, y2 + 86))

  return [
    `M ${x1.toFixed(1)} ${y1.toFixed(1)}`,
    `C ${x1.toFixed(1)} ${(y1 - 72).toFixed(1)}, ${(trunkX + (x1 - trunkX) * 0.18).toFixed(1)} ${(rootJoinY + 42).toFixed(1)}, ${trunkX.toFixed(1)} ${rootJoinY.toFixed(1)}`,
    `C ${(trunkX - 18).toFixed(1)} ${(rootJoinY - 78).toFixed(1)}, ${(trunkX + 18).toFixed(1)} ${(crownJoinY + 86).toFixed(1)}, ${trunkX.toFixed(1)} ${crownJoinY.toFixed(1)}`,
    `C ${trunkX.toFixed(1)} ${forkY.toFixed(1)}, ${(x2 + trunkX) / 2} ${(y2 + forkY) / 2}, ${x2.toFixed(1)} ${y2.toFixed(1)}`,
  ].join(' ')
}

function buildArcPath(from: KnowledgeTreeNode, to: KnowledgeTreeNode, width: number, height: number): string {
  const x1 = from.x * width
  const y1 = from.y * height
  const x2 = to.x * width
  const y2 = to.y * height
  const dx = x2 - x1
  const dy = y2 - y1

  if (Math.abs(dy) < 24) {
    const lift = Math.max(58, Math.min(150, Math.abs(dx) * 0.16))
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${x1.toFixed(1)} ${(y1 - lift).toFixed(1)}, ${x2.toFixed(1)} ${(y2 - lift).toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`
  }

  const direction = dy < 0 ? -1 : 1
  const bend = Math.max(76, Math.min(270, Math.abs(dx) * 0.24 + Math.abs(dy) * 0.26))
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${x1.toFixed(1)} ${(y1 + direction * bend).toFixed(1)}, ${x2.toFixed(1)} ${(y2 - direction * bend).toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

function linkKindClass(kind: KnowledgeTreeLinkKind): string {
  if (kind === 'prerequisite') return styles.prerequisiteLink ?? ''
  if (kind === 'related') return styles.relatedLink ?? ''
  return styles.structuralLink ?? ''
}

function buildTreeGuides(width: number, height: number): { trunk: string; branches: string[]; roots: string[]; canopy: string[] } {
  const x = width / 2
  const crownTop = height * 0.08
  const crownMid = height * 0.35
  const trunkTop = height * 0.52
  const trunkBottom = height * 0.78
  const rootBottom = height * 0.95

  return {
    trunk: `M ${x} ${trunkTop} C ${x - 42} ${height * 0.61}, ${x + 38} ${height * 0.69}, ${x} ${trunkBottom}`,
    branches: [
      `M ${x} ${trunkTop} C ${x - 220} ${height * 0.44}, ${x - 560} ${height * 0.31}, ${x - 890} ${crownMid}`,
      `M ${x} ${trunkTop} C ${x - 120} ${height * 0.34}, ${x - 260} ${height * 0.18}, ${x - 470} ${crownTop}`,
      `M ${x} ${trunkTop} C ${x - 18} ${height * 0.36}, ${x + 18} ${height * 0.25}, ${x} ${height * 0.1}`,
      `M ${x} ${trunkTop} C ${x + 130} ${height * 0.34}, ${x + 280} ${height * 0.18}, ${x + 500} ${crownTop}`,
      `M ${x} ${trunkTop} C ${x + 230} ${height * 0.43}, ${x + 580} ${height * 0.3}, ${x + 900} ${crownMid}`,
    ],
    roots: [
      `M ${x} ${trunkBottom} C ${x - 190} ${height * 0.84}, ${x - 480} ${height * 0.9}, ${x - 820} ${rootBottom}`,
      `M ${x} ${trunkBottom} C ${x + 190} ${height * 0.84}, ${x + 480} ${height * 0.9}, ${x + 820} ${rootBottom}`,
      `M ${x} ${trunkBottom} C ${x - 70} ${height * 0.86}, ${x - 150} ${height * 0.91}, ${x - 230} ${rootBottom}`,
      `M ${x} ${trunkBottom} C ${x + 70} ${height * 0.86}, ${x + 150} ${height * 0.91}, ${x + 230} ${rootBottom}`,
    ],
    canopy: [
      `M ${x - 980} ${height * 0.38} C ${x - 820} ${height * 0.11}, ${x - 430} ${height * 0.04}, ${x} ${height * 0.08} C ${x + 430} ${height * 0.04}, ${x + 820} ${height * 0.11}, ${x + 980} ${height * 0.38}`,
      `M ${x - 1030} ${height * 0.55} C ${x - 760} ${height * 0.72}, ${x - 360} ${height * 0.78}, ${x} ${height * 0.73} C ${x + 360} ${height * 0.78}, ${x + 760} ${height * 0.72}, ${x + 1030} ${height * 0.55}`,
    ],
  }
}

function buildLearningRoute(
  tagId: string,
  links: KnowledgeTreeLink[],
  nodes: NodeView[],
  selectionContext: SelectionContext,
): LearningRoute {
  const nodeMap = new Map(nodes.map((node) => [node.tagId, node]))
  const prerequisites = sortRouteNodes(
    [...selectionContext.upstream].map((id) => nodeMap.get(id)).filter((node): node is NodeView => Boolean(node)),
  )
  const nextNodes = sortRouteNodes(
    [...selectionContext.downstream].map((id) => nodeMap.get(id)).filter((node): node is NodeView => Boolean(node)),
  )
  const relatedIds = new Set<string>()

  for (const link of links) {
    if (link.kind !== 'related') continue
    if (link.fromTagId === tagId) relatedIds.add(link.toTagId)
    if (link.toTagId === tagId) relatedIds.add(link.fromTagId)
  }

  const relatedNodes = sortRouteNodes(
    [...relatedIds].map((id) => nodeMap.get(id)).filter((node): node is NodeView => Boolean(node)),
  )

  return { prerequisites, nextNodes, relatedNodes }
}

function emptyLearningRoute(): LearningRoute {
  return { prerequisites: [], nextNodes: [], relatedNodes: [] }
}

function sortRouteNodes(nodes: NodeView[]): NodeView[] {
  return [...nodes].sort((a, b) => {
    const levelDiff = nodeLevelNumber(a.bandOrLevel) - nodeLevelNumber(b.bandOrLevel)
    if (levelDiff !== 0) return levelDiff
    const domainDiff = domainRank(a.domain) - domainRank(b.domain)
    if (domainDiff !== 0) return domainDiff
    return a.sortOrder - b.sortOrder
  })
}

function domainRank(domain: string): number {
  const rank = ['syntax', 'control-flow', 'data-structure', 'algorithm', 'math', 'engineering'].indexOf(domain)
  return rank === -1 ? 999 : rank
}

function formatLinkedNodes(nodes: NodeView[], emptyLabel: string): string {
  if (nodes.length === 0) return emptyLabel
  const names = nodes.slice(0, 3).map((node) => node.zhName)
  return nodes.length > names.length ? `${names.join('、')} 等 ${nodes.length} 个` : names.join('、')
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
