import { describe, it, expect } from 'vitest'
import {
  dailyChallengeSeed,
  dateKeyForUtc,
  pickDailyChallenge,
} from '@/lib/dailyChallenge'

describe('dateKeyForUtc', () => {
  it('formats a known timestamp as YYYY-MM-DD in UTC', () => {
    // 2026-04-26 00:00:00 UTC.
    const ms = Date.UTC(2026, 3, 26, 0, 0, 0)
    expect(dateKeyForUtc(ms)).toBe('2026-04-26')
  })

  it('pads single-digit month and day', () => {
    const ms = Date.UTC(2025, 0, 5, 0, 0, 0)
    expect(dateKeyForUtc(ms)).toBe('2025-01-05')
  })

  it('uses UTC date even just before midnight UTC', () => {
    const ms = Date.UTC(2026, 3, 26, 23, 59, 59)
    expect(dateKeyForUtc(ms)).toBe('2026-04-26')
  })

  it('rolls to the next UTC day at midnight UTC', () => {
    const ms = Date.UTC(2026, 3, 27, 0, 0, 0)
    expect(dateKeyForUtc(ms)).toBe('2026-04-27')
  })

  it('falls back to today when given a non-finite millis value', () => {
    const today = dateKeyForUtc(Date.now())
    expect(dateKeyForUtc(Number.NaN)).toBe(today)
    expect(dateKeyForUtc(Number.POSITIVE_INFINITY)).toBe(today)
  })

  it('falls back to today when given a non-number input', () => {
    const today = dateKeyForUtc(Date.now())
    expect(dateKeyForUtc('not a number' as unknown as number)).toBe(today)
  })
})

describe('dailyChallengeSeed', () => {
  it('returns 0 for empty or non-string input', () => {
    expect(dailyChallengeSeed('')).toBe(0)
    expect(dailyChallengeSeed(undefined as unknown as string)).toBe(0)
    expect(dailyChallengeSeed(null as unknown as string)).toBe(0)
  })

  it('is deterministic for the same input', () => {
    expect(dailyChallengeSeed('2026-04-26')).toBe(
      dailyChallengeSeed('2026-04-26'),
    )
  })

  it('is sensitive to a single-character flip', () => {
    expect(dailyChallengeSeed('2026-04-26')).not.toBe(
      dailyChallengeSeed('2026-04-27'),
    )
  })

  it('returns an unsigned 32-bit integer', () => {
    const seed = dailyChallengeSeed('whatever-slug-here')
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThan(2 ** 32)
    expect(Number.isInteger(seed)).toBe(true)
  })
})

describe('pickDailyChallenge', () => {
  const tracks = [
    { slug: 'oval' },
    { slug: 'sandbox' },
    { slug: 'figure-eight' },
    { slug: 'serpent' },
    { slug: 'hairpin' },
  ]

  it('returns null for an empty candidate list', () => {
    expect(pickDailyChallenge([], '2026-04-26')).toBeNull()
  })

  it('returns null when handed a non-array input', () => {
    expect(
      pickDailyChallenge(undefined as unknown as { slug: string }[], '2026-04-26'),
    ).toBeNull()
  })

  it('always returns a candidate from the input list', () => {
    const seen = new Set<string>()
    for (let day = 1; day <= 60; day++) {
      const key = `2026-04-${String(day).padStart(2, '0')}`
      const pick = pickDailyChallenge(tracks, key)
      expect(pick).not.toBeNull()
      expect(tracks.some((t) => t.slug === pick!.slug)).toBe(true)
      seen.add(pick!.slug)
    }
    // Across two months of date keys we should land on more than one candidate
    // so the pick is not pinned to a single slug by an unfortunate hash.
    expect(seen.size).toBeGreaterThan(1)
  })

  it('returns the same candidate for the same date key', () => {
    const a = pickDailyChallenge(tracks, '2026-04-26')
    const b = pickDailyChallenge(tracks, '2026-04-26')
    expect(a).toEqual(b)
  })

  it('returns the only candidate when the list has length 1', () => {
    const single = [{ slug: 'lonely' }]
    expect(pickDailyChallenge(single, '2026-04-26')).toEqual({ slug: 'lonely' })
    expect(pickDailyChallenge(single, '2099-12-31')).toEqual({ slug: 'lonely' })
  })

  it('changes the pick when the date key changes (most days)', () => {
    let differences = 0
    let prev = pickDailyChallenge(tracks, '2026-04-01')
    for (let day = 2; day <= 30; day++) {
      const key = `2026-04-${String(day).padStart(2, '0')}`
      const next = pickDailyChallenge(tracks, key)
      if (next!.slug !== prev!.slug) differences++
      prev = next
    }
    // Adjacent date keys should resolve to different picks more often than
    // they collide, otherwise the daily challenge feels static.
    expect(differences).toBeGreaterThan(10)
  })

  it('does not mutate the input list', () => {
    const before = tracks.map((t) => t.slug)
    pickDailyChallenge(tracks, '2026-04-26')
    expect(tracks.map((t) => t.slug)).toEqual(before)
  })

  it('returns the same pick across many calls (idempotent)', () => {
    const first = pickDailyChallenge(tracks, '2026-04-26')
    for (let i = 0; i < 10; i++) {
      expect(pickDailyChallenge(tracks, '2026-04-26')).toEqual(first)
    }
  })

  it('typing-preserves the candidate type', () => {
    const richer = [
      { slug: 'oval', extra: 1 },
      { slug: 'sandbox', extra: 2 },
    ] as const
    const pick = pickDailyChallenge(richer, '2026-04-26')
    expect(pick).not.toBeNull()
    // Type-check at runtime: the picked entry should still carry the extra
    // field (we just used a const tuple with extras).
    expect(pick!.extra).toBeDefined()
  })
})
