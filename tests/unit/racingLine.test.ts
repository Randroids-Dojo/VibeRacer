import { describe, it, expect } from 'vitest'
import {
  RACING_LINE_COLOR_HEX,
  RACING_LINE_LIFT_Y,
  RACING_LINE_WIDTH_PX,
  racingLineNeedsRebuild,
  samplesToPolyline,
} from '@/game/racingLine'
import type { Replay } from '@/lib/replay'

function makeReplay(samples: Replay['samples']): Replay {
  return { lapTimeMs: 60_000, samples }
}

describe('racingLine constants', () => {
  it('exports a positive lift', () => {
    expect(RACING_LINE_LIFT_Y).toBeGreaterThan(0)
    expect(Number.isFinite(RACING_LINE_LIFT_Y)).toBe(true)
  })

  it('lift sits above the kerb plane (y = 0.04)', () => {
    expect(RACING_LINE_LIFT_Y).toBeGreaterThan(0.04)
  })

  it('color is a valid 24-bit hex value', () => {
    expect(Number.isInteger(RACING_LINE_COLOR_HEX)).toBe(true)
    expect(RACING_LINE_COLOR_HEX).toBeGreaterThanOrEqual(0)
    expect(RACING_LINE_COLOR_HEX).toBeLessThanOrEqual(0xffffff)
  })

  it('width hint is a positive integer', () => {
    expect(Number.isInteger(RACING_LINE_WIDTH_PX)).toBe(true)
    expect(RACING_LINE_WIDTH_PX).toBeGreaterThan(0)
  })
})

describe('samplesToPolyline', () => {
  it('returns null on null', () => {
    expect(samplesToPolyline(null)).toBeNull()
  })

  it('returns null on undefined', () => {
    expect(samplesToPolyline(undefined)).toBeNull()
  })

  it('returns null on empty samples', () => {
    expect(samplesToPolyline([])).toBeNull()
  })

  it('returns null on a single-sample list (a point is not a line)', () => {
    expect(samplesToPolyline([[0, 0, 0]])).toBeNull()
  })

  it('produces a Float32Array of length 3 * sampleCount', () => {
    const out = samplesToPolyline([
      [1, 2, 0],
      [3, 4, 0.1],
      [5, 6, 0.2],
    ])
    expect(out).not.toBeNull()
    expect(out!.length).toBe(9)
  })

  it('writes x and z straight through and lifts y', () => {
    const out = samplesToPolyline([
      [10, -20, 1],
      [11, -21, 1.5],
    ])
    expect(out).not.toBeNull()
    // Float32Array narrows precision so we compare with a tolerance.
    // i=0
    expect(out![0]).toBeCloseTo(10, 5)
    expect(out![1]).toBeCloseTo(RACING_LINE_LIFT_Y, 5)
    expect(out![2]).toBeCloseTo(-20, 5)
    // i=1
    expect(out![3]).toBeCloseTo(11, 5)
    expect(out![4]).toBeCloseTo(RACING_LINE_LIFT_Y, 5)
    expect(out![5]).toBeCloseTo(-21, 5)
  })

  it('honors a custom liftY', () => {
    const out = samplesToPolyline(
      [
        [0, 0, 0],
        [1, 1, 0],
      ],
      0.5,
    )
    expect(out).not.toBeNull()
    expect(out![1]).toBeCloseTo(0.5, 5)
    expect(out![4]).toBeCloseTo(0.5, 5)
  })

  it('returns null when liftY is non-finite', () => {
    expect(samplesToPolyline([[0, 0, 0], [1, 1, 0]], NaN)).toBeNull()
    expect(samplesToPolyline([[0, 0, 0], [1, 1, 0]], Infinity)).toBeNull()
  })

  it('returns null on a non-finite x', () => {
    expect(
      samplesToPolyline([
        [NaN, 0, 0],
        [1, 1, 0],
      ]),
    ).toBeNull()
  })

  it('returns null on a non-finite z', () => {
    expect(
      samplesToPolyline([
        [0, Infinity, 0],
        [1, 1, 0],
      ]),
    ).toBeNull()
  })
})

describe('racingLineNeedsRebuild', () => {
  it('returns false on identical references', () => {
    const r = makeReplay([
      [0, 0, 0],
      [1, 1, 0],
    ])
    expect(racingLineNeedsRebuild(r, r)).toBe(false)
  })

  it('returns true on differing references with the same data', () => {
    // Reference equality is the gate: a fresh object means a fresh geometry.
    const a = makeReplay([
      [0, 0, 0],
      [1, 1, 0],
    ])
    const b = makeReplay([
      [0, 0, 0],
      [1, 1, 0],
    ])
    expect(racingLineNeedsRebuild(a, b)).toBe(true)
  })

  it('returns true when transitioning from null to a replay', () => {
    const r = makeReplay([
      [0, 0, 0],
      [1, 1, 0],
    ])
    expect(racingLineNeedsRebuild(null, r)).toBe(true)
  })

  it('returns true when transitioning from a replay to null', () => {
    const r = makeReplay([
      [0, 0, 0],
      [1, 1, 0],
    ])
    expect(racingLineNeedsRebuild(r, null)).toBe(true)
  })

  it('returns false when both sides are null', () => {
    expect(racingLineNeedsRebuild(null, null)).toBe(false)
  })

  it('returns false when both sides are undefined', () => {
    expect(racingLineNeedsRebuild(undefined, undefined)).toBe(false)
  })

  it('treats null and undefined as a meaningful change', () => {
    // Distinct sentinels in case a caller uses one or the other; keeps the
    // setter from skipping a meaningful clear if the two ever cross.
    expect(racingLineNeedsRebuild(null, undefined)).toBe(true)
    expect(racingLineNeedsRebuild(undefined, null)).toBe(true)
  })
})
