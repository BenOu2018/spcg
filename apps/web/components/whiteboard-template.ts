import { convertToExcalidrawElements } from '@excalidraw/excalidraw'
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'
import type { Level } from '@spcg/shared/types'

export type WhiteboardTemplateKind = 'binary_tree' | 'graph' | 'array_1d' | 'matrix_2d' | 'dp_table' | 'blank'

export type WhiteboardSeedInput = {
  level: Level
  sampleInput: string | null
}

export type WhiteboardSeedResult = {
  kind: WhiteboardTemplateKind
  elements: ExcalidrawElement[]
  appState: Partial<AppState>
  files?: BinaryFiles
}

export type WhiteboardPresetKind = 'number_balls' | 'array_1d' | 'matrix_2d'

export type WhiteboardPresetOptions = {
  quantity?: number
  rows?: number
  cols?: number
}

type MatrixData = {
  rows: number
  cols: number
  values: string[][]
}

const EMPTY_FILES: BinaryFiles = {}
const STROKE = '#27414b'
const SOFT_STROKE = '#6c7b82'
const NODE_FILL = '#f9dc84'
const ARRAY_FILL = '#f7f2df'
const NOTE_FILL = '#fff0ba'
const DP_FILL = '#dceef4'

export function buildWhiteboardSeed(input: WhiteboardSeedInput): WhiteboardSeedResult {
  try {
    const kind = detectTemplateKind(input.level, input.sampleInput)

    if (kind === 'binary_tree') return buildBinaryTreeSeed(input)
    if (kind === 'graph') return buildGraphSeed(input)
    if (kind === 'matrix_2d' || kind === 'dp_table') return buildMatrixSeed(input, kind)
    if (kind === 'array_1d') return buildArraySeed(input)

    return buildBlankSeed(input.level)
  } catch {
    return buildBlankSeed(input.level)
  }
}

export function buildWhiteboardPreset(kind: WhiteboardPresetKind, options: WhiteboardPresetOptions = {}): ExcalidrawElement[] {
  if (kind === 'number_balls') {
    const quantity = clampInteger(options.quantity, 5, 1, 40)
    return toElements([
      text(24, 26, `数字球 x ${quantity}`, 18, '#3b3120'),
      ...makeNumberBallGrid(quantity, 28, 70),
    ])
  }

  if (kind === 'array_1d') {
    const quantity = clampInteger(options.quantity, 6, 1, 50)
    return toElements([
      text(24, 26, `一维数组 x ${quantity}`, 18, '#3b3120'),
      ...makeArrayCells(Array.from({ length: quantity }, (_, index) => `a${index}`), 28, 72, 58, 48),
    ])
  }

  const rows = clampInteger(options.rows, 4, 1, 12)
  const cols = clampInteger(options.cols, 5, 1, 12)
  return toElements([
    text(24, 26, `二维数组 ${rows} x ${cols}`, 18, '#3b3120'),
    ...makeTable(
      Array.from({ length: rows }, () => Array.from({ length: cols }, () => '')),
      28,
      70,
      58,
      42,
      DP_FILL,
      true,
    ),
  ])
}

export function makeWhiteboardAppState(level: Level): Partial<AppState> {
  return {
    name: `${level.title} · 逻辑画板`,
    viewBackgroundColor: '#fffdf2',
    currentItemStrokeColor: STROKE,
    currentItemBackgroundColor: ARRAY_FILL,
    currentItemFillStyle: 'solid',
    currentItemStrokeWidth: 2,
    currentItemRoughness: 1,
    activeTool: {
      type: 'selection',
      customType: null,
      lastActiveTool: null,
      locked: true,
    },
    gridSize: 20,
    scrollX: 92,
    scrollY: 72,
    zoom: { value: 1 as AppState['zoom']['value'] },
  }
}

