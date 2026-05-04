'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Circle, Grid3X3, PenLine, RotateCcw, Table2, Trash2, X } from 'lucide-react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types'
import type { Level } from '@spcg/shared/types'
import {
  buildWhiteboardPreset,
  buildWhiteboardSeed,
  makeWhiteboardAppState,
  type WhiteboardPresetKind,
} from '@/components/whiteboard-template'

const ExcalidrawCanvas = dynamic(
  () => import('@excalidraw/excalidraw').then((mod) => mod.Excalidraw),
  {
    ssr: false,
    loading: () => <div className="whiteboard-loading">正在打开画板...</div>,
  },
)

type AlgorithmWhiteboardButtonProps = {
  onOpen: () => void
}

type AlgorithmWhiteboardModalProps = {
  level: Level
  onClose: () => void
}

type SavedScene = {
  elements: readonly ExcalidrawElement[]
  appState: AppState
  files: BinaryFiles
}

export function AlgorithmWhiteboardButton({ onOpen }: AlgorithmWhiteboardButtonProps) {
  return (
    <button type="button" aria-label="打开逻辑画板" title="逻辑画板" onClick={onOpen}>
      <PenLine size={18} strokeWidth={2.4} />
    </button>
  )
}

export function AlgorithmWhiteboardModal({ level, onClose }: AlgorithmWhiteboardModalProps) {
  const sampleInput = level.publicCases[0]?.input ?? null
  const storageKey = useMemo(() => `spcg:whiteboard:${level.id}`, [level.id])
  const seed = useMemo(() => buildWhiteboardSeed({ level, sampleInput }), [level, sampleInput])
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null)
  const [sceneRevision, setSceneRevision] = useState(0)
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const canvasShellRef = useRef<HTMLDivElement | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const latestSceneRef = useRef<SavedScene | null>(null)

  const flushSavedScene = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    const scene = latestSceneRef.current
    if (!scene || typeof window === 'undefined') return

    try {
      window.localStorage.setItem(storageKey, serializeWhiteboardScene(scene))
    } catch {
      // Local drafts are helpful, but storage errors must never block the IDE.
    }
  }, [storageKey])

  useEffect(() => {
    const saved = readSavedScene(storageKey, level)
    setInitialData(saved ?? seedToInitialData(seed, level))
    setSceneRevision((value) => value + 1)
    setApi(null)
  }, [level, seed, storageKey])

  useEffect(() => {
    return () => {
      flushSavedScene()
    }
  }, [flushSavedScene])

  function scheduleSave(elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) {
    latestSceneRef.current = { elements, appState, files }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(flushSavedScene, 320)
  }

  function replaceScene(nextSeed = buildWhiteboardSeed({ level, sampleInput })) {
    const nextInitialData = seedToInitialData(nextSeed, level)
    const nextAppState = { ...makeWhiteboardAppState(level), ...(nextSeed.appState as Partial<AppState>) } as AppState
    latestSceneRef.current = {
      elements: nextSeed.elements,
      appState: nextAppState,
      files: nextSeed.files ?? {},
    }

    if (api) {
      api.updateScene({
        elements: nextSeed.elements,
        appState: nextAppState,
      })
      api.history.clear()
      window.setTimeout(() => api.scrollToContent(nextSeed.elements, { fitToContent: true }), 30)
      flushSavedScene()
      return
    }

    setInitialData(nextInitialData)
    setSceneRevision((value) => value + 1)
    flushSavedScene()
  }

  function resetToSample() {
    if (hasSavedScene(storageKey) && !window.confirm('重置会覆盖当前这道题的本地画板草稿，是否继续？')) return
    replaceScene()
  }

  function clearCanvas() {
    if (!window.confirm('清空当前画板草稿？')) return
    const emptySeed = {
      kind: 'blank' as const,
      elements: [],
      appState: makeWhiteboardAppState(level),
      files: {},
    }
    replaceScene(emptySeed)
  }

  function insertPreset(kind: WhiteboardPresetKind) {
    if (!api) return
    const presetOptions = promptPresetOptions(kind)
    if (!presetOptions) return

    const current = api.getSceneElements()
    const preset = moveElementsToCurrentViewportCenter(buildWhiteboardPreset(kind, presetOptions), api, canvasShellRef.current)
    const nextElements = [...current, ...preset]
    const appState = api.getAppState()
    const files = api.getFiles()

    api.updateScene({ elements: nextElements })
    latestSceneRef.current = { elements: nextElements, appState, files }
    flushSavedScene()
  }

  return (
    <div className="whiteboard-modal-backdrop" role="dialog" aria-modal="true" aria-label={`${level.title} 逻辑画板`}>
      <div className="whiteboard-modal">
        <header className="whiteboard-modal-head">
          <div className="whiteboard-title">
            <span>逻辑画板</span>
          </div>
          <WhiteboardTemplateToolbar
            disabled={!api}
            onInsertNumberBalls={() => insertPreset('number_balls')}
            onInsertArray={() => insertPreset('array_1d')}
            onInsertMatrix={() => insertPreset('matrix_2d')}
            onReset={resetToSample}
            onClear={clearCanvas}
            onClose={onClose}
          />
        </header>

        <div className="whiteboard-canvas-shell" ref={canvasShellRef}>
          {initialData ? (
            <ExcalidrawCanvas
              key={`${level.id}:${sceneRevision}`}
              initialData={initialData}
              excalidrawAPI={setApi}
              langCode="zh-CN"
              theme="light"
              gridModeEnabled
              objectsSnapModeEnabled
              aiEnabled={false}
              validateEmbeddable={false}
              UIOptions={{
                canvasActions: {
                  changeViewBackgroundColor: false,
                  clearCanvas: false,
                  loadScene: false,
                  saveToActiveFile: false,
                  toggleTheme: false,
                  export: { saveFileToDisk: true },
                  saveAsImage: true,
                },
                tools: {
                  image: false,
                },
              }}
              onPointerUp={(activeTool) => keepDrawingToolActive(api, activeTool)}
              onChange={(elements, appState, files) => scheduleSave(elements, appState, files)}
            />
          ) : (
            <div className="whiteboard-loading">正在生成题目图形...</div>
          )}
        </div>
      </div>
    </div>
  )
}

