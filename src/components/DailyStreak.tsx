'use client'

import { useEffect, useMemo, useState } from 'react'
import { dateKeyForUtc } from '@/lib/dateKeys'
import {
  DAILY_STREAK_EVENT,
  readDailyStreakDays,
} from '@/lib/dailyStreakStorage'
import {
  formatStreakLabel,
  summarizeDailyStreak,
  type DailyStreakDay,
} from '@/game/dailyStreak'

/**
 * Home-page widget that surfaces the player's race-day streak. Shows the
 * current consecutive-day count, the all-time best, and a 7-day rolling
 * activity strip so the player sees their week at a glance.
 *
 * Reads from `localStorage` on mount (client-only) so the home page server
 * component stays static; until hydration finishes the section renders
 * nothing rather than flashing a placeholder. When the player has no race
 * days on file (fresh browser, never raced) the widget renders nothing so
 * the home page stays uncluttered for new players. They will see it the
 * moment they finish their first lap, since `Game.tsx` records the day at
 * lap-complete time and the same-tab CustomEvent will fire on the next
 * page open.
 *
 * Refreshes on the same-tab `viberacer:daily-streak-changed` CustomEvent
 * (so a freshly-recorded race day in another component lights up the strip
 * without a manual reload) and on the cross-tab `storage` event (so a
 * race in another tab carries over too).
 */
export function DailyStreak() {
  const [hydrated, setHydrated] = useState(false)
  const [days, setDays] = useState<DailyStreakDay[]>([])
  const [todayKey, setTodayKey] = useState<string>(() =>
    dateKeyForUtc(Date.now()),
  )

  useEffect(() => {
    setDays(readDailyStreakDays())
    setTodayKey(dateKeyForUtc(Date.now()))
    setHydrated(true)
    function refresh() {
      setDays(readDailyStreakDays())
      setTodayKey(dateKeyForUtc(Date.now()))
    }
    window.addEventListener(DAILY_STREAK_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(DAILY_STREAK_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const summary = useMemo(
    () => summarizeDailyStreak(days, todayKey),
    [days, todayKey],
  )

  if (!hydrated) return null
  if (days.length === 0) return null

  const racedTodayLabel = summary.racedToday
    ? 'You raced today.'
    : 'Race today to keep your streak alive.'

  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>Daily streak</div>
      <div style={cardStyle}>
        <div style={statRowStyle}>
          <Stat label="Current" value={formatStreakLabel(summary.current)} />
          <Stat label="Best" value={formatStreakLabel(summary.best)} />
        </div>
        <div style={gridStyle} aria-label="Last seven days of racing">
          {summary.recent.map((cell) => (
            <Cell
              key={cell.dateKey}
              dateKey={cell.dateKey}
              raced={cell.raced}
              isToday={cell.dateKey === todayKey}
            />
          ))}
        </div>
        <div style={hintStyle}>{racedTodayLabel}</div>
      </div>
    </div>
  )
}

interface StatProps {
  label: string
  value: string
}

function Stat({ label, value }: StatProps) {
  return (
    <div style={statBlockStyle}>
      <div style={statValueStyle}>{value}</div>
      <div style={statLabelStyle}>{label}</div>
    </div>
  )
}

interface CellProps {
  dateKey: string
  raced: boolean
  isToday: boolean
}

function Cell({ dateKey, raced, isToday }: CellProps) {
  const baseStyle: React.CSSProperties = {
    ...cellBaseStyle,
    background: raced
      ? 'linear-gradient(180deg, #ffd166, #f29f3a)'
      : 'rgba(255,255,255,0.06)',
    borderColor: raced ? '#ffd166' : 'rgba(255,255,255,0.12)',
    color: raced ? '#1b1b1b' : 'rgba(255,255,255,0.55)',
    boxShadow: isToday ? '0 0 0 2px rgba(154, 216, 255, 0.85)' : 'none',
  }
  // dateKey is `YYYY-MM-DD`; the last segment is the day number, which
  // reads cleanly on a small chip without crowding.
  const dayLabel = dateKey.slice(-2)
  const ariaLabel = `${dateKey} ${raced ? 'raced' : 'no race'}${isToday ? ' (today)' : ''}`
  return (
    <div style={baseStyle} aria-label={ariaLabel} title={ariaLabel}>
      {dayLabel}
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
const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 12,
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}
const statRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'baseline',
}
const statBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}
const statValueStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  fontFamily: 'monospace',
  letterSpacing: 0.5,
  color: '#ffd166',
  lineHeight: 1.05,
}
const statLabelStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.7,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  fontWeight: 600,
}
const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: 6,
}
const cellBaseStyle: React.CSSProperties = {
  height: 30,
  borderRadius: 6,
  border: '1px solid',
  display: 'grid',
  placeItems: 'center',
  fontSize: 11,
  fontWeight: 700,
  fontFamily: 'monospace',
  letterSpacing: 0.4,
}
const hintStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.65,
  fontFamily: 'monospace',
  letterSpacing: 0.4,
}
