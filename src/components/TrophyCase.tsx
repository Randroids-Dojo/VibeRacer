'use client'

import { useEffect, useState } from 'react'
import {
  ACHIEVEMENTS_EVENT,
  readAchievements,
} from '@/lib/achievements'
import {
  buildTrophyCaseSummary,
  emptyTrophyCaseSummary,
  formatTrophyTimestamp,
  type TrophyCaseSummary,
  type TrophyCategory,
  type TrophyCategoryProgress,
  type TrophyRecentUnlock,
} from '@/lib/trophyCase'

/**
 * Renders a compact summary of the player's lifetime achievement unlocks on
 * the home page. Shows the overall progress bar, the most-recent N unlocks
 * with their names and category accents, and a per-category progress
 * breakdown so the player can see at a glance which avenues they have
 * explored.
 *
 * Reads from `localStorage` on mount (client-only) so the home page server
 * component can stay static; until hydration finishes the section renders
 * nothing rather than flashing a placeholder. When the player has no unlocks
 * yet (fresh browser, never raced anywhere or never crossed a finish line),
 * the section also renders nothing so the home page does not get cluttered
 * with empty affordances for new players. The full per-achievement detail
 * lives in the pause-menu Achievements pane.
 *
 * Refreshes on the same-tab `viberacer:achievements-changed` CustomEvent (so
 * an unlock during the current tab updates without remount) and on the
 * cross-tab `storage` event (so a session in another tab updates the totals
 * without requiring a manual reload). Mirrors the visual language of the
 * MedalCabinet section: a header strip, a primary value, a row of secondary
 * tiles.
 */
export function TrophyCase() {
  const [hydrated, setHydrated] = useState(false)
  const [summary, setSummary] = useState<TrophyCaseSummary>(
    emptyTrophyCaseSummary,
  )

  useEffect(() => {
    function refresh() {
      setSummary(buildTrophyCaseSummary(readAchievements()))
    }
    refresh()
    setHydrated(true)
    window.addEventListener('storage', refresh)
    window.addEventListener(ACHIEVEMENTS_EVENT, refresh as EventListener)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener(ACHIEVEMENTS_EVENT, refresh as EventListener)
    }
  }, [])

  if (!hydrated) return null
  if (summary.unlockedCount === 0) return null

  const fraction = summary.totalCount === 0
    ? 0
    : summary.unlockedCount / summary.totalCount
  const fractionPct = Math.round(fraction * 100)

  return (
    <div style={sectionStyle}>
      <div style={headerRowStyle}>
        <span style={sectionHeaderStyle}>Trophy case</span>
        <span style={progressLabelStyle}>
          {summary.unlockedCount} / {summary.totalCount}
        </span>
      </div>
      <div
        style={progressTrackStyle}
        role="progressbar"
        aria-label="Achievement progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={fractionPct}
      >
        <div
          style={{
            ...progressFillStyle,
            width: `${Math.max(0, Math.min(100, fractionPct))}%`,
          }}
        />
      </div>

      {summary.recent.length > 0 ? (
        <ul style={recentListStyle}>
          {summary.recent.map((row) => (
            <RecentRow key={row.def.id} row={row} />
          ))}
        </ul>
      ) : null}

      <div style={categoryGridStyle}>
        {summary.byCategory.map((entry) => (
          <CategoryChip key={entry.category} entry={entry} />
        ))}
      </div>
    </div>
  )
}

function RecentRow({ row }: { row: TrophyRecentUnlock }) {
  const color = CATEGORY_COLOR[row.def.category as TrophyCategory] ?? '#cccccc'
  const when = formatTrophyTimestamp(row.unlockedAt)
  return (
    <li style={recentRowStyle}>
      <span
        style={{ ...recentBadgeStyle, background: color, borderColor: color }}
        aria-hidden="true"
      >
        {'★'}
      </span>
      <span style={recentTextColStyle}>
        <span style={recentNameStyle}>{row.def.name}</span>
        <span style={recentMetaStyle}>
          {when ? <span>{when}</span> : null}
          {when && row.slug ? (
            <span style={recentMetaDot} aria-hidden="true">
              {'·'}
            </span>
          ) : null}
          {row.slug ? <span>/{row.slug}</span> : null}
        </span>
      </span>
    </li>
  )
}

function CategoryChip({ entry }: { entry: TrophyCategoryProgress }) {
  const color = CATEGORY_COLOR[entry.category]
  const earned = entry.unlocked > 0
  return (
    <div
      style={{
        ...categoryChipStyle,
        borderColor: earned ? color : 'rgba(255,255,255,0.15)',
        opacity: earned ? 1 : 0.55,
      }}
      title={`${CATEGORY_LABEL[entry.category]}: ${entry.unlocked} of ${entry.total} unlocked`}
    >
      <div style={{ ...categoryValueStyle, color: earned ? color : '#bbbbbb' }}>
        {entry.unlocked}
        <span style={categoryDenominatorStyle}>/{entry.total}</span>
      </div>
      <div style={categoryLabelStyle}>{CATEGORY_LABEL[entry.category]}</div>
    </div>
  )
}

const CATEGORY_COLOR: Record<TrophyCategory, string> = {
  speed: '#5cb6ff',
  progression: '#ffb55c',
  style: '#ff7a9c',
  mastery: '#f4d774',
  discovery: '#85e08c',
}

const CATEGORY_LABEL: Record<TrophyCategory, string> = {
  speed: 'Speed',
  progression: 'Progress',
  style: 'Style',
  mastery: 'Mastery',
  discovery: 'Discovery',
}

const sectionStyle: React.CSSProperties = {
  paddingTop: 8,
}
const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 8,
  marginBottom: 8,
}
const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  opacity: 0.75,
  fontWeight: 600,
}
const progressLabelStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.4,
  textTransform: 'uppercase',
  opacity: 0.65,
  fontFamily: 'monospace',
  fontWeight: 600,
}
const progressTrackStyle: React.CSSProperties = {
  height: 8,
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 999,
  overflow: 'hidden',
  marginBottom: 10,
}
const progressFillStyle: React.CSSProperties = {
  height: '100%',
  background: 'linear-gradient(90deg, #f4d774, #ffb55c)',
  transition: 'width 0.2s ease-out',
}
const recentListStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 6,
  marginBottom: 10,
}
const recentRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
}
const recentBadgeStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 999,
  border: '1px solid transparent',
  display: 'inline-grid',
  placeItems: 'center',
  fontSize: 12,
  fontWeight: 800,
  color: '#1a1a1a',
  flexShrink: 0,
}
const recentTextColStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
}
const recentNameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'white',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const recentMetaStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.65,
  fontFamily: 'monospace',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const recentMetaDot: React.CSSProperties = {
  opacity: 0.6,
}
const categoryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, 1fr)',
  gap: 6,
}
const categoryChipStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 8,
  padding: '8px 4px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
}
const categoryValueStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  fontFamily: 'monospace',
  letterSpacing: 0.5,
  lineHeight: 1.05,
}
const categoryDenominatorStyle: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.6,
  marginLeft: 2,
}
const categoryLabelStyle: React.CSSProperties = {
  fontSize: 9,
  opacity: 0.7,
  letterSpacing: 0.8,
  textTransform: 'uppercase',
  fontWeight: 600,
}
