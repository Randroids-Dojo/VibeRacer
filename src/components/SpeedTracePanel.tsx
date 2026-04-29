'use client'
import { useMemo, useState, type CSSProperties } from 'react'
import type { Piece } from '@/lib/schemas'
import type { LapTelemetry, OffTrackEvent } from '@/game/offTrackEvents'
import { buildTrackPath } from '@/game/trackPath'
import { buildMinimapGeometry } from '@/game/minimap'
import {
  buildLinePath,
  niceTicks,
  speedColor,
  speedFraction,
} from '@/lib/speedTraceGraph'

interface Props {
  telemetry: LapTelemetry
  /** Track pieces the lap was driven on. Required for the Track view. */
  pieces: Piece[]
  /**
   * The car's max-speed cap from the round's params. Used to color the
   * Track view's per-segment speed ramp and to draw a dashed cap line on
   * the Time view. Falls back to the highest sampled speed when omitted.
   */
  maxSpeed?: number
}

type View = 'time' | 'track'

const VIEW_W = 480
const VIEW_H = 220
const PAD_LEFT = 36
const PAD_RIGHT = 12
const PAD_TOP = 14
const PAD_BOTTOM = 26

const TRACK_VIEW_SIZE = 280

export function SpeedTracePanel({ telemetry, pieces, maxSpeed }: Props) {
  const [view, setView] = useState<View>('time')

  const peakSpeed = useMemo(() => {
    let p = 0
    for (const s of telemetry.speeds) if (s > p) p = s
    return p
  }, [telemetry.speeds])
  const maxRef = Math.max(maxSpeed ?? 0, peakSpeed, 1)

  return (
    <div style={panel}>
      <div style={panelHeader}>
        <div style={panelTitle}>Speed trace</div>
        <div style={toggleRow} role="tablist" aria-label="Speed trace view">
          <button
            role="tab"
            aria-selected={view === 'time'}
            onClick={() => setView('time')}
            style={{
              ...toggleBtn,
              background: view === 'time' ? '#ff6b35' : '#0e0e0e',
              color: view === 'time' ? 'white' : '#cfcfcf',
              borderColor: view === 'time' ? '#ff6b35' : '#3a3a3a',
            }}
          >
            Time
          </button>
          <button
            role="tab"
            aria-selected={view === 'track'}
            onClick={() => setView('track')}
            style={{
              ...toggleBtn,
              background: view === 'track' ? '#ff6b35' : '#0e0e0e',
              color: view === 'track' ? 'white' : '#cfcfcf',
              borderColor: view === 'track' ? '#ff6b35' : '#3a3a3a',
            }}
          >
            Track
          </button>
        </div>
      </div>

      {view === 'time' ? (
        <TimeView telemetry={telemetry} maxRef={maxRef} />
      ) : (
        <TrackView
          telemetry={telemetry}
          pieces={pieces}
          maxRef={maxRef}
        />
      )}
      <Legend maxRef={maxRef} />
    </div>
  )
}

function TimeView({
  telemetry,
  maxRef,
}: {
  telemetry: LapTelemetry
  maxRef: number
}) {
  const { sampleMs, speeds, offTrackEvents } = telemetry
  const totalMs = Math.max((speeds.length - 1) * sampleMs, 1)

  const xTicks = useMemo(
    () => niceTicks(0, totalMs / 1000, 5),
    [totalMs],
  )
  const yTicks = useMemo(() => niceTicks(0, maxRef, 5), [maxRef])

  const xMin = xTicks.niceMin
  const xMax = Math.max(xTicks.niceMax, totalMs / 1000)
  const yMin = yTicks.niceMin
  const yMax = Math.max(yTicks.niceMax, maxRef)

  const innerW = VIEW_W - PAD_LEFT - PAD_RIGHT
  const innerH = VIEW_H - PAD_TOP - PAD_BOTTOM

  const xToPx = (xSec: number): number =>
    PAD_LEFT + ((xSec - xMin) / Math.max(xMax - xMin, 1e-6)) * innerW
  const yToPx = (y: number): number =>
    PAD_TOP + (1 - (y - yMin) / Math.max(yMax - yMin, 1e-6)) * innerH

  const linePoints: Array<[number, number]> = useMemo(() => {
    const pts: Array<[number, number]> = new Array(speeds.length)
    for (let i = 0; i < speeds.length; i++) {
      const tSec = (i * sampleMs) / 1000
      pts[i] = [xToPx(tSec), yToPx(speeds[i])]
    }
    return pts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speeds, sampleMs, xMin, xMax, yMin, yMax])

  const pathD = useMemo(() => buildLinePath(linePoints), [linePoints])

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      height={VIEW_H}
      style={svgStyle}
      role="img"
      aria-label="Speed over lap time"
    >
      <rect
        x={PAD_LEFT}
        y={PAD_TOP}
        width={innerW}
        height={innerH}
        fill="#0a0a0a"
        stroke="#222"
      />
      {yTicks.values.map((v) => (
        <g key={`y-${v}`}>
          <line
            x1={PAD_LEFT}
            x2={PAD_LEFT + innerW}
            y1={yToPx(v)}
            y2={yToPx(v)}
            stroke="#1f1f1f"
            strokeDasharray="2 4"
          />
          <text
            x={PAD_LEFT - 4}
            y={yToPx(v) + 3}
            textAnchor="end"
            fill="#9a9a9a"
            fontSize={9}
            fontFamily="monospace"
          >
            {formatAxisNumber(v)}
          </text>
        </g>
      ))}
      {xTicks.values.map((v) => (
        <g key={`x-${v}`}>
          <line
            x1={xToPx(v)}
            x2={xToPx(v)}
            y1={PAD_TOP}
            y2={PAD_TOP + innerH}
            stroke="#1f1f1f"
            strokeDasharray="2 4"
          />
          <text
            x={xToPx(v)}
            y={PAD_TOP + innerH + 12}
            textAnchor="middle"
            fill="#9a9a9a"
            fontSize={9}
            fontFamily="monospace"
          >
            {formatAxisNumber(v)}s
          </text>
        </g>
      ))}
      {offTrackEvents.map((ev, i) => {
        const startSec = ev.lapMs / 1000
        const endSec = (ev.lapMs + ev.durationMs) / 1000
        const x = xToPx(startSec)
        const w = Math.max(2, xToPx(endSec) - x)
        return (
          <rect
            key={`off-${i}`}
            x={x}
            y={PAD_TOP}
            width={w}
            height={innerH}
            fill="rgba(255, 90, 90, 0.18)"
            stroke="rgba(255, 90, 90, 0.55)"
            strokeWidth={0.7}
          />
        )
      })}
      {Number.isFinite(maxRef) ? (
        <line
          x1={PAD_LEFT}
          x2={PAD_LEFT + innerW}
          y1={yToPx(maxRef)}
          y2={yToPx(maxRef)}
          stroke="#5fe08a"
          strokeWidth={0.8}
          strokeDasharray="3 3"
          opacity={0.5}
        />
      ) : null}
      <path
        d={pathD}
        fill="none"
        stroke="#ff8a3c"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x={PAD_LEFT}
        y={PAD_TOP - 4}
        fill="#cfcfcf"
        fontSize={9}
        fontFamily="monospace"
      >
        m/s
      </text>
    </svg>
  )
}

