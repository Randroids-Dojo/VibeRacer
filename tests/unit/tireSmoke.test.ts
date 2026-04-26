import { describe, it, expect } from 'vitest'
import {
  TIRE_SMOKE_BASE_ALPHA,
  TIRE_SMOKE_BRAKE_WEIGHT,
  TIRE_SMOKE_END_SCALE,
  TIRE_SMOKE_FADE_MS,
  TIRE_SMOKE_MIN_INTENSITY,
  TIRE_SMOKE_MIN_SPEED,
  TIRE_SMOKE_POOL_SIZE,
  TIRE_SMOKE_RISE_SPEED,
  TIRE_SMOKE_SPAWN_INTERVAL_MS,
  TIRE_SMOKE_START_SCALE,
  nextTireSmokeIndex,
  puffAlpha,
  puffIntensity,
  puffPeakAlpha,
  puffRise,
  puffScale,
  shouldSpawnTireSmoke,
} from '@/game/tireSmoke'

describe('tire smoke constants', () => {
  it('keeps the spawn cadence positive and finite', () => {
    expect(TIRE_SMOKE_SPAWN_INTERVAL_MS).toBeGreaterThan(0)
    expect(Number.isFinite(TIRE_SMOKE_SPAWN_INTERVAL_MS)).toBe(true)
  })

  it('keeps the fade window positive and finite', () => {
    expect(TIRE_SMOKE_FADE_MS).toBeGreaterThan(0)
    expect(Number.isFinite(TIRE_SMOKE_FADE_MS)).toBe(true)
  })

  it('keeps the puff lifetime shorter than the skid mark trail so puffs read as bursts', () => {
    // Skid marks last 4500 ms (see SKID_MARK_FADE_MS). Smoke should fade much
    // faster so the cloud reads as a punctuating flash, not a fog.
    expect(TIRE_SMOKE_FADE_MS).toBeLessThan(4500)
  })

  it('keeps the start scale smaller than the end scale so the puff blooms', () => {
    expect(TIRE_SMOKE_START_SCALE).toBeGreaterThan(0)
    expect(TIRE_SMOKE_END_SCALE).toBeGreaterThan(TIRE_SMOKE_START_SCALE)
  })

  it('keeps the rise speed positive so puffs float upward over time', () => {
    expect(TIRE_SMOKE_RISE_SPEED).toBeGreaterThan(0)
  })

  it('keeps the base alpha strictly inside (0, 1] so weak puffs are visible', () => {
    expect(TIRE_SMOKE_BASE_ALPHA).toBeGreaterThan(0)
    expect(TIRE_SMOKE_BASE_ALPHA).toBeLessThanOrEqual(1)
  })

  it('keeps the brake weight strictly inside (0, 1]', () => {
    expect(TIRE_SMOKE_BRAKE_WEIGHT).toBeGreaterThan(0)
    expect(TIRE_SMOKE_BRAKE_WEIGHT).toBeLessThanOrEqual(1)
  })

  it('keeps the pool size positive and a power of pair-spawnable count', () => {
    expect(TIRE_SMOKE_POOL_SIZE).toBeGreaterThan(0)
    expect(TIRE_SMOKE_POOL_SIZE % 2).toBe(0)
  })

  it('keeps the speed floor positive but below the skid mark floor', () => {
    expect(TIRE_SMOKE_MIN_SPEED).toBeGreaterThan(0)
    // Smoke can fire slightly slower than skid marks (4 u/s) so a hard low-
    // speed brake puffs without leaving permanent black streaks.
    expect(TIRE_SMOKE_MIN_SPEED).toBeLessThanOrEqual(4)
  })

  it('keeps the intensity floor inside (0, 1)', () => {
    expect(TIRE_SMOKE_MIN_INTENSITY).toBeGreaterThan(0)
    expect(TIRE_SMOKE_MIN_INTENSITY).toBeLessThan(1)
  })
})

