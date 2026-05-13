import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  KnowledgeProgress,
  KnowledgeTagClassification,
  KnowledgeTreeLink,
  KnowledgeTreeLinkKind,
  KnowledgeTreeNode,
  KnowledgeTreePayload,
  ProblemAlgorithmFamily,
} from '@spcg/shared/types'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  listKnowledgePointRegistryRows,
  listUserKnowledgeProgressRows,
  listUserKnowledgeUsageRows,
  type KnowledgePointRegistryRow,
  type UserKnowledgeProgressRow,
  type UserKnowledgeUsageRow,
} from '@/lib/repositories/knowledge-tree-repository'

type RegistryPoint = {
  tagId: string
  classification: KnowledgeTagClassification
  zhName: string
  enName: string
  domain: string
  bandOrLevel: string
  commonProblemTypes: string
  recommendation: string
  sourceFile: string
  sourceSection: string
  sortOrder: number
  metadata: Record<string, unknown>
}

type AggregatedProgress = {
  attemptCount: number
  correctCount: number
  lastPracticedAt: string | null
}

type WireframeLayout = {
  width: number
  height: number
  nodes: KnowledgeTreeNode[]
}

type LevelShape = {
  region: 'crown' | 'trunk' | 'root'
  y: number
  rowCounts: number[]
  rowGap: number
  centerOffsets: number[]
  arcBend: number
}

type ExplicitKnowledgeRelation = {
  fromTagId: string
  toTagId: string
  kind: Exclude<KnowledgeTreeLinkKind, 'tree'>
  strength: number
  label: string
}

const programmingClassification: KnowledgeTagClassification = '编程算法'
const maxVisibleProgrammingLevel = 8
const wireframeWidth = 2300
const wireframeMarginX = 110
const wireframeCardWidth = 118
const wireframeGapX = 14
const wireframeBottom = 90

const levelShapes: Record<number, LevelShape> = {
  8: { region: 'crown', y: 80, rowCounts: [7, 12], rowGap: 58, centerOffsets: [0, 40], arcBend: 22 },
  7: { region: 'crown', y: 220, rowCounts: [8, 10], rowGap: 58, centerOffsets: [-120, 120], arcBend: 20 },
  6: { region: 'crown', y: 340, rowCounts: [8, 10], rowGap: 58, centerOffsets: [100, -120], arcBend: 18 },
  5: { region: 'crown', y: 470, rowCounts: [8, 10, 11], rowGap: 58, centerOffsets: [0, -140, 140], arcBend: 18 },
  4: { region: 'crown', y: 625, rowCounts: [8, 11], rowGap: 58, centerOffsets: [-80, 80], arcBend: 16 },
  3: { region: 'crown', y: 770, rowCounts: [8, 10, 12], rowGap: 58, centerOffsets: [0, -120, 120], arcBend: 16 },
  2: { region: 'crown', y: 1000, rowCounts: [7, 8], rowGap: 62, centerOffsets: [-72, 72], arcBend: 14 },
  1: { region: 'root', y: 1230, rowCounts: [8, 14], rowGap: 82, centerOffsets: [0, 0], arcBend: 36 },
}

const domainColors: Record<string, string> = {
  syntax: '#4f9cff',
  'control-flow': '#53c873',
  'data-structure': '#8d7bff',
  algorithm: '#f0a434',
  math: '#ffd05a',
  engineering: '#7dd5e7',
}

const domainOrder = ['syntax', 'control-flow', 'data-structure', 'algorithm', 'math', 'engineering']
const defaultNodeColor = '#8fb3ff'

const supportedAlgorithmFamilies = new Set<ProblemAlgorithmFamily>([
  'implementation',
  'math',
  'greedy',
  'search',
  'dp',
  'graph',
  'string',
  'data-structure',
  'divide-conquer',
  'geometry',
  'combinatorics',
  'constructive',
  'simulation',
  'other',
])

export async function getKnowledgeTree(input: {
  classification?: KnowledgeTagClassification
  currentUserId?: string | null
} = {}): Promise<KnowledgeTreePayload> {
  const classification = input.classification ?? programmingClassification
  const points = await loadKnowledgePoints(classification)
  const layout = layoutKnowledgePoints(points)
  const nodes = layout.nodes
  const relations = await loadKnowledgeRelations(classification, nodes)
  const links = buildKnowledgeLinks(nodes, relations)
  const progress = input.currentUserId ? await loadUserKnowledgeProgress(input.currentUserId, nodes) : []

  return {
    classification,
    generatedAt: new Date().toISOString(),
    asset: {
      image: '',
      width: layout.width,
      height: layout.height,
      nodeCount: nodes.length,
    },
    nodes,
    links,
    progress,
    levels: countBy(nodes, (node) => node.bandOrLevel).sort(compareBandFacet),
    domains: countBy(nodes, (node) => node.domain)
      .map((item) => ({ ...item, color: colorForDomain(item.value) }))
      .sort((a, b) => a.value.localeCompare(b.value)),
  }
}

