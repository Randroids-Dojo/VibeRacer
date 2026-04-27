import { describe, it, expect } from 'vitest'
import {
  DAILY_STREAK_MAX_HISTORY_DAYS,
  DAILY_STREAK_RECENT_WINDOW,
  MS_PER_DAY,
  appendDailyStreakDay,
  bestStreakLength,
  buildRecentDays,
  currentStreakLength,
  formatStreakLabel,
  isDateKey,
  parseDateKeyToUtcMs,
  sanitizeDailyStreakDays,
  summarizeDailyStreak,
} from '@/game/dailyStreak'

describe('isDateKey', () => {
  it('accepts a properly-formatted YYYY-MM-DD key', () => {
    expect(isDateKey('2026-04-26')).toBe(true)
    expect(isDateKey('2025-01-05')).toBe(true)
    expect(isDateKey('1999-12-31')).toBe(true)
  })

  it('rejects malformed strings', () => {
    expect(isDateKey('2026-4-26')).toBe(false)
    expect(isDateKey('2026/04/26')).toBe(false)
    expect(isDateKey('26-04-2026')).toBe(false)
    expect(isDateKey('today')).toBe(false)
    expect(isDateKey('')).toBe(false)
  })

  it('rejects non-string inputs defensively', () => {
    expect(isDateKey(null)).toBe(false)
    expect(isDateKey(undefined)).toBe(false)
    expect(isDateKey(20260426)).toBe(false)
    expect(isDateKey({})).toBe(false)
  })

  it('rejects non-existent calendar dates that match the regex', () => {
    expect(isDateKey('2026-02-31')).toBe(false)
    expect(isDateKey('2026-13-01')).toBe(false)
    expect(isDateKey('2026-00-10')).toBe(false)
    expect(isDateKey('2026-01-00')).toBe(false)
    expect(isDateKey('2026-01-32')).toBe(false)
  })
})

describe('parseDateKeyToUtcMs', () => {
  it('returns the UTC midnight instant for a valid key', () => {
    expect(parseDateKeyToUtcMs('2026-04-26')).toBe(Date.UTC(2026, 3, 26))
    expect(parseDateKeyToUtcMs('2025-01-05')).toBe(Date.UTC(2025, 0, 5))
  })

  it('returns null on a malformed key', () => {
    expect(parseDateKeyToUtcMs('not-a-date')).toBeNull()
    expect(parseDateKeyToUtcMs('2026-13-01')).toBeNull()
    expect(parseDateKeyToUtcMs('')).toBeNull()
  })

  it('returns null on a non-string input', () => {
    expect(parseDateKeyToUtcMs(null as unknown as string)).toBeNull()
    expect(parseDateKeyToUtcMs(20260426 as unknown as string)).toBeNull()
  })

  it('round-trips: parsing then formatting returns the same key', () => {
    const key = '2026-04-26'
    const ms = parseDateKeyToUtcMs(key)
    expect(ms).not.toBeNull()
    const d = new Date(ms!)
    const formatted = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    expect(formatted).toBe(key)
  })
})

