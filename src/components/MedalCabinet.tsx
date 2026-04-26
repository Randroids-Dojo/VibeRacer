'use client'

import { useEffect, useState } from 'react'
import {
  emptyMedalCounts,
  readMedalCabinet,
  type MedalCounts,
} from '@/lib/medalCabinet'
import { MEDAL_COLORS, MEDAL_GLYPH, MEDAL_LABELS } from '@/game/medals'

/**
 * Renders the player's lifetime medal cabinet: a strip of four tiles, one
 * per medal tier (Platinum / Gold / Silver / Bronze), each showing the
 * count of distinct tracks the player has earned that tier on. Reads from
 * `localStorage` on mount (client-only) so the home-page server component
 * stays static; until hydration finishes the section renders nothing
 * rather than flashing a placeholder. When the player has no medals yet
 * (fresh browser, never raced anywhere or never earned bronze on any
 * track), the section also renders nothing so the home page stays
 * uncluttered for new players.
 *
 * Mirrors the visual language of the LifetimeStats section: a small grid
 * of stat tiles with a header section title. Refreshes on the cross-tab
 * `storage` event so a session in another tab updates the totals without
 * requiring a manual reload.
 */
export function MedalCabinet() {
  const [hydrated, setHydrated] = useState(false)
  const [counts, setCounts] = useState<MedalCounts>(emptyMedalCounts)

  useEffect(() => {
    setCounts(readMedalCabinet())
    setHydrated(true)
    function refresh() {
      setCounts(readMedalCabinet())
    }
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
    }
  }, [])

  if (!hydrated) return null
  if (counts.total === 0) return null

  const trackLabel = counts.total === 1 ? '1 track' : `${counts.total} tracks`

  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>Medal cabinet</div>
      <div style={gridStyle}>
        <Tile tier="platinum" count={counts.platinum} />
        <Tile tier="gold" count={counts.gold} />
        <Tile tier="silver" count={counts.silver} />
        <Tile tier="bronze" count={counts.bronze} />
      </div>
      <div style={footerStyle}>Earned across {trackLabel}</div>
    </div>
  )
}

interface TileProps {
  tier: 'platinum' | 'gold' | 'silver' | 'bronze'
  count: number
}

function Tile({ tier, count }: TileProps) {
  const color = MEDAL_COLORS[tier]
  const label = MEDAL_LABELS[tier]
  const glow = `0 0 12px ${color}55, inset 0 0 0 1px ${color}88`
  return (
    <div
      style={{
        ...tileStyle,
        boxShadow: count > 0 ? glow : tileStyle.boxShadow,
        opacity: count > 0 ? 1 : 0.45,
      }}
    >
      <div style={{ ...tileGlyphStyle, color }} aria-hidden="true">
        {MEDAL_GLYPH}
      </div>
      <div style={{ ...tileValueStyle, color }}>{count}</div>
      <div style={tileLabelStyle}>{label}</div>
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
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 8,
}
const tileStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 8,
  padding: '10px 8px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
  boxShadow: 'none',
}
const tileGlyphStyle: React.CSSProperties = {
  fontSize: 18,
  lineHeight: 1,
  marginBottom: 2,
}
const tileValueStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  fontFamily: 'monospace',
  letterSpacing: 0.5,
  lineHeight: 1.05,
}
const tileLabelStyle: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.7,
  letterSpacing: 1.0,
  textTransform: 'uppercase',
  fontWeight: 600,
}
const footerStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 11,
  opacity: 0.55,
  fontFamily: 'monospace',
  textAlign: 'right',
}
