import { describe, it, expect } from 'vitest'
import {
  REACTION_TIME_DISPLAY_MS,
  REACTION_TIME_PRESS_THRESHOLD,
  REACTION_TIME_TIERS,
  REACTION_TIME_TIER_COLORS,
  REACTION_TIME_TIER_DESCRIPTIONS,
  REACTION_TIME_TIER_LABELS,
  REACTION_TIME_TIER_THRESHOLDS_MS,
  MAX_REASONABLE_REACTION_MS,
  classifyReactionTime,
  formatReactionTime,
  formatReactionTimeLabel,
  isReactionInputPressed,
  isReactionPb,
  sanitizeReactionTime,
} from '@/game/reactionTime'

describe('reactionTime constants', () => {
  it('REACTION_TIME_DISPLAY_MS is positive and at most a few seconds so the chip fades fast', () => {
    expect(REACTION_TIME_DISPLAY_MS).toBeGreaterThan(0)
    expect(Number.isFinite(REACTION_TIME_DISPLAY_MS)).toBe(true)
    expect(REACTION_TIME_DISPLAY_MS).toBeLessThanOrEqual(10_000)
  })

  it('REACTION_TIME_PRESS_THRESHOLD sits well above gamepad noise floor', () => {
    expect(REACTION_TIME_PRESS_THRESHOLD).toBeGreaterThan(0)
    expect(REACTION_TIME_PRESS_THRESHOLD).toBeLessThan(0.5)
  })

  it('MAX_REASONABLE_REACTION_MS is generous but bounded', () => {
    expect(MAX_REASONABLE_REACTION_MS).toBeGreaterThanOrEqual(10_000)
    expect(MAX_REASONABLE_REACTION_MS).toBeLessThanOrEqual(60_000)
  })

  it('REACTION_TIME_TIERS lists tiers fastest to slowest in that order', () => {
    expect(REACTION_TIME_TIERS).toEqual(['lightning', 'great', 'good', 'human'])
  })

  it('every tier has a label, description, color, and ascending threshold', () => {
    let prev = -1
    for (const tier of REACTION_TIME_TIERS) {
      expect(typeof REACTION_TIME_TIER_LABELS[tier]).toBe('string')
      expect(REACTION_TIME_TIER_LABELS[tier].length).toBeGreaterThan(0)
      expect(typeof REACTION_TIME_TIER_DESCRIPTIONS[tier]).toBe('string')
      expect(REACTION_TIME_TIER_DESCRIPTIONS[tier].length).toBeGreaterThan(0)
      expect(/^#[0-9a-f]{6}$/i.test(REACTION_TIME_TIER_COLORS[tier])).toBe(true)
      const threshold = REACTION_TIME_TIER_THRESHOLDS_MS[tier]
      expect(threshold).toBeGreaterThan(prev)
      prev = threshold
    }
  })

  it('the slowest tier catches every positive measurement', () => {
    expect(REACTION_TIME_TIER_THRESHOLDS_MS.human).toBe(Number.POSITIVE_INFINITY)
  })

  it('no tier label or description contains an em dash', () => {
    for (const tier of REACTION_TIME_TIERS) {
      expect(REACTION_TIME_TIER_LABELS[tier]).not.toContain('—')
      expect(REACTION_TIME_TIER_DESCRIPTIONS[tier]).not.toContain('—')
    }
  })

  it('tier labels are unique', () => {
    const labels = REACTION_TIME_TIERS.map((t) => REACTION_TIME_TIER_LABELS[t])
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('tier colors are unique', () => {
    const colors = REACTION_TIME_TIERS.map((t) => REACTION_TIME_TIER_COLORS[t])
    expect(new Set(colors).size).toBe(colors.length)
  })
})

describe('classifyReactionTime', () => {
  it('classifies a sub-100ms measurement as lightning', () => {
    expect(classifyReactionTime(50)).toBe('lightning')
    expect(classifyReactionTime(100)).toBe('lightning')
    expect(classifyReactionTime(200)).toBe('lightning')
  })

  it('classifies just-above-200ms as great', () => {
    expect(classifyReactionTime(201)).toBe('great')
    expect(classifyReactionTime(300)).toBe('great')
    expect(classifyReactionTime(350)).toBe('great')
  })

  it('classifies just-above-350ms as good', () => {
    expect(classifyReactionTime(351)).toBe('good')
    expect(classifyReactionTime(500)).toBe('good')
    expect(classifyReactionTime(600)).toBe('good')
  })

  it('classifies above-600ms as human', () => {
    expect(classifyReactionTime(601)).toBe('human')
    expect(classifyReactionTime(2000)).toBe('human')
    expect(classifyReactionTime(20_000)).toBe('human')
  })

  it('returns human for non-finite or non-positive inputs (defensive)', () => {
    expect(classifyReactionTime(0)).toBe('human')
    expect(classifyReactionTime(-100)).toBe('human')
    expect(classifyReactionTime(Number.NaN)).toBe('human')
    expect(classifyReactionTime(Number.POSITIVE_INFINITY)).toBe('human')
    expect(classifyReactionTime(Number.NEGATIVE_INFINITY)).toBe('human')
  })

  it('boundary at exactly each threshold falls into the same tier (inclusive)', () => {
    // Inclusive upper bound: 200 is lightning, not great.
    expect(classifyReactionTime(REACTION_TIME_TIER_THRESHOLDS_MS.lightning)).toBe(
      'lightning',
    )
    expect(classifyReactionTime(REACTION_TIME_TIER_THRESHOLDS_MS.great)).toBe(
      'great',
    )
    expect(classifyReactionTime(REACTION_TIME_TIER_THRESHOLDS_MS.good)).toBe(
      'good',
    )
  })
})

describe('formatReactionTime', () => {
  it('formats sub-second as 0.mmm s with three-digit padding', () => {
    expect(formatReactionTime(245)).toBe('0.245 s')
    expect(formatReactionTime(50)).toBe('0.050 s')
    expect(formatReactionTime(7)).toBe('0.007 s')
  })

  it('formats whole seconds with the trailing unit', () => {
    expect(formatReactionTime(1000)).toBe('1.000 s')
    expect(formatReactionTime(2500)).toBe('2.500 s')
  })

  it('rounds fractional milliseconds to whole ms', () => {
    expect(formatReactionTime(245.4)).toBe('0.245 s')
    expect(formatReactionTime(245.6)).toBe('0.246 s')
  })

  it('returns a placeholder on non-finite, zero, or negative input', () => {
    expect(formatReactionTime(0)).toBe('-.--- s')
    expect(formatReactionTime(-1)).toBe('-.--- s')
    expect(formatReactionTime(Number.NaN)).toBe('-.--- s')
    expect(formatReactionTime(Number.POSITIVE_INFINITY)).toBe('-.--- s')
  })

  it('emits no em-dash or en-dash characters', () => {
    const samples = [245, 1000, 0, -1, Number.NaN, 50, 600]
    for (const v of samples) {
      const out = formatReactionTime(v)
      expect(out).not.toContain('—') // em dash
      expect(out).not.toContain('–') // en dash
    }
  })
})

describe('formatReactionTimeLabel', () => {
  it('combines value and tier name in uppercase', () => {
    expect(formatReactionTimeLabel(150)).toBe('0.150 s LIGHTNING')
    expect(formatReactionTimeLabel(300)).toBe('0.300 s GREAT')
    expect(formatReactionTimeLabel(500)).toBe('0.500 s GOOD')
    expect(formatReactionTimeLabel(900)).toBe('0.900 s HUMAN')
  })

  it('honors an explicitly supplied tier (overrides classification)', () => {
    // A misclassification override (rare; primarily for tests / consumers
    // that already computed the tier) should be respected.
    expect(formatReactionTimeLabel(150, 'good')).toBe('0.150 s GOOD')
  })

  it('falls back to the human tier on degenerate values', () => {
    expect(formatReactionTimeLabel(0)).toBe('-.--- s HUMAN')
    expect(formatReactionTimeLabel(Number.NaN)).toBe('-.--- s HUMAN')
  })
})

describe('isReactionInputPressed', () => {
  it('treats fully pressed forward as pressed', () => {
    expect(isReactionInputPressed(1)).toBe(true)
    expect(isReactionInputPressed(0.5)).toBe(true)
  })

  it('treats above-threshold positive analog values as pressed', () => {
    expect(isReactionInputPressed(REACTION_TIME_PRESS_THRESHOLD + 0.01)).toBe(
      true,
    )
  })

  it('treats brake / reverse (negative) input as not pressed', () => {
    expect(isReactionInputPressed(-1)).toBe(false)
    expect(isReactionInputPressed(-0.5)).toBe(false)
  })

  it('treats zero or just-above-zero gamepad noise as not pressed', () => {
    expect(isReactionInputPressed(0)).toBe(false)
    expect(isReactionInputPressed(0.001)).toBe(false)
    expect(isReactionInputPressed(REACTION_TIME_PRESS_THRESHOLD)).toBe(false)
  })

  it('rejects non-finite input defensively', () => {
    expect(isReactionInputPressed(Number.NaN)).toBe(false)
    expect(isReactionInputPressed(Number.POSITIVE_INFINITY)).toBe(false)
    expect(isReactionInputPressed(Number.NEGATIVE_INFINITY)).toBe(false)
  })
})

describe('sanitizeReactionTime', () => {
  it('passes through a normal positive integer', () => {
    expect(sanitizeReactionTime(245)).toBe(245)
  })

  it('rounds fractional inputs', () => {
    expect(sanitizeReactionTime(245.4)).toBe(245)
    expect(sanitizeReactionTime(245.6)).toBe(246)
  })

  it('rejects non-numbers', () => {
    expect(sanitizeReactionTime('245')).toBe(null)
    expect(sanitizeReactionTime(null)).toBe(null)
    expect(sanitizeReactionTime(undefined)).toBe(null)
    expect(sanitizeReactionTime({})).toBe(null)
  })

  it('rejects non-finite numbers', () => {
    expect(sanitizeReactionTime(Number.NaN)).toBe(null)
    expect(sanitizeReactionTime(Number.POSITIVE_INFINITY)).toBe(null)
    expect(sanitizeReactionTime(Number.NEGATIVE_INFINITY)).toBe(null)
  })

  it('rejects zero and negative values', () => {
    expect(sanitizeReactionTime(0)).toBe(null)
    expect(sanitizeReactionTime(-1)).toBe(null)
    expect(sanitizeReactionTime(-1000)).toBe(null)
  })

  it('rejects values above MAX_REASONABLE_REACTION_MS', () => {
    expect(sanitizeReactionTime(MAX_REASONABLE_REACTION_MS + 1)).toBe(null)
    expect(sanitizeReactionTime(60_000)).toBe(null)
  })

  it('accepts values right at the cap', () => {
    expect(sanitizeReactionTime(MAX_REASONABLE_REACTION_MS)).toBe(
      MAX_REASONABLE_REACTION_MS,
    )
  })
})

describe('isReactionPb', () => {
  it('treats null prior as PB on any valid fresh measurement', () => {
    expect(isReactionPb(null, 245)).toBe(true)
  })

  it('treats non-finite or non-positive prior as PB on any valid measurement', () => {
    expect(isReactionPb(Number.NaN, 245)).toBe(true)
    expect(isReactionPb(0, 245)).toBe(true)
    expect(isReactionPb(-100, 245)).toBe(true)
    expect(isReactionPb(Number.POSITIVE_INFINITY, 245)).toBe(true)
  })

  it('returns false when the fresh measurement is invalid', () => {
    expect(isReactionPb(300, 0)).toBe(false)
    expect(isReactionPb(300, -1)).toBe(false)
    expect(isReactionPb(300, Number.NaN)).toBe(false)
  })

  it('strictly faster fresh beats prior', () => {
    expect(isReactionPb(300, 250)).toBe(true)
  })

  it('tied measurement is NOT a PB', () => {
    expect(isReactionPb(300, 300)).toBe(false)
  })

  it('slower measurement is NOT a PB', () => {
    expect(isReactionPb(300, 350)).toBe(false)
  })

  it('a fresh measurement above the sanity cap is NOT a PB', () => {
    expect(isReactionPb(null, MAX_REASONABLE_REACTION_MS + 1)).toBe(false)
    expect(isReactionPb(300, MAX_REASONABLE_REACTION_MS + 1)).toBe(false)
  })
})
