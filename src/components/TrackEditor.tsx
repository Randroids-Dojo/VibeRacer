'use client'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type {
  FlexStraightSpec,
  Piece,
  PieceType,
  Rotation,
  TrackBiome,
  TrackCheckpoint,
  TrackDecoration,
  TrackMood,
} from '@/lib/schemas'
import {
  DEFAULT_FLEX_STRAIGHT_SPEC,
  FLEX_STRAIGHT_MAX_LATERAL,
  FLEX_STRAIGHT_MAX_LENGTH,
  FLEX_STRAIGHT_MIN_LENGTH,
  MAX_PIECES_PER_TRACK,
  MIN_CHECKPOINT_COUNT,
} from '@/lib/schemas'
import type { Dir } from '@/game/track'
import { cellKey, validateClosedLoop } from '@/game/track'
import { endpointsOf, isV1Projectable, transformOf } from '@/game/pieceGeometry'
import {
  applyLoopReconciliation,
  findFreePlacementSnap,
  findLoopReconciliation,
  rotatePieceAroundEndpoint,
  setPieceTransform,
  unconnectedEndpoints,
  type FreePlacementSnap,
} from '@/game/continuousAngleEdit'
import { cardinalTurnsOfTheta } from '@/game/pieceFrames'
import { findOverlappingPiecePairs } from '@/game/pieceObb'
import { footprintCellKeys } from '@/game/trackFootprint'
import { CELL_SIZE } from '@/game/cellSize'
import { CONTINUOUS_ANGLE_EDITOR_ENABLED } from '@/lib/editorFeatureFlags'
import type { PieceTransform } from '@/lib/schemas'
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
import type { CarParams } from '@/game/physics'
import { readLastLoaded } from '@/lib/tuningSettings'
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
  pieceTouchesSelection,
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
  'megaSweepRight',
  'megaSweepLeft',
  'hairpin',
  'hairpinTight',
  'hairpinWide',
  'arc45',
  'arc45Left',
  'diagonal',
  'wideArc45Right',
  'wideArc45Left',
  'diagonalSweepRight',
  'diagonalSweepLeft',
  'kinkRight',
  'kinkLeft',
  'offsetStraightRight',
  'offsetStraightLeft',
  'grandSweepRight',
  'grandSweepLeft',
  'flexStraight',
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
  megaSweepRight: 'Mega sweep (right)',
  megaSweepLeft: 'Mega sweep (left)',
  hairpin: 'Hairpin',
  hairpinTight: 'Tight hairpin',
  hairpinWide: 'Wide hairpin',
  arc45: '45 arc (right)',
  arc45Left: '45 arc (left)',
  diagonal: 'Diagonal',
  wideArc45Right: 'Wide 45 (right)',
  wideArc45Left: 'Wide 45 (left)',
  diagonalSweepRight: 'Diag sweep (right)',
  diagonalSweepLeft: 'Diag sweep (left)',
  kinkRight: 'Kink (right)',
  kinkLeft: 'Kink (left)',
  offsetStraightRight: 'Lane offset (right)',
  offsetStraightLeft: 'Lane offset (left)',
  grandSweepRight: 'Grand sweep (right)',
  grandSweepLeft: 'Grand sweep (left)',
  flexStraight: 'Flex angle',
  start: 'Set start',
  checkpoint: 'Checkpoint',
  ...TRACK_DECORATION_LABELS,
}

function clampFlexLength(value: number): number {
  if (!Number.isFinite(value)) return -DEFAULT_FLEX_STRAIGHT_SPEC.dr
  const clamped = Math.round(Math.abs(value))
  if (clamped < FLEX_STRAIGHT_MIN_LENGTH) return FLEX_STRAIGHT_MIN_LENGTH
  if (clamped > FLEX_STRAIGHT_MAX_LENGTH) return FLEX_STRAIGHT_MAX_LENGTH
  return clamped
}

function clampFlexLateral(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FLEX_STRAIGHT_SPEC.dc
  const clamped = Math.round(value)
  if (clamped < -FLEX_STRAIGHT_MAX_LATERAL) return -FLEX_STRAIGHT_MAX_LATERAL
  if (clamped > FLEX_STRAIGHT_MAX_LATERAL) return FLEX_STRAIGHT_MAX_LATERAL
  return clamped
}

function makeFlexSpec(length: number, lateral: number): FlexStraightSpec {
  return {
    dr: -clampFlexLength(length),
    dc: clampFlexLateral(lateral),
  }
}