describe('puffIntensity', () => {
  it('returns 0 for stationary cars even with full steer', () => {
    const out = puffIntensity(0, 26, 1, 0, true)
    expect(out).toBe(0)
  })

  it('scales with speed ratio when sliding', () => {
    const slow = puffIntensity(5, 26, 1, 0, true)
    const fast = puffIntensity(20, 26, 1, 0, true)
    expect(fast).toBeGreaterThan(slow)
  })

  it('contributes brake input independently of steer', () => {
    const noBrake = puffIntensity(20, 26, 0, 0, true)
    const brake = puffIntensity(20, 26, 0, 1, true)
    expect(brake).toBeGreaterThan(noBrake)
  })

  it('boosts intensity when off track', () => {
    const onTrack = puffIntensity(20, 26, 0.5, 0, true)
    const offTrack = puffIntensity(20, 26, 0.5, 0, false)
    expect(offTrack).toBeGreaterThan(onTrack)
  })

  it('clamps to [0, 1]', () => {
    const out = puffIntensity(100, 26, 5, 5, false)
    expect(out).toBeGreaterThanOrEqual(0)
    expect(out).toBeLessThanOrEqual(1)
  })

  it('returns 0 on non-finite inputs', () => {
    expect(puffIntensity(NaN, 26, 1, 0, true)).toBe(0)
    expect(puffIntensity(20, NaN, 1, 0, true)).toBe(0)
    expect(puffIntensity(20, 26, NaN, 0, true)).toBeGreaterThanOrEqual(0)
    expect(puffIntensity(20, 26, 1, NaN, true)).toBeGreaterThanOrEqual(0)
  })

  it('returns 0 on non-positive maxSpeed', () => {
    expect(puffIntensity(20, 0, 1, 1, true)).toBe(0)
    expect(puffIntensity(20, -5, 1, 1, true)).toBe(0)
  })

  it('returns 0 on negative speed', () => {
    expect(puffIntensity(-5, 26, 1, 1, true)).toBe(0)
  })

  it('treats negative steer/brake as zero rather than spiking', () => {
    const negative = puffIntensity(20, 26, -1, -1, true)
    const zero = puffIntensity(20, 26, 0, 0, true)
    expect(negative).toBe(zero)
  })
})

describe('shouldSpawnTireSmoke', () => {
  it('refuses when intensity is below threshold', () => {
    const out = shouldSpawnTireSmoke(
      TIRE_SMOKE_MIN_INTENSITY - 0.01,
      30,
      TIRE_SMOKE_SPAWN_INTERVAL_MS,
    )
    expect(out.spawn).toBe(false)
  })

  it('refuses when speed is below threshold', () => {
    const out = shouldSpawnTireSmoke(
      0.9,
      TIRE_SMOKE_MIN_SPEED - 0.01,
      TIRE_SMOKE_SPAWN_INTERVAL_MS,
    )
    expect(out.spawn).toBe(false)
  })

  it('refuses when the spawn interval has not elapsed', () => {
    const out = shouldSpawnTireSmoke(0.9, 30, TIRE_SMOKE_SPAWN_INTERVAL_MS - 1)
    expect(out.spawn).toBe(false)
  })

  it('spawns once all three gates pass', () => {
    const out = shouldSpawnTireSmoke(0.9, 30, TIRE_SMOKE_SPAWN_INTERVAL_MS)
    expect(out.spawn).toBe(true)
  })

  it('honors a custom interval', () => {
    const out = shouldSpawnTireSmoke(0.9, 30, 250, 500)
    expect(out.spawn).toBe(false)
    expect(out.intervalMs).toBe(500)
  })
})

describe('puffAlpha', () => {
  it('returns peak at age 0', () => {
    expect(puffAlpha(0, 0.6)).toBeCloseTo(0.6, 5)
  })

  it('returns 0 at the fade end', () => {
    expect(puffAlpha(TIRE_SMOKE_FADE_MS, 0.6)).toBe(0)
  })

  it('returns 0 past the fade end', () => {
    expect(puffAlpha(TIRE_SMOKE_FADE_MS + 100, 0.6)).toBe(0)
  })

  it('halves at the midpoint', () => {
    expect(puffAlpha(TIRE_SMOKE_FADE_MS / 2, 0.6)).toBeCloseTo(0.3, 5)
  })

  it('clamps peak above 1 down to 1', () => {
    expect(puffAlpha(0, 5)).toBe(1)
  })

  it('clamps peak below 0 up to 0', () => {
    expect(puffAlpha(0, -1)).toBe(0)
  })

  it('returns peak when ageMs is non-finite', () => {
    expect(puffAlpha(NaN, 0.5)).toBe(0.5)
  })

  it('returns 0 when fadeMs is non-finite or zero', () => {
    expect(puffAlpha(100, 0.6, 0)).toBe(0)
    expect(puffAlpha(100, 0.6, NaN)).toBe(0)
  })

  it('honors a custom fadeMs', () => {
    expect(puffAlpha(500, 1, 1000)).toBeCloseTo(0.5, 5)
  })
})

