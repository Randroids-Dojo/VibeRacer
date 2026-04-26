'use client'

import { useMemo } from 'react'
import {
  formatLapDelta,
  summarizeHistory,
  type LapHistoryEntry,
} from '@/game/lapHistory'
import {
  MenuButton,
  MenuOverlay,
  MenuPanel,
  menuTheme,
} from './MenuUI'

interface LapHistoryProps {
  entries: readonly LapHistoryEntry[]
  // Player's local PB on this slug + version. Drives the highlight on the
  // matching entry plus the summary header value.
  bestAllTimeMs: number | null
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

export function LapHistory({ entries, bestAllTimeMs, onBack }: LapHistoryProps) {
  const stats = useMemo(() => summarizeHistory(entries), [entries])
  // Walk newest-first so the freshest lap sits at the top of the scroll.
  const ordered = useMemo(() => [...entries].reverse(), [entries])

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
}: {
  entry: LapHistoryEntry
  isCurrentBest: boolean
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
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '52px 1fr auto auto',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 6,
        background: isCurrentBest
          ? 'rgba(255, 107, 53, 0.10)'
          : menuTheme.panelBg,
        border: accentBorder,
      }}
    >
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
    </div>
  )
}