async function loadKnowledgePoints(classification: KnowledgeTagClassification): Promise<RegistryPoint[]> {
  if (isDatabaseConfigured()) {
    try {
      const rows = await listKnowledgePointRegistryRows(classification)
      if (rows.length > 0) return rows.map(mapRegistryRow)
    } catch {
      // Fall through to the markdown source so the visual page still works in local preview.
    }
  }

  return readKnowledgePointsFromMarkdown(classification)
}

async function loadKnowledgeRelations(
  classification: KnowledgeTagClassification,
  nodes: KnowledgeTreeNode[],
): Promise<ExplicitKnowledgeRelation[]> {
  if (classification !== programmingClassification) return []

  const visibleTagIds = new Set(nodes.map((node) => node.tagId))
  const text = await readRepoFile('problem-bank/Knowledge_point_relations.json')
  const parsed: unknown = JSON.parse(text)
  if (!isRecord(parsed) || parsed.classification !== programmingClassification || !Array.isArray(parsed.relations)) {
    return []
  }

  return parsed.relations
    .map((item): ExplicitKnowledgeRelation | null => {
      if (!isRecord(item)) return null
      const fromTagId = readNonEmptyString(item.fromTagId)
      const toTagId = readNonEmptyString(item.toTagId)
      const kind = item.kind === 'related' ? 'related' : item.kind === 'prerequisite' ? 'prerequisite' : null
      if (!fromTagId || !toTagId || !kind || !visibleTagIds.has(fromTagId) || !visibleTagIds.has(toTagId)) return null
      return {
        fromTagId,
        toTagId,
        kind,
        strength: clampNumber(typeof item.strength === 'number' ? item.strength : 0.65, 0.1, 1),
        label: readNonEmptyString(item.label) ?? (kind === 'prerequisite' ? '前置' : '相关'),
      }
    })
    .filter((relation): relation is ExplicitKnowledgeRelation => Boolean(relation))
}

function mapRegistryRow(row: KnowledgePointRegistryRow): RegistryPoint {
  return {
    tagId: row.tag_id,
    classification: row.classification,
    zhName: row.zh_name,
    enName: row.en_name,
    domain: row.domain,
    bandOrLevel: row.band_or_level,
    commonProblemTypes: row.common_problem_types,
    recommendation: row.recommendation,
    sourceFile: row.source_file,
    sourceSection: row.source_section,
    sortOrder: row.sort_order,
    metadata: row.metadata ?? {},
  }
}

async function readKnowledgePointsFromMarkdown(classification: KnowledgeTagClassification): Promise<RegistryPoint[]> {
  const source =
    classification === '数学'
      ? { path: 'problem-bank/Math_Number_Theory_Knowledge_point.md', kind: 'math' as const }
      : { path: 'problem-bank/Knowledge_point.md', kind: 'programming' as const }
  const text = await readRepoFile(source.path)
  const points: RegistryPoint[] = []
  let section = ''

  for (const line of text.split('\n')) {
    const heading = line.match(/^###\s+(.+)$/)
    if (heading) {
      section = heading[1]?.trim() ?? ''
      continue
    }

    if (!line.startsWith('| ')) continue
    const cells = line
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cells[0] ?? '')) continue

    if (source.kind === 'programming' && cells.length === 6) {
      const [tagId, zhName, enName, domain, bandOrLevel, algorithmFamily] = cells
      points.push({
        tagId: tagId ?? '',
        classification,
        zhName: zhName ?? '',
        enName: enName ?? '',
        domain: domain ?? '',
        bandOrLevel: bandOrLevel ?? '',
        commonProblemTypes: '',
        recommendation: `建议 algorithmFamily: ${algorithmFamily ?? 'implementation'}`,
        sourceFile: source.path,
        sourceSection: section,
        sortOrder: points.length + 1,
        metadata: { algorithmFamily, sourceKind: 'programming' },
      })
    }

    if (source.kind === 'math' && cells.length === 6) {
      const [tagId, zhName, enName, domain, bandOrLevel, commonProblemTypes] = cells
      points.push({
        tagId: tagId ?? '',
        classification,
        zhName: zhName ?? '',
        enName: enName ?? '',
        domain: domain ?? '',
        bandOrLevel: bandOrLevel ?? '',
        commonProblemTypes: commonProblemTypes ?? '',
        recommendation: '数学概念标签；作为 primary 或 supporting 取决于题目目标。',
        sourceFile: source.path,
        sourceSection: section,
        sortOrder: points.length + 1,
        metadata: { sourceKind: 'math' },
      })
    }
  }

  return points
}