function flexAngleDegrees(spec: FlexStraightSpec): number {
  // Match sampleFlexStraightLocal exactly: endpoints sit at the south edge
  // midpoint of the anchor cell (z = +HALF) and the north edge midpoint of
  // the exit cell (z = spec.dr * CELL_SIZE - HALF). The vertical delta in
  // cell units is therefore (spec.dr - 1), so the absolute vertical span
  // is |spec.dr - 1| = |spec.dr| + 1 cells (since spec.dr is negative).
  // Lateral span is |spec.dc| cells. Angle measured off cardinal.
  const verticalUnits = Math.abs(spec.dr - 1)
  const lateralUnits = Math.abs(spec.dc)
  return (Math.atan2(lateralUnits, Math.max(verticalUnits, 1e-6)) * 180) / Math.PI
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
  hasCustomMusic?: boolean
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

// Convert a client (mouse / touch) coordinate to a world-space point in
// CELL_SIZE units. Returns null when the SVG has no current screen CTM
// (jsdom or before-first-render cases). Used by the rotate-handle drag
// handlers to map pointer positions to the same world frame the piece
// transforms live in.
//
// World cell `(col, row)` is centered at world `(col * CELL_SIZE,
// row * CELL_SIZE)`. The Cell `<g>` translates to the cell's top-left
// in SVG, and PieceGlyph centers its content at `(CELL/2, CELL/2)`
// inside the cell, so world cell center maps to SVG
// `((col - colMin) * CELL + CELL/2, (row - rowMin) * CELL + CELL/2)`.
// Without the half-cell subtract here, the inverse mapping would treat
// SVG `(0, 0)` as the world center of cell `(colMin, rowMin)` rather
// than its top-left, putting drag pivots / cursor angles half a cell
// off relative to the cell-rendered piece glyphs.
function clientToWorld(
  svgEl: SVGSVGElement,
  clientX: number,
  clientY: number,
  colMin: number,
  rowMin: number,
): { x: number; z: number } | null {
  const ctm = svgEl.getScreenCTM()
  if (ctm === null) return null
  const inv = ctm.inverse()
  const pt = svgEl.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const svgPt = pt.matrixTransform(inv)
  return {
    x: ((svgPt.x - CELL / 2) / CELL + colMin) * CELL_SIZE,
    z: ((svgPt.y - CELL / 2) / CELL + rowMin) * CELL_SIZE,
  }
}

export function TrackEditor({
  slug,
  initialPieces,
  initialCheckpointCount,
  initialCheckpoints = [],
  initialBiome,
  initialDecorations = [],
  initialMood,
  hasCustomMusic = false,
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
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(
    (initialCheckpointCount !== undefined &&
      initialCheckpointCount !== initialPieces.length) ||
      initialMood !== undefined ||
      initialBiome !== undefined ||
      initialDecorations.length > 0 ||
      initialCheckpoints.length > 0,
  )
  const [tool, setTool] = useState<Tool>('straight')
  const [toolRotation, setToolRotation] = useState<Rotation>(0)
  // Per-tool flex spec for the flex-straight tool. Decoupled from the spec
  // already baked into placed pieces so adjusting the slider does not retro
  // edit older flex straights.
  const [toolFlexSpec, setToolFlexSpec] = useState<FlexStraightSpec>(
    DEFAULT_FLEX_STRAIGHT_SPEC,
  )
  const [selectionAnchor, setSelectionAnchor] = useState<{ row: number; col: number } | null>(null)
  const [selectedCells, setSelectedCells] = useState<Set<string>>(() => new Set())
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false)
  const [zoom, setZoom] = useState<number>(ZOOM_DEFAULT)
  const gridContainerRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  // Tracks an active two-finger pinch gesture. Null when no pinch is active.
  const pinchRef = useRef<{
    pointers: Map<number, { x: number; y: number }>
    startDistance: number
    startZoom: number
  } | null>(null)
  // Stage 2 Workstream B rotate handle: state for an active rotate drag.
  // When non-null, the editor swaps `pieces[pieceIdx]` with `preview` for
  // rendering so the user sees the rotation live. On pointer up the
  // preview is committed via `setPieces`. Hidden behind
  // `CONTINUOUS_ANGLE_EDITOR_ENABLED`.
  //
  // `pointerId` is the pointer that started the drag. Subsequent
  // pointermove / pointerup / pointercancel events are filtered by this
  // ID so a second finger landing on a touch device cannot hijack the
  // active rotation or commit it prematurely.
  //
  // `cumulativeDelta` tracks the unwrapped angular sum across the drag,
  // so a single sweep past the +/-PI atan2 branch cut does not jump by
  // 2*PI. `lastCursorAngle` stores the previous frame's atan2 result so
  // the next frame's increment can be normalised into [-PI, PI] before
  // accumulating.
  const [rotateDrag, setRotateDrag] = useState<{
    pieceIdx: number
    pivotIndex: number
    pivotWorld: { x: number; z: number }
    pointerId: number
    lastCursorAngle: number
    cumulativeDelta: number
    startPiece: Piece
    preview: Piece
  } | null>(null)

  // Stage 2 Workstream B slice 4 free-placement drag state. The user
  // can drag any piece around freely with the Select tool active; the
  // dragged piece soft-pulls onto unconnected endpoints within the
  // FREE_PLACEMENT_SNAP_RADIUS / SNAP_ANGLE thresholds defined in
  // continuousAngleEdit.ts. `mode` distinguishes a click that has not
  // yet crossed the drag threshold (`pending`) from a real drag
  // (`active`); pointer-up in `pending` mode lets the regular click
  // handler run for selection, while `active` commits the preview and
  // suppresses the synthetic click.
  const [pieceDrag, setPieceDrag] = useState<{
    pieceIdx: number
    pointerId: number
    startTransform: PieceTransform
    pointerStartWorld: { x: number; z: number }
    preview: Piece
    snap: FreePlacementSnap | null
    mode: 'pending' | 'active'
  } | null>(null)
  // Set by `commitPieceDrag` and read once by the next click event so a
  // committed drag does not leak into a synthetic click that would
  // otherwise re-run the cell's tool action.
  const suppressNextClickRef = useRef(false)
  // Stage 2 Workstream B slice 5: numeric-input editor for power users.
  // Opens via the toolbar's Transform button or via long-press on a
  // piece (touch). When non-null the editor renders a floating panel
  // bound to the piece at `pieceIdx`; on apply, the piece's transform
  // updates via setPieceTransform.
  const [numericEdit, setNumericEdit] = useState<{
    pieceIdx: number
  } | null>(null)
  // Long-press timer for slice 5: pointer-down on a piece in `pending`
  // pieceDrag mode arms a timer; if the user does not move past the
  // drag threshold before it fires, the numeric editor opens. The
  // timer clears whenever the drag advances to `active`, commits, or
  // cancels.
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const LONG_PRESS_MS = 500

  const validation = useMemo(() => validateClosedLoop(pieces), [pieces])
  // Stage 2 Workstream B slice 6: when the loop fails to validate but
  // the chain has exactly two dangling endpoints close to each other,
  // surface a Close Loop button that snaps them shut. Recomputed on
  // every pieces change because the chain shape determines whether
  // reconciliation is offered. Cost is O(E^2) in endpoints because
  // `unconnectedEndpoints` runs `framesConnect` between every pair
  // of endpoints to identify dangling ones, but track sizes are
  // bounded (~64 pieces, ~128 endpoints) so the absolute cost is
  // small relative to the validator's full-loop traversal.
  const loopReconciliation = useMemo(() => {
    if (!CONTINUOUS_ANGLE_EDITOR_ENABLED) return null
    if (validation.ok) return null
    return findLoopReconciliation(pieces)
  }, [pieces, validation.ok])
  // Stage 2 Workstream B slice 7: oriented-bounding-box overlap
  // detection. Surface a warning in the status row when two pieces'
  // OBBs overlap so authors notice cases the validator's duplicate-
  // cell check does not catch. The OBB is built from the AABB of
  // the piece-type's footprint offsets, so non-rectangular
  // footprints (wideArc45, hairpin, flexStraight) over-approximate
  // and the warning can fire on grid-aligned tracks even without
  // duplicate cells; that's why this stays a warning rather than a
  // save-blocking validator. Gated by the editor flag while the
  // continuous-angle UX is rolling out.
  const obbOverlaps = useMemo(() => {
    if (!CONTINUOUS_ANGLE_EDITOR_ENABLED) return []
    return findOverlappingPiecePairs(pieces)
  }, [pieces])
  const openConnectorIssue =
    validation.issue?.kind === 'openConnector' ? validation.issue : null
  const duplicateIssue =
    validation.issue?.kind === 'duplicateCell' ? validation.issue : null

  // While a rotate-handle or free-placement drag is in flight,
  // `displayPieces` substitutes the preview piece for the original at
  // the dragging piece's index so the editor renders the live position
  // / rotation without committing it to history until pointer up. The
  // committed `pieces` array stays untouched until commit, which keeps
  // undo / redo and validation idempotent.
  const displayPieces = useMemo(() => {
    if (rotateDrag !== null) {
      return pieces.map((p, i) =>
        i === rotateDrag.pieceIdx ? rotateDrag.preview : p,
      )
    }
    if (pieceDrag !== null && pieceDrag.mode === 'active') {
      return pieces.map((p, i) =>
        i === pieceDrag.pieceIdx ? pieceDrag.preview : p,
      )
    }
    return pieces
  }, [pieces, rotateDrag, pieceDrag])

  // Bounds drive the SVG viewBox and the world-to-SVG mapping. Source
  // them from `displayPieces` so a rotate-handle drag that swings a long
  // piece outside the committed footprint still keeps the live preview
  // and handle rings inside the rendered area; without this the drag
  // visuals would clip until pointer-up recomputed bounds. `getBounds`
  // is cell-keyed and non-projectable pieces leave `(row, col)`
  // unchanged, so we additionally expand bounds to include each
  // non-projectable piece's transform position (rounded to the nearest
  // cell, plus a 1-cell margin to cover the piece's rotated footprint).
  const bounds = useMemo(() => {
    const base = getBounds(displayPieces)
    let { rowMin, rowMax, colMin, colMax } = base
    for (const p of displayPieces) {
      if (p.transform === undefined) continue
      if (isV1Projectable(p)) continue
      const r = Math.round(p.transform.z / CELL_SIZE)
      const c = Math.round(p.transform.x / CELL_SIZE)
      if (r - 1 < rowMin) rowMin = r - 1
      if (r + 1 > rowMax) rowMax = r + 1
      if (c - 1 < colMin) colMin = c - 1
      if (c + 1 > colMax) colMax = c + 1
    }
    return { rowMin, rowMax, colMin, colMax }
  }, [displayPieces])
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

  // Cell-keyed map: includes every piece so tool actions
  // (erase / set start / checkpoint / click-to-rotate) keep finding
  // pieces by their anchor cell even after a continuous-angle rotation.
  // The piece's visual representation is split between the Cell render
  // path (grid-aligned only) and `NonProjectablePieceOverlay` (off-grid),
  // but occupancy and applyTool stay one-source-of-truth on this map.
  const cellMap = useMemo(() => {
    const m = new Map<string, Piece>()
    for (const p of displayPieces) m.set(cellKey(p.row, p.col), p)
    return m
  }, [displayPieces])
  const nonProjectablePieces = useMemo(
    () => displayPieces.filter((p) => !isV1Projectable(p)),
    [displayPieces],
  )
  // Set of cellKeys covered by any piece whose visuals live on an
  // overlay rather than on the cell itself: every non-projectable
  // piece (rotated off-grid → NonProjectablePieceOverlay) plus every
  // flex straight (FlexStraightRoadOverlay paints the full road
  // across the multi-cell footprint instead of the small in-cell
  // tilt-line glyph PieceGlyph would otherwise draw). The Cell render
  // path masks `cellIsSelected` / `cellIsStart` / `cellHasCheckpoint`
  // (and the piece-occupied background) off for cells in this set so
  // the indicators travel with the overlay rather than leaving a
  // single-cell stub behind on the grid.
  const overlayPieceCoveredCells = useMemo(() => {
    const set = new Set<string>()
    for (const p of displayPieces) {
      if (!isV1Projectable(p) || p.type === 'flexStraight') {
        for (const k of footprintCellKeys(p)) set.add(k)
      }
    }
    return set
  }, [displayPieces])

  const startKey =
    pieces.length > 0 ? cellKey(pieces[0].row, pieces[0].col) : null
  const startExitDir = getStartExitDir(pieces)
  const selectedPieceCount = useMemo(
    () => countSelectedPieces(pieces, selectedCells),
    [pieces, selectedCells],
  )

  // Stage 2 Workstream B: when the continuous-angle editor flag is on
  // and exactly one piece is selected, surface rotate-handle rings at
  // its endpoints. `pieceTouchesSelection` is footprint-aware (matches
  // any cell of the piece's footprint, not just the anchor), so a
  // multi-cell piece selected via a non-anchor cell still surfaces
  // its handles. `displayPieces` drives the lookup so the live preview
  // during a drag is the source the rings track.
  //
  // While a rotate drag is active, the dragging piece's index is
  // pinned so the handles never disappear mid-drag. Without this, a
  // multi-cell piece selected through a non-anchor footprint cell can
  // see its footprint shift after the cardinal-snap crosses a quarter
  // turn (the rotated footprint no longer covers the originally
  // selected cell), `pieceTouchesSelection` goes false, and the rings
  // vanish even though the user is still holding the same gesture.
  const rotateHandlePieceWithIndex = useMemo(() => {
    if (!CONTINUOUS_ANGLE_EDITOR_ENABLED) return null
    if (rotateDrag !== null) {
      const piece = displayPieces[rotateDrag.pieceIdx]
      if (piece !== undefined) return { piece, idx: rotateDrag.pieceIdx }
    }
    if (selectedPieceCount !== 1) return null
    for (let i = 0; i < displayPieces.length; i++) {
      if (pieceTouchesSelection(displayPieces[i], selectedCells)) {
        return { piece: displayPieces[i], idx: i }
      }
    }
    return null
  }, [displayPieces, selectedCells, selectedPieceCount, rotateDrag])
  const rotateHandlePiece = rotateHandlePieceWithIndex?.piece ?? null

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
    toolFlexSpec,
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
    toolFlexSpec,
    selectionAnchor,
  }

  const applyTool = useCallback((row: number, col: number) => {
    const {
      tool: t,
      toolRotation: tr,
      toolFlexSpec: tfs,
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
      const next = withPiecePlaced(prev, row, col, t as PieceType, tr, {
        flex: t === 'flexStraight' ? tfs : undefined,
      })
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
    return cellFromPointerEvent(e)
  }

  // Pointer-event variant: works for any React event whose `.target`
  // is a DOM element (mouse, pointer, touch). Walks up looking for a
  // `data-row` / `data-col` ancestor (cells, the non-projectable
  // overlay, the flex-straight road overlay).
  function cellFromPointerEvent(e: {
    target: EventTarget | null
  }): { row: number; col: number } | null {
    const t = e.target
    if (!(t instanceof Element)) return null
    const target = t.closest('[data-row]') as SVGElement | null
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
    // Touch: track for pinch zoom (existing behavior).
    if (e.pointerType === 'touch') {
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
      // A second touch starting on top of an in-flight piece drag
      // should not advance the drag. The pieceDrag pointerId filter on
      // pointer-move handles that, so no extra logic needed here.
      if (pinch.pointers.size > 1) return
    }
    // Stage 2 Workstream B slice 4: try to start a free-placement
    // piece drag. Only with the Select tool active and the
    // continuous-angle editor flag on. Skipped when a rotate drag or
    // another piece drag is already in flight (single-pointer model).
    if (!CONTINUOUS_ANGLE_EDITOR_ENABLED) return
    if (latestRef.current.tool !== 'select') return
    if (rotateDrag !== null) return
    if (pieceDrag !== null) return
    const cell = cellFromPointerEvent(e)
    if (cell === null) return
    const piece = latestRef.current.cellMap.get(cellKey(cell.row, cell.col))
    if (piece === undefined) return
    const idx = pieces.findIndex(
      (p) => p.row === piece.row && p.col === piece.col,
    )
    if (idx === -1) return
    const svgEl = svgRef.current
    if (svgEl === null) return
    const cursor = clientToWorld(svgEl, e.clientX, e.clientY, colMin, rowMin)
    if (cursor === null) return
    setPieceDrag({
      pieceIdx: idx,
      pointerId: e.pointerId,
      startTransform: { ...transformOf(piece) },
      pointerStartWorld: cursor,
      preview: piece,
      snap: null,
      mode: 'pending',
    })
    // Arm the long-press timer. If the pointer stays within the drag
    // threshold for LONG_PRESS_MS, the numeric editor opens. The
    // advance / finalize handlers below clear this timer when they
    // run; the timer also clears itself when the editor opens.
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current)
    }
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      setPieceDrag((prev) => {
        if (prev === null) return prev
        if (prev.mode !== 'pending') return prev
        if (prev.pointerId !== e.pointerId) return prev
        setNumericEdit({ pieceIdx: prev.pieceIdx })
        return null
      })
    }, LONG_PRESS_MS)
  }, [zoom, rotateDrag, pieceDrag, pieces, colMin, rowMin])

  // Stage 2 Workstream B rotate handle. Pointer-down on a handle ring
  // captures the pointer on the ring element so subsequent move / up
  // events fire on it even if the cursor leaves the small circle. The
  // editor stores the rotate-drag state and re-renders with the live
  // preview swapped in for `rotateDrag.pieceIdx` until pointer up.
  const handleRotatePointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>, pivotIndex: number) => {
      if (!CONTINUOUS_ANGLE_EDITOR_ENABLED) return
      // Only one pointer can drive a rotate drag at a time. A second
      // finger landing on a ring while a drag is in flight would
      // otherwise overwrite `rotateDrag.pointerId` and hijack the
      // gesture from the original pointer (whose move/up events would
      // then be filtered out as foreign). Bounce the new pointer until
      // the active drag finalizes or cancels.
      if (rotateDrag !== null) return
      if (rotateHandlePieceWithIndex === null) return
      const svgEl = svgRef.current
      if (svgEl === null) return
      const { piece, idx } = rotateHandlePieceWithIndex
      const endpoints = endpointsOf(piece)
      const pivot = endpoints[pivotIndex]
      if (pivot === undefined) return
      const cursor = clientToWorld(
        svgEl,
        e.clientX,
        e.clientY,
        colMin,
        rowMin,
      )
      if (cursor === null) return
      e.stopPropagation()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // setPointerCapture can throw in jsdom or in browsers that have
        // already routed the pointer elsewhere. The SVG-level
        // handlePointerMove / handlePointerUp below check rotateDrag
        // and forward to the rotate handlers, so the drag still works
        // even when capture fails: events arrive at the SVG once the
        // cursor leaves the small circle.
      }
      setRotateDrag({
        pieceIdx: idx,
        pivotIndex,
        pivotWorld: { x: pivot.x, z: pivot.z },
        pointerId: e.pointerId,
        lastCursorAngle: Math.atan2(cursor.z - pivot.z, cursor.x - pivot.x),
        cumulativeDelta: 0,
        startPiece: piece,
        preview: piece,
      })
    },
    [colMin, rowMin, rotateHandlePieceWithIndex, rotateDrag],
  )

  // Compute and (optionally) commit the rotate-drag's final preview in a
  // single tick. `advanceRotateDrag` is for live pointermove updates and
  // queues a setState for the preview; pointer-up / cancel must NOT
  // chain advance + commit because React batches setState and the
  // commit closure would still read the pre-advance `rotateDrag` (so
  // the commit would land the previous pointermove preview, not the
  // release position). `finalizeRotateDrag` instead computes the
  // release-position preview directly from the current `rotateDrag`
  // and writes the final piece into history in one setPieces call,
  // then clears `rotateDrag`.
  const finalizeRotateDrag = useCallback(
    (clientX: number, clientY: number, commit: boolean) => {
      if (rotateDrag === null) return
      const svgEl = svgRef.current
      let cumulativeDelta = rotateDrag.cumulativeDelta
      if (svgEl !== null) {
        const cursor = clientToWorld(svgEl, clientX, clientY, colMin, rowMin)
        if (cursor !== null) {
          const currentAngle = Math.atan2(
            cursor.z - rotateDrag.pivotWorld.z,
            cursor.x - rotateDrag.pivotWorld.x,
          )
          let increment = currentAngle - rotateDrag.lastCursorAngle
          while (increment > Math.PI) increment -= 2 * Math.PI
          while (increment < -Math.PI) increment += 2 * Math.PI
          cumulativeDelta += increment
        }
      }
      // No-op rotations (click-and-release without movement, within a
      // tiny epsilon to absorb sub-pixel cursor jitter) skip setPieces
      // so they do not pollute undo / redo with a phantom step.
      if (commit && Math.abs(cumulativeDelta) > 1e-9) {
        const finalPreview = rotatePieceAroundEndpoint(
          rotateDrag.startPiece,
          rotateDrag.pivotIndex,
          cumulativeDelta,
        )
        const idx = rotateDrag.pieceIdx
        setPieces((prev) =>
          prev.map((p, i) => (i === idx ? finalPreview : p)),
        )
      }
      setRotateDrag(null)
    },
    [rotateDrag, colMin, rowMin, setPieces],
  )

  const advanceRotateDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (rotateDrag === null) return
      const svgEl = svgRef.current
      if (svgEl === null) return
      const cursor = clientToWorld(svgEl, clientX, clientY, colMin, rowMin)
      if (cursor === null) return
      const currentAngle = Math.atan2(
        cursor.z - rotateDrag.pivotWorld.z,
        cursor.x - rotateDrag.pivotWorld.x,
      )
      // Normalise the per-frame increment into [-PI, PI] so a sweep
      // across the +/-PI atan2 branch cut does not pop by 2*PI. Then
      // accumulate so the cumulative delta can pass through one or
      // more full revolutions smoothly.
      let increment = currentAngle - rotateDrag.lastCursorAngle
      while (increment > Math.PI) increment -= 2 * Math.PI
      while (increment < -Math.PI) increment += 2 * Math.PI
      const cumulativeDelta = rotateDrag.cumulativeDelta + increment
      const preview = rotatePieceAroundEndpoint(
        rotateDrag.startPiece,
        rotateDrag.pivotIndex,
        cumulativeDelta,
      )
      setRotateDrag({
        ...rotateDrag,
        lastCursorAngle: currentAngle,
        cumulativeDelta,
        preview,
      })
    },
    [colMin, rowMin, rotateDrag],
  )

  const handleRotatePointerMove = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      if (rotateDrag === null) return
      if (e.pointerId !== rotateDrag.pointerId) return
      // Stop propagation so the SVG-level handlePointerMove fallback
      // does not also advance the drag (would double-update and
      // double-render). Fallback only fires when the captured ring
      // missed the event entirely.
      e.stopPropagation()
      advanceRotateDrag(e.clientX, e.clientY)
    },
    [rotateDrag, advanceRotateDrag],
  )

  const handleRotatePointerUp = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      if (rotateDrag === null) return
      if (e.pointerId !== rotateDrag.pointerId) return
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // No-op; capture may already have ended.
      }
      // Stop propagation so the SVG-level handlePointerUp fallback does
      // not also commit (would push a duplicate undo step).
      e.stopPropagation()
      finalizeRotateDrag(e.clientX, e.clientY, true)
    },
    [rotateDrag, finalizeRotateDrag],
  )

  // Stage 2 Workstream B slice 4: free-placement drag handlers. The
  // SVG-level pointer-down may have set pieceDrag in `pending` mode;
  // these advance to `active` mode after a small movement threshold,
  // soft-pull onto unconnected snap targets within range, and commit
  // the preview on pointer up. `pending` mode pointer-up clears state
  // and lets the regular click handler run (selection).
  const PIECE_DRAG_THRESHOLD = CELL_SIZE / 4

  const advancePieceDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (pieceDrag === null) return
      const svgEl = svgRef.current
      if (svgEl === null) return
      const cursor = clientToWorld(svgEl, clientX, clientY, colMin, rowMin)
      if (cursor === null) return
      const dx = cursor.x - pieceDrag.pointerStartWorld.x
      const dz = cursor.z - pieceDrag.pointerStartWorld.z
      const moveDistance = Math.hypot(dx, dz)
      if (
        pieceDrag.mode === 'pending' &&
        moveDistance < PIECE_DRAG_THRESHOLD
      ) {
        return
      }
      // Movement past the threshold cancels the long-press: the user
      // is dragging, not holding. Without this, a drag long enough to
      // exceed LONG_PRESS_MS would still pop the numeric editor open
      // mid-drag.
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
      const sourcePiece = pieces[pieceDrag.pieceIdx]
      if (sourcePiece === undefined) return
      const translated: PieceTransform = {
        x: pieceDrag.startTransform.x + dx,
        z: pieceDrag.startTransform.z + dz,
        theta: pieceDrag.startTransform.theta,
      }
      const draggedWithTranslate = setPieceTransform(sourcePiece, translated)
      const targets = unconnectedEndpoints(pieces, pieceDrag.pieceIdx)
      const snap = findFreePlacementSnap(draggedWithTranslate, targets)
      const finalTransform = snap !== null ? snap.transform : translated
      const preview = setPieceTransform(sourcePiece, finalTransform)
      setPieceDrag({
        ...pieceDrag,
        mode: 'active',
        preview,
        snap,
      })
    },
    [PIECE_DRAG_THRESHOLD, colMin, rowMin, pieces, pieceDrag],
  )

  const finalizePieceDrag = useCallback(
    (commit: boolean) => {
      if (pieceDrag === null) return
      // A finalized drag (commit or cancel) ends the long-press window.
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
      const wasActive = pieceDrag.mode === 'active'
      if (commit && wasActive) {
        const idx = pieceDrag.pieceIdx
        const finalPreview = pieceDrag.preview
        setPieces((prev) =>
          prev.map((p, i) => (i === idx ? finalPreview : p)),
        )
        // Suppress the synthetic click that fires after pointer-up so
        // the click-to-select handler does not race with the just-
        // committed move (which would re-select the cell at the OLD
        // anchor position and feel inconsistent on touch).
        suppressNextClickRef.current = true
      }
      setPieceDrag(null)
    },
    [pieceDrag, setPieces],
  )

  const handleRotatePointerCancel = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      if (rotateDrag === null) return
      if (e.pointerId !== rotateDrag.pointerId) return
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // No-op.
      }
      e.stopPropagation()
      finalizeRotateDrag(e.clientX, e.clientY, false)
    },
    [rotateDrag, finalizeRotateDrag],
  )

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // Rotate-handle fallback for environments where setPointerCapture
    // failed: the captured ring did not get the events, so they bubble
    // to the SVG. Filter by pointerId so a second finger landing on
    // the SVG cannot hijack an in-flight rotation.
    if (rotateDrag !== null && e.pointerId === rotateDrag.pointerId) {
      advanceRotateDrag(e.clientX, e.clientY)
      return
    }
    if (pieceDrag !== null && e.pointerId === pieceDrag.pointerId) {
      advancePieceDrag(e.clientX, e.clientY)
      return
    }
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
  }, [applyZoom, rotateDrag, advanceRotateDrag, pieceDrag, advancePieceDrag])

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // SVG-level pointer-up only fires here for the rotate drag when the
    // ring's setPointerCapture failed (jsdom or some browsers) AND the
    // ring's handler did not run (which would have stopPropagation'd).
    // Filter by pointerId so an unrelated touch release cannot commit.
    if (rotateDrag !== null && e.pointerId === rotateDrag.pointerId) {
      finalizeRotateDrag(e.clientX, e.clientY, true)
      return
    }
    if (pieceDrag !== null && e.pointerId === pieceDrag.pointerId) {
      finalizePieceDrag(true)
      return
    }
    const pinch = pinchRef.current
    if (!pinch) return
    pinch.pointers.delete(e.pointerId)
    if (pinch.pointers.size < 2) {
      pinch.startDistance = 0
    }
    if (pinch.pointers.size === 0) {
      pinchRef.current = null
    }
  }, [rotateDrag, finalizeRotateDrag, pieceDrag, finalizePieceDrag])

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // Pointer cancel on the SVG (capture-failure fallback path) means
      // the gesture aborted. Drop the in-flight preview without
      // committing; pinch state still cleans up below.
      if (rotateDrag !== null && e.pointerId === rotateDrag.pointerId) {
        finalizeRotateDrag(e.clientX, e.clientY, false)
        return
      }
      if (pieceDrag !== null && e.pointerId === pieceDrag.pointerId) {
        finalizePieceDrag(false)
        return
      }
      const pinch = pinchRef.current
      if (!pinch) return
      pinch.pointers.delete(e.pointerId)
      if (pinch.pointers.size < 2) {
        pinch.startDistance = 0
      }
      if (pinch.pointers.size === 0) {
        pinchRef.current = null
      }
    },
    [rotateDrag, finalizeRotateDrag, pieceDrag, finalizePieceDrag],
  )

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Suppress the click that would otherwise fire after a pinch gesture
    // releases its last pointer. Without this a two-finger zoom can
    // accidentally place a piece.
    if (pinchRef.current !== null) return
    // Suppress the synthetic click after a free-placement drag commit
    // so the piece does not get re-selected at the OLD anchor cell
    // immediately after the drag moved it elsewhere.
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }
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
        creatorTuning?: CarParams
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
      // Snapshot the author's most recent setup so racers can later choose
      // "Track creator's setup" in the pre-race picker. Skipped when the
      // author has never tuned, so the field stays absent rather than
      // shipping a synthetic stock copy.
      const creatorTuning = readLastLoaded()
      if (creatorTuning) {
        reqBody.creatorTuning = creatorTuning
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
        <div style={headerActions}>
          <button
            type="button"
            onClick={() => router.push(`/music/${slug}`)}
            style={hasCustomMusic ? musicBtnActive : musicBtn}
            title={
              hasCustomMusic
                ? 'Edit the custom soundtrack for this track.'
                : 'Create a custom soundtrack for this track.'
            }
          >
            {hasCustomMusic ? 'Edit Music *' : 'Edit Music'}
          </button>
        </div>
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
                      flex: t === 'flexStraight' ? toolFlexSpec : undefined,
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

      {tool === 'flexStraight' ? (
        <div style={flexBar} aria-label="Flex straight controls">
          <div style={flexLabel}>Length</div>
          <div style={flexControl}>
            <button
              type="button"
              style={flexStepBtn}
              onClick={() =>
                setToolFlexSpec((s) => makeFlexSpec(-s.dr - 1, s.dc))
              }
              aria-label="Decrease flex straight length"
            >
              {'-'}
            </button>
            <span style={flexValue} aria-live="polite">
              {-toolFlexSpec.dr}
            </span>
            <button
              type="button"
              style={flexStepBtn}
              onClick={() =>
                setToolFlexSpec((s) => makeFlexSpec(-s.dr + 1, s.dc))
              }
              aria-label="Increase flex straight length"
            >
              {'+'}
            </button>
          </div>
          <div style={flexLabel}>Lateral</div>
          <div style={flexControl}>
            <button
              type="button"
              style={flexStepBtn}
              onClick={() =>
                setToolFlexSpec((s) => makeFlexSpec(-s.dr, s.dc - 1))
              }
              aria-label="Shift flex straight exit left"
            >
              {'-'}
            </button>
            <span style={flexValue} aria-live="polite">
              {toolFlexSpec.dc}
            </span>
            <button
              type="button"
              style={flexStepBtn}
              onClick={() =>
                setToolFlexSpec((s) => makeFlexSpec(-s.dr, s.dc + 1))
              }
              aria-label="Shift flex straight exit right"
            >
              {'+'}
            </button>
          </div>
          <span style={flexAngleHint}>
            {flexAngleDegrees(toolFlexSpec).toFixed(1)} degrees off cardinal
          </span>
        </div>
      ) : null}

      {templatePanelOpen ? (
        <div style={templatePanel}>
          <div style={templateHeader}>
            <div>
              <div style={advancedTitle}>Templates</div>
              <p style={templateHelp}>
                Replace the current layout with a valid starter loop. Mood,
                biome, and other advanced settings stay as-is.
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
            ref={svgRef}
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
            onPointerCancel={handlePointerCancel}
          >
            {rows.map((r) =>
              cols.map((c) => {
                const x = (c - colMin) * CELL
                const y = (r - rowMin) * CELL
                const key = cellKey(r, c)
                const piece = cellMap.get(key)
                // Non-projectable pieces render via the overlay group at
                // their actual world transform, not at this cell. Hide
                // their cell visuals (background fill, glyph, data-piece
                // attrs) by passing an undefined piece to Cell so the
                // original anchor cell looks empty. cellMap still has
                // the piece for applyTool occupancy checks.
                // Two separate suppressions:
                //
                //   `pieceRendersAtCell` controls whether THIS cell's
                //   anchored piece paints its own cell glyph + the
                //   piece-occupied background. False for non-projectable
                //   pieces (their NonProjectablePieceOverlay handles the
                //   visuals at the rotated transform) and false for flex
                //   straights (FlexStraightRoadOverlay handles the
                //   multi-cell road). For every other piece anchored at
                //   this cell, the cell renders normally even when
                //   the cell happens to also fall inside another
                //   overlay piece's footprint. Without this split, an
                //   overlap state would silently hide the second
                //   piece's glyph, making it impossible to see and
                //   resolve duplicates / overlaps.
                //
                //   `indicatorsHere` controls whether the cell-level
                //   selection rect / START label / checkpoint marker
                //   render at this cell. Empty cells covered by an
                //   overlay piece's footprint hide indicators so the
                //   overlay's own indicators are the only ones showing
                //   for that piece. Cells with their own anchored
                //   projectable non-flex piece render their indicators
                //   normally regardless of overlay coverage; the
                //   overlay piece's indicators live elsewhere on the
                //   overlay.
                const coveredByOverlay = overlayPieceCoveredCells.has(key)
                const pieceRendersAtCell =
                  piece !== undefined &&
                  isV1Projectable(piece) &&
                  piece.type !== 'flexStraight'
                const renderedPiece = pieceRendersAtCell ? piece : undefined
                const indicatorsHere =
                  pieceRendersAtCell ||
                  (piece === undefined && !coveredByOverlay)
                const cellIsStart = indicatorsHere && key === startKey
                const cellIsSelected =
                  indicatorsHere &&
                  selectedCells.has(selectedCellKey(r, c))
                const cellHasCheckpoint =
                  indicatorsHere && checkpointKeys.has(key)
                const badConnectorDir =
                  openConnectorIssue?.connectorRow === r &&
                  openConnectorIssue.connectorCol === c
                    ? openConnectorIssue.dir
                    : null
                const isConnectorTarget =
                  openConnectorIssue?.targetRow === r &&
                  openConnectorIssue.targetCol === c
                const isDuplicateIssue =
                  duplicateIssue?.row === r && duplicateIssue.col === c
                return (
                  <Cell
                    key={key}
                    row={r}
                    col={c}
                    x={x}
                    y={y}
                    piece={renderedPiece}
                    isStart={cellIsStart}
                    hasCheckpoint={cellHasCheckpoint}
                    decoration={decorationMap.get(key)}
                    startExitDir={cellIsStart ? startExitDir : null}
                    isSelected={cellIsSelected}
                    isSelectionAnchor={
                      selectionAnchor?.row === r && selectionAnchor.col === c
                    }
                    badConnectorDir={badConnectorDir}
                    isConnectorTarget={isConnectorTarget}
                    isDuplicateIssue={isDuplicateIssue}
                  />
                )
              }),
            )}
            {displayPieces
              .filter((p) => p.type === 'flexStraight')
              .map((piece) => {
                const overlayKey = cellKey(piece.row, piece.col)
                const isStart = overlayKey === startKey
                const piecesFootprintKeys = footprintCellKeys(piece)
                const isSelected = pieceTouchesSelection(
                  piece,
                  selectedCells,
                )
                const hasCheckpoint = piecesFootprintKeys.some((k) =>
                  checkpointKeys.has(k),
                )
                return (
                  <FlexStraightRoadOverlay
                    key={`flex-road-${piece.row}-${piece.col}`}
                    piece={piece}
                    colMin={colMin}
                    rowMin={rowMin}
                    isStart={isStart}
                    isSelected={isSelected}
                    hasCheckpoint={hasCheckpoint}
                  />
                )
              })}
            {nonProjectablePieces
              .filter((piece) => piece.type !== 'flexStraight')
              .map((piece) => {
              const overlayKey = cellKey(piece.row, piece.col)
              const isStart = overlayKey === startKey
              // Flags must be footprint-aware (not anchor-only) because
              // the cell renderer suppresses selection / checkpoint
              // visuals for every cell in `overlayPieceCoveredCells`.
              // If the user selected a non-anchor footprint cell via
              // rectangle selection, the cell rect is hidden AND the
              // anchor-only check would also miss it, leaving the piece
              // with no selection feedback. `pieceTouchesSelection`
              // mirrors `pieceTouchesSelection` in editor.ts (already
              // used by `selectedPieceCount` and the rotate handle
              // lookup) so all three agree on what "this piece is
              // selected" means. Same logic for checkpoints living on
              // non-anchor footprint cells.
              const piecesFootprintKeys = footprintCellKeys(piece)
              const isSelected = pieceTouchesSelection(piece, selectedCells)
              const hasCheckpoint = piecesFootprintKeys.some((k) =>
                checkpointKeys.has(k),
              )
              return (
                <NonProjectablePieceOverlay
                  key={`overlay-${piece.row}-${piece.col}`}
                  piece={piece}
                  colMin={colMin}
                  rowMin={rowMin}
                  isStart={isStart}
                  isSelected={isSelected}
                  hasCheckpoint={hasCheckpoint}
                  startExitDir={isStart ? startExitDir : null}
                />
              )
            })}
            {rotateHandlePiece !== null ? (
              <RotateHandles
                piece={rotateHandlePiece}
                colMin={colMin}
                rowMin={rowMin}
                onPointerDown={handleRotatePointerDown}
                onPointerMove={handleRotatePointerMove}
                onPointerUp={handleRotatePointerUp}
                onPointerCancel={handleRotatePointerCancel}
              />
            ) : null}
            {pieceDrag !== null && pieceDrag.snap !== null ? (
              <SnapTargetIndicator
                snap={pieceDrag.snap}
                pieces={displayPieces}
                colMin={colMin}
                rowMin={rowMin}
              />
            ) : null}
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
            {CONTINUOUS_ANGLE_EDITOR_ENABLED &&
            rotateHandlePieceWithIndex !== null ? (
              <button
                type="button"
                onClick={() =>
                  setNumericEdit({
                    pieceIdx: rotateHandlePieceWithIndex.idx,
                  })
                }
                style={transformBtnWide}
                title="Edit transform x / z / theta"
              >
                Transform
              </button>
            ) : null}
          </div>
        ) : null}
        {numericEdit !== null &&
        pieces[numericEdit.pieceIdx] !== undefined ? (
          <NumericTransformPanel
            piece={pieces[numericEdit.pieceIdx]}
            onApply={(t) => {
              const idx = numericEdit.pieceIdx
              setPieces((prev) =>
                prev.map((p, i) =>
                  i === idx ? setPieceTransform(p, t) : p,
                ),
              )
              setNumericEdit(null)
            }}
            onCancel={() => setNumericEdit(null)}
          />
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
          {openConnectorIssue ? (
            <span style={invalidStatus}>
              needs matching connector at {openConnectorIssue.targetRow},{openConnectorIssue.targetCol}
            </span>
          ) : null}
          {obbOverlaps.length > 0 ? (
            <span
              style={invalidStatus}
              data-testid="obb-overlap-warning"
              title={obbOverlaps
                .map((p) => `pieces ${p.a} and ${p.b}`)
                .join(', ')}
            >
              {obbOverlaps.length} overlapping{' '}
              {obbOverlaps.length === 1 ? 'piece pair' : 'piece pairs'}
            </span>
          ) : null}
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
              moodActive ? (
                <span style={advancedDot} />
              ) : null}
            </button>
          ) : null}
          {loopReconciliation !== null ? (
            <button
              onClick={() =>
                setPieces((prev) => {
                  // Recompute against `prev` rather than reusing the
                  // render-time plan: a batched setPieces between
                  // render and click could shift the chain's
                  // dangling endpoints out from under the cached
                  // plan, and applying a stale plan would move the
                  // wrong piece. If the chain has changed enough to
                  // no longer be reconcilable, leave the pieces
                  // alone (returning the same array skips a history
                  // entry via setPieces' equality check).
                  const fresh = findLoopReconciliation(prev)
                  if (fresh === null) return prev
                  return applyLoopReconciliation(prev, fresh)
                })
              }
              style={btnGhost}
              title={`Snap a ${loopReconciliation.gap.toFixed(1)}-unit gap shut`}
            >
              Close loop
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
  badConnectorDir: Dir | null
  isConnectorTarget: boolean
  isDuplicateIssue: boolean
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
  badConnectorDir,
  isConnectorTarget,
  isDuplicateIssue,
}: CellProps) {
  return (
    <g
      transform={`translate(${x}, ${y})`}
      data-row={row}
      data-col={col}
      data-piece-type={piece?.type}
      data-piece-rotation={piece?.rotation}
    >
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
      {isConnectorTarget ? <ConnectorTargetMarker /> : null}
      {badConnectorDir !== null ? (
        <BadConnectorMarker dir={badConnectorDir} />
      ) : null}
      {isDuplicateIssue ? (
        <rect
          x={2}
          y={2}
          width={CELL - 4}
          height={CELL - 4}
          fill="none"
          stroke="#ff6b6b"
          strokeWidth={3}
          strokeDasharray="5 3"
          style={{ pointerEvents: 'none' }}
        />
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
              transform={`rotate(${startExitDir * 45} ${CELL / 2} ${CELL / 2})`}
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

function ConnectorTargetMarker() {
  return (
    <g data-testid="connector-target-marker" style={{ pointerEvents: 'none' }}>
      <rect
        x={8}
        y={8}
        width={CELL - 16}
        height={CELL - 16}
        rx={6}
        fill="rgba(255, 179, 71, 0.12)"
        stroke="#ffb347"
        strokeWidth={2}
        strokeDasharray="5 4"
      />
      <text
        x={CELL / 2}
        y={CELL / 2 + 4}
        textAnchor="middle"
        fontSize={10}
        fontWeight={800}
        fill="#ffdf8a"
      >
        NEED
      </text>
    </g>
  )
}

function BadConnectorMarker({ dir }: { dir: Dir }) {
  const p = connectorGlyphPoint(dir)
  return (
    <g data-testid="bad-connector-marker" style={{ pointerEvents: 'none' }}>
      <line
        x1={CELL / 2}
        y1={CELL / 2}
        x2={p.x}
        y2={p.y}
        stroke="#ff6b6b"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle
        cx={p.x}
        cy={p.y}
        r={7}
        fill="#0d1420"
        stroke="#ff6b6b"
        strokeWidth={3}
      />
      <path
        d={`M ${p.x - 3} ${p.y - 3} L ${p.x + 3} ${p.y + 3} M ${p.x + 3} ${p.y - 3} L ${p.x - 3} ${p.y + 3}`}
        stroke="#ffdf8a"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </g>
  )
}

function connectorGlyphPoint(dir: Dir): { x: number; y: number } {
  const center = CELL / 2
  const inset = 6
  const lo = inset
  const hi = CELL - inset
  const mid = center
  const points: Record<Dir, { x: number; y: number }> = {
    0: { x: mid, y: lo },
    1: { x: hi, y: lo },
    2: { x: hi, y: mid },
    3: { x: hi, y: hi },
    4: { x: mid, y: hi },
    5: { x: lo, y: hi },
    6: { x: lo, y: mid },
    7: { x: lo, y: lo },
  }
  return points[dir]
}

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

// Stage 2 Workstream B: render a non-projectable piece (one whose
// transform sits off the integer cell grid) at its actual world
// position and continuous angle. `cellMap` keeps every piece (so
// applyTool / erase / start / checkpoint actions still find off-grid
// pieces by anchor cell), but the cell loop hides the glyph and the
// piece-following indicators (background fill, glyph, selection rect,
// START label, checkpoint marker) by passing
// `renderedPiece = undefined` and the masked-off `cellIsStart` /
// `cellIsSelected` / `cellHasCheckpoint` flags to Cell whenever
// `isV1Projectable(piece)` is false. The overlay then renders all of
// those visuals inside its rotated `<g>` so the selection rectangle,
// START badge, and checkpoint marker follow the rotated piece, not
// the original anchor cell. For grid-aligned pieces the Cell render
// path is unchanged, so the existing snapshot wall and template
// hashes stay pinned.
// Stage 2 Workstream B: paint the full flex-straight road from entry to
// exit. PieceGlyph only renders a tilted line inside the anchor cell,
// so a flex straight with a multi-cell offset (default `dr = -3, dc = 1`)
// would otherwise look like a single-cell piece in the editor while its
// connector endpoints (and the rotate-handle rings) actually live
// several cells away. This overlay reads the world-space endpoint
// frames from `endpointsOf(piece)` (the same source the rotate handles
// use), so the visible road and the rings always agree on where the
// piece sits.
//
// Renders for both v1-projectable (rotation 0/90/180/270) and
// non-projectable flex straights. The line is straight from entry to
// exit, matching the in-game road geometry built by
// `sampleFlexStraightLocal`.
function FlexStraightRoadOverlay({
  piece,
  colMin,
  rowMin,
  isStart,
  isSelected,
  hasCheckpoint,
}: {
  piece: Piece
  colMin: number
  rowMin: number
  isStart: boolean
  isSelected: boolean
  hasCheckpoint: boolean
}) {
  const endpoints = endpointsOf(piece)
  const entry = endpoints[0]
  const exit = endpoints[1]
  if (entry === undefined || exit === undefined) return null
  // World cell center `(col * CELL_SIZE, row * CELL_SIZE)` maps to SVG
  // `((col - colMin) * CELL + CELL/2)`; the +CELL/2 puts the road on
  // the cell-center axis instead of half a cell northwest of the
  // grid-rendered pieces.
  const ex = (entry.x / CELL_SIZE - colMin) * CELL + CELL / 2
  const ey = (entry.z / CELL_SIZE - rowMin) * CELL + CELL / 2
  const xx = (exit.x / CELL_SIZE - colMin) * CELL + CELL / 2
  const xy = (exit.z / CELL_SIZE - rowMin) * CELL + CELL / 2
  const midX = (ex + xx) / 2
  const midY = (ey + xy) / 2
  const road = '#4a5a70'
  const stroke = '#ffd36b'
  const startStroke = '#6ee787'
  const roadWidth = CELL * 0.4
  // Road direction in SVG coords (CW from +x because SVG y grows down).
  // The START arrow's apex defaults to -y (up = -90 deg), so to make it
  // point along the road we rotate by `roadAngleDeg + 90`.
  const roadAngleDeg = (Math.atan2(xy - ey, xx - ex) * 180) / Math.PI
  return (
    <g
      // Pointer events on so the user can click / drag the road itself
      // to grab the flex-straight piece. `data-row` / `data-col`
      // mirror the anchor cell so cellFromEvent finds the piece on a
      // road click. Without these, the road would render but be
      // un-grabbable, and selecting / erasing / dragging would have to
      // happen on the (now-empty-looking) anchor cell.
      data-flex-straight-road-anchor={`${piece.row},${piece.col}`}
      data-row={piece.row}
      data-col={piece.col}
      style={{ cursor: 'pointer' }}
    >
      {/*
        Selection halo: a fatter translucent line under the road. Drawn
        first so it appears beneath the road body.
      */}
      {isSelected ? (
        <line
          x1={ex}
          y1={ey}
          x2={xx}
          y2={xy}
          stroke="#58a6ff"
          strokeWidth={roadWidth + 8}
          strokeOpacity={0.32}
          strokeLinecap="round"
        />
      ) : null}
      <line
        x1={ex}
        y1={ey}
        x2={xx}
        y2={xy}
        stroke={road}
        strokeWidth={roadWidth}
        strokeLinecap="butt"
      />
      <line
        x1={ex}
        y1={ey}
        x2={xx}
        y2={xy}
        stroke={isStart ? startStroke : stroke}
        strokeWidth={2}
        strokeDasharray="4 4"
      />
      {isStart ? (
        <>
          <text
            x={midX}
            y={midY - 4}
            textAnchor="middle"
            fontSize={9}
            fontWeight={700}
            fill={startStroke}
            transform={`rotate(${roadAngleDeg} ${midX} ${midY})`}
            style={{ letterSpacing: 1 }}
          >
            START
          </text>
          <polygon
            points={`${ex - 5},${ey + 3} ${ex + 5},${ey + 3} ${ex},${ey - 5}`}
            transform={`rotate(${roadAngleDeg + 90} ${ex} ${ey})`}
            fill={startStroke}
          />
        </>
      ) : null}
      {hasCheckpoint ? (
        <g>
          <circle
            cx={midX}
            cy={midY}
            r={10}
            fill="rgba(255, 179, 71, 0.18)"
            stroke="#ffb347"
            strokeWidth={2}
          />
          <path
            d={`M ${midX - 4} ${midY + 10} L ${midX - 4} ${midY - 10} L ${midX + 9} ${midY - 6} L ${midX - 4} ${midY - 2}`}
            fill="#ffb347"
          />
        </g>
      ) : null}
    </g>
  )
}

function NonProjectablePieceOverlay({
  piece,
  colMin,
  rowMin,
  isStart,
  isSelected,
  hasCheckpoint,
  startExitDir,
}: {
  piece: Piece
  colMin: number
  rowMin: number
  isStart: boolean
  isSelected: boolean
  hasCheckpoint: boolean
  startExitDir: Dir | null
}) {
  const t = transformOf(piece)
  // World coordinates are in CELL_SIZE units (20); SVG coordinates are
  // in CELL units (56). World cell `(col, row)` center is at world
  // `(col * CELL_SIZE, row * CELL_SIZE)`, which maps to SVG cell
  // center at `((col - colMin) * CELL + CELL / 2, ...)`. The `+ CELL /
  // 2` keeps the rotated overlay aligned with the grid-rendered cell
  // glyphs; without it the overlay would render half a cell northwest
  // of where a v1-projectable Cell paints the same piece, and a piece
  // toggling between Cell and overlay rendering paths would visually
  // jump.
  const svgCx = (t.x / CELL_SIZE - colMin) * CELL + CELL / 2
  const svgCy = (t.z / CELL_SIZE - rowMin) * CELL + CELL / 2
  const thetaDeg = (t.theta * 180) / Math.PI
  // The outer group rotates the inner glyph by thetaDeg. `startExitDir`
  // already encodes the cardinal-snapped portion of theta (computed via
  // `cardinalTurnsOfTheta` in connectorPortsOf), so an inner rotation of
  // `startExitDir * 45` would double-count the cardinal turn. Subtract
  // the cardinal snap so the inner-frame rotation plus the outer
  // rotation lands at `startExitDir * 45 + residualDeg` in world,
  // matching the actual piece exit direction even off-cardinal.
  const cardinalSnapDeg = cardinalTurnsOfTheta(t.theta) * 90
  return (
    <g
      transform={`translate(${svgCx - CELL / 2} ${svgCy - CELL / 2}) rotate(${thetaDeg} ${CELL / 2} ${CELL / 2})`}
      // `data-row` / `data-col` mirror the piece's anchor cell so
      // `cellFromEvent` walks up to find them on a click against the
      // rotated glyph. Without these attrs, applyTool would treat the
      // visible piece as unclickable. The anchor row / col stays the
      // original integer cell because `convertV1Piece` leaves the cell
      // fields untouched for non-projectable transforms; clicks at the
      // original cell route to the same piece.
      data-row={piece.row}
      data-col={piece.col}
      data-non-projectable-piece-type={piece.type}
    >
      {/*
        Cell-sized background rect mirroring Cell's piece-occupied fill.
        Renders inside the rotated group so the piece-occupied tinted
        background follows the rotation, giving a clear visual of where
        the piece footprint actually sits.
      */}
      <rect
        width={CELL}
        height={CELL}
        fill={isStart ? '#1f3a2a' : '#222e40'}
        stroke={isStart ? '#6ee787' : '#2b3a50'}
        strokeWidth={isStart ? 2 : 1}
      />
      <PieceGlyph piece={piece} rotationDegOverride={0} />
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
              transform={`rotate(${startExitDir * 45 - cardinalSnapDeg} ${CELL / 2} ${CELL / 2})`}
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
          stroke="#58a6ff"
          strokeWidth={2}
          style={{ pointerEvents: 'none' }}
        />
      ) : null}
    </g>
  )
}

// Stage 2 Workstream B: SVG rings at the selected piece's endpoints. The
// editor renders these only when CONTINUOUS_ANGLE_EDITOR_ENABLED is on
// and exactly one piece is selected. Pointer-down on a ring captures
// the pointer (so subsequent move / up events fire on the ring even if
// the cursor leaves the small circle), and the parent dispatches into
// rotatePieceAroundEndpoint via the editor's rotate-drag state.
function RotateHandles({
  piece,
  colMin,
  rowMin,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  piece: Piece
  colMin: number
  rowMin: number
  onPointerDown: (
    e: React.PointerEvent<SVGCircleElement>,
    pivotIndex: number,
  ) => void
  onPointerMove: (e: React.PointerEvent<SVGCircleElement>) => void
  onPointerUp: (e: React.PointerEvent<SVGCircleElement>) => void
  onPointerCancel: (e: React.PointerEvent<SVGCircleElement>) => void
}) {
  const endpoints = endpointsOf(piece)
  return (
    <g data-testid="rotate-handles" style={{ pointerEvents: 'auto' }}>
      {endpoints.map((frame, i) => {
        // +CELL/2 puts the rings on the cell-center axis, matching where
        // the cell-rendered piece glyphs sit. Without the offset the
        // ring would sit half a cell northwest of the visible endpoint
        // for v1-projectable pieces.
        const svgX = (frame.x / CELL_SIZE - colMin) * CELL + CELL / 2
        const svgY = (frame.z / CELL_SIZE - rowMin) * CELL + CELL / 2
        return (
          <circle
            key={i}
            cx={svgX}
            cy={svgY}
            r={9}
            fill="rgba(110, 231, 135, 0.18)"
            stroke="#6ee787"
            strokeWidth={2}
            data-rotate-handle-pivot-index={i}
            style={{ cursor: 'grab', touchAction: 'none' }}
            onPointerDown={(e) => onPointerDown(e, i)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          />
        )
      })}
    </g>
  )
}

// Stage 2 Workstream B slice 5: floating numeric editor for power
// users. Opens via the toolbar's Transform button or a long-press on
// a piece (touch). Shows the piece's current transform in cell-space
// units (x and z divided by CELL_SIZE so authors enter cell
// coordinates) and degrees (theta * 180 / PI), and applies the parsed
// values back through `setPieceTransform` on Apply. Cancel restores
// nothing (the piece was never modified during editing) and just
// closes the panel.
function NumericTransformPanel({
  piece,
  onApply,
  onCancel,
}: {
  piece: Piece
  onApply: (transform: PieceTransform) => void
  onCancel: () => void
}) {
  const t = transformOf(piece)
  const [colInput, setColInput] = useState(
    () => (t.x / CELL_SIZE).toFixed(3),
  )
  const [rowInput, setRowInput] = useState(
    () => (t.z / CELL_SIZE).toFixed(3),
  )
  const [thetaInput, setThetaInput] = useState(
    () => ((t.theta * 180) / Math.PI).toFixed(2),
  )
  const apply = () => {
    const col = Number.parseFloat(colInput)
    const row = Number.parseFloat(rowInput)
    const thetaDeg = Number.parseFloat(thetaInput)
    if (!Number.isFinite(col) || !Number.isFinite(row) || !Number.isFinite(thetaDeg)) {
      return
    }
    onApply({
      x: col * CELL_SIZE,
      z: row * CELL_SIZE,
      theta: (thetaDeg * Math.PI) / 180,
    })
  }
  return (
    <div style={numericTransformPanel} role="dialog" aria-label="Edit piece transform">
      <div style={numericTransformLabel}>Transform</div>
      <div style={numericTransformRow}>
        <label style={numericTransformFieldLabel}>
          col
          <input
            type="number"
            step="0.01"
            value={colInput}
            onChange={(e) => setColInput(e.target.value)}
            style={numericTransformInput}
          />
        </label>
        <label style={numericTransformFieldLabel}>
          row
          <input
            type="number"
            step="0.01"
            value={rowInput}
            onChange={(e) => setRowInput(e.target.value)}
            style={numericTransformInput}
          />
        </label>
        <label style={numericTransformFieldLabel}>
          theta (deg)
          <input
            type="number"
            step="0.1"
            value={thetaInput}
            onChange={(e) => setThetaInput(e.target.value)}
            style={numericTransformInput}
          />
        </label>
      </div>
      <div style={numericTransformActions}>
        <button type="button" onClick={onCancel} style={transformBtnWide}>
          Cancel
        </button>
        <button type="button" onClick={apply} style={transformBtnWide}>
          Apply
        </button>
      </div>
    </div>
  )
}

// Stage 2 Workstream B slice 4: a green glow at the snap target's
// endpoint frame while a free-placement drag is in range. Shows the
// user which target the soft-pull will snap to on release.
function SnapTargetIndicator({
  snap,
  pieces,
  colMin,
  rowMin,
}: {
  snap: FreePlacementSnap
  pieces: readonly Piece[]
  colMin: number
  rowMin: number
}) {
  const target = pieces[snap.targetPieceIdx]
  if (target === undefined) return null
  const ends = endpointsOf(target)
  const frame = ends[snap.targetEndpointIdx]
  if (frame === undefined) return null
  const cx = (frame.x / CELL_SIZE - colMin) * CELL + CELL / 2
  const cy = (frame.z / CELL_SIZE - rowMin) * CELL + CELL / 2
  return (
    <g style={{ pointerEvents: 'none' }} data-testid="snap-target-indicator">
      <circle
        cx={cx}
        cy={cy}
        r={14}
        fill="rgba(110, 231, 135, 0.18)"
        stroke="#6ee787"
        strokeWidth={2}
      />
      <circle cx={cx} cy={cy} r={5} fill="#6ee787" />
    </g>
  )
}

function PieceGlyph({
  piece,
  rotationDegOverride,
}: {
  piece: Piece
  // When set, replaces `piece.rotation` for the visual rotation of the
  // glyph. The overlay renderer for non-projectable pieces passes 0 here
  // so the inner glyph stays in its rotation-0 frame and the OUTER
  // wrapping `<g>` applies the continuous `transform.theta` rotation.
  // Default is `piece.rotation` so cell-based rendering is unchanged.
  rotationDegOverride?: number
}) {
  const cx = CELL / 2
  const cy = CELL / 2
  const stroke = '#ffd36b'
  const road = '#4a5a70'
  const roadWidth = CELL * 0.4
  const rotationDeg = rotationDegOverride ?? piece.rotation
  return (
    <g transform={`rotate(${rotationDeg} ${cx} ${cy})`}>
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
      {piece.type === 'megaSweepRight' || piece.type === 'megaSweepLeft' ? (
        <>
          <g
            transform={
              piece.type === 'megaSweepLeft'
                ? `translate(${2 * cx} 0) scale(-1 1)`
                : undefined
            }
          >
            <path
              d={`M ${cx} ${CELL}
                  C ${cx} ${CELL * -0.12} ${CELL * -0.12} ${cy} ${CELL} ${cy}`}
              stroke={road}
              strokeWidth={roadWidth}
              strokeLinecap="butt"
              fill="none"
            />
            <path
              d={`M ${cx} ${CELL}
                  C ${cx} ${CELL * -0.12} ${CELL * -0.12} ${cy} ${CELL} ${cy}`}
              stroke={stroke}
              strokeWidth={2}
              strokeDasharray="4 4"
              fill="none"
            />
          </g>
        </>
      ) : null}
      {piece.type === 'grandSweepRight' || piece.type === 'grandSweepLeft' ? (
        <>
          <g
            transform={
              piece.type === 'grandSweepLeft'
                ? `translate(${2 * cx} 0) scale(-1 1)`
                : undefined
            }
          >
            <path
              d={`M ${cx} ${CELL}
                  C ${cx} ${CELL * -0.25} ${CELL * 0.35} ${CELL * -0.08} ${CELL} 0`}
              stroke={road}
              strokeWidth={roadWidth}
              strokeLinecap="butt"
              fill="none"
            />
            <path
              d={`M ${cx} ${CELL}
                  C ${cx} ${CELL * -0.25} ${CELL * 0.35} ${CELL * -0.08} ${CELL} 0`}
              stroke={stroke}
              strokeWidth={2}
              strokeDasharray="4 4"
              fill="none"
            />
          </g>
        </>
      ) : null}
      {piece.type === 'hairpin' ||
      piece.type === 'hairpinTight' ||
      piece.type === 'hairpinWide' ? (
        <>
          <path
            d={`M 0 ${cy - CELL * 0.36}
                C ${
                  piece.type === 'hairpinTight'
                    ? CELL * 0.55
                    : piece.type === 'hairpinWide'
                      ? CELL * 1.08
                      : CELL * 0.82
                } ${cy - CELL * 0.36} ${
                  piece.type === 'hairpinTight'
                    ? CELL * 0.55
                    : piece.type === 'hairpinWide'
                      ? CELL * 1.08
                      : CELL * 0.82
                } ${cy + CELL * 0.36} 0 ${cy + CELL * 0.36}`}
            stroke={road}
            strokeWidth={roadWidth}
            strokeLinecap="butt"
            fill="none"
          />
          <path
            d={`M 0 ${cy - CELL * 0.36}
                C ${
                  piece.type === 'hairpinTight'
                    ? CELL * 0.55
                    : piece.type === 'hairpinWide'
                      ? CELL * 1.08
                      : CELL * 0.82
                } ${cy - CELL * 0.36} ${
                  piece.type === 'hairpinTight'
                    ? CELL * 0.55
                    : piece.type === 'hairpinWide'
                      ? CELL * 1.08
                      : CELL * 0.82
                } ${cy + CELL * 0.36} 0 ${cy + CELL * 0.36}`}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="none"
          />
        </>
      ) : null}
      {piece.type === 'arc45' || piece.type === 'arc45Left' ? (
        <>
          <g
            transform={
              piece.type === 'arc45Left'
                ? `translate(${2 * cx} 0) scale(-1 1)`
                : undefined
            }
          >
            <path
              d={`M ${cx} ${CELL}
                  C ${cx} ${CELL * 0.45} ${CELL * 0.45} ${CELL * 0.08} ${CELL} 0`}
              stroke={road}
              strokeWidth={roadWidth}
              strokeLinecap="butt"
              fill="none"
            />
            <path
              d={`M ${cx} ${CELL}
                  C ${cx} ${CELL * 0.45} ${CELL * 0.45} ${CELL * 0.08} ${CELL} 0`}
              stroke={stroke}
              strokeWidth={2}
              strokeDasharray="4 4"
              fill="none"
            />
          </g>
        </>
      ) : null}
      {piece.type === 'wideArc45Right' || piece.type === 'wideArc45Left' ? (
        <>
          <g
            transform={
              piece.type === 'wideArc45Left'
                ? `translate(${2 * cx} 0) scale(-1 1)`
                : undefined
            }
          >
            <path
              d={`M ${cx} ${CELL}
                  C ${cx} ${CELL * 0.08} ${CELL * 0.72} ${CELL * -0.18} ${CELL} 0`}
              stroke={road}
              strokeWidth={roadWidth}
              strokeLinecap="butt"
              fill="none"
            />
            <path
              d={`M ${cx} ${CELL}
                  C ${cx} ${CELL * 0.08} ${CELL * 0.72} ${CELL * -0.18} ${CELL} 0`}
              stroke={stroke}
              strokeWidth={2}
              strokeDasharray="4 4"
              fill="none"
            />
          </g>
        </>
      ) : null}
      {piece.type === 'diagonalSweepRight' ||
      piece.type === 'diagonalSweepLeft' ? (
        <>
          <g
            transform={
              piece.type === 'diagonalSweepLeft'
                ? `translate(${2 * cx} 0) scale(-1 1)`
                : undefined
            }
          >
            <path
              d={`M 0 ${CELL}
                  C ${CELL * 0.35} ${CELL * 0.45} ${CELL * 0.65} ${CELL * 0.45} ${CELL} ${CELL}`}
              stroke={road}
              strokeWidth={roadWidth}
              strokeLinecap="butt"
              fill="none"
            />
            <path
              d={`M 0 ${CELL}
                  C ${CELL * 0.35} ${CELL * 0.45} ${CELL * 0.65} ${CELL * 0.45} ${CELL} ${CELL}`}
              stroke={stroke}
              strokeWidth={2}
              strokeDasharray="4 4"
              fill="none"
            />
          </g>
        </>
      ) : null}
      {piece.type === 'kinkRight' ||
      piece.type === 'kinkLeft' ||
      piece.type === 'offsetStraightRight' ||
      piece.type === 'offsetStraightLeft' ? (
        <>
          <g
            transform={
              piece.type === 'kinkLeft' ||
              piece.type === 'offsetStraightLeft'
                ? `translate(${2 * cx} 0) scale(-1 1)`
                : undefined
            }
          >
            <path
              d={
                piece.type === 'kinkRight' || piece.type === 'kinkLeft'
                  ? `M ${cx} ${CELL}
                      C ${cx + CELL * 0.24} ${CELL * 0.7} ${cx + CELL * 0.24} ${CELL * 0.3} ${cx} 0`
                  : `M ${cx} ${CELL}
                      C ${cx} ${CELL * 0.62} ${cx + CELL * 0.36} ${CELL * 0.38} ${cx + CELL * 0.36} 0`
              }
              stroke={road}
              strokeWidth={roadWidth}
              strokeLinecap="butt"
              fill="none"
            />
            <path
              d={
                piece.type === 'kinkRight' || piece.type === 'kinkLeft'
                  ? `M ${cx} ${CELL}
                      C ${cx + CELL * 0.24} ${CELL * 0.7} ${cx + CELL * 0.24} ${CELL * 0.3} ${cx} 0`
                  : `M ${cx} ${CELL}
                      C ${cx} ${CELL * 0.62} ${cx + CELL * 0.36} ${CELL * 0.38} ${cx + CELL * 0.36} 0`
              }
              stroke={stroke}
              strokeWidth={2}
              strokeDasharray="4 4"
              fill="none"
            />
          </g>
        </>
      ) : null}
      {piece.type === 'diagonal' ? (
        <>
          <line
            x1={0}
            y1={CELL}
            x2={CELL}
            y2={0}
            stroke={road}
            strokeWidth={roadWidth}
            strokeLinecap="butt"
          />
          <line
            x1={0}
            y1={CELL}
            x2={CELL}
            y2={0}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="4 4"
          />
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
      {piece.type === 'flexStraight' ? (() => {
        const spec = piece.flex ?? DEFAULT_FLEX_STRAIGHT_SPEC
        // Project the spec into the glyph cell with the same vertical span
        // the sampler uses: |spec.dr - 1| = |spec.dr| + 1 cells. Using a
        // larger denominator than the previous |spec.dr| keeps the tilt in
        // sync with the angle readout and the actual road geometry.
        const verticalUnits = Math.max(Math.abs(spec.dr - 1), 1)
        const lateralRatio = spec.dc / verticalUnits
        const exitX = cx + lateralRatio * cx * 0.7
        return (
          <>
            <line
              x1={cx}
              y1={CELL}
              x2={exitX}
              y2={0}
              stroke={road}
              strokeWidth={roadWidth}
              strokeLinecap="butt"
            />
            <line
              x1={cx}
              y1={CELL}
              x2={exitX}
              y2={0}
              stroke={stroke}
              strokeWidth={2}
              strokeDasharray="4 4"
            />
          </>
        )
      })() : null}
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
  // Allow the page to scroll on small viewports when the Advanced or
  // Templates panel grows past the viewport. Combined with `gridOuter`'s
  // basis below, desktop still sees the canvas filling the screen while
  // mobile can scroll down to reach the bottom advanced rows.
  overflowY: 'auto',
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
const headerActions: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  marginTop: 10,
}
const musicBtn: React.CSSProperties = {
  border: '1px solid #334155',
  background: '#162233',
  color: 'white',
  borderRadius: 8,
  padding: '8px 12px',
  fontWeight: 700,
  fontSize: 13,
  fontFamily: 'inherit',
  cursor: 'pointer',
}
const musicBtnActive: React.CSSProperties = {
  ...musicBtn,
  borderColor: '#ffb347',
  color: '#ffdf8a',
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
const flexBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 16px',
  borderBottom: '1px solid #1f2b3d',
  background: '#101926',
  flexWrap: 'wrap',
}
const flexLabel: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.75,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
}
const flexControl: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
}
const flexStepBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 6,
  background: '#1a2536',
  color: 'white',
  border: '1px solid #2b3a50',
  fontFamily: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
}
const flexValue: React.CSSProperties = {
  minWidth: 26,
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
}
const flexAngleHint: React.CSSProperties = {
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
  // Grow to fill remaining space on desktop, but lock a minimum height on
  // small viewports so the canvas does not get squashed when the Advanced
  // panel pushes the layout past the viewport (root scrolls instead).
  flex: '1 0 320px',
  position: 'relative',
  display: 'flex',
  minHeight: 320,
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
const numericTransformPanel: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  zIndex: 30,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '12px 14px',
  borderRadius: 10,
  background: '#0f1826',
  border: '1px solid #2b3a50',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
  pointerEvents: 'auto',
}
const numericTransformLabel: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  opacity: 0.72,
}
const numericTransformRow: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-end',
}
const numericTransformFieldLabel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 11,
  opacity: 0.78,
}
const numericTransformInput: React.CSSProperties = {
  width: 76,
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid #2b3a50',
  background: '#0a1220',
  color: '#dde7f5',
  fontVariantNumeric: 'tabular-nums',
  fontSize: 13,
}
const numericTransformActions: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
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
  // Natural height; the root container scrolls when total content
  // overflows the viewport (mobile path).
  flexShrink: 0,
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
