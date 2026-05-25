/**
 * Championship standings panel for the World Tour. Rendered between
 * races (garage page) and after every race (results page) so the
 * player can see exactly where they stand in the cumulative points
 * race that drives the unlock gate. Replaces the implicit "Top N of
 * M" affordance with an explicit leaderboard plus the literal points
 * each row has scored across the tour so far.
 *
 * Two visual variants share the same data shape:
 *
 * - `'menu'` paints the cream-card menu surface (RULE 3.5 / 11).
 * - `'results'` paints the dark translucent panel that matches the
 *   existing results page chrome.
 *
 * Both variants pull their colors from `menuTheme` (the dark variant
 * just opts into the shellPanelBg / textPrimary tokens), so a global
 * theme tweak lands on both surfaces.
 */

'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { Tour } from '@/lib/worldTourChampionship'
import type { ChampionshipStandingsRow } from '@/game/worldTourRaceResult'
import { menuTheme } from './menuTheme'

interface Props {
  tour: Tour
  rows: ChampionshipStandingsRow[]
  playerStanding: number
  racesCompleted: number
  totalRaces: number
  requiredStanding: number
  variant?: 'menu' | 'results'
}

export function ChampionshipStandingsPanel({
  tour,
  rows,
  playerStanding,
  racesCompleted,
  totalRaces,
  requiredStanding,
  variant = 'menu',
}: Props) {
  const v = variant === 'results' ? RESULTS_TOKENS : MENU_TOKENS
  // Pre-race state: no race has scored yet. Anchor the copy on the
  // gate so the player knows exactly what they are racing for before
  // they even leave the starting grid.
  const headline =
    racesCompleted === 0
      ? `Top ${requiredStanding} after ${totalRaces} races unlocks the next tour.`
      : `Through race ${racesCompleted} of ${totalRaces}, top ${requiredStanding} clears the gate.`

  return (
    <section
      style={{
        ...panelStyle,
        background: v.panelBg,
        border: v.panelBorder,
        color: v.text,
        boxShadow: v.panelShadow,
      }}
      aria-label={`Championship standings for ${tour.name}`}
    >
      <header style={headerStyle}>
        <h2 style={{ ...titleStyle, color: v.text }}>Championship standings</h2>
        <p style={{ ...subtitleStyle, color: v.mutedText }}>{headline}</p>
      </header>
      <ol style={listStyle}>
        {rows.map((row, idx) => (
          <Row
            key={row.key}
            placement={idx + 1}
            row={row}
            highlight={row.isPlayer}
            tokens={v}
          />
        ))}
      </ol>
      {racesCompleted > 0 ? (
        <p style={{ ...footerStyle, color: v.mutedText }}>
          You are {ordinal(playerStanding)} of {tour.fieldSize}. Need top{' '}
          {requiredStanding} by race {totalRaces}.
        </p>
      ) : null}
    </section>
  )
}

interface RowProps {
  placement: number
  row: ChampionshipStandingsRow
  highlight: boolean
  tokens: Tokens
}

function Row({ placement, row, highlight, tokens }: RowProps): ReactNode {
  return (
    <li
      style={{
        ...rowStyle,
        background: highlight ? tokens.rowHighlightBg : tokens.rowBg,
        color: highlight ? tokens.text : tokens.text,
        border: highlight ? tokens.rowHighlightBorder : tokens.rowBorder,
        fontWeight: highlight ? 700 : 500,
        opacity: row.isGhost ? 0.55 : 1,
      }}
    >
      <span style={placementStyle}>{placement}.</span>
      <span style={labelStyle}>{row.label}</span>
      <span style={{ ...pointsStyle, color: tokens.mutedText }}>
        {row.points} pts
      </span>
      {highlight ? <span style={{ ...youPillStyle, color: tokens.text }}>YOU</span> : null}
    </li>
  )
}

function ordinal(n: number): string {
  if (!Number.isFinite(n) || n < 1) return `${n}`
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

interface Tokens {
  panelBg: string
  panelBorder: string
  panelShadow: string
  text: string
  mutedText: string
  rowBg: string
  rowBorder: string
  rowHighlightBg: string
  rowHighlightBorder: string
}

const MENU_TOKENS: Tokens = {
  panelBg: menuTheme.cardBg,
  panelBorder: `2px solid ${menuTheme.cardBorder}`,
  panelShadow: menuTheme.cardShadow,
  text: menuTheme.cardText,
  mutedText: menuTheme.cardMutedText,
  rowBg: 'rgba(0,0,0,0.04)',
  rowBorder: '1px solid rgba(0,0,0,0.08)',
  rowHighlightBg: 'rgba(232,74,95,0.18)',
  rowHighlightBorder: `2px solid ${menuTheme.ctaBg}`,
}

const RESULTS_TOKENS: Tokens = {
  panelBg: 'rgba(0,0,0,0.45)',
  panelBorder: '1px solid rgba(255,255,255,0.08)',
  panelShadow: 'none',
  text: '#fff',
  mutedText: 'rgba(255,255,255,0.65)',
  rowBg: 'rgba(255,255,255,0.04)',
  rowBorder: '1px solid rgba(255,255,255,0.08)',
  rowHighlightBg: 'rgba(232,74,95,0.22)',
  rowHighlightBorder: `2px solid ${menuTheme.ctaBg}`,
}

const panelStyle: CSSProperties = {
  padding: 16,
  borderRadius: 12,
  display: 'grid',
  gap: 10,
}
const headerStyle: CSSProperties = {
  display: 'grid',
  gap: 2,
}
const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 800,
  letterSpacing: 0.3,
}
const subtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.4,
}
const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  gap: 4,
}
const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '28px 1fr auto auto',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  borderRadius: 8,
  fontSize: 13,
}
const placementStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 700,
}
const labelStyle: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const pointsStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontSize: 12,
  paddingLeft: 8,
}
const youPillStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1,
  padding: '2px 6px',
  borderRadius: 6,
  background: 'rgba(255,255,255,0.18)',
  border: '1px solid rgba(255,255,255,0.25)',
}
const footerStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.4,
}