function detectTemplateKind(level: Level, sampleInput: string | null): WhiteboardTemplateKind {
  const text = [
    level.title,
    level.knowledgePoint,
    level.description,
    level.inputFormat,
    level.outputFormat,
    level.source?.name,
    level.source?.notes,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()

  if (/二叉树|binary\s*tree|树的遍历|层序|前序|中序|后序/.test(text)) return 'binary_tree'
  if (/最小生成树|mst|kruskal|prim|最短路|dijkstra|图论|无向图|有向图|边权|连通图/.test(text)) return 'graph'
  if (/动态规划|\bdp\b|状态转移/.test(text)) return 'dp_table'
  if (/矩阵|二维|棋盘|网格|grid/.test(text)) return 'matrix_2d'
  if (/数组|前缀和|双指针|单调栈|单调队列|序列|下标/.test(text)) return 'array_1d'

  if (looksLikeGraphInput(sampleInput)) return 'graph'
  if (looksLikeMatrixInput(sampleInput)) return 'matrix_2d'
  if (extractNumberTokens(sampleInput).length >= 3) return 'array_1d'

  return 'blank'
}

function buildBinaryTreeSeed(input: WhiteboardSeedInput): WhiteboardSeedResult {
  const rawTokens = extractTreeTokens(input.sampleInput)
  const tokens = (rawTokens.length > 0 ? rawTokens : ['1', '2', '3', '4', '5', '6', '7']).slice(0, 15)
  const skeletons: ExcalidrawElementSkeleton[] = [
    text(18, 20, `${input.level.title} · 样例二叉树`, 20, '#2f3c42'),
  ]
  const nodePositions = new Map<number, { x: number; y: number }>()
  const maxDepth = Math.min(3, Math.floor(Math.log2(Math.max(tokens.length, 1))))

  tokens.forEach((token, index) => {
    if (isNullToken(token)) return
    const depth = Math.floor(Math.log2(index + 1))
    if (depth > 3) return

    const levelIndex = index - (2 ** depth - 1)
    const slots = 2 ** depth
    const spread = 640 / (slots + 1)
    const x = 50 + spread * (levelIndex + 1)
    const y = 86 + depth * 116
    nodePositions.set(index, { x, y })

    if (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)
      const parent = nodePositions.get(parentIndex)
      if (parent) {
        skeletons.push(line(parent.x + 26, parent.y + 52, x + 26, y))
      }
    }

    skeletons.push(node(x, y, token))
  })

  if (nodePositions.size === 0) return buildBlankSeed(input.level)

  skeletons.push(text(50, 570, '可拖动节点、补充空儿子或标记遍历顺序。', 16, '#52636b'))
  return {
    kind: 'binary_tree',
    elements: toElements(skeletons),
    appState: makeWhiteboardAppState(input.level),
    files: EMPTY_FILES,
  }
}

function buildGraphSeed(input: WhiteboardSeedInput): WhiteboardSeedResult {
  const graph = parseGraph(input.sampleInput)
  if (!graph) return buildBlankSeed(input.level)

  const radius = graph.n <= 4 ? 150 : 190
  const centerX = 390
  const centerY = 300
  const positions = new Map<number, { x: number; y: number }>()
  const skeletons: ExcalidrawElementSkeleton[] = [
    text(18, 20, `${input.level.title} · 样例图`, 20, '#2f3c42'),
  ]

  for (let id = 1; id <= graph.n; id += 1) {
    const angle = -Math.PI / 2 + ((id - 1) / graph.n) * Math.PI * 2
    positions.set(id, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    })
  }

  for (const edge of graph.edges) {
    const from = positions.get(edge.from)
    const to = positions.get(edge.to)
    if (!from || !to) continue

    skeletons.push(line(from.x + 28, from.y + 28, to.x + 28, to.y + 28))
    if (edge.weight !== null) {
      skeletons.push(text((from.x + to.x) / 2 + 26, (from.y + to.y) / 2 + 8, String(edge.weight), 15, '#795c14'))
    }
  }

  for (let id = 1; id <= graph.n; id += 1) {
    const point = positions.get(id)
    if (point) skeletons.push(node(point.x, point.y, String(id)))
  }

  skeletons.push(text(48, 568, '可圈出当前选择的边、标记权值，模拟 Kruskal / Prim 的推导过程。', 16, '#52636b'))
  return {
    kind: 'graph',
    elements: toElements(skeletons),
    appState: makeWhiteboardAppState(input.level),
    files: EMPTY_FILES,
  }
}

function buildArraySeed(input: WhiteboardSeedInput): WhiteboardSeedResult {
  const values = normalizeArrayValues(extractNumberTokens(input.sampleInput)).slice(0, 12)
  const cells = values.length > 0 ? values : ['3', '1', '4', '1', '5', '9']
  const skeletons: ExcalidrawElementSkeleton[] = [
    text(18, 22, `${input.level.title} · 一维数组`, 20, '#2f3c42'),
    ...makeArrayCells(cells, 38, 112, 58, 52),
    text(38, 230, '可以拖动画笔标出指针、区间、前缀和或单调结构。', 16, '#52636b'),
  ]

  return {
    kind: 'array_1d',
    elements: toElements(skeletons),
    appState: makeWhiteboardAppState(input.level),
    files: EMPTY_FILES,
  }
}

