import { describe, it, expect } from 'vitest'
import {
  LIFETIME_BESTS_PREFIXES,
  buildLifetimeBests,
  emptyLifetimeBests,
  parseNamespacedKey,
  parseStoredPositiveNumber,
} from '@/lib/lifetimeBests'

const HASH = 'a'.repeat(64)
const HASH2 = 'b'.repeat(64)

describe('emptyLifetimeBests', () => {
  it('returns null for every field', () => {
    const e = emptyLifetimeBests()
    expect(e.fastestLapMs).toBeNull()
    expect(e.bestDriftScore).toBeNull()
    expect(e.bestPbStreak).toBeNull()
  })

  it('returns a fresh object each call', () => {
    expect(emptyLifetimeBests()).not.toBe(emptyLifetimeBests())
  })
})

describe('parseNamespacedKey', () => {
  it('parses a valid lap key', () => {
    const parsed = parseNamespacedKey(
      `${LIFETIME_BESTS_PREFIXES.lap}oval.${HASH}`,
      LIFETIME_BESTS_PREFIXES.lap,
    )
    expect(parsed).toEqual({ slug: 'oval', versionHash: HASH })
  })

  it('parses a drift key', () => {
    const parsed = parseNamespacedKey(
      `${LIFETIME_BESTS_PREFIXES.drift}sandbox.${HASH}`,
      LIFETIME_BESTS_PREFIXES.drift,
    )
    expect(parsed).toEqual({ slug: 'sandbox', versionHash: HASH })
  })

  it('returns null on a non-matching prefix', () => {
    expect(
      parseNamespacedKey(
        `${LIFETIME_BESTS_PREFIXES.drift}oval.${HASH}`,
        LIFETIME_BESTS_PREFIXES.lap,
      ),
    ).toBeNull()
  })

  it('returns null on an unrelated prefix', () => {
    expect(
      parseNamespacedKey('viberacer.controls.foo', LIFETIME_BESTS_PREFIXES.lap),
    ).toBeNull()
  })

  it('returns null on a malformed slug', () => {
    expect(
      parseNamespacedKey(
        `${LIFETIME_BESTS_PREFIXES.lap}TooLongSlugThatBreaksTheSchemaValidationBecauseThisCannotMatch.${HASH}`,
        LIFETIME_BESTS_PREFIXES.lap,
      ),
    ).toBeNull()
  })

  it('returns null on a malformed hash', () => {
    expect(
      parseNamespacedKey(
        `${LIFETIME_BESTS_PREFIXES.lap}oval.tooShort`,
        LIFETIME_BESTS_PREFIXES.lap,
      ),
    ).toBeNull()
  })

  it('returns null on a missing dot', () => {
    expect(
      parseNamespacedKey(
        `${LIFETIME_BESTS_PREFIXES.lap}ovalnodot`,
        LIFETIME_BESTS_PREFIXES.lap,
      ),
    ).toBeNull()
  })

  it('returns null on a leading dot', () => {
    expect(
      parseNamespacedKey(
        `${LIFETIME_BESTS_PREFIXES.lap}.${HASH}`,
        LIFETIME_BESTS_PREFIXES.lap,
      ),
    ).toBeNull()
  })

  it('returns null on a trailing dot', () => {
    expect(
      parseNamespacedKey(
        `${LIFETIME_BESTS_PREFIXES.lap}oval.`,
        LIFETIME_BESTS_PREFIXES.lap,
      ),
    ).toBeNull()
  })
})

describe('parseStoredPositiveNumber', () => {
  it('parses a positive integer', () => {
    expect(parseStoredPositiveNumber('1234', 100_000)).toBe(1234)
  })
  it('returns null on null', () => {
    expect(parseStoredPositiveNumber(null, 100)).toBeNull()
  })
  it('returns null on a non-numeric string', () => {
    expect(parseStoredPositiveNumber('abc', 100)).toBeNull()
  })
  it('returns null on zero or negative', () => {
    expect(parseStoredPositiveNumber('0', 100)).toBeNull()
    expect(parseStoredPositiveNumber('-5', 100)).toBeNull()
  })
  it('returns null on Infinity / NaN', () => {
    expect(parseStoredPositiveNumber('Infinity', 100)).toBeNull()
    expect(parseStoredPositiveNumber('NaN', 100)).toBeNull()
  })
  it('returns null when over the cap', () => {
    expect(parseStoredPositiveNumber('1000', 999)).toBeNull()
  })
  it('keeps fractional values', () => {
    expect(parseStoredPositiveNumber('12.5', 100)).toBe(12.5)
  })
})

