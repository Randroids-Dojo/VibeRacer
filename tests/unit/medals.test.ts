import { describe, it, expect } from 'vitest'
import {
  MEDAL_TIERS,
  MEDAL_TIERS_DESCENDING,
  MEDAL_THRESHOLDS,
  MEDAL_LABELS,
  MEDAL_COLORS,
  MEDAL_GLYPH,
  NEXT_MEDAL_TIER,
  medalRank,
  isMedalUpgrade,
  medalThresholdsFor,
  medalForTime,
  nextMedalGap,
  formatNextMedalLabel,
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

describe('NEXT_MEDAL_TIER', () => {
  it('walks the ladder one tier at a time', () => {
    expect(NEXT_MEDAL_TIER.bronze).toBe('silver')
    expect(NEXT_MEDAL_TIER.silver).toBe('gold')
    expect(NEXT_MEDAL_TIER.gold).toBe('platinum')
  })

  it('platinum has no upgrade', () => {
    expect(NEXT_MEDAL_TIER.platinum).toBeNull()
  })

  it('covers every tier exactly once', () => {
    // Sanity-check that a future tier addition will trip the type system.
    const keys = Object.keys(NEXT_MEDAL_TIER)
    expect(keys.sort()).toEqual([...MEDAL_TIERS].sort())
  })
})

describe('nextMedalGap', () => {
  const target = 30_000

  it('returns null when no medal is currently earned', () => {
    // Slower than 125% of target falls outside any tier.
    expect(nextMedalGap(target * 1.5, target)).toBeNull()
  })

  it('returns null when target is null', () => {
    expect(nextMedalGap(target, null)).toBeNull()
  })

  it('returns null when lap is null', () => {
    expect(nextMedalGap(null, target)).toBeNull()
  })

  it('returns null at platinum (top of ladder)', () => {
    expect(nextMedalGap(target, target)).toBeNull()
    // Platinum below the target time is still platinum.
    expect(nextMedalGap(target * 0.5, target)).toBeNull()
  })

  it('points bronze toward silver and exposes the time gap', () => {
    // Bronze is anything from > 110% up to 125%. A 120% lap on a 30s target
    // sits at 36000, with the silver threshold at 33000 (110% of target).
    const lap = target * 1.2
    const gap = nextMedalGap(lap, target)
    expect(gap).not.toBeNull()
    expect(gap!.tier).toBe('silver')
    // 36000 - 33000 = 3000.
    expect(gap!.gapMs).toBe(3000)
  })

  it('points silver toward gold and exposes the time gap', () => {
    // Silver is > 102% up to 110%. A 105% lap is 31500; gold threshold is
    // 30600 (102% of target). 31500 - 30600 = 900.
    const lap = target * 1.05
    const gap = nextMedalGap(lap, target)
    expect(gap).not.toBeNull()
    expect(gap!.tier).toBe('gold')
    expect(gap!.gapMs).toBe(900)
  })

  it('points gold toward platinum and exposes the time gap', () => {
    // Gold is > 100% up to 102%. A 101% lap is 30300; platinum is 30000.
    const lap = target * 1.01
    const gap = nextMedalGap(lap, target)
    expect(gap).not.toBeNull()
    expect(gap!.tier).toBe('platinum')
    expect(gap!.gapMs).toBe(300)
  })

  it('clamps the gap to zero on exact threshold ties', () => {
    // A lap exactly at the gold threshold is graded gold (inclusive bound)
    // so the next tier is platinum, and the gap is the distance back to the
    // platinum threshold which is below the player. The clamp keeps the
    // surfaced gap at 0 rather than a negative number that would confuse
    // the HUD.
    const lap = target * 1.02
    const gap = nextMedalGap(lap, target)
    expect(gap).not.toBeNull()
    expect(gap!.tier).toBe('platinum')
    // 30600 - 30000 = 600. The lap is graded gold (still 600 ms from
    // platinum). The clamp does not zero a real gap.
    expect(gap!.gapMs).toBe(600)
  })

  it('rounds the gap to the nearest millisecond', () => {
    // Pick a lap with a fractional gap and confirm the helper rounds it.
    const lap = target * 1.0001 + 0.4
    const gap = nextMedalGap(lap, target)
    expect(gap).not.toBeNull()
    expect(Number.isInteger(gap!.gapMs)).toBe(true)
  })

  it('defends against non-finite or non-positive inputs', () => {
    expect(nextMedalGap(NaN, target)).toBeNull()
    expect(nextMedalGap(Infinity, target)).toBeNull()
    expect(nextMedalGap(0, target)).toBeNull()
    expect(nextMedalGap(-100, target)).toBeNull()
    expect(nextMedalGap(target, NaN)).toBeNull()
    expect(nextMedalGap(target, Infinity)).toBeNull()
    expect(nextMedalGap(target, 0)).toBeNull()
    expect(nextMedalGap(target, -5)).toBeNull()
  })

  it('returns immutable snapshots (no shared references)', () => {
    const a = nextMedalGap(target * 1.2, target)
    const b = nextMedalGap(target * 1.2, target)
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

describe('formatNextMedalLabel', () => {
  it('returns null on null input', () => {
    expect(formatNextMedalLabel(null)).toBeNull()
  })

  it('formats sub-second gaps with three decimal places', () => {
    expect(formatNextMedalLabel({ tier: 'gold', gapMs: 421 })).toBe(
      'GOLD in 0.421',
    )
  })

  it('formats whole-second gaps with three trailing zeros', () => {
    expect(formatNextMedalLabel({ tier: 'silver', gapMs: 3000 })).toBe(
      'SILVER in 3.000',
    )
  })

  it('formats multi-second gaps with millisecond padding', () => {
    expect(formatNextMedalLabel({ tier: 'platinum', gapMs: 1234 })).toBe(
      'PLATINUM in 1.234',
    )
  })

  it('zero gap renders as "0.000"', () => {
    expect(formatNextMedalLabel({ tier: 'platinum', gapMs: 0 })).toBe(
      'PLATINUM in 0.000',
    )
  })

  it('rounds and clamps malformed gap values', () => {
    expect(formatNextMedalLabel({ tier: 'gold', gapMs: 100.7 })).toBe(
      'GOLD in 0.101',
    )
    // Defensive clamp against an upstream sign error.
    expect(formatNextMedalLabel({ tier: 'gold', gapMs: -50 })).toBe(
      'GOLD in 0.000',
    )
  })

  it('contains no em-dash or en-dash characters', () => {
    const samples: { tier: 'bronze' | 'silver' | 'gold' | 'platinum'; gapMs: number }[] = [
      { tier: 'silver', gapMs: 3000 },
      { tier: 'gold', gapMs: 421 },
      { tier: 'platinum', gapMs: 1234 },
    ]
    for (const s of samples) {
      const label = formatNextMedalLabel(s)
      expect(label).not.toBeNull()
      expect(label).not.toMatch(/[\u2013\u2014]/)
    }
  })
})