function buildMatrixSeed(input: WhiteboardSeedInput, kind: 'matrix_2d' | 'dp_table'): WhiteboardSeedResult {
  const matrix = parseMatrix(input.sampleInput) ?? {
    rows: 4,
    cols: 5,
    values: Array.from({ length: 4 }, (_, row) => Array.from({ length: 5 }, (_, col) => (row === 0 || col === 0 ? '0' : ''))),
  }
  const clipped = {
    rows: Math.min(matrix.rows, 6),
    cols: Math.min(matrix.cols, 7),
    values: matrix.values.slice(0, 6).map((row) => row.slice(0, 7)),
  }
  const skeletons: ExcalidrawElementSkeleton[] = [
    text(18, 22, `${input.level.title} · ${kind === 'dp_table' ? 'DP 推导表' : '二维表格'}`, 20, '#2f3c42'),
    ...makeTable(clipped.values, 38, 92, 58, 44, kind === 'dp_table' ? DP_FILL : ARRAY_FILL, true),
    text(38, 92 + clipped.rows * 44 + 72, '可填写状态、画箭头表示转移来源，或用颜色标出当前格。', 16, '#52636b'),
  ]

  return {
    kind,
    elements: toElements(skeletons),
    appState: makeWhiteboardAppState(input.level),
    files: EMPTY_FILES,
  }
}

function buildBlankSeed(level: Level): WhiteboardSeedResult {
  return {
    kind: 'blank',
    elements: toElements([
      note(42, 54, 360, 118, '从这里画题目结构'),
      text(64, 92, `${level.title}\n可以添加数字球、连线、数组或 DP 表。`, 18, '#3a3526'),
    ]),
    appState: makeWhiteboardAppState(level),
    files: EMPTY_FILES,
  }
}

function makeNumberBallGrid(quantity: number, x: number, y: number): ExcalidrawElementSkeleton[] {
  const cols = Math.min(8, quantity)
  return Array.from({ length: quantity }, (_, index) => {
    const row = Math.floor(index / cols)
    const col = index % cols
    return node(x + col * 78, y + row * 78, String(index + 1))
  })
}

function makeArrayCells(values: string[], x: number, y: number, cellWidth: number, cellHeight: number): ExcalidrawElementSkeleton[] {
  const skeletons: ExcalidrawElementSkeleton[] = []
  values.forEach((value, index) => {
    const left = x + index * cellWidth
    skeletons.push(rect(left, y, cellWidth, cellHeight, value, ARRAY_FILL))
    skeletons.push(text(left + 18, y + cellHeight + 12, String(index), 13, '#7a704f'))
  })
  return skeletons
}

function makeTable(
  values: string[][],
  x: number,
  y: number,
  cellWidth: number,
  cellHeight: number,
  fill: string,
  withIndices = false,
): ExcalidrawElementSkeleton[] {
  const skeletons: ExcalidrawElementSkeleton[] = []
  const offsetX = withIndices ? cellWidth : 0
  const offsetY = withIndices ? cellHeight : 0

  if (withIndices) {
    const cols = Math.max(...values.map((row) => row.length), 0)
    for (let colIndex = 0; colIndex < cols; colIndex += 1) {
      skeletons.push(indexCell(x + offsetX + colIndex * cellWidth, y, cellWidth, cellHeight, String(colIndex)))
    }
    values.forEach((_, rowIndex) => {
      skeletons.push(indexCell(x, y + offsetY + rowIndex * cellHeight, cellWidth, cellHeight, String(rowIndex)))
    })
  }

  values.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      skeletons.push(
        rect(
          x + offsetX + colIndex * cellWidth,
          y + offsetY + rowIndex * cellHeight,
          cellWidth,
          cellHeight,
          value,
          fill,
        ),
      )
    })
  })
  return skeletons
}

function indexCell(x: number, y: number, width: number, height: number, label: string): ExcalidrawElementSkeleton {
  return {
    type: 'rectangle',
    x,
    y,
    width,
    height,
    strokeColor: '#8b7a50',
    backgroundColor: '#efe3bd',
    fillStyle: 'solid',
    strokeWidth: 1,
    roughness: 0,
    opacity: 92,
    label: { text: label, fontSize: 14, textAlign: 'center', verticalAlign: 'middle' },
  } as ExcalidrawElementSkeleton
}

function node(x: number, y: number, label: string): ExcalidrawElementSkeleton {
  return {
    type: 'ellipse',
    x,
    y,
    width: 56,
    height: 56,
    strokeColor: STROKE,
    backgroundColor: NODE_FILL,
    fillStyle: 'solid',
    strokeWidth: 2,
    roughness: 1,
    label: { text: label, fontSize: 20, textAlign: 'center', verticalAlign: 'middle' },
  } as ExcalidrawElementSkeleton
}

function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  fill: string,
): ExcalidrawElementSkeleton {
  return {
    type: 'rectangle',
    x,
    y,
    width,
    height,
    strokeColor: STROKE,
    backgroundColor: fill,
    fillStyle: 'solid',
    strokeWidth: 2,
    roughness: 0,
    label: { text: label, fontSize: 17, textAlign: 'center', verticalAlign: 'middle' },
  } as ExcalidrawElementSkeleton
}

