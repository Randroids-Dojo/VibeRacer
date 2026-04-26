import { describe, it, expect } from 'vitest'
import {
  RACE_CALENDAR_DEFAULT_WEEKS,
  RACE_CALENDAR_MAX_WEEKS,
  buildRaceCalendarGrid,
  formatRacePercent,
  monthLabelForWeek,
  utcWeekdayForDateKey,
  type RaceCalendarWeek,
} from '@/game/raceCalendar'

describe('RACE_CALENDAR_DEFAULT_WEEKS', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(RACE_CALENDAR_DEFAULT_WEEKS)).toBe(true)
    expect(RACE_CALENDAR_DEFAULT_WEEKS).toBeGreaterThan(0)
  })
  it('does not exceed RACE_CALENDAR_MAX_WEEKS', () => {
    expect(RACE_CALENDAR_DEFAULT_WEEKS).toBeLessThanOrEqual(
      RACE_CALENDAR_MAX_WEEKS,
    )
  })
})

describe('RACE_CALENDAR_MAX_WEEKS', () => {
  it('covers at least a year of weeks', () => {
    expect(RACE_CALENDAR_MAX_WEEKS).toBeGreaterThanOrEqual(52)
  })
})

describe('utcWeekdayForDateKey', () => {
  it('returns 0 for Sunday', () => {
    // 2026-04-26 is a Sunday.
    expect(utcWeekdayForDateKey('2026-04-26')).toBe(0)
  })
  it('returns 6 for Saturday', () => {
    // 2026-04-25 is a Saturday.
    expect(utcWeekdayForDateKey('2026-04-25')).toBe(6)
  })
  it('returns -1 on a malformed key', () => {
    expect(utcWeekdayForDateKey('not-a-date')).toBe(-1)
    expect(utcWeekdayForDateKey('')).toBe(-1)
    expect(utcWeekdayForDateKey('2026-13-40')).toBe(-1)
  })
  it('returns -1 on a non-existent calendar date', () => {
    expect(utcWeekdayForDateKey('2026-02-31')).toBe(-1)
  })
})

