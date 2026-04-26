import { describe, it, expect } from 'vitest'
import {
  SPLIT_DISPLAY_MS,
  computeSplitDeltaForLastHit,
  formatSplitDelta,
  isSplitExpired,
  type SplitDelta,
} from '@/game/splits'
import type { CheckpointHit } from '@/lib/schemas'

const PB: CheckpointHit[] = [
  { cpId: 0, tMs: 1000 },
  { cpId: 1, tMs: 2200 },
  { cpId: 2, tMs: 3500 },
  { cpId: 3, tMs: 4800 },
]

describe('computeSplitDeltaForLastHit', () => {
  it('returns null when no PB is available', () => {
    expect(computeSplitDeltaForLastHit([{ cpId: 0, tMs: 950 }], null)).toBeNull()
    expect(computeSplitDeltaForLastHit([{ cpId: 0, tMs: 950 }], [])).toBeNull()
  })

  it('returns null when current hits are empty', () => {
    expect(computeSplitDeltaForLastHit([], PB)).toBeNull()
  })

  it('returns negative delta when ahead of PB', () => {
    const out = computeSplitDeltaForLastHit([{ cpId: 0, tMs: 850 }], PB)
    expect(out).toEqual({ deltaMs: -150, cpId: 0 })
  })

  it('returns positive delta when behind PB', () => {
    const out = computeSplitDeltaForLastHit([{ cpId: 1, tMs: 2350 }], PB)
    expect(out).toEqual({ deltaMs: 150, cpId: 1 })
  })

  it('returns zero delta when matching PB exactly', () => {
    const out = computeSplitDeltaForLastHit([{ cpId: 2, tMs: 3500 }], PB)
    expect(out).toEqual({ deltaMs: 0, cpId: 2 })
  })

  it('uses the last entry when current hits stack up across the lap', () => {
    const current: CheckpointHit[] = [
      { cpId: 0, tMs: 980 },
      { cpId: 1, tMs: 2140 },
      { cpId: 2, tMs: 3590 },
    ]
    expect(computeSplitDeltaForLastHit(current, PB)).toEqual({
      deltaMs: 90,
      cpId: 2,
    })
  })

  it('returns null when the last hit has no matching cpId in PB', () => {
    const out = computeSplitDeltaForLastHit([{ cpId: 99, tMs: 1234 }], PB)
    expect(out).toBeNull()
  })
})

describe('formatSplitDelta', () => {
  it('formats positive deltas with a leading +', () => {
    expect(formatSplitDelta(421)).toBe('+0.421')
    expect(formatSplitDelta(2050)).toBe('+2.050')
  })

  it('formats negative deltas with a leading -', () => {
    expect(formatSplitDelta(-421)).toBe('-0.421')
    expect(formatSplitDelta(-1034)).toBe('-1.034')
  })

  it('formats zero as +0.000 so the tile is never just a number', () => {
    expect(formatSplitDelta(0)).toBe('+0.000')
  })

  it('pads millis to three digits', () => {
    expect(formatSplitDelta(7)).toBe('+0.007')
    expect(formatSplitDelta(-50)).toBe('-0.050')
  })

  it('handles non-finite input defensively', () => {
    expect(formatSplitDelta(NaN)).toBe('+0.000')
    expect(formatSplitDelta(Infinity)).toBe('+0.000')
  })

  it('rolls millis up into seconds when rounding hits 1000', () => {
    expect(formatSplitDelta(1999.6)).toBe('+2.000')
    expect(formatSplitDelta(-999.7)).toBe('-1.000')
  })
})

describe('isSplitExpired', () => {
  const split: SplitDelta = { deltaMs: 200, cpId: 1, generatedAtMs: 10_000 }

  it('treats null splits as expired', () => {
    expect(isSplitExpired(null, 0)).toBe(true)
  })

  it('keeps the split alive within the display window', () => {
    expect(isSplitExpired(split, 10_000)).toBe(false)
    expect(isSplitExpired(split, 10_000 + SPLIT_DISPLAY_MS - 1)).toBe(false)
  })

  it('expires the split at and after the display window', () => {
    expect(isSplitExpired(split, 10_000 + SPLIT_DISPLAY_MS)).toBe(true)
    expect(isSplitExpired(split, 10_000 + SPLIT_DISPLAY_MS + 1000)).toBe(true)
  })

  it('respects a custom window', () => {
    expect(isSplitExpired(split, 11_500, 1000)).toBe(true)
    expect(isSplitExpired(split, 11_500, 2000)).toBe(false)
  })
})
