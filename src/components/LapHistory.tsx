'use client'

import { useMemo, useState } from 'react'
import {
  formatLapDelta,
  summarizeHistory,
  type LapHistoryEntry,
} from '@/game/lapHistory'
import type { SectorDuration } from '@/game/optimalLap'
import {
  buildLapChartGeometry,
  pointsToPolyline,
} from '@/game/lapChart'
import {
  MenuButton,
  MenuOverlay,
  MenuPanel,
  menuTheme,
} from './MenuUI'

const CHART_WIDTH = 460
const CHART_HEIGHT = 80
const CHART_PAD_Y = 8
// Hide the chart for sub-2 entry sessions: a single tick reads as a stray dot
// and is less informative than the existing PB chip below it. Two ticks just
// show a slope, also low signal; three is the minimum for a real trend.
const CHART_MIN_ENTRIES = 3

interface LapHistoryProps {
  entries: readonly LapHistoryEntry[]
  // Player's local PB on this slug + version. Drives the highlight on the
  // matching entry plus the summary header value.
  bestAllTimeMs: number | null
  // Per-sector all-time bests on this slug + version. When a lap's sector
  // duration matches the corresponding all-time best, the sector chip in the
  // expanded breakdown gets a star so the player can see at a glance which
  // sectors of a specific lap were optimal-run material.
  bestSectors: readonly SectorDuration[]
  onBack: () => void
}

function formatLapTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '--:--.---'
  const total = Math.max(0, Math.round(ms))
  const minutes = Math.floor(total / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const millis = total % 1000
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

export function LapHistory({
  entries,
  bestAllTimeMs,
  bestSectors,
  onBack,
}: LapHistoryProps) {
  const stats = useMemo(() => summarizeHistory(entries), [entries])
  // Walk newest-first so the freshest lap sits at the top of the scroll.
  const ordered = useMemo(() => [...entries].reverse(), [entries])
  // Tracks which lap rows are expanded into a sector breakdown. Multi-select
  // by design: the player may want to compare two laps' sector tables at the
  // same time. Resets on unmount (tied to the pause overlay's lifecycle).
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set())
  const bestSectorById = useMemo(() => {
    const map = new Map<number, number>()
    for (const s of bestSectors) {
      if (Number.isFinite(s.durationMs) && s.durationMs > 0) {
        map.set(s.cpId, s.durationMs)
      }
    }
    return map
  }, [bestSectors])
  const fastestSectorByCpId = useMemo(() => {
    const map = new Map<number, number>()
    for (const entry of entries) {
      for (const s of entry.sectors) {
        if (!Number.isFinite(s.durationMs) || s.durationMs <= 0) continue
        const prev = map.get(s.cpId)
        if (prev === undefined || s.durationMs < prev) {
          map.set(s.cpId, s.durationMs)
        }
      }
    }
    return map
  }, [entries])
  function toggleExpanded(lapNumber: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(lapNumber)) next.delete(lapNumber)
      else next.add(lapNumber)
      return next
    })
  }
  // Geometry runs over the original chronological order (oldest -> newest)
  // so the line reads left-to-right as the session progressed. Only built
  // once per history-change so React re-renders on unrelated state are cheap.
  const showChart = entries.length >= CHART_MIN_ENTRIES
  const chartGeom = useMemo(
    () =>
      showChart
        ? buildLapChartGeometry(entries, {
            width: CHART_WIDTH,
            height: CHART_HEIGHT,
            padY: CHART_PAD_Y,
          })
        : null,
    [entries, showChart],
  )

  return (
    <MenuOverlay zIndex={100}>
      <MenuPanel width="wide">
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2 }}>
            LAPS
          </div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.4,
              color: menuTheme.textMuted,
              textTransform: 'uppercase',
            }}
          >
            this session
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
          }}
        >
          <SummaryStat label="Laps" value={stats.count.toString()} />
          <SummaryStat
            label="Best"
            value={stats.bestMs !== null ? formatLapTime(stats.bestMs) : '--'}
          />
          <SummaryStat
            label="Average"
            value={stats.averageMs !== null ? formatLapTime(stats.averageMs) : '--'}
          />
        </div>

        {chartGeom && chartGeom.points.length > 0 ? (
          <LapChart
            geometry={chartGeom}
            width={CHART_WIDTH}
            height={CHART_HEIGHT}
            bestAllTimeMs={bestAllTimeMs}
          />
        ) : null}

        {entries.length === 0 ? (
          <div
            style={{
              padding: '32px 8px',
              textAlign: 'center',
              color: menuTheme.textMuted,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            No laps yet this session. Cross the finish line to log a time.
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              maxHeight: '50vh',
              overflowY: 'auto',
              border: `1px solid ${menuTheme.panelBorder}`,
              borderRadius: 8,
              padding: 6,
              background: menuTheme.inputBg,
            }}
          >
            {ordered.map((entry) => (
              <LapRow
                key={entry.lapNumber}
                entry={entry}
                isCurrentBest={
                  bestAllTimeMs !== null && entry.lapTimeMs === bestAllTimeMs
                }
                isExpanded={expanded.has(entry.lapNumber)}
                onToggle={() => toggleExpanded(entry.lapNumber)}
                bestSectorById={bestSectorById}
                fastestSectorInSessionByCpId={fastestSectorByCpId}
              />
            ))}
          </div>
        )}

        <MenuButton click="back" onClick={onBack}>
          Back
        </MenuButton>
      </MenuPanel>
    </MenuOverlay>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: menuTheme.rowBg,
        border: `1px solid ${menuTheme.panelBorder}`,
        borderRadius: 8,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.4,
          color: menuTheme.textMuted,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 14,
          fontWeight: 700,
          color: menuTheme.textPrimary,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function LapRow({
  entry,
  isCurrentBest,
  isExpanded,
  onToggle,
  bestSectorById,
  fastestSectorInSessionByCpId,
}: {
  entry: LapHistoryEntry
  isCurrentBest: boolean
  isExpanded: boolean
  onToggle: () => void
  bestSectorById: ReadonlyMap<number, number>
  fastestSectorInSessionByCpId: ReadonlyMap<number, number>
}) {
  const deltaText =
    entry.deltaVsPbMs !== null ? formatLapDelta(entry.deltaVsPbMs) : ''
  const deltaColor =
    entry.deltaVsPbMs === null
      ? menuTheme.textMuted
      : entry.deltaVsPbMs <= 0
        ? '#5fe08a'
        : '#ff8a8a'
  const accentBorder = isCurrentBest
    ? `1px solid ${menuTheme.accentBg}`
    : '1px solid transparent'
  const hasSectors = entry.sectors.length > 0
  return (
    <div
      style={{
        borderRadius: 6,
        background: isCurrentBest
          ? 'rgba(255, 107, 53, 0.10)'
          : menuTheme.panelBg,
        border: accentBorder,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={hasSectors ? onToggle : undefined}
        disabled={!hasSectors}
        aria-expanded={hasSectors ? isExpanded : undefined}
        aria-label={
          hasSectors
            ? `Lap ${entry.lapNumber}, ${formatLapTime(entry.lapTimeMs)}, click to ${
                isExpanded ? 'collapse' : 'expand'
              } sector breakdown`
            : `Lap ${entry.lapNumber}, ${formatLapTime(entry.lapTimeMs)}`
        }
        style={{
          all: 'unset',
          width: '100%',
          boxSizing: 'border-box',
          display: 'grid',
          gridTemplateColumns: '20px 52px 1fr auto auto',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          cursor: hasSectors ? 'pointer' : 'default',
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: menuTheme.textMuted,
            textAlign: 'center',
            opacity: hasSectors ? 1 : 0.3,
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 120ms ease',
          }}
          aria-hidden
        >
          ▶
        </div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.2,
            color: menuTheme.textMuted,
            textTransform: 'uppercase',
          }}
        >
          Lap {entry.lapNumber}
        </div>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 14,
            color: menuTheme.textPrimary,
            fontWeight: 600,
          }}
        >
          {formatLapTime(entry.lapTimeMs)}
        </div>
        {entry.isPb ? (
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1.2,
              background: menuTheme.accentBg,
              color: menuTheme.accentText,
              borderRadius: 4,
              padding: '2px 6px',
              fontWeight: 800,
            }}
          >
            PB
          </div>
        ) : (
          <div />
        )}
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 12,
            color: deltaColor,
            minWidth: 60,
            textAlign: 'right',
          }}
        >
          {deltaText || '--'}
        </div>
      </button>
      {hasSectors && isExpanded ? (
        <SectorBreakdown
          sectors={entry.sectors}
          bestSectorById={bestSectorById}
          fastestSectorInSessionByCpId={fastestSectorInSessionByCpId}
        />
      ) : null}
    </div>
  )
}