type WhiteboardTemplateToolbarProps = {
  disabled: boolean
  onInsertNumberBalls: () => void
  onInsertArray: () => void
  onInsertMatrix: () => void
  onReset: () => void
  onClear: () => void
  onClose: () => void
}

function WhiteboardTemplateToolbar({
  disabled,
  onInsertNumberBalls,
  onInsertArray,
  onInsertMatrix,
  onReset,
  onClear,
  onClose,
}: WhiteboardTemplateToolbarProps) {
  return (
    <div className="whiteboard-toolbar">
      <button type="button" title="添加数字球" aria-label="添加数字球" disabled={disabled} onClick={onInsertNumberBalls}>
        <Circle size={17} strokeWidth={2.6} />
        <span>数字球</span>
      </button>
      <button type="button" title="添加一维数组" aria-label="添加一维数组" disabled={disabled} onClick={onInsertArray}>
        <Table2 size={17} strokeWidth={2.6} />
        <span>数组</span>
      </button>
      <button type="button" title="添加二维表格" aria-label="添加二维表格" disabled={disabled} onClick={onInsertMatrix}>
        <Grid3X3 size={17} strokeWidth={2.6} />
        <span>表格</span>
      </button>
      <button type="button" title="按样例重置" aria-label="按样例重置" onClick={onReset}>
        <RotateCcw size={17} strokeWidth={2.6} />
      </button>
      <button type="button" title="清空画板" aria-label="清空画板" onClick={onClear}>
        <Trash2 size={17} strokeWidth={2.6} />
      </button>
      <button className="whiteboard-close" type="button" title="关闭画板" aria-label="关闭画板" onClick={onClose}>
        <X size={18} strokeWidth={2.8} />
      </button>
    </div>
  )
}

function seedToInitialData(seed: ReturnType<typeof buildWhiteboardSeed>, level: Level): ExcalidrawInitialDataState {
  const appState = {
    ...makeWhiteboardAppState(level),
    ...seed.appState,
  }

  return {
    type: 'excalidraw',
    version: 2,
    source: 'spcg-whiteboard',
    elements: seed.elements,
    appState: lockWhiteboardActiveTool(appState),
    files: seed.files ?? {},
    scrollToContent: true,
  }
}

function readSavedScene(storageKey: string, level: Level): ExcalidrawInitialDataState | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ExcalidrawInitialDataState
    if (!Array.isArray(parsed.elements)) return null

    return {
      ...parsed,
      appState: lockWhiteboardActiveTool({
        ...makeWhiteboardAppState(level),
        ...(parsed.appState ?? {}),
      }),
      files: parsed.files ?? {},
      scrollToContent: true,
    }
  } catch {
    return null
  }
}

function hasSavedScene(storageKey: string): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(window.localStorage.getItem(storageKey))
}