describe('buildLifetimeBests', () => {
  it('returns the empty snapshot for an empty input', () => {
    expect(buildLifetimeBests([])).toEqual(emptyLifetimeBests())
  })

  it('finds the fastest lap across multiple slug+versions', () => {
    const result = buildLifetimeBests([
      [`${LIFETIME_BESTS_PREFIXES.lap}oval.${HASH}`, '25000'],
      [`${LIFETIME_BESTS_PREFIXES.lap}oval.${HASH2}`, '18000'],
      [`${LIFETIME_BESTS_PREFIXES.lap}sandbox.${HASH}`, '21000'],
    ])
    expect(result.fastestLapMs).toBe(18000)
  })

  it('finds the highest drift score', () => {
    const result = buildLifetimeBests([
      [`${LIFETIME_BESTS_PREFIXES.drift}oval.${HASH}`, '500'],
      [`${LIFETIME_BESTS_PREFIXES.drift}oval.${HASH2}`, '750'],
      [`${LIFETIME_BESTS_PREFIXES.drift}sandbox.${HASH}`, '200'],
    ])
    expect(result.bestDriftScore).toBe(750)
  })

  it('finds the highest pb streak', () => {
    const result = buildLifetimeBests([
      [`${LIFETIME_BESTS_PREFIXES.pbStreak}oval.${HASH}`, '3'],
      [`${LIFETIME_BESTS_PREFIXES.pbStreak}oval.${HASH2}`, '7'],
    ])
    expect(result.bestPbStreak).toBe(7)
  })

  it('rounds lap times to whole ms', () => {
    const result = buildLifetimeBests([
      [`${LIFETIME_BESTS_PREFIXES.lap}oval.${HASH}`, '21512.7'],
    ])
    expect(result.fastestLapMs).toBe(21513)
  })

  it('floors pb streaks to integers', () => {
    const result = buildLifetimeBests([
      [`${LIFETIME_BESTS_PREFIXES.pbStreak}oval.${HASH}`, '4.9'],
    ])
    expect(result.bestPbStreak).toBe(4)
  })

  it('skips malformed values', () => {
    const result = buildLifetimeBests([
      [`${LIFETIME_BESTS_PREFIXES.lap}oval.${HASH}`, 'abc'],
      [`${LIFETIME_BESTS_PREFIXES.lap}oval.${HASH2}`, '20000'],
      [`${LIFETIME_BESTS_PREFIXES.drift}oval.${HASH}`, '-100'],
      [`${LIFETIME_BESTS_PREFIXES.drift}oval.${HASH2}`, '500'],
    ])
    expect(result.fastestLapMs).toBe(20000)
    expect(result.bestDriftScore).toBe(500)
  })

  it('skips malformed keys', () => {
    const result = buildLifetimeBests([
      ['unrelated.key', '999'],
      [`${LIFETIME_BESTS_PREFIXES.lap}oval.tooShort`, '999'],
      [`${LIFETIME_BESTS_PREFIXES.lap}oval.${HASH}`, '25000'],
    ])
    expect(result.fastestLapMs).toBe(25000)
  })

  it('handles a mixed payload across all three families', () => {
    const result = buildLifetimeBests([
      [`${LIFETIME_BESTS_PREFIXES.lap}oval.${HASH}`, '25000'],
      [`${LIFETIME_BESTS_PREFIXES.drift}oval.${HASH}`, '450'],
      [`${LIFETIME_BESTS_PREFIXES.pbStreak}oval.${HASH}`, '3'],
      [`${LIFETIME_BESTS_PREFIXES.lap}sandbox.${HASH}`, '30000'],
      [`${LIFETIME_BESTS_PREFIXES.drift}sandbox.${HASH}`, '900'],
    ])
    expect(result.fastestLapMs).toBe(25000)
    expect(result.bestDriftScore).toBe(900)
    expect(result.bestPbStreak).toBe(3)
  })

  it('rejects laps over the one-hour cap', () => {
    const result = buildLifetimeBests([
      [
        `${LIFETIME_BESTS_PREFIXES.lap}oval.${HASH}`,
        String(60 * 60 * 1000 + 1),
      ],
      [`${LIFETIME_BESTS_PREFIXES.lap}oval.${HASH2}`, '25000'],
    ])
    expect(result.fastestLapMs).toBe(25000)
  })

  it('returns null for a family with no valid entries', () => {
    const result = buildLifetimeBests([
      [`${LIFETIME_BESTS_PREFIXES.lap}oval.${HASH}`, '25000'],
    ])
    expect(result.bestDriftScore).toBeNull()
    expect(result.bestPbStreak).toBeNull()
  })
})