describe('sanitizeDailyStreakDays', () => {
  it('returns an empty array on empty input', () => {
    expect(sanitizeDailyStreakDays([])).toEqual([])
  })

  it('drops malformed entries', () => {
    expect(
      sanitizeDailyStreakDays([
        '2026-04-26',
        'not-a-date',
        '2026-13-01',
        42 as unknown as string,
        null,
      ]),
    ).toEqual(['2026-04-26'])
  })

  it('dedupes duplicate keys', () => {
    expect(
      sanitizeDailyStreakDays([
        '2026-04-26',
        '2026-04-26',
        '2026-04-25',
        '2026-04-26',
      ]),
    ).toEqual(['2026-04-25', '2026-04-26'])
  })

  it('sorts ascending', () => {
    expect(
      sanitizeDailyStreakDays(['2026-04-28', '2026-04-26', '2026-04-27']),
    ).toEqual(['2026-04-26', '2026-04-27', '2026-04-28'])
  })

  it('does not mutate the input', () => {
    const input = ['2026-04-28', '2026-04-26']
    const before = [...input]
    sanitizeDailyStreakDays(input)
    expect(input).toEqual(before)
  })

  it('returns a fresh array on every call', () => {
    const a = sanitizeDailyStreakDays(['2026-04-26'])
    const b = sanitizeDailyStreakDays(['2026-04-26'])
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

describe('appendDailyStreakDay', () => {
  it('appends a brand-new day', () => {
    expect(appendDailyStreakDay([], '2026-04-26')).toEqual(['2026-04-26'])
  })

  it('keeps the result sorted ascending', () => {
    const out = appendDailyStreakDay(['2026-04-25', '2026-04-27'], '2026-04-26')
    expect(out).toEqual(['2026-04-25', '2026-04-26', '2026-04-27'])
  })

  it('is a no-op on a duplicate day', () => {
    const before = ['2026-04-25', '2026-04-26']
    const after = appendDailyStreakDay(before, '2026-04-26')
    expect(after).toEqual(before)
  })

  it('does not mutate the input', () => {
    const before = ['2026-04-26']
    const snapshot = [...before]
    appendDailyStreakDay(before, '2026-04-27')
    expect(before).toEqual(snapshot)
  })

  it('drops malformed prior entries on read', () => {
    const out = appendDailyStreakDay(
      ['2026-04-26', 'garbage', '2026-13-40'],
      '2026-04-27',
    )
    expect(out).toEqual(['2026-04-26', '2026-04-27'])
  })

  it('is a no-op on a malformed new key', () => {
    const before = ['2026-04-26']
    expect(appendDailyStreakDay(before, 'garbage')).toEqual(['2026-04-26'])
    expect(appendDailyStreakDay(before, '')).toEqual(['2026-04-26'])
  })

  it('caps the history at DAILY_STREAK_MAX_HISTORY_DAYS, dropping oldest', () => {
    const days: string[] = []
    const startMs = Date.UTC(2024, 0, 1)
    for (let i = 0; i < DAILY_STREAK_MAX_HISTORY_DAYS + 50; i++) {
      const ms = startMs + i * MS_PER_DAY
      const d = new Date(ms)
      days.push(
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
      )
    }
    let acc: string[] = []
    for (const day of days) {
      acc = appendDailyStreakDay(acc, day)
    }
    expect(acc.length).toBe(DAILY_STREAK_MAX_HISTORY_DAYS)
    // The most recent day is preserved at the end.
    expect(acc[acc.length - 1]).toBe(days[days.length - 1])
    // The oldest entries fell off.
    expect(acc[0]).not.toBe(days[0])
  })
})

describe('currentStreakLength', () => {
  it('returns 0 on an empty history', () => {
    expect(currentStreakLength([], '2026-04-26')).toBe(0)
  })

  it('returns 1 when only today is recorded', () => {
    expect(currentStreakLength(['2026-04-26'], '2026-04-26')).toBe(1)
  })

  it('counts a multi-day consecutive run ending today', () => {
    expect(
      currentStreakLength(
        ['2026-04-23', '2026-04-24', '2026-04-25', '2026-04-26'],
        '2026-04-26',
      ),
    ).toBe(4)
  })

  it('counts a streak that ends yesterday (one-day grace)', () => {
    expect(
      currentStreakLength(
        ['2026-04-23', '2026-04-24', '2026-04-25'],
        '2026-04-26',
      ),
    ).toBe(3)
  })

  it('returns 0 when the most recent day is more than one day ago', () => {
    expect(
      currentStreakLength(['2026-04-23', '2026-04-24'], '2026-04-26'),
    ).toBe(0)
  })

  it('breaks the streak at a gap mid-run', () => {
    expect(
      currentStreakLength(
        ['2026-04-22', '2026-04-25', '2026-04-26'],
        '2026-04-26',
      ),
    ).toBe(2)
  })

  it('returns 0 on a malformed today key', () => {
    expect(currentStreakLength(['2026-04-26'], 'today')).toBe(0)
    expect(currentStreakLength(['2026-04-26'], '')).toBe(0)
  })

  it('drops malformed prior entries before counting', () => {
    expect(
      currentStreakLength(['garbage', '2026-04-26'] as string[], '2026-04-26'),
    ).toBe(1)
  })

  it('does not double-count duplicates in the history', () => {
    expect(
      currentStreakLength(
        ['2026-04-25', '2026-04-25', '2026-04-26'],
        '2026-04-26',
      ),
    ).toBe(2)
  })

  it('handles a UTC month boundary cleanly', () => {
    expect(
      currentStreakLength(
        ['2026-03-31', '2026-04-01', '2026-04-02'],
        '2026-04-02',
      ),
    ).toBe(3)
  })
})

describe('bestStreakLength', () => {
  it('returns 0 on empty input', () => {
    expect(bestStreakLength([])).toBe(0)
  })

  it('returns 1 on a single recorded day', () => {
    expect(bestStreakLength(['2026-04-26'])).toBe(1)
  })

  it('finds the longest consecutive run when multiple runs exist', () => {
    expect(
      bestStreakLength([
        '2026-04-01',
        '2026-04-02',
        '2026-04-03',
        '2026-04-10',
        '2026-04-11',
        '2026-04-12',
        '2026-04-13',
        '2026-04-20',
      ]),
    ).toBe(4)
  })

  it('finds the run when it is at the start of the history', () => {
    expect(
      bestStreakLength(['2026-04-01', '2026-04-02', '2026-04-03', '2026-04-15']),
    ).toBe(3)
  })

  it('finds the run when it is at the end of the history', () => {
    expect(
      bestStreakLength(['2026-04-01', '2026-04-15', '2026-04-16', '2026-04-17']),
    ).toBe(3)
  })

  it('treats unsorted input identically to sorted input (sanitize first)', () => {
    expect(
      bestStreakLength(['2026-04-03', '2026-04-01', '2026-04-02']),
    ).toBe(3)
  })

  it('crosses a month boundary cleanly', () => {
    expect(bestStreakLength(['2026-03-30', '2026-03-31', '2026-04-01'])).toBe(3)
  })

  it('drops malformed entries before counting', () => {
    expect(
      bestStreakLength([
        '2026-04-01',
        'garbage',
        '2026-04-02',
        '2026-04-03',
      ] as string[]),
    ).toBe(3)
  })
})

describe('buildRecentDays', () => {
  it('returns DAILY_STREAK_RECENT_WINDOW entries by default', () => {
    const out = buildRecentDays([], '2026-04-26')
    expect(out.length).toBe(DAILY_STREAK_RECENT_WINDOW)
  })

  it('returns oldest first, ending on todayKey', () => {
    const out = buildRecentDays([], '2026-04-26')
    expect(out[out.length - 1].dateKey).toBe('2026-04-26')
    // Oldest = today minus (window - 1) days. For 7 days, that is 6 days back.
    const todayMs = Date.UTC(2026, 3, 26)
    const oldestMs = todayMs - (DAILY_STREAK_RECENT_WINDOW - 1) * MS_PER_DAY
    const d = new Date(oldestMs)
    const expected = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    expect(out[0].dateKey).toBe(expected)
  })

  it('marks raced days correctly', () => {
    const out = buildRecentDays(['2026-04-26', '2026-04-24'], '2026-04-26')
    const map = new Map(out.map((c) => [c.dateKey, c.raced]))
    expect(map.get('2026-04-26')).toBe(true)
    expect(map.get('2026-04-25')).toBe(false)
    expect(map.get('2026-04-24')).toBe(true)
  })

  it('honors a custom window size', () => {
    const out = buildRecentDays([], '2026-04-26', 3)
    expect(out.length).toBe(3)
    expect(out[2].dateKey).toBe('2026-04-26')
  })

  it('returns an empty array when todayKey is malformed', () => {
    expect(buildRecentDays([], 'garbage')).toEqual([])
  })

  it('collapses non-finite or non-positive window to a single day', () => {
    expect(buildRecentDays([], '2026-04-26', 0).length).toBe(1)
    expect(buildRecentDays([], '2026-04-26', -3).length).toBe(1)
    expect(buildRecentDays([], '2026-04-26', Number.NaN).length).toBe(1)
    expect(buildRecentDays([], '2026-04-26', Number.POSITIVE_INFINITY).length).toBe(1)
  })

  it('crosses a month boundary cleanly in the day labels', () => {
    const out = buildRecentDays([], '2026-04-02', 4)
    expect(out.map((c) => c.dateKey)).toEqual([
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
      '2026-04-02',
    ])
  })
})

describe('summarizeDailyStreak', () => {
  it('aggregates current, best, recent, and racedToday flags', () => {
    const days = [
      '2026-04-23',
      '2026-04-24',
      '2026-04-25',
      '2026-04-26',
      '2026-04-10',
      '2026-04-11',
    ]
    const out = summarizeDailyStreak(days, '2026-04-26')
    expect(out.current).toBe(4)
    expect(out.best).toBe(4)
    expect(out.recent.length).toBe(DAILY_STREAK_RECENT_WINDOW)
    expect(out.racedToday).toBe(true)
    expect(out.becameBest).toBe(false)
  })

  it('reports racedToday=false when today is missing', () => {
    const out = summarizeDailyStreak(['2026-04-25'], '2026-04-26')
    expect(out.racedToday).toBe(false)
    // One-day grace keeps the streak alive.
    expect(out.current).toBe(1)
  })

  it('flags becameBest when current best exceeds priorBest', () => {
    const out = summarizeDailyStreak(
      ['2026-04-23', '2026-04-24', '2026-04-25', '2026-04-26'],
      '2026-04-26',
      3,
    )
    expect(out.best).toBe(4)
    expect(out.becameBest).toBe(true)
  })

  it('does not flag becameBest when priorBest matches current best', () => {
    const out = summarizeDailyStreak(
      ['2026-04-23', '2026-04-24', '2026-04-25', '2026-04-26'],
      '2026-04-26',
      4,
    )
    expect(out.becameBest).toBe(false)
  })

  it('defaults priorBest to current best (becameBest false)', () => {
    const out = summarizeDailyStreak(
      ['2026-04-25', '2026-04-26'],
      '2026-04-26',
    )
    expect(out.becameBest).toBe(false)
  })

  it('treats a non-finite priorBest as a no-op (becameBest false)', () => {
    const out = summarizeDailyStreak(
      ['2026-04-25', '2026-04-26'],
      '2026-04-26',
      Number.NaN,
    )
    expect(out.becameBest).toBe(false)
  })

  it('returns zero-everywhere on an empty history', () => {
    const out = summarizeDailyStreak([], '2026-04-26')
    expect(out.current).toBe(0)
    expect(out.best).toBe(0)
    expect(out.racedToday).toBe(false)
    // The recent window is still populated so the renderer has a stable shape.
    expect(out.recent.length).toBe(DAILY_STREAK_RECENT_WINDOW)
    for (const cell of out.recent) {
      expect(cell.raced).toBe(false)
    }
  })
})

describe('formatStreakLabel', () => {
  it('returns "0 days" on zero or negative input', () => {
    expect(formatStreakLabel(0)).toBe('0 days')
    expect(formatStreakLabel(-3)).toBe('0 days')
  })

  it('returns "1 day" (singular) for exactly one', () => {
    expect(formatStreakLabel(1)).toBe('1 day')
  })

  it('returns "N days" (plural) for two or more', () => {
    expect(formatStreakLabel(2)).toBe('2 days')
    expect(formatStreakLabel(7)).toBe('7 days')
    expect(formatStreakLabel(366)).toBe('366 days')
  })

  it('floors fractional input', () => {
    expect(formatStreakLabel(2.7)).toBe('2 days')
  })

  it('returns "0 days" on non-finite input', () => {
    expect(formatStreakLabel(Number.NaN)).toBe('0 days')
    expect(formatStreakLabel(Number.POSITIVE_INFINITY)).toBe('0 days')
  })

  it('contains no em-dashes or en-dashes', () => {
    for (const n of [0, 1, 2, 5, 100]) {
      const out = formatStreakLabel(n)
      expect(out.includes('\u2014')).toBe(false)
      expect(out.includes('\u2013')).toBe(false)
    }
  })
})
