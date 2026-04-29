'use client'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type {
  Piece,
  PieceType,
  Rotation,
  TrackBiome,
  TrackCheckpoint,
  TrackDecoration,
  TrackMood,
  TrackTransmissionMode,
} from '@/lib/schemas'
import { MAX_PIECES_PER_TRACK, MIN_CHECKPOINT_COUNT } from '@/lib/schemas'
import type { Dir } from '@/game/track'
import { cellKey, validateClosedLoop } from '@/game/track'
import {
  TIME_OF_DAY_LABELS,
  TIME_OF_DAY_NAMES,
  type TimeOfDay,
} from '@/lib/lighting'
import { WEATHER_LABELS, WEATHER_NAMES, type Weather } from '@/lib/weather'
import {
  TRACK_BIOME_DESCRIPTIONS,
  TRACK_BIOME_LABELS,
  TRACK_BIOME_NAMES,
} from '@/lib/biomes'
import {
  MAX_DECORATIONS_PER_TRACK,
  TRACK_DECORATION_LABELS,
  TRACK_DECORATION_KINDS,
  decorationCellKey,
  getDecorationPaletteForBiome,
  type TrackDecorationKind,
} from '@/lib/decorations'
import { sanitizeTrackMood } from '@/game/trackMood'
import { recordMyTrack } from '@/lib/myTracks'
import {
  getBounds,
  getStartExitDir,
  flipCellWithinSelection,
  flipSelectedPieces,
  flipSelectionKeys,
  moveStartTo,
  moveSelectedPieces,
  nextRotation,
  countSelectedPieces,
  rectangleSelectionKeys,
  reverseStartDirection,
  rotateSelectedPieces,
  selectedCellKey,
  shiftSelectionKeys,
  withPiecePlaced,
  withPieceRemoved,
  withPieceRotated,
} from '@/game/editor'
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type EditorHistory,
} from '@/game/editorHistory'
import {
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  clampZoom,
  distance,
  fitZoom,
  pinchZoom,
  shiftZoomTowardCursor,
} from '@/game/editorZoom'
import {
  TRACK_TEMPLATES,
  cloneTemplatePieces,
  getTrackTemplate,
} from '@/game/trackTemplates'

type Tool = 'select' | 'erase' | PieceType | 'start' | 'checkpoint' | TrackDecorationKind
const PIECE_TOOLS: PieceType[] = [
  'straight',
  'left90',
  'right90',
  'scurve',
  'scurveLeft',
  'sweepRight',
  'sweepLeft',
]
const BASE_TOOLS: Tool[] = ['select', 'erase', ...PIECE_TOOLS, 'start', 'checkpoint']
const TOOL_LABELS: Record<Tool, string> = {
  select: 'Select',
  erase: 'Erase',
  straight: 'Straight',
  left90: 'Left turn',
  right90: 'Right turn',
  scurve: 'S-curve (right)',
  scurveLeft: 'S-curve (left)',
  sweepRight: 'Sweep turn (right)',
  sweepLeft: 'Sweep turn (left)',
  start: 'Set start',
  checkpoint: 'Checkpoint',
  ...TRACK_DECORATION_LABELS,
}

interface TrackEditorProps {
  slug: string
  initialPieces: Piece[]
  initialCheckpointCount?: number
  initialCheckpoints?: TrackCheckpoint[]
  initialBiome?: TrackBiome
  initialDecorations?: TrackDecoration[]
  // Optional baked-in author mood (timeOfDay / weather) to seed the editor's
  // pickers with. Both fields are optional inside the mood. Undefined when
  // the loaded track has no mood (legacy or never set).
  initialMood?: TrackMood
  initialTransmission?: TrackTransmissionMode
  // When set, the editor was opened against a historical version. Saving still
  // creates a new version on the same slug. The editor surfaces a small banner
  // so the player understands they are forking, not overwriting.
  forkingFromHash?: string | null
}

const CELL = 56
const PAD_CELLS = 2

function shortHash(hash: string): string {
  return hash.slice(0, 8)
}

