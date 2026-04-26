'use client'

import { useEffect, useState } from 'react'
import {
  emptyLifetimeStats,
  readLifetimeStats,
  type LifetimeStats,
} from '@/lib/lifetimeStats'
import {
  formatDuration,
  formatPlayedAt,
} from '@/game/trackStats'

/**
 * Renders the player's lifetime engagement totals across every track they
 * have raced. Reads from `localStorage` on mount (client-only) so the home
 * page server component stays static; until hydration finishes the section
 * renders nothing rather than flashing a placeholder. When the scanned totals
 * are empty (fresh browser, never raced anywhere), the section also renders
 * nothing so the home page stays uncluttered for new players.
 *
 * Mirrors the visual language of the per-track Stats pause pane: a small
 * grid of stat tiles with a header section title. Refreshes on the
 * cross-tab `storage` event so a session in another tab updates the totals
 * without requiring a manual reload.
 */
export function LifetimeStats() {
  const [hydrated, setHydrated] = useState(false)
  const [stats, setStats] = useState<LifetimeStats>(emptyLifetimeStats)

  useEffect(() => {
    setStats(readLifetimeStats())
    setHydrated(true)
    function refresh() {
      setStats(readLifetimeStats())
    }
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
    }
  }, [])

  if (!hydrated) return null
  // Hide the section entirely until the player has at least one recorded
  // session so a brand-new browser does not see an empty grid of dashes.
  if (stats.totalSessions === 0 && stats.totalLaps === 0) return null

  const trackLabel = stats.trackCount === 1 ? 'track raced' : 'tracks raced'
  const versionSubLabel =
    stats.versionCount === stats.trackCount
      ? null
      : stats.versionCount === 1
        ? '1 version'
        : `${stats.versionCount} versions`

  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>Your lifetime stats</div>
      <div style={gridStyle}>
        <Tile label="Total laps" value={String(stats.totalLaps)} />
        <Tile
          label="Time on track"
          value={formatDuration(stats.totalDriveMs)}
        />
        <Tile label="Sessions" value={String(stats.totalSessions)} />
        <Tile
          label={trackLabel}
          value={String(stats.trackCount)}
          sub={versionSubLabel}
        />
      </div>
      {stats.firstPlayedAt !== null ? (
        <div style={footerStyle}>
          Racing since {formatPlayedAt(stats.firstPlayedAt)}
          {stats.lastPlayedAt !== null &&
          stats.lastPlayedAt !== stats.firstPlayedAt
            ? `, last raced ${formatPlayedAt(stats.lastPlayedAt)}`
            : null}
        </div>
      ) : null}
    </div>
  )
}

interface TileProps {
  label: string
  value: string
  sub?: string | null
}

function Tile({ label, value, sub }: TileProps) {
  return (
    <div style={tileStyle}>
      <div style={tileValueStyle}>{value}</div>
      <div style={tileLabelStyle}>{label}</div>
      {sub ? <div style={tileSubStyle}>{sub}</div> : null}
    </div>
  )
}

const sectionStyle: React.CSSProperties = {
  paddingTop: 8,
}
const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  opacity: 0.75,
  marginBottom: 10,
  fontWeight: 600,
}
const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
}
const tileStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.10)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}
const tileValueStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: 'white',
  fontFamily: 'monospace',
  letterSpacing: 0.5,
  lineHeight: 1.05,
}
const tileLabelStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.7,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  fontWeight: 600,
}
const tileSubStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.55,
  fontFamily: 'monospace',
  marginTop: 2,
}
const footerStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 11,
  opacity: 0.55,
  fontFamily: 'monospace',
  textAlign: 'right',
}
