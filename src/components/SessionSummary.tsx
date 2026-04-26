'use client'

import {
  formatSectorDelta,
  formatSectorDuration,
  formatSessionDuration,
  type SectorBreakdownRow,
  type SessionSummaryStats,
} from '@/game/sessionSummary'
import {
  colorForConsistencyTier,
  formatConsistencyRatio,
  formatConsistencyStdDev,
  labelForConsistencyTier,
} from '@/game/lapConsistency'
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
            {stats.consistency ? (
              <StatTile
                label="Consistency"
                value={labelForConsistencyTier(stats.consistency.tier)}
                sub={`${formatConsistencyStdDev(stats.consistency.stdDevMs)} spread (${formatConsistencyRatio(stats.consistency.stdDevRatio)})`}
                valueColorOverride={colorForConsistencyTier(stats.consistency.tier)}
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

        {hasLaps && stats.sectorBreakdown.length > 0 ? (
          <SectorBreakdownCard
            rows={stats.sectorBreakdown}
            totalLostMs={stats.totalTimeLostMs}
          />
        ) : null}

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

/**
 * "Where you lost time" card. Renders one row per sector showing the
 * session-best duration, the player's all-time best for that sector at
 * session start, and a signed delta. Rows with a positive (time-lost) delta
 * are sorted to the top biggest-loss-first so the player sees the most
 * actionable target immediately. Each row includes a small horizontal bar
 * scaled to the largest absolute delta in the breakdown so the magnitudes
 * read at a glance without crowding the panel with raw ms.
 */
function SectorBreakdownCard({
  rows,
  totalLostMs,
}: {
  rows: SectorBreakdownRow[]
  totalLostMs: number | null
}) {
  // Compute the bar scale once per render. Pure visual sugar; falls back to a
  // sentinel of 1 so a row with delta 0 never divides by zero.
  let maxAbsDelta = 0
  for (const row of rows) {
    if (row.deltaMs !== null && Math.abs(row.deltaMs) > maxAbsDelta) {
      maxAbsDelta = Math.abs(row.deltaMs)
    }
  }
  const denom = maxAbsDelta > 0 ? maxAbsDelta : 1
  const headline =
    totalLostMs !== null && totalLostMs > 0
      ? `Left ${formatTotalLost(totalLostMs)} on the table`
      : 'Session matched your best at every sector'
  return (
    <div
      style={{
        background: menuTheme.rowBg,
        border: `1px solid ${menuTheme.panelBorder}`,
        borderRadius: 10,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.4,
            color: menuTheme.textMuted,
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Where you lost time
        </div>
        <div
          style={{
            fontSize: 11,
            color:
              totalLostMs !== null && totalLostMs > 0
                ? '#f3a93b'
                : menuTheme.accent,
            fontWeight: 600,
            letterSpacing: 0.4,
          }}
        >
          {headline}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((row) => (
          <SectorBreakdownRowView key={row.cpId} row={row} denom={denom} />
        ))}
      </div>
      <div
        style={{
          fontSize: 10,
          color: menuTheme.textMuted,
          letterSpacing: 0.3,
          lineHeight: 1.4,
        }}
      >
        Compared against your all-time best per sector before this session.
      </div>
    </div>
  )
}

function SectorBreakdownRowView({
  row,
  denom,
}: {
  row: SectorBreakdownRow
  denom: number
}) {
  const hasDelta = row.deltaMs !== null
  const isLoss = hasDelta && (row.deltaMs ?? 0) > 0
  const isMatch = hasDelta && (row.deltaMs ?? 0) <= 0
  const accent = row.biggestLoss
    ? '#e84a5f'
    : isLoss
      ? '#f3a93b'
      : isMatch
        ? menuTheme.accent
        : menuTheme.textMuted
  const barWidthPct = hasDelta
    ? Math.max(2, Math.min(100, (Math.abs(row.deltaMs ?? 0) / denom) * 100))
    : 0
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '46px 1fr 70px',
        alignItems: 'center',
        gap: 10,
        background: row.biggestLoss
          ? 'rgba(232, 74, 95, 0.08)'
          : 'transparent',
        borderRadius: 6,
        padding: '4px 6px',
      }}
    >
      <div
        style={{
          fontFamily: 'monospace',
          fontWeight: 700,
          fontSize: 13,
          color: accent,
          letterSpacing: 0.5,
        }}
      >
        {row.label}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: menuTheme.textMuted,
            fontFamily: 'monospace',
            letterSpacing: 0.3,
          }}
        >
          <span>{formatSectorDuration(row.sessionBestMs)}s</span>
          <span style={{ opacity: 0.5 }}>vs</span>
          <span>{formatSectorDuration(row.allTimeBestMs)}s</span>
          {row.biggestLoss ? (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 1.2,
                color: '#e84a5f',
                textTransform: 'uppercase',
                marginLeft: 'auto',
              }}
            >
              Focus
            </span>
          ) : null}
        </div>
        <div
          style={{
            position: 'relative',
            height: 4,
            borderRadius: 2,
            background: 'rgba(255,255,255,0.06)',
            overflow: 'hidden',
          }}
        >
          {hasDelta ? (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: `${barWidthPct}%`,
                background: accent,
                opacity: isMatch ? 0.6 : 0.85,
                borderRadius: 2,
              }}
            />
          ) : null}
        </div>
      </div>
      <div
        style={{
          fontFamily: 'monospace',
          fontWeight: 700,
          fontSize: 13,
          color: accent,
          textAlign: 'right',
          letterSpacing: 0.4,
        }}
      >
        {hasDelta ? formatSectorDelta(row.deltaMs) : '--'}
      </div>
    </div>
  )
}

function formatTotalLost(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0.000s'
  const total = Math.round(ms)
  const seconds = Math.floor(total / 1000)
  const millis = total % 1000
  return `${seconds}.${String(millis).padStart(3, '0')}s`
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
