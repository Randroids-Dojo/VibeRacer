import { describe, it, expect } from 'vitest'
import {
  SPLIT_DISPLAY_MS,
  computeSplitDeltaForLastHit,
  formatSplitDelta,
  isSplitExpired,
  predictLapTimeFromHits,
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

describe('predictLapTimeFromHits', () => {
  const PB_LAP_MS = 5000

  it('returns null when no PB splits are stored', () => {
    expect(
      predictLapTimeFromHits([{ cpId: 0, tMs: 950 }], null, PB_LAP_MS),
    ).toBeNull()
    expect(
      predictLapTimeFromHits([{ cpId: 0, tMs: 950 }], [], PB_LAP_MS),
    ).toBeNull()
  })

  it('returns null when no PB lap time is stored', () => {
    expect(predictLapTimeFromHits([{ cpId: 0, tMs: 950 }], PB, null)).toBeNull()
  })

  it('rejects bogus PB lap times defensively', () => {
    expect(predictLapTimeFromHits([{ cpId: 0, tMs: 950 }], PB, 0)).toBeNull()
    expect(predictLapTimeFromHits([{ cpId: 0, tMs: 950 }], PB, -1)).toBeNull()
    expect(predictLapTimeFromHits([{ cpId: 0, tMs: 950 }], PB, NaN)).toBeNull()
    expect(
      predictLapTimeFromHits([{ cpId: 0, tMs: 950 }], PB, Infinity),
    ).toBeNull()
  })

  it('returns null when current hits are empty', () => {
    expect(predictLapTimeFromHits([], PB, PB_LAP_MS)).toBeNull()
  })

  it('returns null when the last cpId is not in PB', () => {
    expect(
      predictLapTimeFromHits([{ cpId: 99, tMs: 1000 }], PB, PB_LAP_MS),
    ).toBeNull()
  })

  it('projects faster lap when ahead of PB', () => {
    // 200ms ahead at cp1 -> projected = 5000 - 200 = 4800
    const out = predictLapTimeFromHits(
      [{ cpId: 1, tMs: 2000 }],
      PB,
      PB_LAP_MS,
    )
    expect(out).toEqual({
      predictedMs: 4800,
      deltaMs: -200,
      deltaVsRecordMs: null,
      cpId: 1,
    })
  })

  it('projects slower lap when behind PB', () => {
    // 350ms behind at cp2 -> projected = 5000 + 350 = 5350
    const out = predictLapTimeFromHits(
      [{ cpId: 2, tMs: 3850 }],
      PB,
      PB_LAP_MS,
    )
    expect(out).toEqual({
      predictedMs: 5350,
      deltaMs: 350,
      deltaVsRecordMs: null,
      cpId: 2,
    })
  })

  it('matches PB exactly when delta is zero', () => {
    const out = predictLapTimeFromHits(
      [{ cpId: 3, tMs: 4800 }],
      PB,
      PB_LAP_MS,
    )
    expect(out).toEqual({
      predictedMs: 5000,
      deltaMs: 0,
      deltaVsRecordMs: null,
      cpId: 3,
    })
  })

  it('uses the latest hit when multiple checkpoints have fired', () => {
    const current: CheckpointHit[] = [
      { cpId: 0, tMs: 1000 },
      { cpId: 1, tMs: 2200 },
      { cpId: 2, tMs: 3400 },
    ]
    // Latest is cp2 (PB at 3500, current 3400 -> 100ms ahead).
    expect(predictLapTimeFromHits(current, PB, PB_LAP_MS)).toEqual({
      predictedMs: 4900,
      deltaMs: -100,
      deltaVsRecordMs: null,
      cpId: 2,
    })
  })

  it('clamps non-negative when a wild PB delta would project below zero', () => {
    // 9999ms ahead is implausible but should not produce a negative projection.
    const out = predictLapTimeFromHits(
      [{ cpId: 0, tMs: -8999 }],
      PB,
      PB_LAP_MS,
    )
    expect(out?.predictedMs).toBe(0)
  })

  it('rounds the projected ms to a whole number', () => {
    const out = predictLapTimeFromHits(
      [{ cpId: 1, tMs: 2200 }],
      PB,
      5000.7,
    )
    expect(out?.predictedMs).toBe(5001)
  })

  it('omits the record delta when no record is supplied', () => {
    const out = predictLapTimeFromHits(
      [{ cpId: 1, tMs: 2200 }],
      PB,
      PB_LAP_MS,
    )
    expect(out?.deltaVsRecordMs).toBeNull()
  })

  it('returns a negative record delta when projected to beat the record', () => {
    // Player is on PB pace -> projected = 5000. Record is 5200 -> -200.
    const out = predictLapTimeFromHits(
      [{ cpId: 1, tMs: 2200 }],
      PB,
      PB_LAP_MS,
      5200,
    )
    expect(out?.deltaVsRecordMs).toBe(-200)
  })

  it('returns a positive record delta when projected behind the record', () => {
    // Player 200ms slower at cp1 -> projected = 5200. Record is 4900 -> +300.
    const out = predictLapTimeFromHits(
      [{ cpId: 1, tMs: 2400 }],
      PB,
      PB_LAP_MS,
      4900,
    )
    expect(out?.deltaVsRecordMs).toBe(300)
  })

  it('returns zero record delta when the projection ties the record', () => {
    const out = predictLapTimeFromHits(
      [{ cpId: 1, tMs: 2200 }],
      PB,
      PB_LAP_MS,
      PB_LAP_MS,
    )
    expect(out?.deltaVsRecordMs).toBe(0)
  })

  it('rejects bogus record lap times defensively', () => {
    for (const bad of [0, -1, NaN, Infinity, -Infinity]) {
      const out = predictLapTimeFromHits(
        [{ cpId: 1, tMs: 2200 }],
        PB,
        PB_LAP_MS,
        bad,
      )
      expect(out?.deltaVsRecordMs).toBeNull()
    }
  })

  it('rounds the record lap time before computing the delta', () => {
    // Predicted 5000, record 5200.7 rounds to 5201 -> -201.
    const out = predictLapTimeFromHits(
      [{ cpId: 1, tMs: 2200 }],
      PB,
      PB_LAP_MS,
      5200.7,
    )
    expect(out?.deltaVsRecordMs).toBe(-201)
  })
})