function lockWhiteboardActiveTool(appState: Partial<AppState>): Partial<AppState> {
  const activeTool = appState.activeTool
  const nextActiveTool: AppState['activeTool'] =
    activeTool?.type === 'custom'
      ? {
          type: 'custom',
          customType: activeTool.customType,
          lastActiveTool: activeTool.lastActiveTool ?? null,
          locked: true,
        }
      : {
          type: activeTool?.type ?? 'selection',
          customType: null,
          lastActiveTool: activeTool?.lastActiveTool ?? null,
          locked: true,
        }

  return {
    ...appState,
    activeTool: nextActiveTool,
  }
}

function keepDrawingToolActive(api: ExcalidrawImperativeAPI | null, activeTool: AppState['activeTool']) {
  if (!api || !isPersistentDrawingTool(activeTool.type)) return

  window.setTimeout(() => {
    if (activeTool.type === 'custom') {
      api.setActiveTool({ type: 'custom', customType: activeTool.customType, locked: true })
      return
    }

    api.setActiveTool({ type: activeTool.type, locked: true })
  }, 0)
}

function isPersistentDrawingTool(type: AppState['activeTool']['type']): boolean {
  return (
    type === 'rectangle' ||
    type === 'diamond' ||
    type === 'ellipse' ||
    type === 'arrow' ||
    type === 'line' ||
    type === 'freedraw' ||
    type === 'text'
  )
}

function promptPresetOptions(kind: WhiteboardPresetKind): { quantity?: number; rows?: number; cols?: number } | null {
  if (kind === 'number_balls') {
    const quantity = promptInteger('请输入数字球数量（1-40）', 5, 1, 40)
    return quantity === null ? null : { quantity }
  }

  if (kind === 'array_1d') {
    const quantity = promptInteger('请输入一维数组长度（1-50）', 6, 1, 50)
    return quantity === null ? null : { quantity }
  }

  const size = promptMatrixSize()
  return size
}

function promptInteger(message: string, fallback: number, min: number, max: number): number | null {
  const raw = window.prompt(message, String(fallback))
  if (raw === null) return null

  const value = Number(raw.trim())
  if (!Number.isInteger(value) || value < min || value > max) {
    window.alert(`请输入 ${min}-${max} 之间的整数。`)
    return null
  }

  return value
}

function promptMatrixSize(): { rows: number; cols: number } | null {
  const raw = window.prompt('请输入二维数组行数和列数，例如 3x4 或 3,4（每项 1-12）', '3x4')
  if (raw === null) return null

  const match = raw.trim().match(/^(\d+)\s*(?:x|X|×|\*|,|，|\s)\s*(\d+)$/)
  if (!match) {
    window.alert('请输入类似 3x4 或 3,4 的格式。')
    return null
  }

  const rows = Number(match[1])
  const cols = Number(match[2])
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || rows > 12 || cols < 1 || cols > 12) {
    window.alert('行数和列数都需要是 1-12 之间的整数。')
    return null
  }

  return { rows, cols }
}

function moveElementsToCurrentViewportCenter(
  elements: ExcalidrawElement[],
  api: ExcalidrawImperativeAPI,
  canvasShell: HTMLDivElement | null,
): ExcalidrawElement[] {
  const center = readViewportCenter(api, canvasShell)
  const bounds = readElementBounds(elements)
  const dx = center.x - (bounds.minX + bounds.width / 2)
  const dy = center.y - (bounds.minY + bounds.height / 2)

  return elements.map((element) => ({
    ...element,
    x: element.x + dx,
    y: element.y + dy,
  })) as ExcalidrawElement[]
}

function readViewportCenter(api: ExcalidrawImperativeAPI, canvasShell: HTMLDivElement | null): { x: number; y: number } {
  const appState = api.getAppState()
  const rect = canvasShell?.getBoundingClientRect()
  const clientX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
  const clientY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2

  return {
    x: (clientX - appState.offsetLeft) / appState.zoom.value - appState.scrollX,
    y: (clientY - appState.offsetTop) / appState.zoom.value - appState.scrollY,
  }
}

function readElementBounds(elements: ExcalidrawElement[]): { minX: number; minY: number; width: number; height: number } {
  if (elements.length === 0) return { minX: 0, minY: 0, width: 1, height: 1 }

  const minX = Math.min(...elements.map((element) => Math.min(element.x, element.x + element.width)))
  const minY = Math.min(...elements.map((element) => Math.min(element.y, element.y + element.height)))
  const maxX = Math.max(...elements.map((element) => Math.max(element.x, element.x + element.width)))
  const maxY = Math.max(...elements.map((element) => Math.max(element.y, element.y + element.height)))

  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  }
}

function serializeWhiteboardScene(scene: SavedScene): string {
  return JSON.stringify({
    type: 'excalidraw',
    version: 2,
    source: 'spcg-whiteboard',
    elements: scene.elements,
    appState: scene.appState,
    files: scene.files,
  })
}