function SectorBreakdown({
  sectors,
  bestSectorById,
  fastestSectorInSessionByCpId,
}: {
  sectors: readonly SectorDuration[]
  bestSectorById: ReadonlyMap<number, number>
  fastestSectorInSessionByCpId: ReadonlyMap<number, number>
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        padding: '6px 8px 8px 28px',
        borderTop: `1px solid ${menuTheme.panelBorder}`,
        background: menuTheme.inputBg,
      }}
      aria-label="Sector breakdown"
    >
      {sectors.map((s, idx) => {
        const sectorBest = bestSectorById.get(s.cpId)
        const sessionBest = fastestSectorInSessionByCpId.get(s.cpId)
        const isAllTimeBest =
          sectorBest !== undefined && s.durationMs === sectorBest
        const isSessionBest =
          !isAllTimeBest &&
          sessionBest !== undefined &&
          s.durationMs === sessionBest
        const delta =
          sectorBest !== undefined ? s.durationMs - sectorBest : null
        const deltaColor =
          delta === null
            ? menuTheme.textMuted
            : delta <= 0
              ? '#f5c451'
              : '#ff8a8a'
        const borderColor = isAllTimeBest
          ? '#f5c451'
          : isSessionBest
            ? '#5fe08a'
            : menuTheme.panelBorder
        return (
          <div
            key={`${s.cpId}-${idx}`}
            title={
              isAllTimeBest
                ? `Sector ${idx + 1}: matched the all-time best for this checkpoint`
                : isSessionBest
                  ? `Sector ${idx + 1}: best of this session for this checkpoint`
                  : `Sector ${idx + 1}`
            }
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '4px 8px',
              borderRadius: 6,
              border: `1px solid ${borderColor}`,
              background: menuTheme.panelBg,
              minWidth: 64,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 9,
                letterSpacing: 1.2,
                color: menuTheme.textMuted,
                textTransform: 'uppercase',
              }}
            >
              <span>S{idx + 1}</span>
              {isAllTimeBest ? (
                <span style={{ color: '#f5c451' }} aria-hidden>
                  ★
                </span>
              ) : isSessionBest ? (
                <span style={{ color: '#5fe08a' }} aria-hidden>
                  ●
                </span>
              ) : null}
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 12,
                fontWeight: 700,
                color: menuTheme.textPrimary,
              }}
            >
              {formatSectorTime(s.durationMs)}
            </div>
            {delta !== null ? (
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 10,
                  color: deltaColor,
                }}
              >
                {formatLapDelta(delta)}
              </div>
            ) : (
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 10,
                  color: menuTheme.textMuted,
                }}
              >
                --
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Sector durations are typically sub-15 seconds so the leading minute slot is
// noise. Format as `S.mmm` (zero-padded millis) so a long sector reads cleanly
// up through 99 seconds.
function formatSectorTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '--.---'
  const total = Math.max(0, Math.round(ms))
  const seconds = Math.floor(total / 1000)
  const millis = total % 1000
  return `${seconds}.${String(millis).padStart(3, '0')}`
}