function note(x: number, y: number, width: number, height: number, label: string): ExcalidrawElementSkeleton {
  return {
    type: 'rectangle',
    x,
    y,
    width,
    height,
    strokeColor: '#946f1f',
    backgroundColor: NOTE_FILL,
    fillStyle: 'solid',
    strokeWidth: 2,
    roughness: 1,
    label: { text: label, fontSize: 22, textAlign: 'center', verticalAlign: 'middle' },
  } as ExcalidrawElementSkeleton
}

function line(x1: number, y1: number, x2: number, y2: number): ExcalidrawElementSkeleton {
  return {
    type: 'line',
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    points: [
      [0, 0],
      [x2 - x1, y2 - y1],
    ],
    strokeColor: SOFT_STROKE,
    strokeWidth: 2,
    roughness: 1,
  } as ExcalidrawElementSkeleton
}

function text(x: number, y: number, value: string, fontSize: number, color: string): ExcalidrawElementSkeleton {
  return {
    type: 'text',
    x,
    y,
    text: value,
    fontSize,
    strokeColor: color,
    backgroundColor: 'transparent',
  } as ExcalidrawElementSkeleton
}

function toElements(skeletons: ExcalidrawElementSkeleton[]): ExcalidrawElement[] {
  return Array.from(convertToExcalidrawElements(skeletons, { regenerateIds: true })) as ExcalidrawElement[]
}

function extractTreeTokens(input: string | null): string[] {
  if (!input) return []
  const bracket = input.match(/\[([^\]]+)\]/)
  if (bracket) {
    return bracket[1]!
      .split(/[,\s]+/)
      .map((token) => token.trim())
      .filter(Boolean)
  }

  const tokens = input.match(/null|nil|none|-?\d+/gi) ?? []
  if (tokens.length > 1 && /^\d+$/.test(tokens[0]!) && Number(tokens[0]) === tokens.length - 1) {
    return tokens.slice(1)
  }
  return tokens
}

function isNullToken(token: string): boolean {
  return /^(null|nil|none|#)$/i.test(token)
}

function extractNumberTokens(input: string | null): string[] {
  return input?.match(/-?\d+(?:\.\d+)?/g) ?? []
}

function normalizeArrayValues(values: string[]): string[] {
  if (values.length >= 2 && Number(values[0]) === values.length - 1) return values.slice(1)
  return values
}

function looksLikeGraphInput(input: string | null): boolean {
  return Boolean(parseGraph(input))
}

function parseGraph(input: string | null): { n: number; edges: Array<{ from: number; to: number; weight: number | null }> } | null {
  const rows = numericRows(input)
  if (rows.length < 2 || rows[0]!.length < 2) return null

  const n = Math.trunc(rows[0]![0]!)
  const m = Math.trunc(rows[0]![1]!)
  if (n < 2 || n > 12 || m < 1 || m > 40 || rows.length - 1 < m) return null

  const edges = rows.slice(1, m + 1).map((row) => ({
    from: Math.trunc(row[0] ?? 0),
    to: Math.trunc(row[1] ?? 0),
    weight: row.length >= 3 ? row[2]! : null,
  }))
  if (edges.some((edge) => edge.from < 1 || edge.from > n || edge.to < 1 || edge.to > n || edge.from === edge.to)) {
    return null
  }

  return { n, edges }
}

function looksLikeMatrixInput(input: string | null): boolean {
  return Boolean(parseMatrix(input))
}

function parseMatrix(input: string | null): MatrixData | null {
  const rows = numericRows(input)
  if (rows.length < 2) return null

  const [first] = rows
  if (!first || first.length < 2) return null

  const declaredRows = Math.trunc(first[0]!)
  const declaredCols = Math.trunc(first[1]!)
  const body = rows.slice(1)
  if (declaredRows >= 2 && declaredRows <= 20 && declaredCols >= 2 && declaredCols <= 20 && body.length >= declaredRows) {
    const values = body.slice(0, declaredRows).map((row) => row.slice(0, declaredCols).map(String))
    if (values.every((row) => row.length >= declaredCols)) {
      return { rows: declaredRows, cols: declaredCols, values }
    }
  }

  const consistentWidth = rows[0]!.length
  if (consistentWidth >= 2 && rows.length >= 2 && rows.every((row) => row.length === consistentWidth)) {
    return { rows: rows.length, cols: consistentWidth, values: rows.map((row) => row.map(String)) }
  }

  return null
}

function numericRows(input: string | null): number[][] {
  return (input ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [])
    .filter((row) => row.length > 0)
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value!)))
}