export function TrackEditor({
  slug,
  initialPieces,
  initialCheckpointCount,
  initialCheckpoints = [],
  initialBiome,
  initialDecorations = [],
  initialMood,
  initialTransmission = 'automatic',
  forkingFromHash,
}: TrackEditorProps) {
  const router = useRouter()
  const [history, setHistory] = useState<EditorHistory<Piece[]>>(() =>
    createHistory(initialPieces),
  )
  const pieces = history.present
  // Wraps a piece-array transformer so each keystroke records one undo
  // step. Reference-equal returns from the transformer are no-ops in
  // `pushHistory`, so an idempotent edit (e.g. erasing an empty cell)
  // does not pollute the past stack with duplicates.
  const setPieces = useCallback(
    (next: Piece[] | ((prev: Piece[]) => Piece[])) => {
      setHistory((prev) => {
        const value =
          typeof next === 'function'
            ? (next as (p: Piece[]) => Piece[])(prev.present)
            : next
        return pushHistory(prev, value)
      })
    },
    [],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // null = "default" (one CP per piece). Number = explicit override.
  const [checkpointCount, setCheckpointCount] = useState<number | null>(
    initialCheckpointCount !== undefined &&
      initialCheckpointCount !== initialPieces.length
      ? initialCheckpointCount
      : null,
  )
  const [checkpoints, setCheckpoints] = useState<TrackCheckpoint[]>(
    () => initialCheckpoints,
  )
  // Author-baked mood pickers. null = "use the player's own pick" (no
  // override). Each field is independent so an author can pick just one.
  const [moodTimeOfDay, setMoodTimeOfDay] = useState<TimeOfDay | null>(
    initialMood?.timeOfDay ?? null,
  )
  const [moodWeather, setMoodWeather] = useState<Weather | null>(
    initialMood?.weather ?? null,
  )
  const moodActive = moodTimeOfDay !== null || moodWeather !== null
  const [biome, setBiome] = useState<TrackBiome | null>(initialBiome ?? null)
  const biomeActive = biome !== null
  const [decorations, setDecorations] = useState<TrackDecoration[]>(
    () => initialDecorations,
  )
  const decorationPalette = useMemo(
    () => getDecorationPaletteForBiome(biome),
    [biome],
  )
  const decorationToolSet = useMemo(
    () => new Set<TrackDecorationKind>(decorationPalette),
    [decorationPalette],
  )
  const tools = useMemo<Tool[]>(
    () => [...BASE_TOOLS, ...decorationPalette],
    [decorationPalette],
  )
  const [transmission, setTransmission] = useState<TrackTransmissionMode>(
    initialTransmission,
  )
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(
    (initialCheckpointCount !== undefined &&
      initialCheckpointCount !== initialPieces.length) ||
      initialMood !== undefined ||
      initialBiome !== undefined ||
      initialDecorations.length > 0 ||
      initialTransmission === 'manual' ||
      initialCheckpoints.length > 0,
  )
  const [tool, setTool] = useState<Tool>('straight')
  const [toolRotation, setToolRotation] = useState<Rotation>(0)
  const [selectionAnchor, setSelectionAnchor] = useState<{ row: number; col: number } | null>(null)
  const [selectedCells, setSelectedCells] = useState<Set<string>>(() => new Set())
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false)
  const [zoom, setZoom] = useState<number>(ZOOM_DEFAULT)
  const gridContainerRef = useRef<HTMLDivElement | null>(null)
  // Tracks an active two-finger pinch gesture. Null when no pinch is active.
  const pinchRef = useRef<{
    pointers: Map<number, { x: number; y: number }>
    startDistance: number
    startZoom: number
  } | null>(null)

  const validation = useMemo(() => validateClosedLoop(pieces), [pieces])

  const bounds = useMemo(() => getBounds(pieces), [pieces])
  const rowMin = bounds.rowMin - PAD_CELLS
  const rowMax = bounds.rowMax + PAD_CELLS
  const colMin = bounds.colMin - PAD_CELLS
  const colMax = bounds.colMax + PAD_CELLS
  // Base content size at zoom = 1. The SVG keeps its viewBox at this size and
  // the rendered width and height scale by `zoom`, so all interior coordinates
  // (and click hit-testing via data-row / data-col) stay in base units.
  const baseWidth = (colMax - colMin + 1) * CELL
  const baseHeight = (rowMax - rowMin + 1) * CELL
  const renderedWidth = baseWidth * zoom
  const renderedHeight = baseHeight * zoom

  const cellMap = useMemo(() => {
    const m = new Map<string, Piece>()
    for (const p of pieces) m.set(cellKey(p.row, p.col), p)
    return m
  }, [pieces])

  const startKey =
    pieces.length > 0 ? cellKey(pieces[0].row, pieces[0].col) : null
  const startExitDir = getStartExitDir(pieces)
  const selectedPieceCount = useMemo(
    () => countSelectedPieces(pieces, selectedCells),
    [pieces, selectedCells],
  )

  // Keep callbacks stable so the memoized <Cell> children are not invalidated
  // by every render. Latest state is read through refs.
  const checkpointKeys = useMemo(
    () => new Set(checkpoints.map((cp) => cellKey(cp.row, cp.col))),
    [checkpoints],
  )
  const decorationMap = useMemo(() => {
    const m = new Map<string, TrackDecoration>()
    for (const decoration of decorations) {
      m.set(decorationCellKey(decoration), decoration)
    }
    return m
  }, [decorations])

  const latestRef = useRef({
    cellMap,
    checkpointKeys,
    decorationMap,
    startKey,
    error,
    tool,
    toolRotation,
    selectionAnchor,
  })
  latestRef.current = {
    cellMap,
    checkpointKeys,
    decorationMap,
    startKey,
    error,
    tool,
    toolRotation,
    selectionAnchor,
  }

  const applyTool = useCallback((row: number, col: number) => {
    const {
      tool: t,
      toolRotation: tr,
      cellMap: cm,
      checkpointKeys: ck,
      decorationMap: dm,
      startKey: sk,
      error: err,
      selectionAnchor: anchor,
    } = latestRef.current
    const key = cellKey(row, col)
    const existing = cm.get(key)
    if (t === 'select') {
      if (anchor === null) {
        setSelectionAnchor({ row, col })
        setSelectedCells(new Set([selectedCellKey(row, col)]))
      } else {
        setSelectedCells(new Set(rectangleSelectionKeys(anchor, { row, col })))
        setSelectionAnchor(null)
      }
      if (err !== null) setError(null)
      return
    }
    if (t === 'checkpoint') {
      if (!existing || key === sk) return
      setCheckpoints((current) =>
        ck.has(key)
          ? current.filter((cp) => cellKey(cp.row, cp.col) !== key)
          : [...current, { row, col }],
      )
      setCheckpointCount(null)
      if (err !== null) setError(null)
      return
    }
    if (decorationToolSet.has(t as TrackDecorationKind)) {
      if (existing) return
      setDecorations((current) => {
        const decorationKind = t as TrackDecorationKind
        const withoutCell = current.filter((item) => decorationCellKey(item) !== key)
        if (dm.get(key)?.kind === decorationKind) return withoutCell
        if (
          withoutCell.length >= MAX_DECORATIONS_PER_TRACK &&
          !dm.has(key)
        ) {
          return current
        }
        return [...withoutCell, { kind: decorationKind, row, col }]
      })
      if (err !== null) setError(null)
      return
    }
    if (t === 'erase') {
      if (dm.has(key)) {
        setDecorations((current) =>
          current.filter((item) => decorationCellKey(item) !== key),
        )
      }
      setPieces((prev) => (existing ? withPieceRemoved(prev, row, col) : prev))
      if (err !== null) setError(null)
      return
    }
    if (t === 'start') {
      setPieces((prev) => {
        // Mirrors the right-click semantics: re-tapping the current start
        // reverses the loop direction; tapping any other piece relocates
        // start to it. Tapping an empty cell is a no-op.
        if (!existing) return prev
        return key === sk
          ? reverseStartDirection(prev)
          : moveStartTo(prev, row, col)
      })
      if (err !== null) setError(null)
      return
    }
    // Tapping any existing piece rotates it. To change the piece type,
    // erase it first and then place the new one.
    if (existing) {
      setPieces((prev) => withPieceRotated(prev, row, col))
      if (err !== null) setError(null)
      return
    }
    setDecorations((current) =>
      current.filter((item) => decorationCellKey(item) !== key),
    )
    setPieces((prev) => {
      const next = withPiecePlaced(prev, row, col, t as PieceType, tr)
      if (next.length > MAX_PIECES_PER_TRACK) return prev
      return next
    })
    if (err !== null) setError(null)
  }, [decorationToolSet, setPieces])

  function selectTool(next: Tool) {
    // Only piece tools have a rotation; tapping the same erase or start
    // tool is a no-op.
    if (next === tool && (PIECE_TOOLS as Tool[]).includes(next)) {
      setToolRotation((r) => nextRotation(r))
      return
    }
    setTool(next)
  }

  const setStartOrReverse = useCallback((row: number, col: number) => {
    const key = cellKey(row, col)
    const { cellMap: cm, startKey: sk, error: err } = latestRef.current
    if (!cm.has(key)) return
    setPieces((prev) =>
      key === sk ? reverseStartDirection(prev) : moveStartTo(prev, row, col),
    )
    if (err !== null) setError(null)
  }, [setPieces])

  function cellFromEvent(e: React.MouseEvent<SVGSVGElement>): { row: number; col: number } | null {
    const target = (e.target as Element).closest('[data-row]') as SVGElement | null
    if (!target) return null
    const row = Number(target.getAttribute('data-row'))
    const col = Number(target.getAttribute('data-col'))
    if (Number.isNaN(row) || Number.isNaN(col)) return null
    return { row, col }
  }

  // Apply a zoom change anchored on a specific cursor location inside the
  // grid container so the world point under the cursor stays put. When no
  // cursor is provided (button taps), we anchor on the viewport center.
  const applyZoom = useCallback(
    (
      newZoom: number,
      anchor?: { clientX: number; clientY: number },
    ) => {
      const container = gridContainerRef.current
      if (!container) {
        setZoom((prev) => clampZoom(newZoom <= 0 ? prev : newZoom))
        return
      }
      const rect = container.getBoundingClientRect()
      const cursorClientX =
        anchor !== undefined ? anchor.clientX - rect.left : rect.width / 2
      const cursorClientY =
        anchor !== undefined ? anchor.clientY - rect.top : rect.height / 2
      setZoom((prev) => {
        const result = shiftZoomTowardCursor({
          oldZoom: prev,
          newZoom,
          cursorClientX,
          cursorClientY,
          scrollLeft: container.scrollLeft,
          scrollTop: container.scrollTop,
        })
        // Apply scroll on the next frame so the new SVG width has been
        // committed; otherwise scrollLeft will be clamped to the old size.
        requestAnimationFrame(() => {
          container.scrollLeft = result.scrollLeft
          container.scrollTop = result.scrollTop
        })
        return result.zoom
      })
    },
    [],
  )

  const zoomIn = useCallback(() => {
    applyZoom(zoom * ZOOM_STEP)
  }, [applyZoom, zoom])
  const zoomOut = useCallback(() => {
    applyZoom(zoom / ZOOM_STEP)
  }, [applyZoom, zoom])
  const zoomFit = useCallback(() => {
    const container = gridContainerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const next = fitZoom({
      contentWidth: baseWidth,
      contentHeight: baseHeight,
      viewportWidth: rect.width,
      viewportHeight: rect.height,
      padding: 16,
    })
    setZoom(next)
    // Recenter after layout settles.
    requestAnimationFrame(() => {
      const c = gridContainerRef.current
      if (!c) return
      c.scrollLeft = (baseWidth * next - c.clientWidth) / 2
      c.scrollTop = (baseHeight * next - c.clientHeight) / 2
    })
  }, [baseHeight, baseWidth])

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      // Only treat as zoom when a modifier is held; otherwise let the user
      // scroll the grid normally. Trackpad pinch gestures arrive with
      // ctrlKey synthesized by the browser, so they zoom out of the box.
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * 0.0015)
      applyZoom(zoom * factor, { clientX: e.clientX, clientY: e.clientY })
    },
    [applyZoom, zoom],
  )

  // Wheel needs a non-passive listener to call preventDefault. React's
  // synthetic onWheel attaches as passive in modern React, so we attach
  // imperatively.
  useEffect(() => {
    const container = gridContainerRef.current
    if (!container) return
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // Center the content the first time we have a viewport. Without this the
  // user can land on a tall track scrolled to the top-left corner.
  const didInitialCenterRef = useRef(false)
  useLayoutEffect(() => {
    if (didInitialCenterRef.current) return
    const container = gridContainerRef.current
    if (!container) return
    if (container.clientWidth === 0 || container.clientHeight === 0) return
    container.scrollLeft = Math.max(0, (renderedWidth - container.clientWidth) / 2)
    container.scrollTop = Math.max(0, (renderedHeight - container.clientHeight) / 2)
    didInitialCenterRef.current = true
  }, [renderedHeight, renderedWidth])

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'touch') return
    const pinch = pinchRef.current ?? {
      pointers: new Map<number, { x: number; y: number }>(),
      startDistance: 0,
      startZoom: zoom,
    }
    pinch.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.pointers.size === 2) {
      const [a, b] = Array.from(pinch.pointers.values())
      pinch.startDistance = distance(a.x, a.y, b.x, b.y)
      pinch.startZoom = zoom
    }
    pinchRef.current = pinch
  }, [zoom])

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const pinch = pinchRef.current
    if (!pinch || !pinch.pointers.has(e.pointerId)) return
    pinch.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.pointers.size !== 2 || pinch.startDistance <= 0) return
    e.preventDefault()
    const [a, b] = Array.from(pinch.pointers.values())
    const cur = distance(a.x, a.y, b.x, b.y)
    const next = pinchZoom(pinch.startZoom, pinch.startDistance, cur)
    const midX = (a.x + b.x) / 2
    const midY = (a.y + b.y) / 2
    applyZoom(next, { clientX: midX, clientY: midY })
  }, [applyZoom])

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const pinch = pinchRef.current
    if (!pinch) return
    pinch.pointers.delete(e.pointerId)
    if (pinch.pointers.size < 2) {
      pinch.startDistance = 0
    }
    if (pinch.pointers.size === 0) {
      pinchRef.current = null
    }
  }, [])

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Suppress the click that would otherwise fire after a pinch gesture
    // releases its last pointer. Without this a two-finger zoom can
    // accidentally place a piece.
    if (pinchRef.current !== null) return
    const cell = cellFromEvent(e)
    if (cell) applyTool(cell.row, cell.col)
  }, [applyTool])

  const handleSvgContextMenu = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const cell = cellFromEvent(e)
    if (!cell) return
    e.preventDefault()
    setStartOrReverse(cell.row, cell.col)
  }, [setStartOrReverse])

  function reverseDirection() {
    if (pieces.length < 2) return
    setPieces((prev) => reverseStartDirection(prev))
    if (error !== null) setError(null)
  }

  function clearAll() {
    setPieces([])
    setSelectionAnchor(null)
    setSelectedCells(new Set())
    setError(null)
  }

  function clearSelection() {
    setSelectionAnchor(null)
    setSelectedCells(new Set())
  }

  function applyTemplate(templateId: string) {
    const template = getTrackTemplate(templateId)
    if (template === null) return
    const nextPieces = cloneTemplatePieces(template)
    setPieces(nextPieces)
    setCheckpointCount(null)
    setCheckpoints([])
    setDecorations([])
    setSelectionAnchor(null)
    setSelectedCells(
      new Set(nextPieces.map((piece) => selectedCellKey(piece.row, piece.col))),
    )
    setError(null)
  }

  const transformCheckpoints = useCallback((
    transform: (row: number, col: number) => { row: number; col: number },
  ) => {
    setCheckpoints((current) =>
      current.map((checkpoint) =>
        selectedCells.has(selectedCellKey(checkpoint.row, checkpoint.col))
          ? transform(checkpoint.row, checkpoint.col)
          : checkpoint,
      ),
    )
  }, [selectedCells])

  const nudgeSelection = useCallback((rowDelta: number, colDelta: number) => {
    if (selectedPieceCount === 0) return
    const nextPieces = moveSelectedPieces(pieces, selectedCells, rowDelta, colDelta)
    if (nextPieces === pieces) {
      setError('selection blocked')
      return
    }
    setPieces(nextPieces)
    transformCheckpoints((row, col) => ({
      row: row + rowDelta,
      col: col + colDelta,
    }))
    setSelectedCells(shiftSelectionKeys(selectedCells, rowDelta, colDelta))
    setSelectionAnchor(null)
    setError(null)
  }, [pieces, selectedCells, selectedPieceCount, setPieces, transformCheckpoints])

  const rotateSelection = useCallback(() => {
    if (selectedPieceCount === 0) return
    const nextPieces = rotateSelectedPieces(pieces, selectedCells)
    if (nextPieces === pieces) return
    setPieces(nextPieces)
    setSelectionAnchor(null)
    setError(null)
  }, [pieces, selectedCells, selectedPieceCount, setPieces])

  const flipSelection = useCallback((axis: 'horizontal' | 'vertical') => {
    if (selectedPieceCount === 0) return
    const nextPieces = flipSelectedPieces(pieces, selectedCells, axis)
    if (nextPieces === pieces) {
      setError('selection blocked')
      return
    }
    const nextSelection = flipSelectionKeys(selectedCells, axis)
    setPieces(nextPieces)
    transformCheckpoints((row, col) =>
      flipCellWithinSelection(row, col, selectedCells, axis),
    )
    setSelectedCells(nextSelection)
    setSelectionAnchor(null)
    setError(null)
  }, [pieces, selectedCells, selectedPieceCount, setPieces, transformCheckpoints])

  const undoEdit = useCallback(() => {
    setHistory((prev) => undoHistory(prev))
    setError(null)
  }, [])

  const redoEdit = useCallback(() => {
    setHistory((prev) => redoHistory(prev))
    setError(null)
  }, [])

  const undoAvailable = canUndo(history)
  const redoAvailable = canRedo(history)

  useEffect(() => {
    setCheckpoints((current) => {
      const valid = new Set(pieces.slice(1).map((p) => cellKey(p.row, p.col)))
      const next = current.filter((cp) => valid.has(cellKey(cp.row, cp.col)))
      return next.length === current.length ? current : next
    })
  }, [pieces])

  useEffect(() => {
    setDecorations((current) => {
      const pieceCells = new Set(pieces.map((p) => cellKey(p.row, p.col)))
      const next = current.filter((item) => !pieceCells.has(decorationCellKey(item)))
      return next.length === current.length ? current : next
    })
  }, [pieces])

  useEffect(() => {
    if (!TRACK_DECORATION_KINDS.includes(tool as TrackDecorationKind)) return
    if (decorationToolSet.has(tool as TrackDecorationKind)) return
    setTool(decorationPalette[0] ?? 'straight')
  }, [decorationPalette, decorationToolSet, tool])

  // Keyboard shortcuts: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z = redo, also
  // Ctrl/Cmd+Y = redo for Windows muscle memory. Ignored when typing in an
  // input or select so the checkpoint number field and mood pickers behave
  // normally.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as Element | null
      if (target) {
        const tag = target.tagName
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          (target as HTMLElement).isContentEditable
        ) {
          return
        }
      }
      const mod = e.ctrlKey || e.metaKey
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) {
          if (canRedo(history)) redoEdit()
        } else {
          if (canUndo(history)) undoEdit()
        }
      } else if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        if (canRedo(history)) redoEdit()
      } else if (!mod && selectedPieceCount > 0) {
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          nudgeSelection(-1, 0)
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          nudgeSelection(1, 0)
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          nudgeSelection(0, -1)
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          nudgeSelection(0, 1)
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault()
          rotateSelection()
        } else if (e.key === 'h' || e.key === 'H') {
          e.preventDefault()
          flipSelection('horizontal')
        } else if (e.key === 'v' || e.key === 'V') {
          e.preventDefault()
          flipSelection('vertical')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    flipSelection,
    history,
    nudgeSelection,
    redoEdit,
    rotateSelection,
    selectedPieceCount,
    undoEdit,
  ])

  // Clamp the override whenever piece count drops below it.
  const cpMax = pieces.length
  const cpMin = Math.min(MIN_CHECKPOINT_COUNT, cpMax)
  const effectiveCp =
    checkpointCount === null
      ? cpMax
      : Math.max(cpMin, Math.min(cpMax, checkpointCount))
  const cpInputDisabled = cpMax < MIN_CHECKPOINT_COUNT
  const customCheckpointsActive = checkpoints.length > 0
  const customCheckpointValid =
    !customCheckpointsActive || checkpoints.length >= MIN_CHECKPOINT_COUNT

  function onCpChange(raw: string) {
    if (raw === '') {
      setCheckpointCount(null)
      return
    }
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    const clamped = Math.max(cpMin, Math.min(cpMax, Math.round(n)))
    setCheckpointCount(clamped === cpMax ? null : clamped)
  }

  async function save() {
    if (!validation.ok || saving) return
    setSaving(true)
    setError(null)
    try {
      const reqBody: {
        pieces: Piece[]
        checkpointCount?: number
        checkpoints?: TrackCheckpoint[]
        biome?: TrackBiome
        decorations?: TrackDecoration[]
        mood?: TrackMood
        transmission?: TrackTransmissionMode
      } = { pieces }
      if (customCheckpointsActive) {
        reqBody.checkpoints = checkpoints
      } else if (checkpointCount !== null && effectiveCp !== cpMax) {
        reqBody.checkpointCount = effectiveCp
      }
      const sanitized = sanitizeTrackMood({
        timeOfDay: moodTimeOfDay ?? undefined,
        weather: moodWeather ?? undefined,
      })
      if (sanitized !== null) {
        reqBody.mood = sanitized
      }
      if (biome !== null) {
        reqBody.biome = biome
      }
      if (decorations.length > 0) {
        reqBody.decorations = decorations
      }
      if (transmission !== 'automatic') {
        reqBody.transmission = transmission
      }
      const res = await fetch(`/api/track/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(reqBody),
      })
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string
          reason?: string
        }
        setError(errBody.reason || errBody.error || `save failed (${res.status})`)
        setSaving(false)
        return
      }
      const okBody = (await res.json()) as { versionHash: string }
      // Record this slug in the local "tracks I built" log so the home page
      // surfaces it under "Tracks you built". Defensive: a thrown writer
      // (quota etc.) is swallowed inside recordMyTrack so the post-save
      // navigation always proceeds.
      recordMyTrack(slug)
      router.push(`/${slug}?v=${okBody.versionHash}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed')
      setSaving(false)
    }
  }

  function cancel() {
    router.push(`/${slug}`)
  }

  const rows: number[] = []
  for (let r = rowMin; r <= rowMax; r++) rows.push(r)
  const cols: number[] = []
  for (let c = colMin; c <= colMax; c++) cols.push(c)

  return (
    <div style={root}>
      <div style={header}>
        <div style={titleStyle}>Track editor: /{slug}</div>
        <div style={hint}>
          Pick a tool below, then tap a cell to place it. Tap the selected
          tool again to rotate. Tap a placed piece to rotate it in place.
          Right-click (or long-press on touch) is a shortcut for the Set
          start tool.
        </div>
        {forkingFromHash ? (
          <div style={forkBanner}>
            <span style={forkBannerLabel}>FORKING</span>
            <span style={forkBannerText}>
              Editing a copy of v{shortHash(forkingFromHash)}. Saving creates a
              new version on /{slug}; the original stays put.
            </span>
            <button
              type="button"
              onClick={() => router.push(`/${slug}/edit`)}
              style={forkBannerBtn}
            >
              Switch to latest
            </button>
          </div>
        ) : null}
      </div>

      <div style={paletteBar} role="toolbar" aria-label="Piece palette">
        {tools.map((t) => {
          const selected = t === tool
          const isPiece = (PIECE_TOOLS as Tool[]).includes(t)
          const isDecoration = decorationToolSet.has(t as TrackDecorationKind)
          return (
            <button
              key={t}
              type="button"
              onClick={() => selectTool(t)}
              style={selected ? toolBtnSelected : toolBtnIdle}
              aria-pressed={selected}
              aria-label={
                selected && isPiece
                  ? `${TOOL_LABELS[t]}, tap again to rotate`
                  : TOOL_LABELS[t]
              }
            >
              <svg width={36} height={36} viewBox={`0 0 ${CELL} ${CELL}`}>
                {t === 'erase' ? (
                  <EraseGlyph />
                ) : t === 'start' ? (
                  <StartGlyph />
                ) : t === 'select' ? (
                  <SelectGlyph />
                ) : t === 'checkpoint' ? (
                  <CheckpointGlyph />
                ) : isDecoration ? (
                  <DecorationGlyph kind={t as TrackDecorationKind} />
                ) : (
                  <PieceGlyph
                    piece={{
                      type: t as PieceType,
                      row: 0,
                      col: 0,
                      rotation: toolRotation,
                    }}
                  />
                )}
              </svg>
              <span style={toolBtnLabel}>{TOOL_LABELS[t]}</span>
            </button>
          )
        })}
        <span style={paletteHint}>{paletteHintText(tool, toolRotation)}</span>
      </div>

      {templatePanelOpen ? (
        <div style={templatePanel}>
          <div style={templateHeader}>
            <div>
              <div style={advancedTitle}>Templates</div>
              <p style={templateHelp}>
                Replace the current layout with a valid starter loop. Mood,
                biome, transmission, and other advanced settings stay as-is.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTemplatePanelOpen(false)}
              style={btnGhostSmall}
            >
              Hide
            </button>
          </div>
          <div style={templateGrid}>
            {TRACK_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => applyTemplate(template.id)}
                style={templateCard}
              >
                <TemplatePreview pieces={template.pieces} />
                <span style={templateCardTitle}>{template.label}</span>
                <span style={templateCardCopy}>{template.description}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div style={gridOuter}>
        <div style={gridWrap} ref={gridContainerRef}>
          <svg
            width={renderedWidth}
            height={renderedHeight}
            viewBox={`0 0 ${baseWidth} ${baseHeight}`}
            style={{
              display: 'block',
              background: '#162233',
              cursor: 'pointer',
              // `none` lets us own pinch gestures; without it the browser
              // intercepts two-finger touches as page zoom.
              touchAction: 'none',
            }}
            onClick={handleSvgClick}
            onContextMenu={handleSvgContextMenu}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {rows.map((r) =>
              cols.map((c) => {
                const x = (c - colMin) * CELL
                const y = (r - rowMin) * CELL
                const key = cellKey(r, c)
                const piece = cellMap.get(key)
                const isStart = key === startKey
                return (
                  <Cell
                    key={key}
                    row={r}
                    col={c}
                    x={x}
                    y={y}
                    piece={piece}
                    isStart={isStart}
                    hasCheckpoint={checkpointKeys.has(key)}
                    decoration={decorationMap.get(key)}
                    startExitDir={isStart ? startExitDir : null}
                    isSelected={selectedCells.has(selectedCellKey(r, c))}
                    isSelectionAnchor={
                      selectionAnchor?.row === r && selectionAnchor.col === c
                    }
                  />
                )
              }),
            )}
          </svg>
        </div>
        <div style={editHistoryToolbar} role="toolbar" aria-label="Edit history">
          <button
            type="button"
            onClick={undoEdit}
            disabled={!undoAvailable}
            style={{
              ...floatingIconBtn,
              opacity: undoAvailable ? 1 : 0.45,
              cursor: undoAvailable ? 'pointer' : 'not-allowed',
            }}
            title="Undo (Ctrl+Z)"
            aria-label="Undo edit"
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            onClick={redoEdit}
            disabled={!redoAvailable}
            style={{
              ...floatingIconBtn,
              opacity: redoAvailable ? 1 : 0.45,
              cursor: redoAvailable ? 'pointer' : 'not-allowed',
            }}
            title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
            aria-label="Redo edit"
          >
            <RedoIcon />
          </button>
        </div>
        {selectedPieceCount > 0 ? (
          <div
            style={selectionTransformToolbar}
            role="toolbar"
            aria-label="Selection transforms"
          >
            <span style={selectionTransformLabel}>
              {selectedPieceCount} selected
            </span>
            <button
              type="button"
              onClick={() => nudgeSelection(-1, 0)}
              style={transformBtn}
              title="Move selected pieces up"
            >
              Up
            </button>
            <button
              type="button"
              onClick={() => nudgeSelection(1, 0)}
              style={transformBtn}
              title="Move selected pieces down"
            >
              Down
            </button>
            <button
              type="button"
              onClick={() => nudgeSelection(0, -1)}
              style={transformBtn}
              title="Move selected pieces left"
            >
              Left
            </button>
            <button
              type="button"
              onClick={() => nudgeSelection(0, 1)}
              style={transformBtn}
              title="Move selected pieces right"
            >
              Right
            </button>
            <button
              type="button"
              onClick={rotateSelection}
              style={transformBtnWide}
              title="Rotate selected pieces"
            >
              Rotate
            </button>
            <button
              type="button"
              onClick={() => flipSelection('horizontal')}
              style={transformBtnWide}
              title="Flip selected pieces horizontally"
            >
              Flip H
            </button>
            <button
              type="button"
              onClick={() => flipSelection('vertical')}
              style={transformBtnWide}
              title="Flip selected pieces vertically"
            >
              Flip V
            </button>
          </div>
        ) : null}
        <div style={zoomToolbar} role="toolbar" aria-label="Zoom controls">
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoom <= ZOOM_MIN + 1e-6}
            style={zoomBtn}
            aria-label="Zoom out"
            title="Zoom out (Ctrl + scroll)"
          >
            -
          </button>
          <button
            type="button"
            onClick={zoomFit}
            style={zoomBtnWide}
            aria-label="Fit track to viewport"
            title="Fit track to viewport"
          >
            Fit
          </button>
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoom >= ZOOM_MAX - 1e-6}
            style={zoomBtn}
            aria-label="Zoom in"
            title="Zoom in (Ctrl + scroll)"
          >
            +
          </button>
          <span style={zoomReadout} aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      {advancedOpen ? (
        <div style={advancedPanel}>
          <div style={advancedHeader}>
            <span style={advancedTitle}>Advanced</span>
            <button
              onClick={() => setAdvancedOpen(false)}
              style={btnGhostSmall}
            >
              Hide
            </button>
          </div>
          <div style={advancedRow}>
            <div style={advancedCopy}>
              <div style={advancedLabel}>Checkpoints</div>
              <p style={advancedHelp}>
                Invisible gates around the loop. The car has to cross every
                gate, in order, before a lap counts. The default is one gate
                per piece, which is the strictest setting and forces the
                player to follow the whole track. Lowering the count spreads
                the gates out evenly so racers can experiment with shortcut
                lines or cut a corner without invalidating the lap. Most
                tracks should leave this on default.
              </p>
            </div>
            <div style={advancedControl}>
              <input
                type="number"
                min={cpMin}
                max={cpMax}
                value={effectiveCp}
                disabled={cpInputDisabled || customCheckpointsActive}
                onChange={(e) => onCpChange(e.target.value)}
                style={cpInput}
                aria-label="Checkpoint count"
              />
              <span style={cpHint}>
                {customCheckpointsActive
                  ? 'custom'
                  : checkpointCount === null
                    ? 'default'
                    : `of ${cpMax}`}
              </span>
              {checkpointCount !== null ? (
                <button
                  onClick={() => setCheckpointCount(null)}
                  style={btnGhostSmall}
                >
                  Reset
                </button>
              ) : null}
              {customCheckpointsActive ? (
                <button
                  onClick={() => setCheckpoints([])}
                  style={btnGhostSmall}
                >
                  Clear custom
                </button>
              ) : null}
            </div>
          </div>
          <div style={advancedRow}>
            <div style={advancedCopy}>
              <div style={advancedLabel}>Transmission</div>
              <p style={advancedHelp}>
                Automatic keeps the classic arcade drive model. Manual adds
                upshift and downshift controls to this track version and gives
                each gear its own acceleration and speed range. Because this
                affects lap behavior, manual tracks save under a different
                version hash.
              </p>
            </div>
            <div style={moodControl}>
              <label style={moodPickerRow}>
                <span style={moodPickerLabel}>Mode</span>
                <select
                  value={transmission}
                  onChange={(e) =>
                    setTransmission(e.target.value as TrackTransmissionMode)
                  }
                  style={moodSelect}
                  aria-label="Track transmission"
                >
                  <option value="automatic">Automatic</option>
                  <option value="manual">Manual shifting</option>
                </select>
              </label>
            </div>
          </div>
          <div style={advancedRow}>
            <div style={advancedCopy}>
              <div style={advancedLabel}>Track biome</div>
              <p style={advancedHelp}>
                Pick the environment theme for this track version. The biome
                changes terrain color, sky tint, road styling, and roadside
                scenery. It is visual only and does not affect physics, lap
                times, or the version hash.
              </p>
            </div>
            <div style={moodControl}>
              <label style={moodPickerRow}>
                <span style={moodPickerLabel}>Biome</span>
                <select
                  value={biome ?? ''}
                  onChange={(e) =>
                    setBiome(
                      e.target.value === ''
                        ? null
                        : (e.target.value as TrackBiome),
                    )
                  }
                  style={moodSelect}
                  aria-label="Track biome"
                >
                  <option value="">Classic forest</option>
                  {TRACK_BIOME_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {TRACK_BIOME_LABELS[name]}
                    </option>
                  ))}
                </select>
              </label>
              <p style={biomeHint}>
                {biome
                  ? TRACK_BIOME_DESCRIPTIONS[biome]
                  : 'Uses the original grass, trees, blue sky, and dark asphalt.'}
              </p>
              {biomeActive ? (
                <button onClick={() => setBiome(null)} style={btnGhostSmall}>
                  Clear biome
                </button>
              ) : null}
            </div>
          </div>
          <div style={advancedRow}>
            <div style={advancedCopy}>
              <div style={advancedLabel}>Decorations</div>
              <p style={advancedHelp}>
                Place cosmetic props on empty grid cells with the decoration
                tools in the palette. The available props follow the current
                biome. Decorations are visual only and do not affect physics,
                lap times, or the version hash.
              </p>
            </div>
            <div style={moodControl}>
              <p style={biomeHint}>
                {decorations.length} of {MAX_DECORATIONS_PER_TRACK} placed.
              </p>
              {decorations.length > 0 ? (
                <button
                  onClick={() => setDecorations([])}
                  style={btnGhostSmall}
                >
                  Clear decorations
                </button>
              ) : null}
            </div>
          </div>
          <div style={advancedRow}>
            <div style={advancedCopy}>
              <div style={advancedLabel}>Track mood</div>
              <p style={advancedHelp}>
                Pick a baked-in time of day or weather and every player who
                races this version will see that look (unless they turn off
                Respect track mood in their Settings). Leave both on Player
                pick to let racers use their own scene preferences. Mood is
                cosmetic only: it does not change physics, the lap times, or
                the version hash, so adding or changing it later does not
                invalidate any leaderboard entry.
              </p>
            </div>
            <div style={moodControl}>
              <label style={moodPickerRow}>
                <span style={moodPickerLabel}>Time of day</span>
                <select
                  value={moodTimeOfDay ?? ''}
                  onChange={(e) =>
                    setMoodTimeOfDay(
                      e.target.value === ''
                        ? null
                        : (e.target.value as TimeOfDay),
                    )
                  }
                  style={moodSelect}
                  aria-label="Track time of day"
                >
                  <option value="">Player pick</option>
                  {TIME_OF_DAY_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {TIME_OF_DAY_LABELS[name]}
                    </option>
                  ))}
                </select>
              </label>
              <label style={moodPickerRow}>
                <span style={moodPickerLabel}>Weather</span>
                <select
                  value={moodWeather ?? ''}
                  onChange={(e) =>
                    setMoodWeather(
                      e.target.value === '' ? null : (e.target.value as Weather),
                    )
                  }
                  style={moodSelect}
                  aria-label="Track weather"
                >
                  <option value="">Player pick</option>
                  {WEATHER_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {WEATHER_LABELS[name]}
                    </option>
                  ))}
                </select>
              </label>
              {moodActive ? (
                <button
                  onClick={() => {
                    setMoodTimeOfDay(null)
                    setMoodWeather(null)
                  }}
                  style={btnGhostSmall}
                >
                  Clear mood
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div style={footer}>
        <div style={status}>
          <span>{pieces.length} / {MAX_PIECES_PER_TRACK} pieces</span>
          <span style={{ color: validation.ok ? '#6ee787' : '#ffb86b' }}>
            {validation.ok ? 'valid closed loop' : (validation.reason ?? 'invalid')}
          </span>
          {checkpointCount !== null ? (
            <span style={cpHint}>
              {effectiveCp} of {cpMax} checkpoints
            </span>
          ) : null}
          {customCheckpointsActive ? (
            <span style={customCheckpointValid ? cpHint : invalidStatus}>
              {checkpoints.length} custom checkpoints
            </span>
          ) : null}
          {decorations.length > 0 ? (
            <span style={cpHint}>
              {decorations.length} decorations
            </span>
          ) : null}
          {selectedCells.size > 0 ? (
            <span style={cpHint}>
              {selectedPieceCount} selected pieces, {selectedCells.size} cells
            </span>
          ) : null}
          {error ? <span style={{ color: '#ff6b6b' }}>{error}</span> : null}
        </div>
        <div style={buttons}>
          <button onClick={cancel} style={btnGhost}>Cancel</button>
          <button
            onClick={reverseDirection}
            style={btnGhost}
            disabled={pieces.length < 2}
          >
            Reverse direction
          </button>
          <button onClick={clearAll} style={btnGhost} disabled={pieces.length === 0}>
            Clear
          </button>
          <button
            onClick={clearSelection}
            style={btnGhost}
            disabled={selectedCells.size === 0 && selectionAnchor === null}
          >
            Clear selection
          </button>
          {!templatePanelOpen ? (
            <button
              onClick={() => setTemplatePanelOpen(true)}
              style={btnGhost}
            >
              Templates
            </button>
          ) : null}
          {!advancedOpen ? (
            <button onClick={() => setAdvancedOpen(true)} style={btnGhost}>
              Advanced
              {checkpointCount !== null ||
              customCheckpointsActive ||
              biomeActive ||
              decorations.length > 0 ||
              moodActive ||
              transmission !== 'automatic' ? (
                <span style={advancedDot} />
              ) : null}
            </button>
          ) : null}
          <button
            onClick={save}
            disabled={!validation.ok || saving || !customCheckpointValid}
            style={{
              ...btnPrimary,
              opacity: validation.ok && !saving && customCheckpointValid ? 1 : 0.5,
              cursor:
                validation.ok && !saving && customCheckpointValid
                  ? 'pointer'
                  : 'not-allowed',
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface CellProps {
  row: number
  col: number
  x: number
  y: number
  piece: Piece | undefined
  isStart: boolean
  hasCheckpoint: boolean
  decoration: TrackDecoration | undefined
  startExitDir: Dir | null
  isSelected: boolean
  isSelectionAnchor: boolean
}

const Cell = memo(function Cell({
  row,
  col,
  x,
  y,
  piece,
  isStart,
  hasCheckpoint,
  decoration,
  startExitDir,
  isSelected,
  isSelectionAnchor,
}: CellProps) {
  return (
    <g transform={`translate(${x}, ${y})`} data-row={row} data-col={col}>
      <rect
        width={CELL}
        height={CELL}
        fill={piece ? (isStart ? '#1f3a2a' : '#222e40') : '#1a2534'}
        stroke={isStart ? '#6ee787' : '#2b3a50'}
        strokeWidth={isStart ? 2 : 1}
      />
      {piece ? <PieceGlyph piece={piece} /> : null}
      {!piece && decoration ? (
        <DecorationGlyph kind={decoration.kind} />
      ) : null}
      {hasCheckpoint ? (
        <g style={{ pointerEvents: 'none' }}>
          <circle
            cx={CELL / 2}
            cy={CELL / 2}
            r={10}
            fill="rgba(255, 179, 71, 0.18)"
            stroke="#ffb347"
            strokeWidth={2}
          />
          <path
            d={`M ${CELL / 2 - 4} ${CELL / 2 + 10} L ${CELL / 2 - 4} ${CELL / 2 - 10} L ${CELL / 2 + 9} ${CELL / 2 - 6} L ${CELL / 2 - 4} ${CELL / 2 - 2}`}
            fill="#ffb347"
          />
        </g>
      ) : null}
      {isStart ? (
        <>
          <text
            x={CELL / 2}
            y={12}
            textAnchor="middle"
            fontSize={9}
            fontWeight={700}
            fill="#6ee787"
            style={{ pointerEvents: 'none', letterSpacing: 1 }}
          >
            START
          </text>
          {startExitDir !== null ? (
            <polygon
              points={`${CELL / 2 - 5},${CELL / 2 + 3} ${CELL / 2 + 5},${CELL / 2 + 3} ${CELL / 2},${CELL / 2 - 5}`}
              transform={`rotate(${startExitDir * 90} ${CELL / 2} ${CELL / 2})`}
              fill="#6ee787"
              style={{ pointerEvents: 'none' }}
            />
          ) : null}
        </>
      ) : null}
      {isSelected ? (
        <rect
          x={3}
          y={3}
          width={CELL - 6}
          height={CELL - 6}
          fill="rgba(88, 166, 255, 0.16)"
          stroke={isSelectionAnchor ? '#ffd36b' : '#58a6ff'}
          strokeWidth={isSelectionAnchor ? 3 : 2}
          strokeDasharray={isSelectionAnchor ? '5 4' : undefined}
          style={{ pointerEvents: 'none' }}
        />
      ) : null}
    </g>
  )
})

function StartGlyph() {
  const cx = CELL / 2
  const cy = CELL / 2
  const r = CELL * 0.32
  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle cx={cx} cy={cy} r={r} stroke="#6ee787" strokeWidth={3} fill="none" />
      <polygon
        points={`${cx - 7},${cy + 4} ${cx + 7},${cy + 4} ${cx},${cy - 8}`}
        fill="#6ee787"
      />
    </g>
  )
}

function paletteHintText(tool: Tool, rotation: Rotation): string {
  if (tool === 'select') {
    return 'Tap one cell to anchor selection, then tap another to select the rectangle.'
  }
  if (tool === 'erase') return 'Tap a placed piece to remove it.'
  if (tool === 'start') {
    return 'Tap any piece to make it the start. Tap the current start to reverse direction.'
  }
  if (tool === 'checkpoint') {
    return 'Tap track pieces to toggle custom checkpoints. Place at least 3.'
  }
  if (TRACK_DECORATION_KINDS.includes(tool as TrackDecorationKind)) {
    return 'Tap empty cells to place or replace decorations. Tap the same prop to remove it.'
  }
  return `Rotation ${rotation}°. Tap the tile above to spin it.`
}

function SelectGlyph() {
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect
        x={12}
        y={12}
        width={32}
        height={32}
        rx={3}
        fill="rgba(88, 166, 255, 0.16)"
        stroke="#58a6ff"
        strokeWidth={4}
        strokeDasharray="6 4"
      />
      <circle cx={12} cy={12} r={4} fill="#ffd36b" />
      <circle cx={44} cy={44} r={4} fill="#58a6ff" />
    </g>
  )
}

function TemplatePreview({ pieces }: { pieces: Piece[] }) {
  const bounds = getBounds(pieces)
  const width = (bounds.colMax - bounds.colMin + 1) * CELL
  const height = (bounds.rowMax - bounds.rowMin + 1) * CELL
  return (
    <svg
      width={112}
      height={78}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={templatePreview}
    >
      {pieces.map((piece) => (
        <g
          key={`${piece.row},${piece.col}`}
          transform={`translate(${(piece.col - bounds.colMin) * CELL}, ${(piece.row - bounds.rowMin) * CELL})`}
        >
          <rect width={CELL} height={CELL} fill="#1a2534" />
          <PieceGlyph piece={piece} />
        </g>
      ))}
    </svg>
  )
}

function EraseGlyph() {
  const cx = CELL / 2
  const cy = CELL / 2
  const r = CELL * 0.32
  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle cx={cx} cy={cy} r={r} stroke="#ff6b6b" strokeWidth={4} fill="none" />
      <line
        x1={cx - r * 0.7}
        y1={cy - r * 0.7}
        x2={cx + r * 0.7}
        y2={cy + r * 0.7}
        stroke="#ff6b6b"
        strokeWidth={4}
      />
    </g>
  )
}

function CheckpointGlyph() {
  const cx = CELL / 2
  const cy = CELL / 2
  return (
    <g style={{ pointerEvents: 'none' }}>
      <line
        x1={cx - 8}
        y1={cy + 14}
        x2={cx - 8}
        y2={cy - 14}
        stroke="#ffb347"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <path
        d={`M ${cx - 6} ${cy - 14} L ${cx + 13} ${cy - 8} L ${cx - 6} ${cy - 2} Z`}
        fill="#ffb347"
      />
    </g>
  )
}

function DecorationGlyph({ kind }: { kind: TrackDecorationKind }) {
  const cx = CELL / 2
  const cy = CELL / 2
  if (kind === 'rock') {
    return (
      <g style={{ pointerEvents: 'none' }}>
        <ellipse cx={cx} cy={cy + 4} rx={13} ry={8} fill="#7b7f84" />
        <path
          d={`M ${cx - 10} ${cy + 3} L ${cx - 2} ${cy - 5} L ${cx + 10} ${cy + 2}`}
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={2}
          fill="none"
        />
      </g>
    )
  }
  if (kind === 'cactus') {
    return (
      <g style={{ pointerEvents: 'none' }} stroke="#4f7f35" strokeWidth={7} strokeLinecap="round">
        <line x1={cx} y1={cy + 15} x2={cx} y2={cy - 14} />
        <path d={`M ${cx - 2} ${cy - 1} H ${cx - 13} V ${cy - 9}`} fill="none" />
        <path d={`M ${cx + 2} ${cy + 5} H ${cx + 13} V ${cy - 2}`} fill="none" />
      </g>
    )
  }
  if (kind === 'building') {
    return (
      <g style={{ pointerEvents: 'none' }}>
        <rect x={cx - 13} y={cy - 16} width={26} height={32} rx={2} fill="#444b55" />
        {[cx - 7, cx + 3].map((x) =>
          [cy - 9, cy, cy + 9].map((y) => (
            <rect key={`${x}-${y}`} x={x} y={y} width={5} height={4} fill="#ffd36b" opacity={0.7} />
          )),
        )}
      </g>
    )
  }
  if (kind === 'snowPile') {
    return (
      <g style={{ pointerEvents: 'none' }}>
        <ellipse cx={cx} cy={cy + 6} rx={16} ry={8} fill="#f1f5f9" />
        <circle cx={cx - 7} cy={cy + 2} r={7} fill="#e2e8f0" />
        <circle cx={cx + 5} cy={cy} r={9} fill="#f8fafc" />
      </g>
    )
  }
  if (kind === 'palm') {
    return (
      <g style={{ pointerEvents: 'none' }}>
        <line x1={cx - 2} y1={cy + 16} x2={cx + 4} y2={cy - 3} stroke="#7c4a25" strokeWidth={5} strokeLinecap="round" />
        <path d={`M ${cx + 4} ${cy - 7} C ${cx - 12} ${cy - 16} ${cx - 14} ${cy - 3} ${cx + 2} ${cy - 2}`} fill="#2e8f63" />
        <path d={`M ${cx + 4} ${cy - 7} C ${cx + 18} ${cy - 16} ${cx + 18} ${cy - 2} ${cx + 5} ${cy - 1}`} fill="#57b26b" />
      </g>
    )
  }
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={cx - 4} y={cy + 6} width={8} height={12} rx={2} fill="#6b4423" />
      <polygon
        points={`${cx},${cy - 18} ${cx - 16},${cy + 8} ${cx + 16},${cy + 8}`}
        fill={kind === 'pine' ? '#2f6b46' : '#4caf50'}
      />
      {kind === 'tree' ? (
        <polygon points={`${cx},${cy - 10} ${cx - 12},${cy + 12} ${cx + 12},${cy + 12}`} fill="#66bb6a" />
      ) : null}
    </g>
  )
}

