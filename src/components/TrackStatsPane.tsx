'use client'

import {
  averageLapMs,
  formatDuration,
  formatPlayedAt,
  type TrackStats,
} from '@/game/trackStats'
import { MenuButton, MenuOverlay, MenuPanel, menuTheme } from './MenuUI'

interface TrackStatsPaneProps {
  // Persisted engagement stats for the current slug + version. Null reads as
  // "no stats stored yet" and the panel renders a friendly empty state.
  stats: TrackStats | null
  // Slug of the current track. Surfaced in the title so the player knows what
  // these numbers belong to (handy when the same browser has been on multiple
  // tracks in rapid succession).
  slug: string
  // Player's local PB on this slug + version. Surfaced beside the average so
  // the player can see "your fastest lap vs your typical lap" at a glance.
  bestAllTimeMs: number | null
  onBack: () => void
}

export function TrackStatsPane({
  stats,
  slug,
  bestAllTimeMs,
  onBack,
}: TrackStatsPaneProps) {
  const safe = stats ?? {
    lapCount: 0,
    totalDriveMs: 0,
    sessionCount: 0,
    firstPlayedAt: null,
    lastPlayedAt: null,
  }
  const avg = averageLapMs(safe)

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
            STATS
          </div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.4,
              color: menuTheme.textMuted,
              textTransform: 'uppercase',
            }}
          >
            /{slug}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
          }}
        >
          <StatTile label="Total laps" value={String(safe.lapCount)} />
          <StatTile label="Sessions" value={String(safe.sessionCount)} />
          <StatTile
            label="Time on track"
            value={formatDuration(safe.totalDriveMs)}
          />
          <StatTile
            label="Avg lap"
            value={avg !== null ? formatLapTime(avg) : '--'}
          />
          <StatTile
            label="Best lap"
            value={bestAllTimeMs !== null ? formatLapTime(bestAllTimeMs) : '--'}
            accent
          />
          <StatTile
            label="Last played"
            value={formatPlayedAt(safe.lastPlayedAt)}
          />
        </div>

        {safe.firstPlayedAt !== null ? (
          <div
            style={{
              fontSize: 12,
              color: menuTheme.textMuted,
              textAlign: 'center',
              letterSpacing: 0.5,
            }}
          >
            First raced on {formatPlayedAt(safe.firstPlayedAt)}.
          </div>
        ) : (
          <div
            style={{
              padding: '14px 8px',
              textAlign: 'center',
              color: menuTheme.textMuted,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            No laps logged on this track yet. Cross the finish line to start
            building a record.
          </div>
        )}

        <MenuButton click="back" onClick={onBack}>
          Back
        </MenuButton>
      </MenuPanel>
    </MenuOverlay>
  )
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div
      style={{
        background: menuTheme.rowBg,
        border: `1px solid ${
          accent ? menuTheme.accentBg : menuTheme.panelBorder
        }`,
        borderRadius: 8,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
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
          fontSize: 16,
          fontWeight: 700,
          color: accent ? menuTheme.accent : menuTheme.textPrimary,
        }}
      >
        {value}
      </div>
    </div>
  )
}

// Mirror LapHistory's lap-time formatter so the pane reads identically. Kept
// local so a refactor of one display does not silently change the other.
function formatLapTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '--:--.---'
  const total = Math.max(0, Math.round(ms))
  const minutes = Math.floor(total / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const millis = total % 1000
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}
