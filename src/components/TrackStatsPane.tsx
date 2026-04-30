'use client'

import {
  averageLapMs,
  formatDuration,
  formatPlayedAt,
  type TrackStats,
} from '@/game/trackStats'
import {
  REACTION_TIME_TIER_LABELS,
  classifyReactionTime,
  formatReactionTime,
} from '@/game/reactionTime'
import {
  TOP_SPEED_TIER_LABELS,
  classifyTopSpeed,
  formatTopSpeed,
} from '@/game/topSpeedPb'
import { type SpeedUnit } from '@/lib/speedometer'
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
  // All-time best PB streak (consecutive PB laps in a single session) on this
  // slug + version. Persists across sessions; null when no streak has been
  // recorded yet.
  pbStreakBestEver: number | null
  // Live PB streak in the CURRENT session. Surfaced as a "now" pill so the
  // player can see how close they are to beating the all-time mark while
  // paused. Zero collapses the live pill cleanly.
  pbStreakLive: number
  // All-time best reaction time (ms) at the GO light on this slug + version.
  // Mirrors the per-track localStorage value the HUD chip writes. Null when
  // no reaction has been recorded yet so the tile shows a friendly "--".
  bestReactionMs: number | null
  // Lifetime best reaction time (ms) across every (slug, version). Null when
  // no reaction has been recorded yet across any track.
  lifetimeBestReactionMs: number | null
  // Per-track best top speed (raw "us") on this slug + version. Mirrors the
  // value the HUD top-speed PB watcher writes through `writeLocalBestTopSpeed`.
  // Null when no qualifying top speed has been recorded yet.
  bestTopSpeedUs: number | null
  // Lifetime best top speed across every (slug, version). Null when no
  // qualifying top speed has been recorded yet on any track.
  lifetimeBestTopSpeedUs: number | null
  // Player's display unit for converting the stored "us" value into a
  // human-readable mph / km/h string. Mirrors the Settings pane choice.
  speedUnit: SpeedUnit
  // Player's current `maxSpeed` tuning. Used to classify the per-track top
  // speed into a tier label (warm / fast / blazing / redline) so the tile
  // reads as a dial position rather than a bare number.
  carMaxSpeed: number
  onBack: () => void
}

export function TrackStatsPane({
  stats,
  slug,
  bestAllTimeMs,
  pbStreakBestEver,
  pbStreakLive,
  bestReactionMs,
  lifetimeBestReactionMs,
  bestTopSpeedUs,
  lifetimeBestTopSpeedUs,
  speedUnit,
  carMaxSpeed,
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
    <MenuOverlay zIndex={100} onBack={onBack}>
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
          <StatTile
            label="Best PB streak"
            value={
              pbStreakBestEver !== null && pbStreakBestEver > 0
                ? `x${pbStreakBestEver}`
                : '--'
            }
            sub={
              pbStreakLive >= 1
                ? `now: x${pbStreakLive}`
                : 'consecutive PBs'
            }
          />
          <StatTile
            label="Best reaction"
            value={
              bestReactionMs !== null && bestReactionMs > 0
                ? formatReactionTime(bestReactionMs)
                : '--'
            }
            sub={
              bestReactionMs !== null && bestReactionMs > 0
                ? REACTION_TIME_TIER_LABELS[
                    classifyReactionTime(bestReactionMs)
                  ].toLowerCase()
                : 'first throttle after GO'
            }
          />
          <StatTile
            label="Best ever (any track)"
            value={
              lifetimeBestReactionMs !== null && lifetimeBestReactionMs > 0
                ? formatReactionTime(lifetimeBestReactionMs)
                : '--'
            }
            sub="reaction across all tracks"
          />
          <StatTile
            label="Top speed"
            value={
              bestTopSpeedUs !== null && bestTopSpeedUs > 0
                ? formatTopSpeed(bestTopSpeedUs, speedUnit)
                : '--'
            }
            sub={
              bestTopSpeedUs !== null && bestTopSpeedUs > 0
                ? TOP_SPEED_TIER_LABELS[
                    classifyTopSpeed(bestTopSpeedUs, carMaxSpeed)
                  ].toLowerCase()
                : 'fastest you have hit here'
            }
          />
          <StatTile
            label="Top speed (any track)"
            value={
              lifetimeBestTopSpeedUs !== null && lifetimeBestTopSpeedUs > 0
                ? formatTopSpeed(lifetimeBestTopSpeedUs, speedUnit)
                : '--'
            }
            sub="top speed across all tracks"
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
  sub,
}: {
  label: string
  value: string
  accent?: boolean
  // Optional secondary line under the value. Used by the streak tile to show
  // the live in-session count under the all-time best so the player can see
  // both numbers without leaving the pane.
  sub?: string
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
      {sub ? (
        <div
          style={{
            fontSize: 10,
            color: menuTheme.textMuted,
            letterSpacing: 0.4,
          }}
        >
          {sub}
        </div>
      ) : null}
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
