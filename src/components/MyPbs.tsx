'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { readMyPbs, type MyPbEntry } from '@/lib/myPbs'
import { formatLapTime } from '@/lib/share'

/**
 * Renders the player's local personal-best lap times across every track they
 * have raced. Reads from `localStorage` on mount (client-only) so the home
 * page server component can stay static; until hydration finishes, the
 * section renders nothing rather than flashing a placeholder. When the
 * scanned list is empty (fresh browser, never raced anywhere), the section
 * also renders nothing so the home page does not get cluttered with empty
 * affordances for new players.
 *
 * Each row links the player back to the exact (slug, versionHash) they
 * recorded the PB on so they can immediately try to beat it. Rows are
 * already sorted by best lap time ascending (fastest first) by `readMyPbs`.
 */
export function MyPbs() {
  const [hydrated, setHydrated] = useState(false)
  const [rows, setRows] = useState<MyPbEntry[]>([])

  useEffect(() => {
    setRows(readMyPbs())
    setHydrated(true)
    // Refresh when other tabs touch localStorage (e.g. the player just set a
    // new PB in another tab). Cheap because the scan is O(n) over a tiny key
    // set in practice.
    function refresh() {
      setRows(readMyPbs())
    }
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
    }
  }, [])

  if (!hydrated) return null
  if (rows.length === 0) return null

  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>Your personal bests</div>
      <ul style={listStyle}>
        {rows.map((row) => (
          <li key={row.slug}>
            <Link
              href={`/${row.slug}?v=${row.versions[0].versionHash}`}
              style={rowStyle}
              title={`Race the version where you set ${formatLapTime(row.bestLapTimeMs)}`}
            >
              <span style={textColStyle}>
                <span style={slugStyle}>/{row.slug}</span>
                <span style={subStyle}>
                  {row.versions.length === 1
                    ? '1 version raced'
                    : `${row.versions.length} versions raced`}
                </span>
              </span>
              <span
                style={timeBadgeStyle}
                aria-label={`Personal best ${formatLapTime(row.bestLapTimeMs)}`}
              >
                <span style={timeLabelStyle}>PB</span>
                <span style={timeValueStyle}>
                  {formatLapTime(row.bestLapTimeMs)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
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
const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 6,
  maxHeight: 240,
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
}
// PB badge mirrors the gold accent used by the top-time badge on
// RecentTrackList so the visual language is consistent across the home
// page even though one badge is the player's PB and the other is the
// track's record holder.
const timeBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: 6,
  padding: '2px 8px',
  background: 'rgba(80, 215, 130, 0.14)',
  border: '1px solid rgba(80, 215, 130, 0.4)',
  borderRadius: 6,
  flex: '0 0 auto',
  fontSize: 11,
  fontFamily: 'monospace',
  letterSpacing: 0.5,
  whiteSpace: 'nowrap',
}
const timeLabelStyle: React.CSSProperties = {
  color: '#7af0a8',
  fontWeight: 700,
}
const timeValueStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.95)',
}
