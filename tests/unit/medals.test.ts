import { describe, it, expect } from 'vitest'
import {
  MEDAL_TIERS,
  MEDAL_TIERS_DESCENDING,
  MEDAL_THRESHOLDS,
  MEDAL_LABELS,
  MEDAL_COLORS,
  MEDAL_GLYPH,
  medalRank,
  isMedalUpgrade,
  medalThresholdsFor,
  medalForTime,
} from '@/game/medals'

describe('medals: constants', () => {
  it('exposes four tier names in ascending order', () => {
    expect(MEDAL_TIERS).toEqual(['bronze', 'silver', 'gold', 'platinum'])
  })

  it('descending list mirrors the ascending list reversed', () => {
    expect([...MEDAL_TIERS_DESCENDING]).toEqual([...MEDAL_TIERS].reverse())
  })

  it('threshold ratios are monotonically increasing', () => {
    expect(MEDAL_THRESHOLDS.platinum).toBeLessThan(MEDAL_THRESHOLDS.gold)
    expect(MEDAL_THRESHOLDS.gold).toBeLessThan(MEDAL_THRESHOLDS.silver)
    expect(MEDAL_THRESHOLDS.silver).toBeLessThan(MEDAL_THRESHOLDS.bronze)
  })

  it('platinum threshold is 100% of target', () => {
    expect(MEDAL_THRESHOLDS.platinum).toBe(1.0)
  })

  it('every tier has a label', () => {
    for (const tier of MEDAL_TIERS) {
      expect(typeof MEDAL_LABELS[tier]).toBe('string')
      expect(MEDAL_LABELS[tier].length).toBeGreaterThan(0)
    }
  })

  it('every tier has a color', () => {
    for (const tier of MEDAL_TIERS) {
      expect(MEDAL_COLORS[tier]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('exposes a glyph string', () => {
    expect(typeof MEDAL_GLYPH).toBe('string')
    expect(MEDAL_GLYPH.length).toBeGreaterThan(0)
  })
})

describe('medalRank', () => {
  it('returns -1 for null', () => {
    expect(medalRank(null)).toBe(-1)
  })

  it('returns ascending integers for the four tiers', () => {
    expect(medalRank('bronze')).toBe(0)
    expect(medalRank('silver')).toBe(1)
    expect(medalRank('gold')).toBe(2)
    expect(medalRank('platinum')).toBe(3)
  })
})

describe('isMedalUpgrade', () => {
  it('null to any tier is an upgrade', () => {
    expect(isMedalUpgrade(null, 'bronze')).toBe(true)
    expect(isMedalUpgrade(null, 'platinum')).toBe(true)
  })

  it('any tier to a higher tier is an upgrade', () => {
    expect(isMedalUpgrade('bronze', 'silver')).toBe(true)
    expect(isMedalUpgrade('silver', 'gold')).toBe(true)
    expect(isMedalUpgrade('gold', 'platinum')).toBe(true)
  })

  it('same tier is not an upgrade', () => {
    expect(isMedalUpgrade('silver', 'silver')).toBe(false)
  })

  it('lower tier is not an upgrade', () => {
    expect(isMedalUpgrade('gold', 'silver')).toBe(false)
    expect(isMedalUpgrade('platinum', 'bronze')).toBe(false)
  })

  it('null next is never an upgrade', () => {
    expect(isMedalUpgrade('bronze', null)).toBe(false)
    expect(isMedalUpgrade(null, null)).toBe(false)
  })
})

describe('medalThresholdsFor', () => {
  it('returns null for a null target', () => {
    expect(medalThresholdsFor(null)).toBeNull()
  })

  it('returns null for a non-finite target', () => {
    expect(medalThresholdsFor(NaN)).toBeNull()
    expect(medalThresholdsFor(Infinity)).toBeNull()
    expect(medalThresholdsFor(-Infinity)).toBeNull()
  })

  it('returns null for a non-positive target', () => {
    expect(medalThresholdsFor(0)).toBeNull()
    expect(medalThresholdsFor(-1)).toBeNull()
  })

  it('scales each threshold by its ratio', () => {
    const target = 60_000
    const thresholds = medalThresholdsFor(target)
    expect(thresholds).not.toBeNull()
    expect(thresholds!.platinum).toBeCloseTo(60_000)
    expect(thresholds!.gold).toBeCloseTo(61_200)
    expect(thresholds!.silver).toBeCloseTo(66_000)
    expect(thresholds!.bronze).toBeCloseTo(75_000)
  })
})

describe('medalForTime', () => {
  const target = 30_000

  it('returns null when lap is null', () => {
    expect(medalForTime(null, target)).toBeNull()
  })

  it('returns null when target is null', () => {
    expect(medalForTime(25_000, null)).toBeNull()
  })

  it('returns null for non-finite or non-positive lap', () => {
    expect(medalForTime(NaN, target)).toBeNull()
    expect(medalForTime(Infinity, target)).toBeNull()
    expect(medalForTime(0, target)).toBeNull()
    expect(medalForTime(-100, target)).toBeNull()
  })

  it('platinum at exactly the target time', () => {
    expect(medalForTime(target, target)).toBe('platinum')
  })

  it('platinum below the target time', () => {
    expect(medalForTime(target - 1, target)).toBe('platinum')
    expect(medalForTime(target * 0.5, target)).toBe('platinum')
  })

  it('gold within 102% of target', () => {
    expect(medalForTime(target * 1.01, target)).toBe('gold')
    expect(medalForTime(target * 1.02, target)).toBe('gold')
  })

  it('silver within 110% of target', () => {
    expect(medalForTime(target * 1.05, target)).toBe('silver')
    expect(medalForTime(target * 1.1, target)).toBe('silver')
  })

  it('bronze within 125% of target', () => {
    expect(medalForTime(target * 1.15, target)).toBe('bronze')
    expect(medalForTime(target * 1.25, target)).toBe('bronze')
  })

  it('null when slower than 125% of target', () => {
    expect(medalForTime(target * 1.26, target)).toBeNull()
    expect(medalForTime(target * 2, target)).toBeNull()
  })

  it('inclusive boundaries: ties land in the better tier', () => {
    // A lap exactly at 102% should be gold, not silver.
    expect(medalForTime(target * 1.02, target)).toBe('gold')
    // A lap exactly at 110% should be silver, not bronze.
    expect(medalForTime(target * 1.1, target)).toBe('silver')
    // A lap exactly at 125% should be bronze, not null.
    expect(medalForTime(target * 1.25, target)).toBe('bronze')
  })
})
