'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  readMostPlayed,
  type MostPlayedEntry,
} from '@/lib/mostPlayed'
import { formatDuration } from '@/game/trackStats'

/**
 * Renders the player's most-frequently-played tracks across every (slug,
 * versionHash) they have raced. Reads from `localStorage` on mount
 * (client-only) so the home page server component can stay static; until
 * hydration finishes, the section renders nothing rather than flashing a
 * placeholder. When the scanned list is empty (fresh browser, never
 * completed a lap anywhere), the section also renders nothing so brand-new
 * players do not see an empty section.
 *
 * Each row links the player back to `/<slug>` so they can immediately race
 * the latest version of their go-to track. Rows are already ranked by
 * `readMostPlayed` (laps descending, then time descending, then slug
 * ascending).
 *
 * Sibling section components on the home page:
 * - `MyPbs` ("Your personal bests"): sorted by lap time, gold time badge
 * - `LifetimeStats` ("Your lifetime stats"): tile grid of totals
 * - `MostPlayed` (this one): ranked by total laps, orange counter badge
 *
 * The three sections answer different questions ("where am I fastest", "how
 * much have I played overall", "what do I keep coming back to") so the home
 * page surfaces three complementary snapshots of the player's history.
 */
export function MostPlayed() {
  const [hydrated, setHydrated] = useState(false)
  const [rows, setRows] = useState<MostPlayedEntry[]>([])

  useEffect(() => {
    setRows(readMostPlayed())
    setHydrated(true)
    function refresh() {
      setRows(readMostPlayed())
    }
    // Cross-tab sync: a session in another tab updates the rankings without
    // requiring a manual reload, mirroring the LifetimeStats / MyPbs pattern.
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
    }
  }, [])

  if (!hydrated) return null
  if (rows.length === 0) return null

  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>Your most-played tracks</div>
      <ul style={listStyle}>
        {rows.map((row, idx) => (
          <li key={row.slug}>
            <Link
              href={`/${row.slug}`}
              style={rowStyle}
              title={`Race the latest version of /${row.slug}`}
            >
              <span style={rankStyle}>{idx + 1}</span>
              <span style={textColStyle}>
                <span style={slugStyle}>/{row.slug}</span>
                <span style={subStyle}>{describeRow(row)}</span>
              </span>
              <span
                style={lapBadgeStyle}
                aria-label={`${row.totalLaps} laps completed`}
              >
                <span style={lapValueStyle}>{row.totalLaps}</span>
                <span style={lapLabelStyle}>
                  {row.totalLaps === 1 ? 'LAP' : 'LAPS'}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function describeRow(row: MostPlayedEntry): string {
  const parts: string[] = []
  parts.push(formatDuration(row.totalDriveMs))
  if (row.totalSessions === 1) {
    parts.push('1 session')
  } else {
    parts.push(`${row.totalSessions} sessions`)
  }
  if (row.versionCount > 1) {
    parts.push(`${row.versionCount} versions`)
  }
  return parts.join(' · ')
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
const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 6,
  maxHeight: 280,
  overflowY: 'auto',
}
const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.12)',
  borderRadius: 8,
  textDecoration: 'none',
  color: 'white',
  fontSize: 14,
}
const rankStyle: React.CSSProperties = {
  // Tiny circular rank chip on the left of each row so the ordering reads at
  // a glance without scanning the lap counts on the right.
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  borderRadius: '50%',
  background: 'rgba(255,255,255,0.10)',
  border: '1px solid rgba(255,255,255,0.22)',
  fontSize: 11,
  fontFamily: 'monospace',
  fontWeight: 700,
  flex: '0 0 auto',
  opacity: 0.9,
}
const textColStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
  flex: 1,
}
const slugStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const subStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.6,
  fontFamily: 'monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
// Orange accent for the lap counter so the badge palette stays distinct
// from the green PB badge in `MyPbs` and the gold record-holder badge on
// `RecentTrackList`. Three different colors per surface keeps the home page
// scannable when a single track shows up across multiple sections.
const lapBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: 6,
  padding: '2px 8px',
  background: 'rgba(255, 165, 75, 0.16)',
  border: '1px solid rgba(255, 165, 75, 0.45)',
  borderRadius: 6,
  flex: '0 0 auto',
  fontSize: 11,
  fontFamily: 'monospace',
  letterSpacing: 0.5,
  whiteSpace: 'nowrap',
}
const lapValueStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.95)',
  fontWeight: 700,
}
const lapLabelStyle: React.CSSProperties = {
  color: '#ffaf6a',
  fontWeight: 700,
}