function PieceGlyph({ piece }: { piece: Piece }) {
  const cx = CELL / 2
  const cy = CELL / 2
  const stroke = '#ffd36b'
  const road = '#4a5a70'
  const roadWidth = CELL * 0.4
  return (
    <g transform={`rotate(${piece.rotation} ${cx} ${cy})`}>
      {piece.type === 'straight' ? (
        <>
          <rect
            x={cx - roadWidth / 2}
            y={0}
            width={roadWidth}
            height={CELL}
            fill={road}
          />
          <line
            x1={cx}
            y1={4}
            x2={cx}
            y2={CELL - 4}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        </>
      ) : null}
      {piece.type === 'right90' ? (
        <>
          <path
            d={`M ${cx - roadWidth / 2} ${CELL}
                L ${cx - roadWidth / 2} ${cx + roadWidth / 2}
                A ${cx + roadWidth / 2} ${cx + roadWidth / 2} 0 0 0 ${CELL} ${cx - roadWidth / 2}
                L ${CELL} ${cx + roadWidth / 2}
                A ${cx - roadWidth / 2} ${cx - roadWidth / 2} 0 0 1 ${cx + roadWidth / 2} ${CELL}
                Z`}
            fill={road}
          />
          <path
            d={`M ${cx} ${CELL} A ${cx} ${cx} 0 0 0 ${CELL} ${cx}`}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="none"
          />
        </>
      ) : null}
      {piece.type === 'left90' ? (
        <>
          <path
            d={`M ${cx + roadWidth / 2} ${CELL}
                L ${cx + roadWidth / 2} ${cx + roadWidth / 2}
                A ${cx + roadWidth / 2} ${cx + roadWidth / 2} 0 0 1 0 ${cx - roadWidth / 2}
                L 0 ${cx + roadWidth / 2}
                A ${cx - roadWidth / 2} ${cx - roadWidth / 2} 0 0 0 ${cx - roadWidth / 2} ${CELL}
                Z`}
            fill={road}
          />
          <path
            d={`M ${cx} ${CELL} A ${cx} ${cx} 0 0 1 0 ${cx}`}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="none"
          />
        </>
      ) : null}
      {piece.type === 'scurve' || piece.type === 'scurveLeft' ? (
        <>
          {/*
            Top-down SVG: y grows downward, so a piece that travels south->north
            in world coords (rotation 0) goes from y=CELL (bottom of glyph) to
            y=0 (top of glyph). The snake bends right (+x) first for 'scurve'
            and left (-x) first for 'scurveLeft'; we draw the scurve glyph and
            mirror the inner group across x = cx for the left variant.
          */}
          <g
            transform={
              piece.type === 'scurveLeft'
                ? `translate(${2 * cx} 0) scale(-1 1)`
                : undefined
            }
          >
            <path
              d={`M ${cx - roadWidth / 2} ${CELL}
                  L ${cx - roadWidth / 2} ${CELL * 0.78}
                  C ${cx - roadWidth / 2} ${CELL * 0.6} ${cx + CELL * 0.32 - roadWidth / 2} ${CELL * 0.6} ${cx + CELL * 0.32 - roadWidth / 2} ${CELL * 0.42}
                  C ${cx + CELL * 0.32 - roadWidth / 2} ${CELL * 0.24} ${cx - roadWidth / 2} ${CELL * 0.24} ${cx - roadWidth / 2} ${CELL * 0.06}
                  L ${cx - roadWidth / 2} 0
                  L ${cx + roadWidth / 2} 0
                  L ${cx + roadWidth / 2} ${CELL * 0.06}
                  C ${cx + roadWidth / 2} ${CELL * 0.24} ${cx + CELL * 0.32 + roadWidth / 2} ${CELL * 0.24} ${cx + CELL * 0.32 + roadWidth / 2} ${CELL * 0.42}
                  C ${cx + CELL * 0.32 + roadWidth / 2} ${CELL * 0.6} ${cx + roadWidth / 2} ${CELL * 0.6} ${cx + roadWidth / 2} ${CELL * 0.78}
                  L ${cx + roadWidth / 2} ${CELL}
                  Z`}
              fill={road}
            />
            <path
              d={`M ${cx} ${CELL}
                  L ${cx} ${CELL * 0.78}
                  C ${cx} ${CELL * 0.6} ${cx + CELL * 0.32} ${CELL * 0.6} ${cx + CELL * 0.32} ${CELL * 0.42}
                  C ${cx + CELL * 0.32} ${CELL * 0.24} ${cx} ${CELL * 0.24} ${cx} ${CELL * 0.06}
                  L ${cx} 0`}
              stroke={stroke}
              strokeWidth={2}
              strokeDasharray="4 4"
              fill="none"
            />
          </g>
        </>
      ) : null}
      {piece.type === 'sweepRight' || piece.type === 'sweepLeft' ? (
        <>
          <g
            transform={
              piece.type === 'sweepLeft'
                ? `translate(${2 * cx} 0) scale(-1 1)`
                : undefined
            }
          >
            <path
              d={`M ${cx} ${CELL}
                  C ${cx} ${CELL * 0.2} ${CELL * 0.8} ${cy} ${CELL} ${cy}`}
              stroke={road}
              strokeWidth={roadWidth}
              strokeLinecap="butt"
              fill="none"
            />
            <path
              d={`M ${cx} ${CELL}
                  C ${cx} ${CELL * 0.2} ${CELL * 0.8} ${cy} ${CELL} ${cy}`}
              stroke={stroke}
              strokeWidth={2}
              strokeDasharray="4 4"
              fill="none"
            />
          </g>
        </>
      ) : null}
      <circle cx={cx} cy={CELL - 8} r={3} fill="#9ad8ff" />
    </g>
  )
}

