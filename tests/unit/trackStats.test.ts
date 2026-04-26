import { describe, it, expect } from 'vitest'
import {
  averageLapMs,
  emptyStats,
  formatDuration,
  formatPlayedAt,
  recordLap,
  recordSession,
  type TrackStats,
} from '@/game/trackStats'

describe('emptyStats', () => {
  it('returns an all-zero snapshot with null timestamps', () => {
    expect(emptyStats()).toEqual({
      lapCount: 0,
      totalDriveMs: 0,
      sessionCount: 0,
      firstPlayedAt: null,
      lastPlayedAt: null,
    })
  })

  it('returns a fresh object each call so callers can safely mutate', () => {
    const a = emptyStats()
    const b = emptyStats()
    expect(a).not.toBe(b)
    a.lapCount = 5
    expect(b.lapCount).toBe(0)
  })
})

describe('recordSession', () => {
  it('increments the session counter and stamps both timestamps on first call', () => {
    const next = recordSession(emptyStats(), 1_700_000_000_000)
    expect(next.sessionCount).toBe(1)
    expect(next.firstPlayedAt).toBe(1_700_000_000_000)
    expect(next.lastPlayedAt).toBe(1_700_000_000_000)
  })

  it('preserves firstPlayedAt across subsequent sessions', () => {
    const a = recordSession(emptyStats(), 1_700_000_000_000)
    const b = recordSession(a, 1_700_000_500_000)
    expect(b.sessionCount).toBe(2)
    expect(b.firstPlayedAt).toBe(1_700_000_000_000)
    expect(b.lastPlayedAt).toBe(1_700_000_500_000)
  })

  it('does not mutate the input snapshot', () => {
    const prev = emptyStats()
    recordSession(prev, 1_700_000_000_000)
    expect(prev.sessionCount).toBe(0)
    expect(prev.firstPlayedAt).toBeNull()
    expect(prev.lastPlayedAt).toBeNull()
  })

  it('floors fractional timestamps so the persisted record stays integer', () => {
    const next = recordSession(emptyStats(), 1_700_000_000_123.99)
    expect(next.firstPlayedAt).toBe(1_700_000_000_123)
    expect(next.lastPlayedAt).toBe(1_700_000_000_123)
  })

  it('falls back to existing timestamps when nowMs is non-finite', () => {
    const a = recordSession(emptyStats(), 1_700_000_000_000)
    const b = recordSession(a, Number.NaN)
    expect(b.sessionCount).toBe(2)
    expect(b.firstPlayedAt).toBe(1_700_000_000_000)
    expect(b.lastPlayedAt).toBe(1_700_000_000_000)
  })

  it('treats zero or negative nowMs as missing (falls back to existing)', () => {
    const a = recordSession(emptyStats(), 1_700_000_000_000)
    const b = recordSession(a, 0)
    expect(b.sessionCount).toBe(2)
    expect(b.lastPlayedAt).toBe(1_700_000_000_000)
    const c = recordSession(b, -5)
    expect(c.lastPlayedAt).toBe(1_700_000_000_000)
  })

  it('still advances the counter even when the clock is broken', () => {
    const a = recordSession(emptyStats(), Number.NaN)
    expect(a.sessionCount).toBe(1)
    expect(a.firstPlayedAt).toBeNull()
    expect(a.lastPlayedAt).toBeNull()
  })
})

