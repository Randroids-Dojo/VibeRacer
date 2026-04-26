'use client'

import {
  formatSessionDuration,
  type SessionSummaryStats,
} from '@/game/sessionSummary'
import { MenuButton, MenuOverlay, MenuPanel, menuTheme } from './MenuUI'

interface SessionSummaryProps {
  stats: SessionSummaryStats
  // Slug of the current track. Surfaced in the header so the player knows
  // which track these numbers belong to (a session may span multiple visits
  // in rapid succession).
  slug: string
  // Closes the pane and returns to the pause menu without leaving the
  // session. Used by the "Back" button so a player who clicked Exit by
  // mistake can recover without losing their lap log.
  onBack: () => void
  // Restarts the race and closes the pane. The player stays on the track and
  // the lap log resets, mirroring the pause-menu Restart button.
  onRaceAgain: () => void
  // Routes to the title screen. The session ends and the lap log is
  // discarded along with the page navigation.
  onExit: () => void
  // Optional Share button. The handler should reuse the same Web Share /
  // clipboard helper as the pause-menu Share entry. When omitted the Share
  // button hides (e.g. on a fresh session with no PB to brag about).
  onShare?: () => void
  shareLabel?: string
}

export function SessionSummary({
  stats,
  slug,
  onBack,
  onRaceAgain,
  onExit,
  onShare,
  shareLabel,
}: SessionSummaryProps) {
  const hasLaps = stats.lapCount > 0
  const deltaTone = stats.beatsAllTime
    ? menuTheme.accent
    : stats.deltaVsAllTimeMs !== null && stats.deltaVsAllTimeMs > 0
      ? menuTheme.textMuted
      : menuTheme.textPrimary
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
            SESSION
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

        {hasLaps ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 8,
            }}
          >
            <StatTile label="Laps" value={String(stats.lapCount)} />
            <StatTile
              label="Time on page"
              value={formatSessionDuration(stats.sessionDurationMs)}
            />
            <StatTile
              label="Best lap"
              value={
                stats.bestLapMs !== null ? formatLapTime(stats.bestLapMs) : '--'
              }
              accent
            />
            <StatTile
              label="Avg lap"
              value={
                stats.averageLapMs !== null
                  ? formatLapTime(stats.averageLapMs)
                  : '--'
              }
            />
            <StatTile
              label="Total lap time"
              value={
                stats.totalLapMs !== null
                  ? formatLapTime(stats.totalLapMs)
                  : '--'
              }
            />
            <StatTile
              label={stats.beatsAllTime ? 'New PB' : 'Vs PB'}
              value={
                stats.deltaVsAllTimeMs !== null
                  ? formatSignedDelta(stats.deltaVsAllTimeMs)
                  : 'first run'
              }
              accent={stats.beatsAllTime}
              sub={
                stats.priorAllTimeMs !== null
                  ? `prior ${formatLapTime(stats.priorAllTimeMs)}`
                  : 'no prior PB'
              }
              valueColorOverride={deltaTone}
            />
            {stats.driftBest !== null ? (
              <StatTile
                label="Drift best"
                value={String(Math.round(stats.driftBest))}
                sub="this session"
              />
            ) : null}
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
            No laps completed this session. Race a lap to log one for the
            summary.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <MenuButton variant="primary" click="confirm" onClick={onRaceAgain}>
            Race again
          </MenuButton>
          {onShare ? (
            <MenuButton click="soft" onClick={onShare}>
              {shareLabel ?? 'Share session'}
            </MenuButton>
          ) : null}
          <MenuButton click="confirm" onClick={onExit}>
            Exit to title
          </MenuButton>
          <MenuButton variant="ghost" click="back" onClick={onBack}>
            Back
          </MenuButton>
        </div>
      </MenuPanel>
    </MenuOverlay>
  )
}

function StatTile({
  label,
  value,
  accent,
  sub,
  valueColorOverride,
}: {
  label: string
  value: string
  accent?: boolean
  sub?: string
  // When provided, overrides the accent / primary tinting for the value
  // text. The delta tile uses this so a "+1.234" reads muted while a
  // "-0.234" pops in accent without conflating accent with PB-set state.
  valueColorOverride?: string
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
          color:
            valueColorOverride ??
            (accent ? menuTheme.accent : menuTheme.textPrimary),
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

function formatLapTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '--:--.---'
  const total = Math.max(0, Math.round(ms))
  const minutes = Math.floor(total / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const millis = total % 1000
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

function formatSignedDelta(ms: number): string {
  if (!Number.isFinite(ms)) return '+0.000'
  const sign = ms > 0 ? '+' : ms < 0 ? '-' : '+'
  const abs = Math.abs(ms)
  const seconds = Math.floor(abs / 1000)
  const millis = Math.round(abs % 1000)
  const adjSeconds = millis === 1000 ? seconds + 1 : seconds
  const adjMillis = millis === 1000 ? 0 : millis
  return `${sign}${adjSeconds}.${String(adjMillis).padStart(3, '0')}`
}
