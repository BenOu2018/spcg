'use client'

import dynamic from 'next/dynamic'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
} from 'react'
import { Circle, GitBranch, Grid3X3, PenLine, RotateCcw, Table2, Trash2, X } from 'lucide-react'
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
  appState: Partial<AppState>
  files: BinaryFiles
}

type ClickDriftSnapshot = {
  clientX: number
  clientY: number
  activeToolType: AppState['activeTool']['type']
  positions: Map<string, { x: number; y: number; width: number; height: number; isDeleted: boolean }>
}

export function AlgorithmWhiteboardButton({ onOpen }: AlgorithmWhiteboardButtonProps) {
  return (
    <button type="button" aria-label="打开逻辑画板" title="逻辑画板" data-tooltip="逻辑画板" onClick={onOpen}>
      <PenLine size={18} strokeWidth={2.4} />
    </button>
  )
}

export function AlgorithmWhiteboardModal({ level, onClose }: AlgorithmWhiteboardModalProps) {
  const sampleInput = level.publicCases[0]?.input ?? null
  const storageKey = useMemo(() => `spcg:whiteboard:v2:${level.id}`, [level.id])
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null)
  const [sceneRevision, setSceneRevision] = useState(0)
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const canvasShellRef = useRef<HTMLDivElement | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const latestSceneRef = useRef<SavedScene | null>(null)
  const quickEditRef = useRef<{ targetId: string; value: string; updatedAt: number } | null>(null)
  const clickDriftSnapshotRef = useRef<ClickDriftSnapshot | null>(null)

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
    setInitialData(saved ?? makeBlankInitialData(level))
    setSceneRevision((value) => value + 1)
    setApi(null)
  }, [level, storageKey])

  useEffect(() => {
    return () => {
      flushSavedScene()
    }
  }, [flushSavedScene])

  function scheduleSave(elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) {
    latestSceneRef.current = {
      elements,
      appState: makePersistableWhiteboardAppState(appState),
      files,
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(flushSavedScene, 320)
  }

  function replaceScene(nextSeed = buildWhiteboardSeed({ level, sampleInput })) {
    const nextInitialData = seedToInitialData(nextSeed, level)
    const nextAppState = makeRuntimeWhiteboardAppState({
      ...makeWhiteboardAppState(level),
      ...(nextSeed.appState as Partial<AppState>),
    })
    latestSceneRef.current = {
      elements: nextSeed.elements,
      appState: makePersistableWhiteboardAppState(nextAppState),
      files: nextSeed.files ?? {},
    }

    if (api) {
      const runtimeAppState = {
        ...api.getAppState(),
        ...nextAppState,
      } as AppState

      api.updateScene({
        elements: nextSeed.elements,
        appState: runtimeAppState,
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
    if (hasSavedScene(storageKey) && !window.confirm('重置会清空当前这道题的本地画板草稿，是否继续？')) return
    replaceScene({
      kind: 'blank' as const,
      elements: [],
      appState: makeWhiteboardAppState(level),
      files: {},
    })
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

  function insertProblemShape() {
    insertElements(buildWhiteboardSeed({ level, sampleInput }).elements)
  }

  function insertPreset(kind: WhiteboardPresetKind) {
    if (!api) return
    const presetOptions = promptPresetOptions(kind)
    if (!presetOptions) return

    insertElements(buildWhiteboardPreset(kind, presetOptions))
  }

  function insertElements(elements: ExcalidrawElement[]) {
    if (!api || elements.length === 0) return

    const current = api.getSceneElements()
    const preset = moveElementsToCurrentViewportCenter(elements, api, canvasShellRef.current)
    const nextElements = [...current, ...preset]
    const appState = api.getAppState()
    const files = api.getFiles()

    api.updateScene({ elements: nextElements })
    latestSceneRef.current = {
      elements: nextElements,
      appState: makePersistableWhiteboardAppState(appState),
      files,
    }
    flushSavedScene()
  }

  function handleWhiteboardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!api || shouldIgnoreWhiteboardQuickEdit(event)) return

    const inputKey = normalizeQuickEditKey(event)
    if (!inputKey) return

    const updated = updateSelectedElementLabel(api, inputKey, quickEditRef)
    if (!updated) return

    event.preventDefault()
    event.stopPropagation()

    latestSceneRef.current = {
      elements: updated.elements,
      appState: makePersistableWhiteboardAppState(api.getAppState()),
      files: api.getFiles(),
    }
    flushSavedScene()
  }

  function handleWhiteboardPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!api || event.button !== 0) {
      clickDriftSnapshotRef.current = null
      return
    }

    const appState = api.getAppState()
    clickDriftSnapshotRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      activeToolType: appState.activeTool.type,
      positions: new Map(
        api.getSceneElements().map((element) => [
          element.id,
          {
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
            isDeleted: element.isDeleted,
          },
        ]),
      ),
    }
  }

  function handleWhiteboardPointerUp(event: PointerEvent<HTMLDivElement>) {
    const snapshot = clickDriftSnapshotRef.current
    clickDriftSnapshotRef.current = null
    if (!api || !snapshot || snapshot.activeToolType !== 'selection') return

    const pointerDistance = Math.hypot(event.clientX - snapshot.clientX, event.clientY - snapshot.clientY)
    if (pointerDistance > 4) return

    window.setTimeout(() => {
      restoreClickDrift(api, snapshot, flushSavedScene, latestSceneRef)
    }, 0)
  }

  return (
    <div
      className="whiteboard-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="逻辑画板"
      onKeyDownCapture={handleWhiteboardKeyDown}
      onPointerDownCapture={handleWhiteboardPointerDown}
      onPointerUpCapture={handleWhiteboardPointerUp}
    >
      <div className="whiteboard-modal">
        <header className="whiteboard-modal-head">
          <div className="whiteboard-title">
            <span>逻辑画板</span>
          </div>
          <WhiteboardTemplateToolbar
            disabled={!api}
            onInsertProblemShape={insertProblemShape}
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
  onInsertProblemShape: () => void
  onInsertNumberBalls: () => void
  onInsertArray: () => void
  onInsertMatrix: () => void
  onReset: () => void
  onClear: () => void
  onClose: () => void
}