describe('puffScale', () => {
  it('starts at TIRE_SMOKE_START_SCALE', () => {
    expect(puffScale(0)).toBe(TIRE_SMOKE_START_SCALE)
  })

  it('ends at TIRE_SMOKE_END_SCALE', () => {
    expect(puffScale(TIRE_SMOKE_FADE_MS)).toBe(TIRE_SMOKE_END_SCALE)
  })

  it('grows linearly between endpoints', () => {
    const mid = puffScale(TIRE_SMOKE_FADE_MS / 2)
    const expected = (TIRE_SMOKE_START_SCALE + TIRE_SMOKE_END_SCALE) / 2
    expect(mid).toBeCloseTo(expected, 5)
  })

  it('clamps before age 0', () => {
    expect(puffScale(-1000)).toBe(TIRE_SMOKE_START_SCALE)
  })

  it('clamps past fade end', () => {
    expect(puffScale(TIRE_SMOKE_FADE_MS * 5)).toBe(TIRE_SMOKE_END_SCALE)
  })

  it('honors custom start / end scales', () => {
    expect(puffScale(500, 1000, 0.1, 1.1)).toBeCloseTo(0.6, 5)
  })

  it('returns startScale when ageMs is non-finite', () => {
    expect(puffScale(NaN)).toBe(TIRE_SMOKE_START_SCALE)
  })
})

describe('puffRise', () => {
  it('returns 0 at age 0', () => {
    expect(puffRise(0)).toBe(0)
  })

  it('grows linearly with age in seconds', () => {
    expect(puffRise(1000)).toBeCloseTo(TIRE_SMOKE_RISE_SPEED, 5)
    expect(puffRise(500)).toBeCloseTo(TIRE_SMOKE_RISE_SPEED * 0.5, 5)
  })

  it('honors a custom rise speed', () => {
    expect(puffRise(1000, 5)).toBeCloseTo(5, 5)
  })

  it('returns 0 on non-finite age', () => {
    expect(puffRise(NaN)).toBe(0)
  })

  it('returns 0 on non-positive rise speed', () => {
    expect(puffRise(1000, 0)).toBe(0)
    expect(puffRise(1000, -1)).toBe(0)
    expect(puffRise(1000, NaN)).toBe(0)
  })
})

describe('puffPeakAlpha', () => {
  it('returns 0 at zero intensity', () => {
    expect(puffPeakAlpha(0)).toBe(0)
  })

  it('returns BASE_ALPHA at full intensity', () => {
    expect(puffPeakAlpha(1)).toBe(TIRE_SMOKE_BASE_ALPHA)
  })

  it('clamps above 1', () => {
    expect(puffPeakAlpha(5)).toBe(TIRE_SMOKE_BASE_ALPHA)
  })

  it('clamps below 0', () => {
    expect(puffPeakAlpha(-2)).toBe(0)
  })

  it('scales linearly between 0 and 1', () => {
    expect(puffPeakAlpha(0.5)).toBeCloseTo(TIRE_SMOKE_BASE_ALPHA * 0.5, 5)
  })
})

describe('nextTireSmokeIndex', () => {
  it('advances by 1 within bounds', () => {
    expect(nextTireSmokeIndex(0, 4)).toBe(1)
    expect(nextTireSmokeIndex(2, 4)).toBe(3)
  })

  it('wraps at the end of the pool', () => {
    expect(nextTireSmokeIndex(3, 4)).toBe(0)
  })

  it('uses default pool size when none is given', () => {
    expect(nextTireSmokeIndex(TIRE_SMOKE_POOL_SIZE - 1)).toBe(0)
  })

  it('returns 0 on a degenerate pool size', () => {
    expect(nextTireSmokeIndex(5, 0)).toBe(0)
    expect(nextTireSmokeIndex(5, -1)).toBe(0)
    expect(nextTireSmokeIndex(5, NaN)).toBe(0)
  })
})
