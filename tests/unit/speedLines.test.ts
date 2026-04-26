import { describe, it, expect } from 'vitest'
import {
  SPEED_LINES_LIFE_MS,
  SPEED_LINES_PEAK_ALPHA,
  SPEED_LINES_SATURATION,
  SPEED_LINES_THRESHOLD,
  SPEED_LINES_INNER_RADIUS,
  SPEED_LINES_OUTER_RADIUS,
  SPEED_LINES_SPAWN_PER_SEC,
  SPEED_LINES_LENGTH_SAT,
  isStreakExpired,
  makeSpeedLinesRng,
  spawnSpeedLine,
  speedLineSpawnCount,
  speedLinesIntensity,
  stepSpeedLines,
  streakAlpha,
} from '@/game/speedLines'

describe('speedLinesIntensity', () => {
  it('returns 0 below the threshold', () => {
    expect(speedLinesIntensity(0)).toBe(0)
    expect(speedLinesIntensity(SPEED_LINES_THRESHOLD - 0.01)).toBe(0)
    expect(speedLinesIntensity(SPEED_LINES_THRESHOLD)).toBe(0)
  })

  it('returns 1 at and above the saturation point', () => {
    expect(speedLinesIntensity(SPEED_LINES_SATURATION)).toBe(1)
    expect(speedLinesIntensity(1.0)).toBe(1)
    expect(speedLinesIntensity(2.0)).toBe(1)
  })

  it('ramps linearly between threshold and saturation', () => {
    const mid =
      SPEED_LINES_THRESHOLD + (SPEED_LINES_SATURATION - SPEED_LINES_THRESHOLD) / 2
    const value = speedLinesIntensity(mid)
    expect(value).toBeGreaterThan(0.45)
    expect(value).toBeLessThan(0.55)
  })

  it('returns 0 for non-finite input (defensive against NaN / Infinity)', () => {
    expect(speedLinesIntensity(NaN)).toBe(0)
    expect(speedLinesIntensity(Infinity)).toBe(0)
    expect(speedLinesIntensity(-Infinity)).toBe(0)
  })
})

describe('speedLineSpawnCount', () => {
  it('spawns nothing below the threshold', () => {
    const r = speedLineSpawnCount(0.5, 1 / 60, 0)
    expect(r.spawn).toBe(0)
    expect(r.nextCarry).toBe(0)
  })

  it('returns no spawn but preserves carry on a bad dt', () => {
    const r = speedLineSpawnCount(1, 0, 0.7)
    expect(r.spawn).toBe(0)
    expect(r.nextCarry).toBeCloseTo(0.7, 5)
  })

  it('approaches the saturation rate over a one-second simulated burst', () => {
    let carry = 0
    let total = 0
    for (let i = 0; i < 60; i++) {
      const r = speedLineSpawnCount(1, 1 / 60, carry)
      carry = r.nextCarry
      total += r.spawn
    }
    expect(total).toBe(SPEED_LINES_SPAWN_PER_SEC)
  })

  it('carries fractional spawn forward so low rates eventually fire', () => {
    let carry = 0
    let firstSpawnFrame = -1
    const fraction = SPEED_LINES_THRESHOLD + 0.01 // intensity ~ 0.033
    for (let i = 0; i < 240; i++) {
      const r = speedLineSpawnCount(fraction, 1 / 60, carry)
      carry = r.nextCarry
      if (r.spawn > 0) {
        firstSpawnFrame = i
        break
      }
    }
    expect(firstSpawnFrame).toBeGreaterThan(0)
  })

  it('rejects non-finite carry without crashing', () => {
    const r = speedLineSpawnCount(1, 1 / 60, NaN)
    expect(Number.isFinite(r.spawn)).toBe(true)
    expect(Number.isFinite(r.nextCarry)).toBe(true)
  })
})

