import { describe, it, expect } from 'vitest'
import {
  STREAK_HUD_MIN,
  formatStreakLabel,
  incrementStreak,
  isStreakBest,
  resetStreak,
  sanitizeStreak,
} from '@/game/pbStreak'

describe('STREAK_HUD_MIN', () => {
  it('is at least 2 so a single first-PB does not double up the existing toast', () => {
    expect(STREAK_HUD_MIN).toBeGreaterThanOrEqual(2)
  })
})

describe('incrementStreak', () => {
  it('returns 1 from a zero baseline', () => {
    expect(incrementStreak(0)).toBe(1)
  })

  it('adds one to an existing positive streak', () => {
    expect(incrementStreak(3)).toBe(4)
  })

  it('chains through several increments', () => {
    let s = 0
    s = incrementStreak(s)
    s = incrementStreak(s)
    s = incrementStreak(s)
    expect(s).toBe(3)
  })

  it('is pure (does not mutate the input value)', () => {
    const before = 5
    const after = incrementStreak(before)
    expect(before).toBe(5)
    expect(after).toBe(6)
  })

  it('floors fractional inputs before incrementing', () => {
    expect(incrementStreak(2.7)).toBe(3)
  })

  it('collapses non-finite input to a fresh 1', () => {
    expect(incrementStreak(Number.NaN)).toBe(1)
    expect(incrementStreak(Number.POSITIVE_INFINITY)).toBe(1)
  })

  it('collapses negative input to a fresh 1', () => {
    expect(incrementStreak(-3)).toBe(1)
  })
})

describe('resetStreak', () => {
  it('always returns zero', () => {
    expect(resetStreak()).toBe(0)
  })
})

describe('isStreakBest', () => {
  it('returns true on a fresh slug with no prior best', () => {
    expect(isStreakBest(1, null)).toBe(true)
  })

  it('returns true when current beats prior best', () => {
    expect(isStreakBest(5, 3)).toBe(true)
  })

  it('returns false on a tie', () => {
    expect(isStreakBest(5, 5)).toBe(false)
  })

  it('returns false when current is below prior best', () => {
    expect(isStreakBest(2, 5)).toBe(false)
  })

  it('returns false when current is zero', () => {
    expect(isStreakBest(0, null)).toBe(false)
    expect(isStreakBest(0, 3)).toBe(false)
  })

  it('returns false when current is non-finite or negative', () => {
    expect(isStreakBest(Number.NaN, 3)).toBe(false)
    expect(isStreakBest(Number.POSITIVE_INFINITY, 3)).toBe(false)
    expect(isStreakBest(-1, 3)).toBe(false)
  })

  it('treats a non-finite prior best as null (any positive current wins)', () => {
    expect(isStreakBest(2, Number.NaN)).toBe(true)
  })
})

describe('formatStreakLabel', () => {
  it('returns null below the HUD threshold', () => {
    expect(formatStreakLabel(0)).toBeNull()
    expect(formatStreakLabel(1)).toBeNull()
  })

  it('returns the label at the HUD threshold', () => {
    expect(formatStreakLabel(STREAK_HUD_MIN)).toBe(`PB STREAK x${STREAK_HUD_MIN}`)
  })

  it('returns the label above the HUD threshold', () => {
    expect(formatStreakLabel(7)).toBe('PB STREAK x7')
  })

  it('floors fractional input before formatting', () => {
    expect(formatStreakLabel(3.9)).toBe('PB STREAK x3')
  })

  it('returns null for non-finite input', () => {
    expect(formatStreakLabel(Number.NaN)).toBeNull()
    expect(formatStreakLabel(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('returns null for negative input', () => {
    expect(formatStreakLabel(-5)).toBeNull()
  })

  it('contains no em-dash or en-dash characters', () => {
    const label = formatStreakLabel(4)!
    expect(label.includes('\u2014')).toBe(false)
    expect(label.includes('\u2013')).toBe(false)
  })
})

describe('sanitizeStreak', () => {
  it('returns null for non-number input', () => {
    expect(sanitizeStreak('3')).toBeNull()
    expect(sanitizeStreak(null)).toBeNull()
    expect(sanitizeStreak(undefined)).toBeNull()
    expect(sanitizeStreak({})).toBeNull()
  })

  it('returns null for non-finite numbers', () => {
    expect(sanitizeStreak(Number.NaN)).toBeNull()
    expect(sanitizeStreak(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('returns null for zero or negative numbers', () => {
    expect(sanitizeStreak(0)).toBeNull()
    expect(sanitizeStreak(-1)).toBeNull()
  })

  it('floors a fractional positive number', () => {
    expect(sanitizeStreak(3.9)).toBe(3)
  })

  it('passes a positive integer through unchanged', () => {
    expect(sanitizeStreak(7)).toBe(7)
  })
})

describe('streak lifecycle (chained helpers)', () => {
  it('PB then non-PB resets the streak', () => {
    let streak = 0
    streak = incrementStreak(streak) // PB lap 1
    streak = incrementStreak(streak) // PB lap 2
    expect(streak).toBe(2)
    streak = resetStreak() // non-PB lap 3
    expect(streak).toBe(0)
  })

  it('can rebuild a streak after a reset', () => {
    let streak = 5
    streak = resetStreak()
    streak = incrementStreak(streak) // fresh PB
    streak = incrementStreak(streak)
    expect(streak).toBe(2)
  })

  it('best mark only advances when current exceeds prior', () => {
    let best: number | null = null
    let live = 0
    live = incrementStreak(live)
    if (isStreakBest(live, best)) best = live
    expect(best).toBe(1)
    live = incrementStreak(live)
    if (isStreakBest(live, best)) best = live
    expect(best).toBe(2)
    // streak resets, best stays at the high-water mark
    live = resetStreak()
    if (isStreakBest(live, best)) best = live
    expect(best).toBe(2)
    // rebuild but never exceeds 2; best stays put
    live = incrementStreak(live)
    if (isStreakBest(live, best)) best = live
    expect(best).toBe(2)
  })
})