function TrackView({
  telemetry,
  pieces,
  maxRef,
}: {
  telemetry: LapTelemetry
  pieces: Piece[]
  maxRef: number
}) {
  const geometry = useMemo(() => {
    try {
      return buildMinimapGeometry(buildTrackPath(pieces), TRACK_VIEW_SIZE, 8)
    } catch {
      return null
    }
  }, [pieces])

  if (geometry === null) {
    return (
      <div style={emptyNote}>Track shape unavailable</div>
    )
  }

  const view = geometry.viewSize
  const samples = telemetry.positions
  const speeds = telemetry.speeds

  const segments: Array<{ d: string; color: string }> = []
  for (let i = 1; i < samples.length; i++) {
    const a = geometry.worldToView(samples[i - 1][0], samples[i - 1][1])
    const b = geometry.worldToView(samples[i][0], samples[i][1])
    const sp = (speeds[i - 1] + speeds[i]) / 2
    const t = speedFraction(sp, maxRef)
    segments.push({
      d: `M${a.x.toFixed(2)} ${a.y.toFixed(2)} L${b.x.toFixed(2)} ${b.y.toFixed(2)}`,
      color: speedColor(t),
    })
  }

  return (
    <svg
      viewBox={`0 0 ${view} ${view}`}
      width="100%"
      height={view}
      style={svgStyle}
      role="img"
      aria-label="Speed projected on the lap track"
    >
      <rect x={0} y={0} width={view} height={view} fill="#0a0a0a" />
      {geometry.pieces.map((d, i) => (
        <path
          key={`piece-${i}`}
          d={d}
          fill="none"
          stroke="#2a2a2a"
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {segments.map((seg, i) => (
        <path
          key={`seg-${i}`}
          d={seg.d}
          stroke={seg.color}
          strokeWidth={2.2}
          strokeLinecap="round"
          fill="none"
        />
      ))}
      {telemetry.offTrackEvents.map((ev, i) => {
        const v = geometry.worldToView(ev.x, ev.z)
        const r = 3.5
        return (
          <g key={`offmark-${i}`}>
            <polygon
              points={`${(v.x).toFixed(2)},${(v.y - r).toFixed(2)} ${(v.x + r).toFixed(2)},${(v.y + r).toFixed(2)} ${(v.x - r).toFixed(2)},${(v.y + r).toFixed(2)}`}
              fill="rgba(255, 80, 80, 0.95)"
              stroke="white"
              strokeWidth={0.6}
            />
          </g>
        )
      })}
    </svg>
  )
}

function Legend({ maxRef }: { maxRef: number }) {
  const stops = [0, 0.25, 0.5, 0.75, 1]
  return (
    <div style={legendRow}>
      <span style={legendLabel}>0 m/s</span>
      <div style={legendBar}>
        {stops.map((t) => (
          <div
            key={t}
            style={{
              flex: 1,
              background: speedColor(t),
              height: 6,
              borderRadius: 2,
            }}
          />
        ))}
      </div>
      <span style={legendLabel}>{Math.round(maxRef)} m/s</span>
    </div>
  )
}

function formatAxisNumber(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(1)
}

const panel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 12,
  background: '#1d1d1d',
  borderRadius: 8,
  color: 'white',
}
const panelHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}
const panelTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: 0.5,
}
const toggleRow: CSSProperties = {
  display: 'flex',
  gap: 4,
}
const toggleBtn: CSSProperties = {
  border: '1px solid #3a3a3a',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.5,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const svgStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  background: '#0a0a0a',
  borderRadius: 6,
}
const legendRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 10,
  fontFamily: 'monospace',
  opacity: 0.75,
}
const legendLabel: CSSProperties = {
  flex: '0 0 auto',
}
const legendBar: CSSProperties = {
  flex: 1,
  display: 'flex',
  gap: 1,
}
const emptyNote: CSSProperties = {
  fontSize: 12,
  opacity: 0.6,
  fontStyle: 'italic',
  padding: 12,
  textAlign: 'center',
}