describe('makeSpeedLinesRng', () => {
  it('is deterministic for the same seed', () => {
    const a = makeSpeedLinesRng(42)
    const b = makeSpeedLinesRng(42)
    for (let i = 0; i < 5; i++) {
      expect(a()).toBe(b())
    }
  })

  it('yields different streams for different seeds', () => {
    const a = makeSpeedLinesRng(1)
    const b = makeSpeedLinesRng(2)
    let differs = false
    for (let i = 0; i < 5; i++) {
      if (a() !== b()) {
        differs = true
        break
      }
    }
    expect(differs).toBe(true)
  })

  it('returns floats in [0, 1)', () => {
    const rng = makeSpeedLinesRng(123)
    for (let i = 0; i < 50; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('avoids the zero-state degenerate output when seeded with 0', () => {
    const rng = makeSpeedLinesRng(0)
    const samples = new Set<number>()
    for (let i = 0; i < 5; i++) samples.add(rng())
    expect(samples.size).toBeGreaterThan(1)
  })
})

describe('spawnSpeedLine', () => {
  it('starts each streak between the inner and outer spawn radii', () => {
    const rng = makeSpeedLinesRng(7)
    for (let i = 0; i < 20; i++) {
      const s = spawnSpeedLine(rng, 1)
      expect(s.startRadius).toBeGreaterThanOrEqual(SPEED_LINES_INNER_RADIUS)
      expect(s.startRadius).toBeLessThanOrEqual(SPEED_LINES_OUTER_RADIUS)
    }
  })

  it('starts streaks with zero age', () => {
    const rng = makeSpeedLinesRng(7)
    for (let i = 0; i < 5; i++) {
      const s = spawnSpeedLine(rng, 0.5)
      expect(s.ageMs).toBe(0)
    }
  })

  it('scales length with intensity', () => {
    const lowSeed = makeSpeedLinesRng(11)
    const highSeed = makeSpeedLinesRng(11)
    const low = spawnSpeedLine(lowSeed, 0)
    const high = spawnSpeedLine(highSeed, 1)
    expect(high.length).toBeGreaterThan(low.length)
    expect(high.length).toBeCloseTo(SPEED_LINES_LENGTH_SAT, 5)
  })

  it('caps peak alpha at the configured ceiling', () => {
    const rng = makeSpeedLinesRng(5)
    for (let i = 0; i < 30; i++) {
      const s = spawnSpeedLine(rng, 1)
      // peakAlpha = SPEED_LINES_PEAK_ALPHA * 1 * jitter where jitter <= 1.15
      expect(s.peakAlpha).toBeLessThanOrEqual(SPEED_LINES_PEAK_ALPHA * 1.15 + 1e-9)
      expect(s.peakAlpha).toBeGreaterThan(0)
    }
  })

  it('rolls angles across the full circle over many spawns', () => {
    const rng = makeSpeedLinesRng(99)
    let minAngle = Infinity
    let maxAngle = -Infinity
    for (let i = 0; i < 200; i++) {
      const s = spawnSpeedLine(rng, 1)
      if (s.angle < minAngle) minAngle = s.angle
      if (s.angle > maxAngle) maxAngle = s.angle
    }
    expect(minAngle).toBeLessThan(0.5)
    expect(maxAngle).toBeGreaterThan(Math.PI * 2 - 0.5)
  })
})

describe('stepSpeedLines', () => {
  it('advances every particle by dtMs', () => {
    const ps = [
      { angle: 0, startRadius: 0.4, length: 0.2, peakAlpha: 0.5, ageMs: 0 },
      { angle: 1, startRadius: 0.5, length: 0.2, peakAlpha: 0.5, ageMs: 100 },
    ]
    stepSpeedLines(ps, 16)
    expect(ps[0]!.ageMs).toBe(16)
    expect(ps[1]!.ageMs).toBe(116)
  })

  it('is a no-op on an empty array', () => {
    const ps: Parameters<typeof stepSpeedLines>[0] = []
    stepSpeedLines(ps, 16)
    expect(ps.length).toBe(0)
  })

  it('rejects non-finite or non-positive dt without poisoning age', () => {
    const ps = [
      { angle: 0, startRadius: 0.4, length: 0.2, peakAlpha: 0.5, ageMs: 50 },
    ]
    stepSpeedLines(ps, NaN)
    expect(ps[0]!.ageMs).toBe(50)
    stepSpeedLines(ps, -10)
    expect(ps[0]!.ageMs).toBe(50)
    stepSpeedLines(ps, 0)
    expect(ps[0]!.ageMs).toBe(50)
  })
})

describe('streakAlpha', () => {
  it('returns 0 at and beyond the life span', () => {
    expect(streakAlpha(SPEED_LINES_LIFE_MS, 0.5)).toBe(0)
    expect(streakAlpha(SPEED_LINES_LIFE_MS + 1, 0.5)).toBe(0)
  })

  it('returns 0 for negative or non-finite age', () => {
    expect(streakAlpha(-1, 0.5)).toBe(0)
    expect(streakAlpha(NaN, 0.5)).toBe(0)
  })

  it('fades in to peak over the first 20% of life', () => {
    const start = streakAlpha(0, 0.6)
    const quarterIn = streakAlpha(SPEED_LINES_LIFE_MS * 0.1, 0.6)
    const atFadeInEnd = streakAlpha(SPEED_LINES_LIFE_MS * 0.2, 0.6)
    expect(start).toBe(0)
    expect(quarterIn).toBeGreaterThan(0)
    expect(quarterIn).toBeLessThan(0.6)
    expect(atFadeInEnd).toBeCloseTo(0.6, 5)
  })

  it('holds at peak through the middle window', () => {
    expect(streakAlpha(SPEED_LINES_LIFE_MS * 0.35, 0.5)).toBeCloseTo(0.5, 5)
  })

  it('fades out linearly after the hold window', () => {
    const mid = streakAlpha(SPEED_LINES_LIFE_MS * 0.75, 0.5)
    const late = streakAlpha(SPEED_LINES_LIFE_MS * 0.9, 0.5)
    expect(mid).toBeCloseTo(0.25, 5)
    expect(late).toBeLessThan(mid)
    expect(late).toBeGreaterThan(0)
  })
})

describe('isStreakExpired', () => {
  it('is true once age crosses the life span', () => {
    expect(
      isStreakExpired({
        angle: 0,
        startRadius: 0.4,
        length: 0.2,
        peakAlpha: 0.5,
        ageMs: SPEED_LINES_LIFE_MS,
      }),
    ).toBe(true)
  })

  it('is false for a fresh streak', () => {
    expect(
      isStreakExpired({
        angle: 0,
        startRadius: 0.4,
        length: 0.2,
        peakAlpha: 0.5,
        ageMs: 0,
      }),
    ).toBe(false)
  })

  it('treats undefined / non-finite age as expired', () => {
    expect(isStreakExpired(undefined)).toBe(true)
    expect(
      isStreakExpired({
        angle: 0,
        startRadius: 0.4,
        length: 0.2,
        peakAlpha: 0.5,
        ageMs: NaN,
      }),
    ).toBe(true)
  })
})
