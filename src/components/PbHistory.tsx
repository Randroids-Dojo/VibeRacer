'use client'

import { useMemo } from 'react'
import {
  formatPbAge,
  pbImprovementMs,
  sortPbHistoryNewestFirst,
  summarizePbHistory,
  type PbHistoryEntry,
} from '@/lib/pbHistory'
import { MenuButton, MenuOverlay, MenuPanel, menuTheme } from './MenuUI'
import { MenuNavProvider } from './MenuNav'

interface PbHistoryProps {
  entries: readonly PbHistoryEntry[]
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

// PB-improvement deltas typically land in the sub-second to multi-second
// range. Format as `S.mmm` so the sign is always explicit and the player can
// scan the chronological column at a glance.
function formatImprovement(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const total = Math.max(0, Math.round(ms))
  const seconds = Math.floor(total / 1000)
  const millis = total % 1000
  return `-${seconds}.${String(millis).padStart(3, '0')}`
}

export function PbHistory({ entries, onBack }: PbHistoryProps) {
  const summary = useMemo(() => summarizePbHistory(entries), [entries])
  const ordered = useMemo(() => sortPbHistoryNewestFirst(entries), [entries])

  return (
    <MenuOverlay zIndex={100}>
      <MenuNavProvider onBack={onBack}>
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
            PB HISTORY
          </div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.4,
              color: menuTheme.textMuted,
              textTransform: 'uppercase',
            }}
          >
            this layout
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
          }}
        >
          <SummaryStat
            label="PBs set"
            value={summary.count > 0 ? String(summary.count) : '0'}
          />
          <SummaryStat
            label="Current"
            value={
              summary.latestMs !== null ? formatLapTime(summary.latestMs) : '--'
            }
          />
          <SummaryStat
            label="Time shaved"
            value={
              summary.totalImprovementMs > 0
                ? formatImprovement(summary.totalImprovementMs).replace(/^-/, '')
                : '--'
            }
            hint={
              summary.totalImprovementMs > 0 && summary.firstMs !== null
                ? `from ${formatLapTime(summary.firstMs)}`
                : undefined
            }
          />
        </div>

        {ordered.length === 0 ? (
          <div
            style={{
              padding: '32px 8px',
              textAlign: 'center',
              color: menuTheme.textMuted,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            No personal bests yet on this version. Set a PB to start your
            progression log.
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
            {ordered.map((entry, idx) => (
              <PbRow
                key={`${entry.achievedAt}-${idx}`}
                entry={entry}
                // The freshest PB sits at index 0 of the newest-first list and
                // mirrors the player's current all-time PB on this version.
                isCurrent={idx === 0}
              />
            ))}
          </div>
        )}

        <MenuButton click="back" onClick={onBack}>
          Back
        </MenuButton>
        </MenuPanel>
      </MenuNavProvider>
    </MenuOverlay>
  )
}

function SummaryStat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
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
      {hint ? (
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 10,
            color: menuTheme.textMuted,
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  )
}

function PbRow({
  entry,
  isCurrent,
}: {
  entry: PbHistoryEntry
  isCurrent: boolean
}) {
  const improvement = pbImprovementMs(entry)
  const age = formatPbAge(entry.achievedAt)
  const accentBorder = isCurrent
    ? `1px solid ${menuTheme.accentBg}`
    : '1px solid transparent'
  return (
    <div
      style={{
        borderRadius: 6,
        background: isCurrent
          ? 'rgba(255, 107, 53, 0.10)'
          : menuTheme.panelBg,
        border: accentBorder,
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto auto',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.2,
          color: isCurrent ? menuTheme.accent : menuTheme.textMuted,
          textTransform: 'uppercase',
          minWidth: 36,
          fontWeight: isCurrent ? 800 : 500,
        }}
      >
        {isCurrent ? 'BEST' : 'PB'}
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
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 12,
          color: improvement !== null ? '#5fe08a' : menuTheme.textMuted,
          minWidth: 72,
          textAlign: 'right',
        }}
        title={
          improvement !== null
            ? `Beat the prior PB (${formatLapTime(entry.priorBestMs ?? 0)}) by ${formatImprovement(improvement).replace(/^-/, '')}`
            : 'First personal best on this layout.'
        }
      >
        {improvement !== null ? formatImprovement(improvement) : 'first'}
      </div>
      <div
        style={{
          fontSize: 11,
          color: menuTheme.textMuted,
          minWidth: 64,
          textAlign: 'right',
        }}
      >
        {age}
      </div>
    </div>
  )
}