describe('recordLap', () => {
  const start: TrackStats = {
    lapCount: 0,
    totalDriveMs: 0,
    sessionCount: 1,
    firstPlayedAt: 1_700_000_000_000,
    lastPlayedAt: 1_700_000_000_000,
  }

  it('increments lap count and adds the rounded lap time', () => {
    const next = recordLap(start, 18420.4, 1_700_000_500_000)
    expect(next.lapCount).toBe(1)
    expect(next.totalDriveMs).toBe(18420)
    expect(next.lastPlayedAt).toBe(1_700_000_500_000)
  })

  it('rounds half-up consistently with Math.round', () => {
    const next = recordLap(start, 18420.5, 1_700_000_500_000)
    expect(next.totalDriveMs).toBe(18421)
  })

  it('accumulates across multiple laps', () => {
    const a = recordLap(start, 18000, 1_700_000_500_000)
    const b = recordLap(a, 17500, 1_700_000_700_000)
    const c = recordLap(b, 17750, 1_700_000_900_000)
    expect(c.lapCount).toBe(3)
    expect(c.totalDriveMs).toBe(18000 + 17500 + 17750)
    expect(c.lastPlayedAt).toBe(1_700_000_900_000)
  })

  it('does not mutate the input snapshot', () => {
    recordLap(start, 18000, 1_700_000_500_000)
    expect(start.lapCount).toBe(0)
    expect(start.totalDriveMs).toBe(0)
  })

  it('drops a lap with non-positive time and leaves counters alone', () => {
    const a = recordLap(start, 0, 1_700_000_500_000)
    expect(a.lapCount).toBe(0)
    expect(a.totalDriveMs).toBe(0)
    // lastPlayedAt still moves so the engagement record does not go stale on
    // a degenerate lap.
    expect(a.lastPlayedAt).toBe(1_700_000_500_000)
  })

  it('drops a lap with negative time', () => {
    const a = recordLap(start, -42, 1_700_000_500_000)
    expect(a.lapCount).toBe(0)
    expect(a.totalDriveMs).toBe(0)
  })

  it('drops a lap with non-finite time', () => {
    const a = recordLap(start, Number.NaN, 1_700_000_500_000)
    const b = recordLap(start, Number.POSITIVE_INFINITY, 1_700_000_500_000)
    expect(a.lapCount).toBe(0)
    expect(b.lapCount).toBe(0)
  })

  it('preserves sessionCount and firstPlayedAt', () => {
    const next = recordLap(start, 18000, 1_700_000_500_000)
    expect(next.sessionCount).toBe(1)
    expect(next.firstPlayedAt).toBe(1_700_000_000_000)
  })

  it('seeds firstPlayedAt when recording the very first lap on a fresh stats object', () => {
    const fresh = emptyStats()
    const next = recordLap(fresh, 18000, 1_700_000_500_000)
    expect(next.firstPlayedAt).toBe(1_700_000_500_000)
    expect(next.lastPlayedAt).toBe(1_700_000_500_000)
  })

  it('falls back to existing lastPlayedAt when nowMs is non-finite', () => {
    const next = recordLap(start, 18000, Number.NaN)
    expect(next.lapCount).toBe(1)
    expect(next.lastPlayedAt).toBe(1_700_000_000_000)
  })
})

describe('formatDuration', () => {
  it('renders seconds in MM:SS for a sub-minute duration', () => {
    expect(formatDuration(45_000)).toBe('00:45')
  })

  it('renders minutes and seconds for a sub-hour duration', () => {
    expect(formatDuration(125_000)).toBe('02:05')
  })

  it('renders hours when the duration spans an hour', () => {
    expect(formatDuration(3 * 3_600_000 + 25 * 60_000 + 7_000)).toBe('03:25:07')
  })

  it('rounds fractional ms with the same rule as the lap-time formatter', () => {
    // Implementation rounds the ms total then floors-divides to seconds, so
    // sub-second residue is dropped rather than promoted. Tested both sides
    // of the boundary so a refactor that flips the rounding direction trips.
    expect(formatDuration(45_499)).toBe('00:45')
    expect(formatDuration(45_999)).toBe('00:45')
  })

  it('renders 00:00 for zero', () => {
    expect(formatDuration(0)).toBe('00:00')
  })

  it('renders --:-- for non-finite or negative inputs', () => {
    expect(formatDuration(Number.NaN)).toBe('--:--')
    expect(formatDuration(Number.NEGATIVE_INFINITY)).toBe('--:--')
    expect(formatDuration(-1)).toBe('--:--')
  })
})

describe('formatPlayedAt', () => {
  it('renders YYYY-MM-DD UTC for a normal timestamp', () => {
    expect(formatPlayedAt(Date.UTC(2026, 3, 26, 12, 0, 0))).toBe('2026-04-26')
  })

  it('renders -- for null', () => {
    expect(formatPlayedAt(null)).toBe('--')
  })

  it('renders -- for non-finite or non-positive inputs', () => {
    expect(formatPlayedAt(Number.NaN)).toBe('--')
    expect(formatPlayedAt(Number.POSITIVE_INFINITY)).toBe('--')
    expect(formatPlayedAt(0)).toBe('--')
    expect(formatPlayedAt(-1)).toBe('--')
  })

  it('zero-pads single-digit months and days', () => {
    // 2026-01-05T00:00:00Z
    expect(formatPlayedAt(Date.UTC(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('averageLapMs', () => {
  it('returns null when no laps have been recorded', () => {
    expect(averageLapMs(emptyStats())).toBeNull()
  })

  it('divides totalDriveMs by lapCount', () => {
    const stats: TrackStats = {
      lapCount: 4,
      totalDriveMs: 80_000,
      sessionCount: 1,
      firstPlayedAt: 1,
      lastPlayedAt: 2,
    }
    expect(averageLapMs(stats)).toBe(20_000)
  })

  it('returns null when totalDriveMs is corrupt despite a positive lapCount', () => {
    const stats: TrackStats = {
      lapCount: 4,
      totalDriveMs: 0,
      sessionCount: 1,
      firstPlayedAt: 1,
      lastPlayedAt: 2,
    }
    expect(averageLapMs(stats)).toBeNull()
  })
})
