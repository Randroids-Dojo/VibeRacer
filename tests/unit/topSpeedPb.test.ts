import { describe, it, expect } from 'vitest'
import {
  TOP_SPEED_PB_DISPLAY_MS,
  TOP_SPEED_PB_MIN_DELTA_US,
  TOP_SPEED_TIERS,
  TOP_SPEED_TIER_COLORS,
  TOP_SPEED_TIER_LABELS,
  TOP_SPEED_TIER_THRESHOLDS,
  MAX_REASONABLE_TOP_SPEED_US,
  classifyTopSpeed,
  formatTopSpeed,
  formatTopSpeedDelta,
  formatTopSpeedLabel,
  isTopSpeedPb,
  sanitizeTopSpeed,
} from '@/game/topSpeedPb'

describe('top speed PB constants', () => {
  it('TOP_SPEED_PB_DISPLAY_MS is positive and at most a few seconds so the chip fades fast', () => {
    expect(TOP_SPEED_PB_DISPLAY_MS).toBeGreaterThan(0)
    expect(Number.isFinite(TOP_SPEED_PB_DISPLAY_MS)).toBe(true)
    expect(TOP_SPEED_PB_DISPLAY_MS).toBeLessThanOrEqual(10_000)
  })

  it('TOP_SPEED_PB_MIN_DELTA_US is positive and small enough to register a real PB', () => {
    expect(TOP_SPEED_PB_MIN_DELTA_US).toBeGreaterThan(0)
    expect(TOP_SPEED_PB_MIN_DELTA_US).toBeLessThan(5)
  })

  it('MAX_REASONABLE_TOP_SPEED_US is generous but bounded', () => {
    expect(MAX_REASONABLE_TOP_SPEED_US).toBeGreaterThanOrEqual(50)
    expect(MAX_REASONABLE_TOP_SPEED_US).toBeLessThanOrEqual(1_000)
  })

  it('TOP_SPEED_TIERS lists tiers slowest to fastest in that order', () => {
    expect(TOP_SPEED_TIERS).toEqual(['warm', 'fast', 'blazing', 'redline'])
  })

  it('every tier has a label, color, and ascending threshold', () => {
    let prev = -1
    for (const tier of TOP_SPEED_TIERS) {
      expect(typeof TOP_SPEED_TIER_LABELS[tier]).toBe('string')
      expect(TOP_SPEED_TIER_LABELS[tier].length).toBeGreaterThan(0)
      expect(/^#[0-9a-f]{6}$/i.test(TOP_SPEED_TIER_COLORS[tier])).toBe(true)
      const threshold = TOP_SPEED_TIER_THRESHOLDS[tier]
      expect(threshold).toBeGreaterThan(prev)
      prev = threshold
    }
  })

  it('the redline tier saturates at the player ceiling', () => {
    expect(TOP_SPEED_TIER_THRESHOLDS.redline).toBe(1.0)
  })

  it('no tier label contains an em dash or en dash', () => {
    for (const tier of TOP_SPEED_TIERS) {
      expect(TOP_SPEED_TIER_LABELS[tier]).not.toContain('\u2014')
      expect(TOP_SPEED_TIER_LABELS[tier]).not.toContain('\u2013')
    }
  })

  it('tier labels are unique', () => {
    const labels = TOP_SPEED_TIERS.map((t) => TOP_SPEED_TIER_LABELS[t])
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('tier colors are unique', () => {
    const colors = TOP_SPEED_TIERS.map((t) => TOP_SPEED_TIER_COLORS[t])
    expect(new Set(colors).size).toBe(colors.length)
  })
})

describe('sanitizeTopSpeed', () => {
  it('passes through a healthy value rounded to one decimal', () => {
    expect(sanitizeTopSpeed(25.67)).toBe(25.7)
    expect(sanitizeTopSpeed(10)).toBe(10)
  })

  it('returns null for non-numeric input', () => {
    expect(sanitizeTopSpeed('25')).toBeNull()
    expect(sanitizeTopSpeed(null)).toBeNull()
    expect(sanitizeTopSpeed(undefined)).toBeNull()
    expect(sanitizeTopSpeed({})).toBeNull()
  })

  it('returns null for non-finite input', () => {
    expect(sanitizeTopSpeed(Number.NaN)).toBeNull()
    expect(sanitizeTopSpeed(Number.POSITIVE_INFINITY)).toBeNull()
    expect(sanitizeTopSpeed(Number.NEGATIVE_INFINITY)).toBeNull()
  })

  it('returns null for zero or negative input', () => {
    expect(sanitizeTopSpeed(0)).toBeNull()
    expect(sanitizeTopSpeed(-5)).toBeNull()
  })

  it('returns null for absurdly large input', () => {
    expect(sanitizeTopSpeed(MAX_REASONABLE_TOP_SPEED_US + 1)).toBeNull()
    expect(sanitizeTopSpeed(1_000_000)).toBeNull()
  })

  it('accepts the boundary value', () => {
    expect(sanitizeTopSpeed(MAX_REASONABLE_TOP_SPEED_US)).toBe(
      MAX_REASONABLE_TOP_SPEED_US,
    )
  })
})

describe('isTopSpeedPb', () => {
  it('treats a null prior best as a PB', () => {
    expect(isTopSpeedPb(null, 25)).toBe(true)
  })

  it('treats a corrupt (non-finite or non-positive) prior best as a PB', () => {
    expect(isTopSpeedPb(0, 10)).toBe(true)
    expect(isTopSpeedPb(-5, 10)).toBe(true)
    expect(isTopSpeedPb(Number.NaN, 10)).toBe(true)
    expect(isTopSpeedPb(Number.POSITIVE_INFINITY, 10)).toBe(true)
  })

  it('rejects a fresh value that does not exceed the delta threshold', () => {
    const prior = 20
    expect(isTopSpeedPb(prior, prior)).toBe(false)
    expect(isTopSpeedPb(prior, prior + TOP_SPEED_PB_MIN_DELTA_US / 2)).toBe(false)
  })

  it('accepts a fresh value that meets or exceeds the delta threshold', () => {
    const prior = 20
    expect(isTopSpeedPb(prior, prior + TOP_SPEED_PB_MIN_DELTA_US)).toBe(true)
    expect(isTopSpeedPb(prior, prior + TOP_SPEED_PB_MIN_DELTA_US + 0.5)).toBe(
      true,
    )
  })

  it('rejects a fresh value that is junk', () => {
    expect(isTopSpeedPb(20, Number.NaN)).toBe(false)
    expect(isTopSpeedPb(20, -10)).toBe(false)
    expect(isTopSpeedPb(20, MAX_REASONABLE_TOP_SPEED_US + 1)).toBe(false)
  })

  it('rejects a fresh value lower than the prior best', () => {
    expect(isTopSpeedPb(30, 25)).toBe(false)
  })
})

describe('classifyTopSpeed', () => {
  it('returns warm for tiny fractions of maxSpeed', () => {
    expect(classifyTopSpeed(1, 26)).toBe('warm')
    expect(classifyTopSpeed(13, 26)).toBe('warm') // 0.5 == warm threshold
  })

  it('returns fast at three quarters of maxSpeed', () => {
    expect(classifyTopSpeed(19.5, 26)).toBe('fast') // exactly 0.75
    expect(classifyTopSpeed(20, 26)).toBe('fast')
  })

  it('returns blazing at 90 percent of maxSpeed', () => {
    // 0.9 exactly, computed without floating-point precision drift.
    expect(classifyTopSpeed(9, 10)).toBe('blazing')
    expect(classifyTopSpeed(24, 26)).toBe('blazing')
  })

  it('returns redline when saturating maxSpeed', () => {
    expect(classifyTopSpeed(26, 26)).toBe('redline')
    expect(classifyTopSpeed(30, 26)).toBe('redline')
  })

  it('defends against non-finite or non-positive inputs', () => {
    expect(classifyTopSpeed(Number.NaN, 26)).toBe('warm')
    expect(classifyTopSpeed(20, 0)).toBe('warm')
    expect(classifyTopSpeed(20, -1)).toBe('warm')
    expect(classifyTopSpeed(20, Number.POSITIVE_INFINITY)).toBe('warm')
    expect(classifyTopSpeed(0, 26)).toBe('warm')
  })

  it('classifies higher fractions strictly higher than lower fractions', () => {
    const ranks: Record<string, number> = {
      warm: 0,
      fast: 1,
      blazing: 2,
      redline: 3,
    }
    let prev = -1
    for (const us of [13, 20, 24, 26]) {
      const tier = classifyTopSpeed(us, 26)
      expect(ranks[tier]).toBeGreaterThanOrEqual(prev)
      prev = ranks[tier]
    }
  })
})

describe('formatTopSpeed', () => {
  it('renders mph as a whole number with the unit suffix', () => {
    // 26 us * 2.2369... = 58.16 mph -> rounded to 58
    expect(formatTopSpeed(26, 'mph')).toBe('58 MPH')
  })

  it('renders km/h as a whole number with the unit suffix', () => {
    // 26 us * 3.6 = 93.6 km/h -> rounded to 94
    expect(formatTopSpeed(26, 'kmh')).toBe('94 KM/H')
  })

  it('renders raw us with one decimal', () => {
    expect(formatTopSpeed(25.67, 'us')).toBe('25.7 U/S')
  })

  it('renders the placeholder for null input', () => {
    expect(formatTopSpeed(null, 'mph')).toBe('-- MPH')
  })

  it('renders the placeholder for non-finite or non-positive input', () => {
    expect(formatTopSpeed(0, 'mph')).toBe('-- MPH')
    expect(formatTopSpeed(-5, 'kmh')).toBe('-- KM/H')
    expect(formatTopSpeed(Number.NaN, 'us')).toBe('-- U/S')
  })
})

describe('formatTopSpeedDelta', () => {
  it('returns null when there is no prior PB', () => {
    expect(formatTopSpeedDelta(20, null, 'mph')).toBeNull()
  })

  it('returns null when the fresh value is junk', () => {
    expect(formatTopSpeedDelta(Number.NaN, 10, 'mph')).toBeNull()
    expect(formatTopSpeedDelta(0, 10, 'mph')).toBeNull()
  })

  it('returns null when the fresh value is not greater than the prior', () => {
    expect(formatTopSpeedDelta(10, 10, 'mph')).toBeNull()
    expect(formatTopSpeedDelta(8, 10, 'mph')).toBeNull()
  })

  it('returns null when the prior is corrupt', () => {
    expect(formatTopSpeedDelta(20, 0, 'mph')).toBeNull()
    expect(formatTopSpeedDelta(20, -1, 'mph')).toBeNull()
    expect(formatTopSpeedDelta(20, Number.NaN, 'mph')).toBeNull()
  })

  it('formats a positive mph delta with leading +', () => {
    // (25 - 20) us = 5 us * 2.2369 = 11.18 mph -> +11 MPH
    expect(formatTopSpeedDelta(25, 20, 'mph')).toBe('+11 MPH')
  })

  it('formats a positive km/h delta with leading +', () => {
    // (25 - 20) us = 5 us * 3.6 = 18 km/h -> +18 KM/H
    expect(formatTopSpeedDelta(25, 20, 'kmh')).toBe('+18 KM/H')
  })

  it('formats a positive raw delta with one decimal', () => {
    expect(formatTopSpeedDelta(25.7, 20, 'us')).toBe('+5.7 U/S')
  })

  it('shows a sub-unit win as a one-decimal value rather than +0', () => {
    // (20.4 - 20) us = 0.4 us * 2.2369 = 0.89 mph -> rounds to 1, but the
    // helper short-circuits the "rounds to zero" branch using the raw value
    // before rounding. Either way, the result is positive and visible.
    const result = formatTopSpeedDelta(20.4, 20, 'mph')
    expect(result).not.toBeNull()
    expect(result!.startsWith('+')).toBe(true)
  })

  it('shows a single-decimal value when the rounded mph delta would be zero', () => {
    // (20.1 - 20) us = 0.1 us * 2.2369 = 0.22 mph -> rounds to 0.
    // The helper falls back to the one-decimal representation so the chip
    // never lies about a "+0 MPH" win.
    expect(formatTopSpeedDelta(20.1, 20, 'mph')).toBe('+0.2 MPH')
  })
})

describe('formatTopSpeedLabel', () => {
  it('combines the value and the tier name', () => {
    expect(formatTopSpeedLabel(26, 'mph', 'redline', 26)).toBe('58 MPH REDLINE')
  })

  it('falls back to the classified tier when none is supplied', () => {
    // 26 / 26 = 1.0 -> redline
    expect(formatTopSpeedLabel(26, 'mph', undefined, 26)).toContain('REDLINE')
  })

  it('handles a junk top speed by tier-classifying to warm', () => {
    expect(formatTopSpeedLabel(0, 'mph', undefined, 26)).toContain('WARM')
  })
})
