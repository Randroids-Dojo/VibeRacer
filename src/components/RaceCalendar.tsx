'use client'

import { useEffect, useMemo, useState } from 'react'
import { dateKeyForUtc } from '@/lib/dateKeys'
import {
  DAILY_STREAK_EVENT,
  readDailyStreakDays,
} from '@/lib/dailyStreakStorage'
import {
  RACE_CALENDAR_DEFAULT_WEEKS,
  buildRaceCalendarGrid,
  formatRacePercent,
  monthLabelForWeek,
  type RaceCalendarCell,
  type RaceCalendarWeek,
} from '@/game/raceCalendar'
import type { DailyStreakDay } from '@/game/dailyStreak'

/**
 * Home-page widget that surfaces a multi-week race-day heatmap. Reuses the
 * same `viberacer.dailyStreak` storage as the seven-day daily-streak strip,
 * but visualizes a full quarter (twelve weeks) of activity in a Sunday-first
 * grid so the player can see longer-term cadence at a glance.
 *
 * Reads from `localStorage` on mount (client-only) so the home page server
 * component stays static; until hydration finishes the section renders
 * nothing rather than flashing a placeholder. When the player has no race
 * days on file (fresh browser) the widget renders nothing so the home page
 * stays uncluttered for new players.
 *
 * Refreshes on the same-tab `viberacer:daily-streak-changed` CustomEvent
 * (so a freshly-recorded race day in another component lights up the
 * heatmap without a manual reload) and on the cross-tab `storage` event
 * (so a race in another tab carries over too).
 */
export function RaceCalendar() {
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

  const grid = useMemo(
    () => buildRaceCalendarGrid(days, todayKey, RACE_CALENDAR_DEFAULT_WEEKS),
    [days, todayKey],
  )

  if (!hydrated) return null
  if (days.length === 0) return null

  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>Race calendar</div>
      <div style={cardStyle}>
        <div
          style={monthRowStyle}
          aria-hidden="true"
        >
          {grid.weeks.map((week) => (
            <div key={`mlabel-${week.index}`} style={monthLabelCellStyle}>
              {monthLabelForWeek(week) ?? ''}
            </div>
          ))}
        </div>
        <div style={gridWrapStyle}>
          <div style={weekdayColStyle} aria-hidden="true">
            {WEEKDAY_LABELS.map((label, idx) => (
              <div
                key={`wd-${idx}`}
                style={{
                  ...weekdayLabelStyle,
                  visibility:
                    idx === 1 || idx === 3 || idx === 5 ? 'visible' : 'hidden',
                }}
              >
                {label}
              </div>
            ))}
          </div>
          <div
            style={gridStyle}
            aria-label={`Race activity for the last ${grid.weeks.length} weeks`}
          >
            {grid.weeks.map((week) => (
              <WeekColumn key={`wc-${week.index}`} week={week} />
            ))}
          </div>
        </div>
        <div style={footerStyle}>
          <span style={footerStatStyle}>
            {grid.racedCount} race {grid.racedCount === 1 ? 'day' : 'days'}
          </span>
          <span style={footerSeparatorStyle}>/</span>
          <span style={footerStatStyle}>
            {formatRacePercent(grid.racedCount, grid.coveredCells)} of last
            {' '}
            {grid.weeks.length} weeks
          </span>
        </div>
      </div>
    </div>
  )
}

interface WeekColumnProps {
  week: RaceCalendarWeek
}

function WeekColumn({ week }: WeekColumnProps) {
  return (
    <div style={weekColStyle}>
      {week.cells.map((cell) => (
        <Cell key={cell.dateKey} cell={cell} />
      ))}
    </div>
  )
}

interface CellProps {
  cell: RaceCalendarCell
}

function Cell({ cell }: CellProps) {
  let background: string
  let borderColor: string
  if (cell.isFuture) {
    background = 'rgba(255,255,255,0.03)'
    borderColor = 'rgba(255,255,255,0.05)'
  } else if (cell.raced) {
    background = 'linear-gradient(180deg, #ffd166, #f29f3a)'
    borderColor = '#ffd166'
  } else {
    background = 'rgba(255,255,255,0.06)'
    borderColor = 'rgba(255,255,255,0.1)'
  }
  const style: React.CSSProperties = {
    ...cellStyle,
    background,
    borderColor,
    boxShadow: cell.isToday ? '0 0 0 2px rgba(154, 216, 255, 0.85)' : 'none',
  }
  const ariaLabel = cell.isFuture
    ? `${cell.dateKey} (future)`
    : `${cell.dateKey} ${cell.raced ? 'raced' : 'no race'}${cell.isToday ? ' (today)' : ''}`
  return <div style={style} aria-label={ariaLabel} title={ariaLabel} />
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

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
  gap: 8,
}
const monthRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `repeat(${RACE_CALENDAR_DEFAULT_WEEKS}, minmax(0, 1fr))`,
  gap: 4,
  marginLeft: 16,
  fontSize: 10,
  opacity: 0.6,
  letterSpacing: 0.5,
  fontFamily: 'monospace',
  height: 12,
}
const monthLabelCellStyle: React.CSSProperties = {
  textAlign: 'left',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
}
const gridWrapStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  alignItems: 'stretch',
}
const weekdayColStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'repeat(7, minmax(0, 1fr))',
  gap: 3,
  width: 12,
  fontSize: 9,
  fontFamily: 'monospace',
  opacity: 0.55,
  letterSpacing: 0.4,
}
const weekdayLabelStyle: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
}
const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `repeat(${RACE_CALENDAR_DEFAULT_WEEKS}, minmax(0, 1fr))`,
  gap: 4,
  flex: 1,
}
const weekColStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'repeat(7, minmax(0, 1fr))',
  gap: 3,
}
const cellStyle: React.CSSProperties = {
  aspectRatio: '1 / 1',
  borderRadius: 3,
  border: '1px solid',
  minWidth: 8,
  minHeight: 8,
}
const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  fontSize: 11,
  opacity: 0.7,
  fontFamily: 'monospace',
  letterSpacing: 0.4,
  marginTop: 4,
}
const footerStatStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.85)',
}
const footerSeparatorStyle: React.CSSProperties = {
  opacity: 0.5,
}