async function readRepoFile(relativePath: string): Promise<string> {
  const roots = Array.from(new Set([process.cwd(), path.resolve(process.cwd(), '../..')]))
  const errors: string[] = []

  for (const root of roots) {
    const fullPath = path.join(root, relativePath)
    try {
      return await readFile(fullPath, 'utf8')
    } catch (error) {
      errors.push(`${fullPath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(`Unable to read ${relativePath}\n${errors.join('\n')}`)
}

function layoutKnowledgePoints(points: RegistryPoint[]): WireframeLayout {
  const sortedPoints = points
    .filter((point) => levelNumber(point.bandOrLevel) <= maxVisibleProgrammingLevel)
    .sort(compareKnowledgePoint)
  const byLevel = new Map<number, RegistryPoint[]>()
  const draftNodes: Array<KnowledgeTreeNode & { pixelX: number; pixelY: number }> = []

  for (const point of sortedPoints) {
    const level = levelNumber(point.bandOrLevel)
    const group = byLevel.get(level) ?? []
    group.push(point)
    byLevel.set(level, group)
  }

  for (const level of [8, 7, 6, 5, 4, 3, 2, 1]) {
    const shape = levelShapes[level]
    const group = byLevel.get(level) ?? []
    if (!shape || group.length === 0) continue

    placeRows({
      points: group,
      draftNodes,
      region: shape.region,
      rowCounts: shape.rowCounts,
      y: shape.y,
      rowGap: shape.rowGap,
      centerOffsets: shape.centerOffsets,
      arcBend: shape.arcBend,
    })
  }

  const height = Math.ceil(Math.max(...draftNodes.map((node) => node.pixelY), 0) + wireframeBottom)
  const nodes = draftNodes
    .map(({ pixelX, pixelY, ...node }) => ({
      ...node,
      x: pixelX / wireframeWidth,
      y: pixelY / height,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  return { width: wireframeWidth, height, nodes }
}

function placeRows(input: {
  points: RegistryPoint[]
  draftNodes: Array<KnowledgeTreeNode & { pixelX: number; pixelY: number }>
  region: 'crown' | 'trunk' | 'root'
  rowCounts: number[]
  y: number
  rowGap: number
  centerOffsets: number[]
  arcBend: number
}): number {
  let pointIndex = 0
  let rowIndex = 0
  let lastY = input.y

  while (pointIndex < input.points.length) {
    const rowCapacity = input.rowCounts[rowIndex % input.rowCounts.length] ?? input.rowCounts[input.rowCounts.length - 1] ?? 1
    const rowCount = Math.min(rowCapacity, input.points.length - pointIndex)
    const centerOffset = input.centerOffsets[rowIndex % input.centerOffsets.length] ?? 0
    const rowWidth = rowCount * wireframeCardWidth + Math.max(0, rowCount - 1) * wireframeGapX
    const centerX = clamp(wireframeWidth / 2 + centerOffset, wireframeMarginX + rowWidth / 2, wireframeWidth - wireframeMarginX - rowWidth / 2)
    const startX = rowCount > 1 ? centerX - rowWidth / 2 + wireframeCardWidth / 2 : centerX
    const y = input.y + rowIndex * input.rowGap

    for (let col = 0; col < rowCount; col += 1) {
      const point = input.points[pointIndex + col]
      if (!point) continue
      const level = levelNumber(point.bandOrLevel)
      const pixelX = startX + col * (wireframeCardWidth + wireframeGapX)
      const pixelY = y + curvedRowOffset(col, rowCount, input.arcBend)

      input.draftNodes.push(makeLayoutNode(point, `${input.region}-${String(pointIndex + col + 1).padStart(3, '0')}`, pixelX, pixelY, level))
      lastY = Math.max(lastY, pixelY)
    }

    pointIndex += rowCount
    rowIndex += 1
  }

  return lastY
}

function makeLayoutNode(
  point: RegistryPoint,
  slotId: string,
  pixelX: number,
  pixelY: number,
  level: number,
): KnowledgeTreeNode & { pixelX: number; pixelY: number } {
  const algorithmFamily = readAlgorithmFamily(point.metadata.algorithmFamily)

  return {
    slotId,
    tagId: point.tagId,
    classification: point.classification,
    zhName: point.zhName,
    enName: point.enName,
    domain: point.domain,
    bandOrLevel: point.bandOrLevel,
    sortOrder: point.sortOrder,
    x: 0,
    y: 0,
    radius: level <= 2 ? 9 : 7,
    color: colorForDomain(point.domain),
    algorithmFamily,
    sourceSection: point.sourceSection,
    recommendation: point.recommendation || point.commonProblemTypes,
    pixelX,
    pixelY,
  }
}

function curvedRowOffset(col: number, rowCount: number, arcBend: number): number {
  if (rowCount <= 1 || arcBend === 0) return 0
  const middle = (rowCount - 1) / 2
  const distance = Math.abs(col - middle) / Math.max(1, middle)
  return distance * arcBend
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function compareKnowledgePoint(a: RegistryPoint, b: RegistryPoint): number {
  return (
    levelNumber(a.bandOrLevel) - levelNumber(b.bandOrLevel) ||
    domainRank(a.domain) - domainRank(b.domain) ||
    a.sortOrder - b.sortOrder ||
    a.tagId.localeCompare(b.tagId)
  )
}

function domainRank(domain: string): number {
  const index = domainOrder.indexOf(domain)
  return index >= 0 ? index : domainOrder.length
}

function buildKnowledgeLinks(nodes: KnowledgeTreeNode[], relations: ExplicitKnowledgeRelation[]): KnowledgeTreeLink[] {
  const explicitPairKeys = new Set(relations.map((relation) => `${relation.fromTagId}:${relation.toTagId}`))
  const links: KnowledgeTreeLink[] = []
  const placed: KnowledgeTreeNode[] = []

  for (const node of [...nodes].sort(compareNodeByTreePosition)) {
    const parent = findNearestParent(node, placed)
    if (parent && !explicitPairKeys.has(`${parent.tagId}:${node.tagId}`)) {
      links.push({
        fromTagId: parent.tagId,
        toTagId: node.tagId,
        kind: 'tree',
        strength: 0.28,
        label: '树状',
      })
    }
    placed.push(node)
  }

  for (const relation of relations) {
    links.push({
      fromTagId: relation.fromTagId,
      toTagId: relation.toTagId,
      kind: relation.kind,
      strength: relation.strength,
      label: relation.label,
    })
  }

  return links.sort(compareLinkByKind)
}

function compareNodeByTreePosition(a: KnowledgeTreeNode, b: KnowledgeTreeNode): number {
  return b.y - a.y || Math.abs(a.x - 0.5) - Math.abs(b.x - 0.5) || a.sortOrder - b.sortOrder
}

function compareLinkByKind(a: KnowledgeTreeLink, b: KnowledgeTreeLink): number {
  return linkKindRank(a.kind) - linkKindRank(b.kind) || b.strength - a.strength || a.toTagId.localeCompare(b.toTagId)
}

function linkKindRank(kind: KnowledgeTreeLinkKind): number {
  if (kind === 'tree') return 0
  if (kind === 'related') return 1
  return 2
}

function findNearestParent(node: KnowledgeTreeNode, candidates: KnowledgeTreeNode[]): KnowledgeTreeNode | null {
  let best: { node: KnowledgeTreeNode; score: number } | null = null

  for (const candidate of candidates) {
    if (candidate.y <= node.y + 0.012) continue
    const verticalGap = candidate.y - node.y
    const domainBonus = candidate.domain === node.domain ? -0.035 : 0
    const centerBonus = Math.abs(candidate.x - 0.5) < 0.16 ? -0.018 : 0
    const score = Math.abs(candidate.x - node.x) * 1.85 + verticalGap * 0.85 + domainBonus + centerBonus
    if (!best || score < best.score) best = { node: candidate, score }
  }

  return best?.node ?? null
}

async function loadUserKnowledgeProgress(userId: string, nodes: KnowledgeTreeNode[]): Promise<KnowledgeProgress[]> {
  if (!isDatabaseConfigured()) return []

  try {
    const classification = nodes[0]?.classification ?? programmingClassification
    const usageRows = await listUserKnowledgeUsageRows(userId, classification)
    if (usageRows.length > 0) return aggregateUsageProgress(usageRows, nodes)
    const rows = await listUserKnowledgeProgressRows(userId)
    return aggregateProgress(rows, nodes)
  } catch {
    return []
  }
}

function aggregateUsageProgress(rows: UserKnowledgeUsageRow[], nodes: KnowledgeTreeNode[]): KnowledgeProgress[] {
  const byTagId = new Map(nodes.map((node) => [node.tagId, node]))
  return rows
    .filter((row) => byTagId.has(row.tag_id))
    .map((row) => {
      const attemptCount = Number(row.usage_count ?? 0)
      const correctCount = Number(row.passed_level_count ?? 0)
      const mastery = correctCount > 0 ? 100 : masteryFromProgress({ attemptCount, correctCount, lastPracticedAt: toIsoOrNull(row.last_used_at) })
      return {
        tagId: row.tag_id,
        status: statusFromMastery(mastery, attemptCount),
        mastery,
        attemptCount,
        correctCount,
        lastPracticedAt: toIsoOrNull(row.last_used_at),
      }
    })
}

function aggregateProgress(rows: UserKnowledgeProgressRow[], nodes: KnowledgeTreeNode[]): KnowledgeProgress[] {
  const byTagId = new Map(nodes.map((node) => [node.tagId, node]))
  const byZhName = new Map(nodes.map((node) => [node.zhName, node]))
  const progress = new Map<string, AggregatedProgress>()

  for (const row of rows) {
    const tagIds = findProgressTagIds(row, byTagId, byZhName)
    for (const tagId of tagIds) {
      const current = progress.get(tagId) ?? { attemptCount: 0, correctCount: 0, lastPracticedAt: null }
      current.attemptCount += Number(row.attempt_count ?? 0)
      current.correctCount += row.passed ? 1 : 0
      current.lastPracticedAt = newestIso(current.lastPracticedAt, row.last_submitted_at)
      progress.set(tagId, current)
    }
  }

  return [...progress.entries()].map(([tagId, item]) => {
    const mastery = masteryFromProgress(item)
    return {
      tagId,
      status: statusFromMastery(mastery, item.attemptCount),
      mastery,
      attemptCount: item.attemptCount,
      correctCount: item.correctCount,
      lastPracticedAt: item.lastPracticedAt,
    }
  })
}

function findProgressTagIds(
  row: UserKnowledgeProgressRow,
  byTagId: Map<string, KnowledgeTreeNode>,
  byZhName: Map<string, KnowledgeTreeNode>,
): string[] {
  const snapshots = Array.isArray(row.import_meta?.knowledgePointSnapshots) ? row.import_meta.knowledgePointSnapshots : []
  const tagIds = snapshots
    .map((snapshot) => (isRecord(snapshot) ? String(snapshot.tagId ?? '') : ''))
    .filter((tagId) => byTagId.has(tagId))

  if (tagIds.length > 0) return Array.from(new Set(tagIds))

  const title = row.knowledge_point.trim()
  const exact = byZhName.get(title)
  if (exact) return [exact.tagId]

  const fuzzy = [...byZhName.values()].find((node) => title.includes(node.zhName) || node.zhName.includes(title))
  return fuzzy ? [fuzzy.tagId] : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function newestIso(current: string | null, candidate: Date | string | null): string | null {
  const next = toIsoOrNull(candidate)
  if (!next) return current
  if (!current) return next
  return new Date(next).getTime() > new Date(current).getTime() ? next : current
}

function toIsoOrNull(candidate: Date | string | null): string | null {
  if (!candidate) return null
  return candidate instanceof Date ? candidate.toISOString() : new Date(candidate).toISOString()
}

function masteryFromProgress(progress: AggregatedProgress): number {
  if (progress.correctCount > 0) return 100
  if (progress.attemptCount <= 0) return 0
  return Math.min(76, 20 + progress.attemptCount * 9)
}

function statusFromMastery(mastery: number, attemptCount: number): KnowledgeProgress['status'] {
  if (mastery >= 100) return 'mastered'
  if (mastery > 0) return 'practicing'
  if (attemptCount > 0) return 'unlocked'
  return 'unstarted'
}

function countBy<T>(items: T[], readValue: (item: T) => string): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const value = readValue(item)
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count }))
}

function compareBandFacet(a: { value: string }, b: { value: string }): number {
  return levelNumber(a.value) - levelNumber(b.value) || a.value.localeCompare(b.value)
}

function levelNumber(value: string): number {
  const match = value.match(/(\d+)/)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

function colorForDomain(domain: string): string {
  return domainColors[domain] ?? defaultNodeColor
}

function readAlgorithmFamily(value: unknown): KnowledgeTreeNode['algorithmFamily'] {
  return typeof value === 'string' && supportedAlgorithmFamilies.has(value as ProblemAlgorithmFamily)
    ? (value as ProblemAlgorithmFamily)
    : 'unknown'
}