function WhiteboardTemplateToolbar({
  disabled,
  onInsertProblemShape,
  onInsertNumberBalls,
  onInsertArray,
  onInsertMatrix,
  onReset,
  onClear,
  onClose,
}: WhiteboardTemplateToolbarProps) {
  return (
    <div className="whiteboard-toolbar">
      <button type="button" title="加载本题图形" aria-label="加载本题图形" disabled={disabled} onClick={onInsertProblemShape}>
        <GitBranch size={17} strokeWidth={2.6} />
        <span>本题图形</span>
      </button>
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
      <button type="button" title="重置为空白画板" aria-label="重置为空白画板" onClick={onReset}>
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
  const appState = makeRuntimeWhiteboardAppState({
    ...makeWhiteboardAppState(level),
    ...seed.appState,
  })

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

function makeBlankInitialData(level: Level): ExcalidrawInitialDataState {
  return {
    type: 'excalidraw',
    version: 2,
    source: 'spcg-whiteboard',
    elements: [],
    appState: lockWhiteboardActiveTool(makeRuntimeWhiteboardAppState(makeWhiteboardAppState(level))),
    files: {},
    scrollToContent: false,
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
      appState: lockWhiteboardActiveTool(makeRuntimeWhiteboardAppState({
        ...makeWhiteboardAppState(level),
        ...(parsed.appState ?? {}),
      })),
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

function makeRuntimeWhiteboardAppState(appState: Partial<AppState>): Partial<AppState> {
  return {
    ...makePersistableWhiteboardAppState(appState),
    collaborators: new Map(),
  } as Partial<AppState>
}

function makePersistableWhiteboardAppState(appState: Partial<AppState>): Partial<AppState> {
  const {
    collaborators: _collaborators,
    editingElement: _editingElement,
    resizingElement: _resizingElement,
    draggingElement: _draggingElement,
    suggestedBindings: _suggestedBindings,
    startBoundElement: _startBoundElement,
    cursorButton: _cursorButton,
    ...persistableAppState
  } = appState as Partial<AppState> & Record<string, unknown>

  return persistableAppState as Partial<AppState>
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

function restoreClickDrift(
  api: ExcalidrawImperativeAPI,
  snapshot: ClickDriftSnapshot,
  flushSavedScene: () => void,
  latestSceneRef: MutableRefObject<SavedScene | null>,
) {
  const elements = api.getSceneElements()
  let restoredAny = false
  const now = Date.now()
  const restoredElements = elements.map((element) => {
    const before = snapshot.positions.get(element.id)
    if (!before || before.isDeleted !== element.isDeleted) return element
    if (!almostSameSize(before, element)) return element

    const drift = Math.hypot(element.x - before.x, element.y - before.y)
    if (drift <= 0 || drift > 18) return element

    restoredAny = true
    return {
      ...element,
      x: before.x,
      y: before.y,
      version: element.version + 1,
      versionNonce: makeWhiteboardVersionNonce(),
      updated: now,
    } as ExcalidrawElement
  })

  if (!restoredAny) return

  api.updateScene({ elements: restoredElements })
  latestSceneRef.current = {
    elements: restoredElements,
    appState: makePersistableWhiteboardAppState(api.getAppState()),
    files: api.getFiles(),
  }
  flushSavedScene()
}

function almostSameSize(
  before: { width: number; height: number },
  element: ExcalidrawElement,
): boolean {
  return Math.abs(element.width - before.width) < 0.001 && Math.abs(element.height - before.height) < 0.001
}

function shouldIgnoreWhiteboardQuickEdit(event: KeyboardEvent<HTMLDivElement>): boolean {
  if (event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) return true

  const target = event.target
  if (!(target instanceof HTMLElement)) return false

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], .excalidraw-textEditorContainer'))
}

function normalizeQuickEditKey(event: KeyboardEvent<HTMLDivElement>): string | null {
  if (event.key === 'Backspace') return 'Backspace'
  if (event.key.length === 1 && /^[\d.-]$/.test(event.key)) return event.key
  return null
}

function updateSelectedElementLabel(
  api: ExcalidrawImperativeAPI,
  inputKey: string,
  quickEditRef: MutableRefObject<{ targetId: string; value: string; updatedAt: number } | null>,
): { elements: ExcalidrawElement[] } | null {
  const appState = api.getAppState() as AppState & { editingElement?: unknown }
  if (appState.editingElement) return null

  const selectedIds = Object.entries(appState.selectedElementIds ?? {})
    .filter(([, selected]) => selected)
    .map(([id]) => id)
  if (selectedIds.length === 0) return null

  const elements = api.getSceneElements()
  const target = findEditableLabelTarget(elements, selectedIds)
  if (!target) return null

  const currentValue = target.textElement ? readTextValue(target.textElement) : ''
  const nextValue = computeQuickEditValue(inputKey, target.targetId, currentValue, quickEditRef)
  const now = Date.now()
  const nextElements = elements.map((element) => ({ ...element })) as ExcalidrawElement[]
  const textIndex = target.textElement ? nextElements.findIndex((element) => element.id === target.textElement?.id) : -1
  const shape = target.shapeElement ? nextElements.find((element) => element.id === target.shapeElement?.id) ?? null : null
  const updatedText = updateTextElementValue(
    target.textElement ?? makeQuickTextElement(shape, nextValue),
    nextValue,
    shape ?? null,
    now,
  )

  if (textIndex >= 0) {
    nextElements[textIndex] = updatedText
  } else {
    nextElements.push(updatedText)
  }

  api.updateScene({ elements: nextElements })
  return { elements: nextElements }
}

function findEditableLabelTarget(
  elements: readonly ExcalidrawElement[],
  selectedIds: string[],
): { targetId: string; textElement: ExcalidrawElement | null; shapeElement: ExcalidrawElement | null } | null {
  const visibleElements = elements.filter((element) => !element.isDeleted)
  const selectedElements = selectedIds
    .map((id) => visibleElements.find((element) => element.id === id))
    .filter((element): element is ExcalidrawElement => Boolean(element))

  const selectedText = selectedElements.find(isTextElement)
  if (selectedText) {
    return { targetId: selectedText.id, textElement: selectedText, shapeElement: null }
  }

  const selectedShape = selectedElements.find(isEditableShapeElement)
  if (!selectedShape) return null

  return {
    targetId: selectedShape.id,
    textElement: findCenteredLabelForShape(selectedShape, visibleElements),
    shapeElement: selectedShape,
  }
}

function isTextElement(element: ExcalidrawElement): boolean {
  return element.type === 'text'
}

function isEditableShapeElement(element: ExcalidrawElement): boolean {
  return element.type === 'rectangle' || element.type === 'ellipse'
}

function findCenteredLabelForShape(shape: ExcalidrawElement, elements: readonly ExcalidrawElement[]): ExcalidrawElement | null {
  const shapeCenter = readElementCenter(shape)
  const candidates = elements
    .filter(isTextElement)
    .map((textElement) => {
      const textCenter = readElementCenter(textElement)
      const inside =
        textCenter.x >= Math.min(shape.x, shape.x + shape.width) - 8 &&
        textCenter.x <= Math.max(shape.x, shape.x + shape.width) + 8 &&
        textCenter.y >= Math.min(shape.y, shape.y + shape.height) - 8 &&
        textCenter.y <= Math.max(shape.y, shape.y + shape.height) + 8

      return {
        textElement,
        inside,
        distance: Math.hypot(textCenter.x - shapeCenter.x, textCenter.y - shapeCenter.y),
      }
    })
    .filter((candidate) => candidate.inside)
    .sort((a, b) => a.distance - b.distance)

  return candidates[0]?.textElement ?? null
}

function readElementCenter(element: ExcalidrawElement): { x: number; y: number } {
  return {
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  }
}

function readTextValue(element: ExcalidrawElement): string {
  return typeof (element as ExcalidrawElement & { text?: unknown }).text === 'string'
    ? ((element as ExcalidrawElement & { text: string }).text)
    : ''
}

function computeQuickEditValue(
  inputKey: string,
  targetId: string,
  currentValue: string,
  quickEditRef: MutableRefObject<{ targetId: string; value: string; updatedAt: number } | null>,
): string {
  const now = Date.now()
  const previous = quickEditRef.current
  const continuing = previous?.targetId === targetId && now - previous.updatedAt < 1200
  const baseValue = continuing ? previous.value : inputKey === 'Backspace' ? currentValue : ''

  let nextValue = baseValue
  if (inputKey === 'Backspace') {
    nextValue = baseValue.slice(0, -1)
  } else if (inputKey === '-') {
    nextValue = baseValue.startsWith('-') ? baseValue.slice(1) : `-${baseValue}`
  } else if (inputKey === '.') {
    nextValue = baseValue.includes('.') ? baseValue : `${baseValue || '0'}.`
  } else {
    nextValue = `${baseValue}${inputKey}`
  }

  quickEditRef.current = { targetId, value: nextValue, updatedAt: now }
  return nextValue
}

function updateTextElementValue(
  element: ExcalidrawElement,
  value: string,
  shape: ExcalidrawElement | null,
  updated: number,
): ExcalidrawElement {
  const fontSize = readTextFontSize(element)
  const { width, height, baseline } = measureTextElement(value, fontSize)
  const nextElement = {
    ...element,
    text: value,
    originalText: value,
    width,
    height,
    baseline,
    version: element.version + 1,
    versionNonce: makeWhiteboardVersionNonce(),
    updated,
  } as unknown as ExcalidrawElement

  if (!shape) return nextElement

  return {
    ...nextElement,
    x: shape.x + shape.width / 2 - width / 2,
    y: shape.y + shape.height / 2 - height / 2,
  } as ExcalidrawElement
}

function makeQuickTextElement(shape: ExcalidrawElement | null, value: string): ExcalidrawElement {
  const fontSize = shape?.type === 'ellipse' ? 20 : 17
  const { width, height, baseline } = measureTextElement(value, fontSize)
  const x = shape ? shape.x + shape.width / 2 - width / 2 : 0
  const y = shape ? shape.y + shape.height / 2 - height / 2 : 0

  return {
    id: `spcg-text-${makeWhiteboardVersionNonce().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    type: 'text',
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: shape?.strokeColor ?? '#27414b',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: makeWhiteboardVersionNonce(),
    version: 1,
    versionNonce: makeWhiteboardVersionNonce(),
    index: null,
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    text: value,
    originalText: value,
    fontSize,
    fontFamily: 1,
    textAlign: 'center',
    verticalAlign: 'middle',
    baseline,
    containerId: null,
    autoResize: true,
    lineHeight: 1.25,
  } as unknown as ExcalidrawElement
}

function readTextFontSize(element: ExcalidrawElement): number {
  const fontSize = (element as ExcalidrawElement & { fontSize?: unknown }).fontSize
  return typeof fontSize === 'number' && Number.isFinite(fontSize) ? fontSize : 17
}

function measureTextElement(value: string, fontSize: number): { width: number; height: number; baseline: number } {
  const safeValue = value || ' '
  const lines = safeValue.split('\n')
  const width = Math.max(24, ...lines.map((line) => line.length * fontSize * 0.62))
  const height = Math.max(fontSize * 1.25, lines.length * fontSize * 1.25)

  return { width, height, baseline: Math.round(height * 0.78) }
}

function makeWhiteboardVersionNonce(): number {
  return Math.floor(Math.random() * 2_147_483_647) + 1
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
    appState: makePersistableWhiteboardAppState(scene.appState),
    files: scene.files,
  })
}
