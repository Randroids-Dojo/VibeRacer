'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  FAVORITE_TRACKS_EVENT,
  readFavoriteTracks,
  removeFavoriteTrack,
  type FavoriteTrackEntry,
} from '@/lib/favoriteTracks'

/**
 * Renders the player's starred tracks on the home page. Each row links
 * straight to `/<slug>` to race the latest version. A small unstar button
 * lets the player drop a slug from the list without leaving the home page.
 *
 * Reads from `localStorage` on mount (client-only) so the server component
 * `HomePage` can stay static; until hydration finishes, the section renders
 * nothing rather than flashing a placeholder. When the scanned list is
 * empty, the section also renders nothing so the home page does not get
 * cluttered with an empty affordance for new players. The list is already
 * sorted most-recently-starred first by `readFavoriteTracks`.
 */
export function FavoriteTracks() {
  const [hydrated, setHydrated] = useState(false)
  const [rows, setRows] = useState<FavoriteTrackEntry[]>([])

  useEffect(() => {
    setRows(readFavoriteTracks())
    setHydrated(true)
    function refresh() {
      setRows(readFavoriteTracks())
    }
    window.addEventListener('storage', refresh)
    window.addEventListener(FAVORITE_TRACKS_EVENT, refresh as EventListener)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener(
        FAVORITE_TRACKS_EVENT,
        refresh as EventListener,
      )
    }
  }, [])

  if (!hydrated) return null
  if (rows.length === 0) return null

  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>Favorites</div>
      <ul style={listStyle}>
        {rows.map((row) => (
          <li key={row.slug} style={rowWrapStyle}>
            <Link
              href={`/${row.slug}`}
              style={raceLinkStyle}
              title={`Race /${row.slug}`}
            >
              <span style={starGlyphStyle} aria-hidden="true">
                {STAR_FILLED}
              </span>
              <span style={slugStyle}>/{row.slug}</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                setRows(removeFavoriteTrack(row.slug))
              }}
              style={removeBtnStyle}
              title={`Remove /${row.slug} from favorites`}
              aria-label={`Remove /${row.slug} from favorites`}
            >
              {STAR_FILLED}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

const STAR_FILLED = '★'

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
const rowWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 6,
}
// The race link gets an inline gold star as a leading glyph so the row reads
// as "favorite" at a glance; the slug sits in monospace next to it. Layout
// mirrors MyTracks so the home page rows feel consistent.
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
const starGlyphStyle: React.CSSProperties = {
  color: '#ffd750',
  fontSize: 16,
  lineHeight: 1,
  flex: '0 0 auto',
  textShadow: '0 0 6px rgba(255, 215, 80, 0.45)',
}
const slugStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  minWidth: 0,
}
// Remove chip mirrors the EDIT chip on MyTracks but uses the same gold accent
// as the star itself so the player understands clicking it un-stars the row.
const removeBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 14px',
  background: 'rgba(255, 215, 80, 0.18)',
  border: '1px solid rgba(255, 215, 80, 0.4)',
  borderRadius: 8,
  color: '#ffd750',
  fontSize: 16,
  fontWeight: 700,
  fontFamily: 'inherit',
  flex: '0 0 auto',
  cursor: 'pointer',
}
