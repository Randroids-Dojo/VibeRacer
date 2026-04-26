'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  MY_TRACKS_EVENT,
  readMyTracks,
  type MyTrackEntry,
} from '@/lib/myTracks'
import { formatDate } from '@/lib/formatDate'

/**
 * Renders the player's authored-tracks list on the home page. Each row links
 * to `/<slug>` to race the latest version and to `/<slug>/edit` to keep
 * iterating on the layout. Reads from `localStorage` on mount (client-only)
 * so the home page server component can stay static; until hydration
 * finishes, the section renders nothing rather than flashing a placeholder.
 *
 * When the scanned list is empty (the player has never saved a track), the
 * section also renders nothing so the home page does not get cluttered with
 * empty affordances for new players. The list is already sorted newest-first
 * by `readMyTracks`.
 */
export function MyTracks() {
  const [hydrated, setHydrated] = useState(false)
  const [rows, setRows] = useState<MyTrackEntry[]>([])

  useEffect(() => {
    setRows(readMyTracks())
    setHydrated(true)
    function refresh() {
      setRows(readMyTracks())
    }
    // Native storage event covers cross-tab edits (player saves a new track in
    // another tab); the custom event covers same-tab updates after the editor
    // navigates back to the home page through Next's client router.
    window.addEventListener('storage', refresh)
    window.addEventListener(MY_TRACKS_EVENT, refresh as EventListener)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener(MY_TRACKS_EVENT, refresh as EventListener)
    }
  }, [])

  if (!hydrated) return null
  if (rows.length === 0) return null

  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>Tracks you built</div>
      <ul style={listStyle}>
        {rows.map((row) => (
          <li key={row.slug} style={rowWrapStyle}>
            <Link
              href={`/${row.slug}`}
              style={raceLinkStyle}
              title={`Race /${row.slug}`}
            >
              <span style={textColStyle}>
                <span style={slugStyle}>/{row.slug}</span>
                <span style={subStyle}>saved {formatDate(row.updatedAt)}</span>
              </span>
            </Link>
            <Link
              href={`/${row.slug}/edit`}
              style={editLinkStyle}
              title={`Keep editing /${row.slug}`}
              aria-label={`Edit /${row.slug}`}
            >
              EDIT
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
// Wrap a Race link plus an Edit chip on each row so the player can either
// jump in to race or pop straight into the editor without an extra click.
const rowWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 6,
}
const raceLinkStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.12)',
  borderRadius: 8,
  textDecoration: 'none',
  color: 'white',
  fontSize: 14,
  flex: 1,
  minWidth: 0,
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
// Edit chip mirrors the "go to track" affordance but with an amber accent so
// the player can scan the row and pick the right action quickly. The amber
// matches the FORKING banner inside TrackEditor so the visual language for
// "edit a track you already own" stays consistent across the app.
const editLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 14px',
  background: 'rgba(255, 188, 80, 0.18)',
  border: '1px solid rgba(255, 188, 80, 0.4)',
  borderRadius: 8,
  textDecoration: 'none',
  color: '#ffd58a',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1.2,
  fontFamily: 'monospace',
  flex: '0 0 auto',
}
