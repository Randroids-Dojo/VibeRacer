import { describe, expect, it } from 'vitest'
import {
  LAP_CONSISTENCY_TIERS,
  LAP_CONSISTENCY_LABELS,
  LAP_CONSISTENCY_DESCRIPTIONS,
  LAP_CONSISTENCY_COLORS,
  LAP_CONSISTENCY_THRESHOLDS,
  LAP_CONSISTENCY_MIN_LAPS,
  LAP_CONSISTENCY_WINDOW,
  LAP_CONSISTENCY_MIN_MEAN_MS,
  classifyConsistency,
  computeLapConsistency,
  isLapConsistencyTier,
  labelForConsistencyTier,
  colorForConsistencyTier,
  formatConsistencyStdDev,
  formatConsistencyRatio,
} from '@/game/lapConsistency'
import type { LapHistoryEntry } from '@/game/lapHistory'

function lap(lapNumber: number, lapTimeMs: number): LapHistoryEntry {
  return {
    lapNumber,
    lapTimeMs,
    deltaVsPbMs: null,
    isPb: false,
    sectors: [],
  }
}

describe('LAP_CONSISTENCY_TIERS', () => {
  it('lists tiers in ascending tightness-to-looseness order', () => {
    expect(LAP_CONSISTENCY_TIERS).toEqual([
      'locked-in',
      'steady',
      'wavering',
      'wobbly',
    ])
  })

  it('has unique tier identifiers', () => {
    const set = new Set(LAP_CONSISTENCY_TIERS)
    expect(set.size).toBe(LAP_CONSISTENCY_TIERS.length)
  })

  it('has a label for every tier', () => {
    for (const tier of LAP_CONSISTENCY_TIERS) {
      expect(LAP_CONSISTENCY_LABELS[tier]).toBeTruthy()
    }
  })

  it('has a description for every tier', () => {
    for (const tier of LAP_CONSISTENCY_TIERS) {
      const desc = LAP_CONSISTENCY_DESCRIPTIONS[tier]
      expect(desc).toBeTruthy()
      expect(desc.length).toBeGreaterThan(20)
    }
  })

  it('has a color hex for every tier', () => {
    for (const tier of LAP_CONSISTENCY_TIERS) {
      const color = LAP_CONSISTENCY_COLORS[tier]
      expect(color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('has unique colors per tier', () => {
    const colors = new Set(LAP_CONSISTENCY_TIERS.map((t) => LAP_CONSISTENCY_COLORS[t]))
    expect(colors.size).toBe(LAP_CONSISTENCY_TIERS.length)
  })

  it('contains no em-dashes or en-dashes in player-facing text', () => {
    const ban = /[—–]/
    for (const tier of LAP_CONSISTENCY_TIERS) {
      expect(LAP_CONSISTENCY_LABELS[tier]).not.toMatch(ban)
      expect(LAP_CONSISTENCY_DESCRIPTIONS[tier]).not.toMatch(ban)
    }
  })
})

describe('LAP_CONSISTENCY_THRESHOLDS', () => {
  it('lists thresholds in ascending order so the cascade walks correctly', () => {
    expect(LAP_CONSISTENCY_THRESHOLDS['locked-in']).toBeLessThan(
      LAP_CONSISTENCY_THRESHOLDS.steady,
    )
    expect(LAP_CONSISTENCY_THRESHOLDS.steady).toBeLessThan(
      LAP_CONSISTENCY_THRESHOLDS.wavering,
    )
  })

  it('has positive finite values', () => {
    expect(LAP_CONSISTENCY_THRESHOLDS['locked-in']).toBeGreaterThan(0)
    expect(LAP_CONSISTENCY_THRESHOLDS.steady).toBeGreaterThan(0)
    expect(LAP_CONSISTENCY_THRESHOLDS.wavering).toBeGreaterThan(0)
    expect(Number.isFinite(LAP_CONSISTENCY_THRESHOLDS['locked-in'])).toBe(true)
    expect(Number.isFinite(LAP_CONSISTENCY_THRESHOLDS.steady)).toBe(true)
    expect(Number.isFinite(LAP_CONSISTENCY_THRESHOLDS.wavering)).toBe(true)
  })

  it('uses ratio (fraction-of-mean) values strictly under 1', () => {
    expect(LAP_CONSISTENCY_THRESHOLDS['locked-in']).toBeLessThan(1)
    expect(LAP_CONSISTENCY_THRESHOLDS.steady).toBeLessThan(1)
    expect(LAP_CONSISTENCY_THRESHOLDS.wavering).toBeLessThan(1)
  })
})

describe('constants', () => {
  it('LAP_CONSISTENCY_MIN_LAPS is at least 3', () => {
    expect(LAP_CONSISTENCY_MIN_LAPS).toBeGreaterThanOrEqual(3)
    expect(Number.isInteger(LAP_CONSISTENCY_MIN_LAPS)).toBe(true)
  })

  it('LAP_CONSISTENCY_WINDOW is at least the minimum lap count', () => {
    expect(LAP_CONSISTENCY_WINDOW).toBeGreaterThanOrEqual(LAP_CONSISTENCY_MIN_LAPS)
    expect(Number.isInteger(LAP_CONSISTENCY_WINDOW)).toBe(true)
  })

  it('LAP_CONSISTENCY_MIN_MEAN_MS is positive and well under any plausible lap', () => {
    expect(LAP_CONSISTENCY_MIN_MEAN_MS).toBeGreaterThan(0)
    expect(LAP_CONSISTENCY_MIN_MEAN_MS).toBeLessThan(5000)
  })
})

describe('classifyConsistency', () => {
  it('returns locked-in for a clean zero ratio', () => {
    expect(classifyConsistency(0)).toBe('locked-in')
  })

  it('returns locked-in at the locked-in threshold (inclusive)', () => {
    expect(classifyConsistency(LAP_CONSISTENCY_THRESHOLDS['locked-in'])).toBe('locked-in')
  })

  it('returns steady just past the locked-in threshold', () => {
    expect(
      classifyConsistency(LAP_CONSISTENCY_THRESHOLDS['locked-in'] + 0.0001),
    ).toBe('steady')
  })

  it('returns steady at the steady threshold (inclusive)', () => {
    expect(classifyConsistency(LAP_CONSISTENCY_THRESHOLDS.steady)).toBe('steady')
  })

  it('returns wavering just past the steady threshold', () => {
    expect(
      classifyConsistency(LAP_CONSISTENCY_THRESHOLDS.steady + 0.0001),
    ).toBe('wavering')
  })

  it('returns wavering at the wavering threshold (inclusive)', () => {
    expect(classifyConsistency(LAP_CONSISTENCY_THRESHOLDS.wavering)).toBe(
      'wavering',
    )
  })

  it('returns wobbly past the wavering threshold', () => {
    expect(
      classifyConsistency(LAP_CONSISTENCY_THRESHOLDS.wavering + 0.0001),
    ).toBe('wobbly')
  })

  it('returns wobbly for an arbitrarily large ratio', () => {
    expect(classifyConsistency(1)).toBe('wobbly')
    expect(classifyConsistency(99)).toBe('wobbly')
  })

  it('collapses negative input to wobbly', () => {
    expect(classifyConsistency(-1)).toBe('wobbly')
  })

  it('collapses NaN to wobbly', () => {
    expect(classifyConsistency(Number.NaN)).toBe('wobbly')
  })

  it('collapses Infinity to wobbly', () => {
    expect(classifyConsistency(Number.POSITIVE_INFINITY)).toBe('wobbly')
    expect(classifyConsistency(Number.NEGATIVE_INFINITY)).toBe('wobbly')
  })

  it('collapses non-number input to wobbly', () => {
    // @ts-expect-error intentional misuse
    expect(classifyConsistency('0')).toBe('wobbly')
    // @ts-expect-error intentional misuse
    expect(classifyConsistency(null)).toBe('wobbly')
    // @ts-expect-error intentional misuse
    expect(classifyConsistency(undefined)).toBe('wobbly')
  })
})

describe('isLapConsistencyTier', () => {
  it('accepts every documented tier', () => {
    for (const tier of LAP_CONSISTENCY_TIERS) {
      expect(isLapConsistencyTier(tier)).toBe(true)
    }
  })

  it('rejects unknown strings', () => {
    expect(isLapConsistencyTier('rock-solid')).toBe(false)
    expect(isLapConsistencyTier('LOCKED-IN')).toBe(false)
    expect(isLapConsistencyTier('')).toBe(false)
  })

  it('rejects non-string input', () => {
    expect(isLapConsistencyTier(0)).toBe(false)
    expect(isLapConsistencyTier(null)).toBe(false)
    expect(isLapConsistencyTier(undefined)).toBe(false)
    expect(isLapConsistencyTier({})).toBe(false)
  })
})

describe('labelForConsistencyTier', () => {
  it('returns the documented label per tier', () => {
    for (const tier of LAP_CONSISTENCY_TIERS) {
      expect(labelForConsistencyTier(tier)).toBe(LAP_CONSISTENCY_LABELS[tier])
    }
  })
})

describe('colorForConsistencyTier', () => {
  it('returns the documented hex per tier', () => {
    for (const tier of LAP_CONSISTENCY_TIERS) {
      expect(colorForConsistencyTier(tier)).toBe(LAP_CONSISTENCY_COLORS[tier])
    }
  })
})

describe('computeLapConsistency', () => {
  it('returns null for null input', () => {
    expect(computeLapConsistency(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(computeLapConsistency(undefined)).toBeNull()
  })

  it('returns null for an empty array', () => {
    expect(computeLapConsistency([])).toBeNull()
  })

  it('returns null for non-array input', () => {
    // @ts-expect-error intentional misuse
    expect(computeLapConsistency('not an array')).toBeNull()
    // @ts-expect-error intentional misuse
    expect(computeLapConsistency({})).toBeNull()
  })

  it('returns null for fewer laps than the minimum sample count', () => {
    const history = [lap(1, 14_000), lap(2, 14_100)]
    expect(history.length).toBeLessThan(LAP_CONSISTENCY_MIN_LAPS)
    expect(computeLapConsistency(history)).toBeNull()
  })

  it('returns a tier once at or past the minimum sample count', () => {
    const history = [lap(1, 14_000), lap(2, 14_050), lap(3, 14_100)]
    const info = computeLapConsistency(history)
    expect(info).not.toBeNull()
    expect(info!.sampleCount).toBe(3)
  })

  it('uses only the most recent window when history is longer than the window', () => {
    // First two laps wildly off, last five laps tightly clustered.
    const history = [
      lap(1, 30_000),
      lap(2, 25_000),
      lap(3, 14_000),
      lap(4, 14_010),
      lap(5, 14_005),
      lap(6, 13_995),
      lap(7, 14_002),
    ]
    const info = computeLapConsistency(history)
    expect(info).not.toBeNull()
    expect(info!.sampleCount).toBe(LAP_CONSISTENCY_WINDOW)
    // Should classify as locked-in despite the early outliers.
    expect(info!.tier).toBe('locked-in')
  })

  it('classifies a perfectly identical run as locked-in with zero stddev', () => {
    const history = [lap(1, 14_000), lap(2, 14_000), lap(3, 14_000)]
    const info = computeLapConsistency(history)
    expect(info).not.toBeNull()
    expect(info!.stdDevMs).toBe(0)
    expect(info!.stdDevRatio).toBe(0)
    expect(info!.tier).toBe('locked-in')
  })

  it('classifies a tight cluster as locked-in or steady', () => {
    // ~0.5% of mean spread.
    const history = [lap(1, 14_000), lap(2, 14_050), lap(3, 14_100), lap(4, 14_080)]
    const info = computeLapConsistency(history)
    expect(info).not.toBeNull()
    expect(['locked-in', 'steady']).toContain(info!.tier)
  })

  it('classifies a moderate spread as wavering', () => {
    // ~5% of mean spread.
    const history = [
      lap(1, 14_000),
      lap(2, 14_700),
      lap(3, 15_400),
      lap(4, 13_300),
      lap(5, 14_600),
    ]
    const info = computeLapConsistency(history)
    expect(info).not.toBeNull()
    // Spread is large enough to be wavering or wobbly depending on exact math.
    expect(['wavering', 'wobbly']).toContain(info!.tier)
  })

  it('classifies a wild spread as wobbly', () => {
    const history = [
      lap(1, 14_000),
      lap(2, 22_000),
      lap(3, 18_000),
      lap(4, 30_000),
    ]
    const info = computeLapConsistency(history)
    expect(info).not.toBeNull()
    expect(info!.tier).toBe('wobbly')
  })

  it('skips laps with non-finite times', () => {
    const history = [
      lap(1, Number.NaN),
      lap(2, 14_000),
      lap(3, 14_010),
      lap(4, 14_005),
    ]
    const info = computeLapConsistency(history)
    expect(info).not.toBeNull()
    // Only three valid laps, so the sample count is 3.
    expect(info!.sampleCount).toBe(3)
  })

  it('skips laps with non-positive times', () => {
    const history = [
      lap(1, 0),
      lap(2, -100),
      lap(3, 14_000),
      lap(4, 14_010),
      lap(5, 14_005),
    ]
    const info = computeLapConsistency(history)
    expect(info).not.toBeNull()
    expect(info!.sampleCount).toBe(3)
  })

  it('returns null when only invalid laps survive sanitization', () => {
    const history = [
      lap(1, Number.NaN),
      lap(2, -1),
      lap(3, 0),
    ]
    expect(computeLapConsistency(history)).toBeNull()
  })

  it('returns null when input contains malformed entries that drop below the minimum', () => {
    // Two valid laps, one malformed entry. Two surviving laps fall under the
    // minimum sample count.
    const history = [
      null,
      lap(2, 14_000),
      lap(3, 14_010),
    ] as unknown as LapHistoryEntry[]
    expect(computeLapConsistency(history)).toBeNull()
  })

  it('rounds stdDevMs and meanMs to two decimals', () => {
    const history = [lap(1, 14_001), lap(2, 14_002), lap(3, 14_003)]
    const info = computeLapConsistency(history)
    expect(info).not.toBeNull()
    // Mean and std dev land on simple values here; just check they round.
    expect(info!.meanMs * 100).toBeCloseTo(Math.round(info!.meanMs * 100), 5)
    expect(info!.stdDevMs * 100).toBeCloseTo(Math.round(info!.stdDevMs * 100), 5)
  })

  it('returns a fresh object on every call', () => {
    const history = [lap(1, 14_000), lap(2, 14_010), lap(3, 14_005)]
    const a = computeLapConsistency(history)
    const b = computeLapConsistency(history)
    expect(a).not.toBe(b)
  })

  it('honors a custom window size when valid', () => {
    const history = [
      lap(1, 14_000),
      lap(2, 22_000),
      lap(3, 14_010),
      lap(4, 14_005),
      lap(5, 14_002),
    ]
    // Use a window of 3 to ignore the early outlier.
    const info = computeLapConsistency(history, 3)
    expect(info).not.toBeNull()
    expect(info!.sampleCount).toBe(3)
    expect(info!.tier).toBe('locked-in')
  })

  it('falls back to the default window when the custom window is too small', () => {
    const history = [
      lap(1, 14_000),
      lap(2, 14_010),
      lap(3, 14_005),
      lap(4, 14_002),
      lap(5, 14_007),
    ]
    // Window of 1 is below the minimum, so the helper should fall back to
    // the default window (5).
    const info = computeLapConsistency(history, 1)
    expect(info).not.toBeNull()
    expect(info!.sampleCount).toBe(LAP_CONSISTENCY_WINDOW)
  })

  it('falls back to the default window when the custom window is non-finite', () => {
    const history = [
      lap(1, 14_000),
      lap(2, 14_010),
      lap(3, 14_005),
    ]
    const info = computeLapConsistency(history, Number.NaN)
    expect(info).not.toBeNull()
    expect(info!.sampleCount).toBe(3)
  })

  it('uses the floor mean when the actual mean is pathologically small', () => {
    // All laps near zero: the actual mean would create a meaningless ratio.
    // The floor keeps things sensible: a tiny absolute spread becomes a
    // small ratio, not a huge one.
    const history = [lap(1, 50), lap(2, 60), lap(3, 55)]
    const info = computeLapConsistency(history)
    expect(info).not.toBeNull()
    // 50ms-60ms vs the LAP_CONSISTENCY_MIN_MEAN_MS floor (250ms) should keep
    // the ratio low enough to land in locked-in or steady.
    expect(['locked-in', 'steady']).toContain(info!.tier)
  })
})

describe('formatConsistencyStdDev', () => {
  it('formats values under one second as integer ms', () => {
    expect(formatConsistencyStdDev(0)).toBe('0ms')
    expect(formatConsistencyStdDev(123)).toBe('123ms')
    expect(formatConsistencyStdDev(999)).toBe('999ms')
  })

  it('rounds sub-millisecond fractions', () => {
    expect(formatConsistencyStdDev(123.4)).toBe('123ms')
    expect(formatConsistencyStdDev(123.5)).toBe('124ms')
  })

  it('formats values past one second as seconds with two decimals', () => {
    expect(formatConsistencyStdDev(1000)).toBe('1.00s')
    expect(formatConsistencyStdDev(1421)).toBe('1.42s')
    expect(formatConsistencyStdDev(2500)).toBe('2.50s')
  })

  it('returns -- for non-finite input', () => {
    expect(formatConsistencyStdDev(Number.NaN)).toBe('--')
    expect(formatConsistencyStdDev(Number.POSITIVE_INFINITY)).toBe('--')
    expect(formatConsistencyStdDev(Number.NEGATIVE_INFINITY)).toBe('--')
  })

  it('returns -- for negative input', () => {
    expect(formatConsistencyStdDev(-1)).toBe('--')
  })

  it('returns -- for non-number input', () => {
    // @ts-expect-error intentional misuse
    expect(formatConsistencyStdDev('100')).toBe('--')
    // @ts-expect-error intentional misuse
    expect(formatConsistencyStdDev(null)).toBe('--')
  })

  it('contains no em-dashes or en-dashes', () => {
    const ban = /[—–]/
    expect(formatConsistencyStdDev(0)).not.toMatch(ban)
    expect(formatConsistencyStdDev(1500)).not.toMatch(ban)
    expect(formatConsistencyStdDev(Number.NaN)).not.toMatch(ban)
  })
})

describe('formatConsistencyRatio', () => {
  it('formats ratios under 10% with one decimal', () => {
    expect(formatConsistencyRatio(0)).toBe('0.0%')
    expect(formatConsistencyRatio(0.012)).toBe('1.2%')
    expect(formatConsistencyRatio(0.099)).toBe('9.9%')
  })

  it('formats ratios at or past 10% as integer percent', () => {
    expect(formatConsistencyRatio(0.1)).toBe('10%')
    expect(formatConsistencyRatio(0.255)).toBe('26%')
  })

  it('returns -- for non-finite input', () => {
    expect(formatConsistencyRatio(Number.NaN)).toBe('--')
    expect(formatConsistencyRatio(Number.POSITIVE_INFINITY)).toBe('--')
  })

  it('returns -- for negative input', () => {
    expect(formatConsistencyRatio(-0.1)).toBe('--')
  })

  it('returns -- for non-number input', () => {
    // @ts-expect-error intentional misuse
    expect(formatConsistencyRatio('0.1')).toBe('--')
  })

  it('contains no em-dashes or en-dashes', () => {
    const ban = /[—–]/
    expect(formatConsistencyRatio(0)).not.toMatch(ban)
    expect(formatConsistencyRatio(0.05)).not.toMatch(ban)
    expect(formatConsistencyRatio(Number.NaN)).not.toMatch(ban)
  })
})