const root: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: '#0d1420',
  color: 'white',
  fontFamily: 'system-ui, sans-serif',
  display: 'flex',
  flexDirection: 'column',
}
const header: React.CSSProperties = {
  padding: '14px 20px 10px',
  borderBottom: '1px solid #1f2b3d',
}
const titleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  letterSpacing: 0.5,
}
const hint: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.65,
  marginTop: 4,
}
const forkBanner: React.CSSProperties = {
  marginTop: 10,
  padding: '8px 12px',
  background: 'rgba(255, 179, 71, 0.12)',
  border: '1px solid rgba(255, 179, 71, 0.45)',
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  fontSize: 12,
}
const forkBannerLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1.5,
  color: '#ffb347',
  background: 'rgba(255, 179, 71, 0.18)',
  borderRadius: 4,
  padding: '2px 6px',
}
const forkBannerText: React.CSSProperties = {
  color: '#fde9c2',
  flex: 1,
  minWidth: 220,
}
const forkBannerBtn: React.CSSProperties = {
  background: 'transparent',
  color: '#ffb347',
  border: '1px solid rgba(255, 179, 71, 0.5)',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 11,
  fontFamily: 'inherit',
  cursor: 'pointer',
  letterSpacing: 0.4,
}
const paletteBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  borderBottom: '1px solid #1f2b3d',
  background: '#111a28',
  flexWrap: 'wrap',
}
const toolBtnBase: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  padding: '6px 8px',
  borderRadius: 8,
  background: 'transparent',
  border: '1px solid #2b3a50',
  color: 'white',
  cursor: 'pointer',
  fontFamily: 'inherit',
  minWidth: 64,
}
const toolBtnIdle: React.CSSProperties = {
  ...toolBtnBase,
}
const toolBtnSelected: React.CSSProperties = {
  ...toolBtnBase,
  background: '#1f2b3d',
  borderColor: '#ff6b35',
  boxShadow: '0 0 0 1px #ff6b35 inset',
}
const toolBtnLabel: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 0.5,
  opacity: 0.85,
}
const paletteHint: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.6,
  marginLeft: 'auto',
}
const templatePanel: React.CSSProperties = {
  borderBottom: '1px solid #1f2b3d',
  background: '#0f1826',
  padding: '14px 20px',
}
const templateHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
  marginBottom: 12,
}
const templateHelp: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 12,
  lineHeight: 1.4,
  opacity: 0.72,
}
const templateGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
}
const templateCard: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 8,
  border: '1px solid #2b3a50',
  borderRadius: 8,
  background: '#111f30',
  color: 'white',
  padding: 10,
  fontFamily: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
}
const templatePreview: React.CSSProperties = {
  width: '100%',
  height: 78,
  borderRadius: 6,
  background: '#162233',
  border: '1px solid #243247',
}
const templateCardTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
}
const templateCardCopy: React.CSSProperties = {
  fontSize: 11,
  lineHeight: 1.35,
  opacity: 0.72,
}
const gridOuter: React.CSSProperties = {
  flex: 1,
  position: 'relative',
  display: 'flex',
  minHeight: 0,
}
const gridWrap: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  display: 'grid',
  placeItems: 'center',
  padding: 20,
  // Reserve space below for the toolbar so the centered SVG never sits
  // underneath it.
  paddingBottom: 60,
}
const zoomToolbar: React.CSSProperties = {
  position: 'absolute',
  bottom: 12,
  right: 16,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 8px',
  background: 'rgba(13, 20, 32, 0.85)',
  border: '1px solid #2b3a50',
  borderRadius: 8,
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
  pointerEvents: 'auto',
}
const editHistoryToolbar: React.CSSProperties = {
  ...zoomToolbar,
  left: 16,
  right: 'auto',
}
const selectionTransformToolbar: React.CSSProperties = {
  ...zoomToolbar,
  left: '50%',
  right: 'auto',
  transform: 'translateX(-50%)',
  gap: 8,
  flexWrap: 'wrap',
  justifyContent: 'center',
  maxWidth: 'calc(100% - 240px)',
}
const selectionTransformLabel: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.75,
  marginRight: 2,
  whiteSpace: 'nowrap',
}
const floatingIconBtn: React.CSSProperties = {
  width: 36,
  height: 36,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: '1px solid #334155',
  borderRadius: 6,
  color: 'white',
  cursor: 'pointer',
  lineHeight: 1,
}
const zoomBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: '1px solid #334155',
  borderRadius: 6,
  color: 'white',
  fontFamily: 'inherit',
  fontSize: 18,
  fontWeight: 700,
  cursor: 'pointer',
  lineHeight: 1,
}
const zoomBtnWide: React.CSSProperties = {
  ...zoomBtn,
  width: 48,
  fontSize: 12,
  letterSpacing: 0.5,
}
const transformBtn: React.CSSProperties = {
  ...zoomBtn,
  width: 48,
  fontSize: 12,
}
const transformBtnWide: React.CSSProperties = {
  ...zoomBtn,
  width: 72,
  fontSize: 12,
}
const zoomReadout: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.7,
  minWidth: 36,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
}
const footer: React.CSSProperties = {
  padding: '12px 20px',
  borderTop: '1px solid #1f2b3d',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  flexWrap: 'wrap',
}
const status: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'center',
  fontSize: 13,
  flexWrap: 'wrap',
}
const buttons: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
}
const cpInput: React.CSSProperties = {
  width: 56,
  background: '#162233',
  color: 'white',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '4px 6px',
  fontFamily: 'inherit',
  fontSize: 13,
}
const cpHint: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.6,
}
const invalidStatus: React.CSSProperties = {
  fontSize: 11,
  color: '#ffb86b',
}
const advancedPanel: React.CSSProperties = {
  borderTop: '1px solid #1f2b3d',
  background: '#111a28',
  padding: '14px 20px',
}
const advancedHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
}
const advancedTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: 'uppercase',
  opacity: 0.7,
}
const advancedRow: React.CSSProperties = {
  display: 'flex',
  gap: 20,
  alignItems: 'flex-start',
  flexWrap: 'wrap',
}
const advancedCopy: React.CSSProperties = {
  flex: '1 1 320px',
  minWidth: 240,
}
const advancedLabel: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 4,
}
const advancedHelp: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  opacity: 0.75,
  margin: 0,
}
const advancedControl: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
}
const moodControl: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 8,
  flexShrink: 0,
  minWidth: 200,
}
const moodPickerRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 12,
}
const moodPickerLabel: React.CSSProperties = {
  width: 78,
  opacity: 0.75,
}
const moodSelect: React.CSSProperties = {
  background: '#162233',
  color: 'white',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '4px 8px',
  fontFamily: 'inherit',
  fontSize: 13,
  minWidth: 130,
}
const biomeHint: React.CSSProperties = {
  margin: 0,
  maxWidth: 260,
  fontSize: 12,
  lineHeight: 1.4,
  opacity: 0.75,
}
const btnGhostSmall: React.CSSProperties = {
  border: '1px solid #334155',
  background: 'transparent',
  color: 'white',
  padding: '4px 10px',
  borderRadius: 6,
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const advancedDot: React.CSSProperties = {
  display: 'inline-block',
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: '#ffd36b',
  marginLeft: 6,
  verticalAlign: 'middle',
}
const btnPrimary: React.CSSProperties = {
  border: 'none',
  background: '#ff6b35',
  color: 'white',
  padding: '10px 18px',
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const btnGhost: React.CSSProperties = {
  border: '1px solid #334155',
  background: 'transparent',
  color: 'white',
  padding: '10px 14px',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

function UndoIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 7H5v4"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 10.5A7 7 0 1 1 8 17"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </svg>
  )
}

function RedoIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15 7h4v4"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.5 10.5A7 7 0 1 0 16 17"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </svg>
  )
}