describe('buildRaceCalendarGrid', () => {
  const TODAY_KEY = '2026-04-26' // Sunday
  it('returns the requested number of weeks', () => {
    const grid = buildRaceCalendarGrid([], TODAY_KEY, 8)
    expect(grid.weeks.length).toBe(8)
  })

  it('defaults to RACE_CALENDAR_DEFAULT_WEEKS when no weeks arg', () => {
    const grid = buildRaceCalendarGrid([], TODAY_KEY)
    expect(grid.weeks.length).toBe(RACE_CALENDAR_DEFAULT_WEEKS)
  })

  it('clamps weeks to RACE_CALENDAR_MAX_WEEKS', () => {
    const grid = buildRaceCalendarGrid([], TODAY_KEY, 9999)
    expect(grid.weeks.length).toBe(RACE_CALENDAR_MAX_WEEKS)
  })

  it('collapses non-finite or non-positive weeks to default', () => {
    const a = buildRaceCalendarGrid([], TODAY_KEY, 0)
    const b = buildRaceCalendarGrid([], TODAY_KEY, -3)
    const c = buildRaceCalendarGrid([], TODAY_KEY, Number.NaN)
    const d = buildRaceCalendarGrid([], TODAY_KEY, Number.POSITIVE_INFINITY)
    expect(a.weeks.length).toBe(RACE_CALENDAR_DEFAULT_WEEKS)
    expect(b.weeks.length).toBe(RACE_CALENDAR_DEFAULT_WEEKS)
    expect(c.weeks.length).toBe(RACE_CALENDAR_DEFAULT_WEEKS)
    expect(d.weeks.length).toBe(RACE_CALENDAR_DEFAULT_WEEKS)
  })

  it('returns an empty grid when todayKey is malformed', () => {
    const grid = buildRaceCalendarGrid([], 'not-a-date', 4)
    expect(grid.weeks.length).toBe(0)
    expect(grid.racedCount).toBe(0)
    expect(grid.totalCells).toBe(0)
    expect(grid.coveredCells).toBe(0)
    expect(grid.todayKey).toBe('not-a-date')
  })

  it('produces 7 cells per week column', () => {
    const grid = buildRaceCalendarGrid([], TODAY_KEY, 4)
    for (const week of grid.weeks) {
      expect(week.cells.length).toBe(7)
    }
  })

  it('orders cells Sun..Sat per column', () => {
    const grid = buildRaceCalendarGrid([], TODAY_KEY, 1)
    const weekdays = grid.weeks[0]!.cells.map((c) => c.weekday)
    expect(weekdays).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('places newest week on the right', () => {
    const grid = buildRaceCalendarGrid([], TODAY_KEY, 3)
    const newestWeek = grid.weeks[grid.weeks.length - 1]!
    // The newest week's Sunday is today (2026-04-26 is a Sunday).
    expect(newestWeek.cells[0]!.dateKey).toBe('2026-04-26')
  })

  it('flags today as isToday', () => {
    const grid = buildRaceCalendarGrid([], TODAY_KEY, 4)
    let foundToday = false
    for (const week of grid.weeks) {
      for (const cell of week.cells) {
        if (cell.dateKey === TODAY_KEY) {
          expect(cell.isToday).toBe(true)
          foundToday = true
        } else {
          expect(cell.isToday).toBe(false)
        }
      }
    }
    expect(foundToday).toBe(true)
  })

  it('flags cells past today as isFuture', () => {
    const grid = buildRaceCalendarGrid([], TODAY_KEY, 1)
    // Sunday is today (idx 0). Mon..Sat are future.
    expect(grid.weeks[0]!.cells[0]!.isFuture).toBe(false)
    for (let i = 1; i < 7; i++) {
      expect(grid.weeks[0]!.cells[i]!.isFuture).toBe(true)
    }
  })

  it('marks a raced day as raced when present in days', () => {
    const grid = buildRaceCalendarGrid(['2026-04-25'], TODAY_KEY, 4)
    let foundRaced = false
    for (const week of grid.weeks) {
      for (const cell of week.cells) {
        if (cell.dateKey === '2026-04-25') {
          expect(cell.raced).toBe(true)
          foundRaced = true
        }
      }
    }
    expect(foundRaced).toBe(true)
  })

  it('does not mark a future day as raced even if present in days', () => {
    // A hand-edited or clock-skewed history could contain a future date.
    // We should NEVER mark a future cell as raced.
    const futureKey = '2026-04-28' // Tuesday after today (Sunday)
    const grid = buildRaceCalendarGrid([futureKey], TODAY_KEY, 1)
    const cell = grid.weeks[0]!.cells.find((c) => c.dateKey === futureKey)
    expect(cell).toBeDefined()
    expect(cell!.isFuture).toBe(true)
    expect(cell!.raced).toBe(false)
  })

  it('counts racedCount only for past or today cells inside the window', () => {
    const grid = buildRaceCalendarGrid(
      ['2026-04-26', '2026-04-25', '2026-04-24'],
      TODAY_KEY,
      4,
    )
    expect(grid.racedCount).toBe(3)
  })

  it('ignores raced days outside the window', () => {
    // 2026-01-01 is far before the 12-week window ending on 2026-04-26.
    const grid = buildRaceCalendarGrid(
      ['2026-01-01', '2026-04-26'],
      TODAY_KEY,
      4,
    )
    expect(grid.racedCount).toBe(1)
  })

  it('skips malformed entries', () => {
    const grid = buildRaceCalendarGrid(
      ['2026-04-26', 'not-a-date', '', '2026-13-40' as unknown as string],
      TODAY_KEY,
      4,
    )
    expect(grid.racedCount).toBe(1)
  })

  it('totalCells equals weeks * 7', () => {
    const grid = buildRaceCalendarGrid([], TODAY_KEY, 6)
    expect(grid.totalCells).toBe(42)
  })

  it('coveredCells excludes future cells', () => {
    // Today is Sunday so the rightmost week has 6 future cells.
    const grid = buildRaceCalendarGrid([], TODAY_KEY, 1)
    expect(grid.coveredCells).toBe(1)
    const grid4 = buildRaceCalendarGrid([], TODAY_KEY, 4)
    // 4 weeks = 28 cells. The rightmost week has 6 future cells (Mon..Sat).
    expect(grid4.coveredCells).toBe(28 - 6)
  })

  it('echoes back the todayKey', () => {
    const grid = buildRaceCalendarGrid([], TODAY_KEY, 4)
    expect(grid.todayKey).toBe(TODAY_KEY)
  })

  it('works on a non-Sunday today', () => {
    // 2026-04-22 is a Wednesday.
    const grid = buildRaceCalendarGrid([], '2026-04-22', 1)
    expect(grid.weeks.length).toBe(1)
    // Sun..Tue are past, Wed is today, Thu..Sat are future.
    expect(grid.weeks[0]!.cells[0]!.dateKey).toBe('2026-04-19')
    expect(grid.weeks[0]!.cells[3]!.dateKey).toBe('2026-04-22')
    expect(grid.weeks[0]!.cells[3]!.isToday).toBe(true)
    expect(grid.weeks[0]!.cells[4]!.isFuture).toBe(true)
    expect(grid.weeks[0]!.cells[6]!.isFuture).toBe(true)
  })

  it('handles a month boundary in the window', () => {
    // 2026-04-01 is a Wednesday. Walk back four weeks; the oldest column
    // should anchor on Sunday 2026-03-08.
    const grid = buildRaceCalendarGrid([], '2026-04-01', 4)
    expect(grid.weeks[0]!.cells[0]!.dateKey).toBe('2026-03-08')
  })

  it('does not mutate the input days array', () => {
    const days = ['2026-04-25', '2026-04-26']
    const snapshot = days.slice()
    buildRaceCalendarGrid(days, TODAY_KEY, 4)
    expect(days).toEqual(snapshot)
  })

  it('returns a fresh grid each call (no shared aliasing)', () => {
    const a = buildRaceCalendarGrid([], TODAY_KEY, 4)
    const b = buildRaceCalendarGrid([], TODAY_KEY, 4)
    expect(a).not.toBe(b)
    expect(a.weeks).not.toBe(b.weeks)
  })

  it('assigns ascending indices to weeks (oldest = 0)', () => {
    const grid = buildRaceCalendarGrid([], TODAY_KEY, 5)
    const indices = grid.weeks.map((w) => w.index)
    expect(indices).toEqual([0, 1, 2, 3, 4])
  })
})

describe('formatRacePercent', () => {
  it('returns "0%" when coveredCells is zero', () => {
    expect(formatRacePercent(0, 0)).toBe('0%')
    expect(formatRacePercent(5, 0)).toBe('0%')
  })
  it('returns "0%" on negative inputs', () => {
    expect(formatRacePercent(-1, 10)).toBe('0%')
    expect(formatRacePercent(5, -1)).toBe('0%')
  })
  it('returns "0%" on non-finite inputs', () => {
    expect(formatRacePercent(Number.NaN, 10)).toBe('0%')
    expect(formatRacePercent(5, Number.POSITIVE_INFINITY)).toBe('0%')
  })
  it('rounds to whole percent', () => {
    expect(formatRacePercent(1, 6)).toBe('17%')
    expect(formatRacePercent(2, 7)).toBe('29%')
  })
  it('returns "100%" for full coverage', () => {
    expect(formatRacePercent(7, 7)).toBe('100%')
  })
  it('clamps over-100% inputs', () => {
    // Hand-edited racedCount > coveredCells should clamp to 100%, not blow
    // past it.
    expect(formatRacePercent(15, 10)).toBe('100%')
  })
  it('rounds half-up to nearest integer', () => {
    expect(formatRacePercent(1, 2)).toBe('50%')
    expect(formatRacePercent(3, 8)).toBe('38%')
  })
})

describe('monthLabelForWeek', () => {
  function makeWeek(dateKeys: string[]): RaceCalendarWeek {
    return {
      index: 0,
      weekOfYear: 0,
      cells: dateKeys.map((k, i) => ({
        dateKey: k,
        raced: false,
        isFuture: false,
        isToday: false,
        weekday: i,
      })),
    }
  }
  it('returns the month name when the column contains a day in 1..7', () => {
    // Week of 2026-04-05: contains April 5..11. April 5 is in [1, 7].
    const week = makeWeek([
      '2026-04-05',
      '2026-04-06',
      '2026-04-07',
      '2026-04-08',
      '2026-04-09',
      '2026-04-10',
      '2026-04-11',
    ])
    expect(monthLabelForWeek(week)).toBe('Apr')
  })
  it('returns null when no cell falls in the 1..7 range', () => {
    // Week of 2026-04-12: contains April 12..18, all past day 7.
    const week = makeWeek([
      '2026-04-12',
      '2026-04-13',
      '2026-04-14',
      '2026-04-15',
      '2026-04-16',
      '2026-04-17',
      '2026-04-18',
    ])
    expect(monthLabelForWeek(week)).toBe(null)
  })
  it('handles a column straddling a month boundary', () => {
    // March 29..April 4: Apr 1..4 are in [1, 7].
    const week = makeWeek([
      '2026-03-29',
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
      '2026-04-02',
      '2026-04-03',
      '2026-04-04',
    ])
    expect(monthLabelForWeek(week)).toBe('Apr')
  })
  it('returns null for a malformed week input', () => {
    expect(monthLabelForWeek(null as unknown as RaceCalendarWeek)).toBe(null)
    expect(
      monthLabelForWeek({
        index: 0,
        weekOfYear: 0,
        cells: [],
      }),
    ).toBe(null)
  })
  it('skips malformed cells when scanning for the month label', () => {
    const week = makeWeek([
      'not-a-date',
      '2026-04-05',
      '2026-04-06',
      '2026-04-07',
      '2026-04-08',
      '2026-04-09',
      '2026-04-10',
    ])
    expect(monthLabelForWeek(week)).toBe('Apr')
  })
  it('does not crash on a non-existent calendar date in the cells', () => {
    const week = makeWeek([
      '2026-02-31',
      '2026-04-05',
      '2026-04-06',
      '2026-04-07',
      '2026-04-08',
      '2026-04-09',
      '2026-04-10',
    ])
    expect(monthLabelForWeek(week)).toBe('Apr')
  })
})
