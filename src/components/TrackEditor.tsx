'use client'
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Piece } from '@/lib/schemas'
import { MAX_PIECES_PER_TRACK, MIN_CHECKPOINT_COUNT } from '@/lib/schemas'
import type { Dir } from '@/game/track'
import { cellKey, validateClosedLoop } from '@/game/track'
import {
  getBounds,
  getStartExitDir,
  moveStartTo,
  reverseStartDirection,
  withCellCycled,
} from '@/game/editor'

interface TrackEditorProps {
  slug: string
  initialPieces: Piece[]
  initialCheckpointCount?: number
}

const CELL = 56
const PAD_CELLS = 2

export function TrackEditor({
  slug,
  initialPieces,
  initialCheckpointCount,
}: TrackEditorProps) {
  const router = useRouter()
  const [pieces, setPieces] = useState<Piece[]>(initialPieces)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // null = "default" (one CP per piece). Number = explicit override.
  const [checkpointCount, setCheckpointCount] = useState<number | null>(
    initialCheckpointCount !== undefined &&
      initialCheckpointCount !== initialPieces.length
      ? initialCheckpointCount
      : null,
  )

  const validation = useMemo(() => validateClosedLoop(pieces), [pieces])

  const bounds = useMemo(() => getBounds(pieces), [pieces])
  const rowMin = bounds.rowMin - PAD_CELLS
  const rowMax = bounds.rowMax + PAD_CELLS
  const colMin = bounds.colMin - PAD_CELLS
  const colMax = bounds.colMax + PAD_CELLS
  const width = (colMax - colMin + 1) * CELL
  const height = (rowMax - rowMin + 1) * CELL

  const cellMap = useMemo(() => {
    const m = new Map<string, Piece>()
    for (const p of pieces) m.set(cellKey(p.row, p.col), p)
    return m
  }, [pieces])

  const startKey =
    pieces.length > 0 ? cellKey(pieces[0].row, pieces[0].col) : null
  const startExitDir = getStartExitDir(pieces)

  // Keep callbacks stable so the memoized <Cell> children are not invalidated
  // by every render. Latest state is read through refs.
  const latestRef = useRef({ cellMap, startKey, error })
  latestRef.current = { cellMap, startKey, error }

  const cycleAt = useCallback((row: number, col: number) => {
    setPieces((prev) => {
      const next = withCellCycled(prev, row, col)
      if (next.length > MAX_PIECES_PER_TRACK) return prev
      return next
    })
    if (latestRef.current.error !== null) setError(null)
  }, [])

  const setStartOrReverse = useCallback((row: number, col: number) => {
    const key = cellKey(row, col)
    const { cellMap: cm, startKey: sk, error: err } = latestRef.current
    if (!cm.has(key)) return
    setPieces((prev) =>
      key === sk ? reverseStartDirection(prev) : moveStartTo(prev, row, col),
    )
    if (err !== null) setError(null)
  }, [])

  function cellFromEvent(e: React.MouseEvent<SVGSVGElement>): { row: number; col: number } | null {
    const target = (e.target as Element).closest('[data-row]') as SVGElement | null
    if (!target) return null
    const row = Number(target.getAttribute('data-row'))
    const col = Number(target.getAttribute('data-col'))
    if (Number.isNaN(row) || Number.isNaN(col)) return null
    return { row, col }
  }

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const cell = cellFromEvent(e)
    if (cell) cycleAt(cell.row, cell.col)
  }, [cycleAt])

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
    setError(null)
  }

  // Clamp the override whenever piece count drops below it.
  const cpMax = pieces.length
  const cpMin = Math.min(MIN_CHECKPOINT_COUNT, cpMax)
  const effectiveCp =
    checkpointCount === null
      ? cpMax
      : Math.max(cpMin, Math.min(cpMax, checkpointCount))
  const cpInputDisabled = cpMax < MIN_CHECKPOINT_COUNT

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
      const reqBody: { pieces: Piece[]; checkpointCount?: number } = { pieces }
      if (checkpointCount !== null && effectiveCp !== cpMax) {
        reqBody.checkpointCount = effectiveCp
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
          Click a cell to cycle piece and rotation. Right-click (or long-press
          on touch) a piece to make it the start. Reverse direction with the
          button below.
        </div>
      </div>

      <div style={gridWrap}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{
            display: 'block',
            background: '#162233',
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
          onClick={handleSvgClick}
          onContextMenu={handleSvgContextMenu}
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
                  startExitDir={isStart ? startExitDir : null}
                />
              )
            }),
          )}
        </svg>
      </div>

      <div style={footer}>
        <div style={status}>
          <span>{pieces.length} / {MAX_PIECES_PER_TRACK} pieces</span>
          <label style={cpLabel}>
            <span>Checkpoints</span>
            <input
              type="number"
              min={cpMin}
              max={cpMax}
              value={effectiveCp}
              disabled={cpInputDisabled}
              onChange={(e) => onCpChange(e.target.value)}
              style={cpInput}
            />
            <span style={cpHint}>
              {checkpointCount === null ? 'default' : `of ${cpMax}`}
            </span>
          </label>
          <span style={{ color: validation.ok ? '#6ee787' : '#ffb86b' }}>
            {validation.ok ? 'valid closed loop' : (validation.reason ?? 'invalid')}
          </span>
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
            onClick={save}
            disabled={!validation.ok || saving}
            style={{
              ...btnPrimary,
              opacity: validation.ok && !saving ? 1 : 0.5,
              cursor: validation.ok && !saving ? 'pointer' : 'not-allowed',
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
  startExitDir: Dir | null
}

const Cell = memo(function Cell({ row, col, x, y, piece, isStart, startExitDir }: CellProps) {
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
    </g>
  )
})

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
const gridWrap: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  display: 'grid',
  placeItems: 'center',
  padding: 20,
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
}
const cpLabel: React.CSSProperties = {
  display: 'inline-flex',
  gap: 6,
  alignItems: 'center',
  fontSize: 13,
  opacity: 0.9,
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
