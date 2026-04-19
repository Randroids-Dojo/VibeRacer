'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Piece } from '@/lib/schemas'
import { MAX_PIECES_PER_TRACK } from '@/lib/schemas'
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
}

const CELL = 56
const PAD_CELLS = 2

export function TrackEditor({ slug, initialPieces }: TrackEditorProps) {
  const router = useRouter()
  const [pieces, setPieces] = useState<Piece[]>(initialPieces)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  function clickCell(row: number, col: number) {
    setPieces((prev) => {
      const next = withCellCycled(prev, row, col)
      if (next.length > MAX_PIECES_PER_TRACK) return prev
      return next
    })
    if (error !== null) setError(null)
  }

  function setStartOrReverse(row: number, col: number) {
    const key = cellKey(row, col)
    if (!cellMap.has(key)) return
    setPieces((prev) =>
      key === startKey ? reverseStartDirection(prev) : moveStartTo(prev, row, col),
    )
    if (error !== null) setError(null)
  }

  function clearAll() {
    setPieces([])
    setError(null)
  }

  async function save() {
    if (!validation.ok || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/track/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pieces }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string
          reason?: string
        }
        setError(body.reason || body.error || `save failed (${res.status})`)
        setSaving(false)
        return
      }
      const body = (await res.json()) as { versionHash: string }
      router.push(`/${slug}?v=${body.versionHash}`)
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
          on touch) to make a piece the start, or to reverse direction if it is
          already the start.
        </div>
      </div>

      <div style={gridWrap}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ display: 'block', background: '#162233' }}
        >
          {rows.map((r) =>
            cols.map((c) => {
              const x = (c - colMin) * CELL
              const y = (r - rowMin) * CELL
              const key = cellKey(r, c)
              const piece = cellMap.get(key)
              const isStart = key === startKey
              return (
                <g
                  key={key}
                  transform={`translate(${x}, ${y})`}
                  onClick={() => clickCell(r, c)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setStartOrReverse(r, c)
                  }}
                  style={{ cursor: 'pointer', touchAction: 'manipulation' }}
                >
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
            }),
          )}
        </svg>
      </div>

      <div style={footer}>
        <div style={status}>
          <span>{pieces.length} / {MAX_PIECES_PER_TRACK} pieces</span>
          <span style={{ color: validation.ok ? '#6ee787' : '#ffb86b' }}>
            {validation.ok ? 'valid closed loop' : (validation.reason ?? 'invalid')}
          </span>
          {error ? <span style={{ color: '#ff6b6b' }}>{error}</span> : null}
        </div>
        <div style={buttons}>
          <button onClick={cancel} style={btnGhost}>Cancel</button>
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