interface LapChartProps {
  geometry: ReturnType<typeof buildLapChartGeometry>
  width: number
  height: number
  bestAllTimeMs: number | null
}

function LapChart({ geometry, width, height, bestAllTimeMs }: LapChartProps) {
  const polyline = pointsToPolyline(geometry)
  // Draw a faint amber dashed reference line at the player's all-time PB IF
  // it sits inside the chart's visible y-range (i.e. the session has logged a
  // lap as fast or faster than the PB). Outside the range and we skip it so
  // the line never floats out at the chart edge with no anchor.
  const pbInRange =
    bestAllTimeMs !== null &&
    geometry.fastestMs !== null &&
    geometry.slowestMs !== null &&
    bestAllTimeMs >= geometry.fastestMs &&
    bestAllTimeMs <= geometry.slowestMs
  const pbY =
    pbInRange && geometry.fastestMs !== null && geometry.slowestMs !== null
      ? geometry.fastestMs === geometry.slowestMs
        ? height / 2
        : ((bestAllTimeMs! - geometry.fastestMs) /
            (geometry.slowestMs - geometry.fastestMs)) *
            (height - 2 * CHART_PAD_Y) +
          CHART_PAD_Y
      : null
  return (
    <div
      style={{
        background: menuTheme.inputBg,
        border: `1px solid ${menuTheme.panelBorder}`,
        borderRadius: 8,
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
      aria-label="Lap-time chart for this session"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          fontSize: 10,
          letterSpacing: 1.2,
          color: menuTheme.textMuted,
          textTransform: 'uppercase',
        }}
      >
        <span>Trend</span>
        <span style={{ fontFamily: 'monospace' }}>
          {geometry.fastestMs !== null
            ? `${formatLapTime(geometry.fastestMs)} fast`
            : ''}
          {geometry.slowestMs !== null && geometry.slowestMs !== geometry.fastestMs
            ? ` / ${formatLapTime(geometry.slowestMs)} slow`
            : ''}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        role="img"
        aria-label="Lap-time chart"
        style={{ display: 'block' }}
      >
        {/* Average reference line (dashed, muted) */}
        {geometry.averageY !== null ? (
          <line
            x1={0}
            x2={width}
            y1={geometry.averageY}
            y2={geometry.averageY}
            stroke={menuTheme.textMuted}
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={0.5}
          />
        ) : null}
        {/* Best (PB) reference line, gold */}
        {pbY !== null ? (
          <line
            x1={0}
            x2={width}
            y1={pbY}
            y2={pbY}
            stroke="#f5c451"
            strokeWidth={1}
            strokeDasharray="2 4"
            opacity={0.7}
          />
        ) : null}
        {/* Best of session line */}
        {geometry.bestY !== null ? (
          <line
            x1={0}
            x2={width}
            y1={geometry.bestY}
            y2={geometry.bestY}
            stroke="#5fe08a"
            strokeWidth={1}
            strokeDasharray="6 6"
            opacity={0.45}
          />
        ) : null}
        {/* Lap-time polyline */}
        {polyline ? (
          <polyline
            points={polyline}
            fill="none"
            stroke={menuTheme.accent}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {/* Per-lap markers. PB ticks render as larger gold circles so they
            pop against the orange line. Other ticks are small accent dots. */}
        {geometry.points.map((p) => (
          <circle
            key={p.entry.lapNumber}
            cx={p.x}
            cy={p.y}
            r={p.entry.isPb ? 4 : 2.5}
            fill={p.entry.isPb ? '#f5c451' : menuTheme.accent}
            stroke={p.entry.isPb ? '#1b1b1b' : 'transparent'}
            strokeWidth={p.entry.isPb ? 1 : 0}
          >
            <title>
              {`Lap ${p.entry.lapNumber}: ${formatLapTime(p.entry.lapTimeMs)}`}
            </title>
          </circle>
        ))}
      </svg>
    </div>
  )
}
