import { describe, it, expect } from 'vitest'
import {
  DEFAULT_RAIN_CONFIG,
  DEFAULT_RAIN_PARTICLES,
  RAIN_BOX_FLOOR,
  RAIN_BOX_HALF_DEPTH,
  RAIN_BOX_HALF_WIDTH,
  RAIN_BOX_TOP,
  RAIN_COLOR_HEX,
  RAIN_FALL_SPEED,
  RAIN_OPACITY,
  RAIN_STREAK_LENGTH,
  RAIN_WIND_X,
  RAIN_WIND_Z,
  initRainParticles,
  makeRainRng,
  tickRainParticles,
  writeRainGeometry,
  type RainConfig,
} from '@/game/rain'

const TEST_CONFIG: RainConfig = {
  halfWidth: RAIN_BOX_HALF_WIDTH,
  halfDepth: RAIN_BOX_HALF_DEPTH,
  top: RAIN_BOX_TOP,
  floor: RAIN_BOX_FLOOR,
  streakLength: RAIN_STREAK_LENGTH,
  fallSpeed: RAIN_FALL_SPEED,
  windX: RAIN_WIND_X,
  windZ: RAIN_WIND_Z,
}

describe('rain constants', () => {
  it('has positive box dimensions', () => {
    expect(RAIN_BOX_HALF_WIDTH).toBeGreaterThan(0)
    expect(RAIN_BOX_HALF_DEPTH).toBeGreaterThan(0)
    expect(RAIN_BOX_TOP).toBeGreaterThan(0)
    expect(RAIN_BOX_FLOOR).toBeGreaterThanOrEqual(0)
  })

  it('default particle count is sane', () => {
    expect(DEFAULT_RAIN_PARTICLES).toBeGreaterThan(0)
    expect(DEFAULT_RAIN_PARTICLES).toBeLessThan(10_000)
  })

  it('streak length is positive', () => {
    expect(RAIN_STREAK_LENGTH).toBeGreaterThan(0)
  })

  it('fall speed is positive (rain goes down)', () => {
    expect(RAIN_FALL_SPEED).toBeGreaterThan(0)
  })

  it('color is in 24-bit RGB range', () => {
    expect(RAIN_COLOR_HEX).toBeGreaterThanOrEqual(0)
    expect(RAIN_COLOR_HEX).toBeLessThanOrEqual(0xffffff)
  })

  it('opacity is in [0, 1]', () => {
    expect(RAIN_OPACITY).toBeGreaterThanOrEqual(0)
    expect(RAIN_OPACITY).toBeLessThanOrEqual(1)
  })

  it('default config matches public constants', () => {
    expect(DEFAULT_RAIN_CONFIG.halfWidth).toBe(RAIN_BOX_HALF_WIDTH)
    expect(DEFAULT_RAIN_CONFIG.halfDepth).toBe(RAIN_BOX_HALF_DEPTH)
    expect(DEFAULT_RAIN_CONFIG.top).toBe(RAIN_BOX_TOP)
    expect(DEFAULT_RAIN_CONFIG.floor).toBe(RAIN_BOX_FLOOR)
    expect(DEFAULT_RAIN_CONFIG.streakLength).toBe(RAIN_STREAK_LENGTH)
    expect(DEFAULT_RAIN_CONFIG.fallSpeed).toBe(RAIN_FALL_SPEED)
    expect(DEFAULT_RAIN_CONFIG.windX).toBe(RAIN_WIND_X)
    expect(DEFAULT_RAIN_CONFIG.windZ).toBe(RAIN_WIND_Z)
  })
})

describe('makeRainRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRainRng(42)
    const b = makeRainRng(42)
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b())
    }
  })

  it('returns values in [0, 1)', () => {
    const rng = makeRainRng(1)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('different seeds produce different sequences', () => {
    const a = makeRainRng(1)
    const b = makeRainRng(2)
    let differs = false
    for (let i = 0; i < 10; i++) {
      if (a() !== b()) {
        differs = true
        break
      }
    }
    expect(differs).toBe(true)
  })

  it('handles a zero seed without locking up', () => {
    const rng = makeRainRng(0)
    const v = rng()
    expect(Number.isFinite(v)).toBe(true)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  })
})

describe('initRainParticles', () => {
  it('returns the requested count', () => {
    const rng = makeRainRng(1)
    const ps = initRainParticles(50, rng, TEST_CONFIG)
    expect(ps.length).toBe(50)
  })

  it('returns an empty list for zero or negative count', () => {
    const rng = makeRainRng(1)
    expect(initRainParticles(0, rng, TEST_CONFIG)).toEqual([])
    expect(initRainParticles(-5, rng, TEST_CONFIG)).toEqual([])
  })

  it('every particle starts inside the rain box', () => {
    const rng = makeRainRng(7)
    const ps = initRainParticles(500, rng, TEST_CONFIG)
    for (const p of ps) {
      expect(p.ox).toBeGreaterThanOrEqual(-TEST_CONFIG.halfWidth)
      expect(p.ox).toBeLessThanOrEqual(TEST_CONFIG.halfWidth)
      expect(p.oz).toBeGreaterThanOrEqual(-TEST_CONFIG.halfDepth)
      expect(p.oz).toBeLessThanOrEqual(TEST_CONFIG.halfDepth)
      expect(p.oy).toBeGreaterThanOrEqual(-TEST_CONFIG.floor)
      expect(p.oy).toBeLessThanOrEqual(TEST_CONFIG.top)
    }
  })

  it('is deterministic with a stable seed', () => {
    const a = initRainParticles(20, makeRainRng(99), TEST_CONFIG)
    const b = initRainParticles(20, makeRainRng(99), TEST_CONFIG)
    for (let i = 0; i < 20; i++) {
      expect(a[i].ox).toBe(b[i].ox)
      expect(a[i].oy).toBe(b[i].oy)
      expect(a[i].oz).toBe(b[i].oz)
    }
  })
})

describe('tickRainParticles', () => {
  it('moves every particle downward by fallSpeed * dt', () => {
    const rng = makeRainRng(1)
    const ps = initRainParticles(5, rng, TEST_CONFIG)
    const initialY = ps.map((p) => p.oy)
    tickRainParticles(ps, 0.1, makeRainRng(1000), TEST_CONFIG)
    for (let i = 0; i < ps.length; i++) {
      // Either still falling (oy decreased) or wrapped to top after impact.
      const wrapped = ps[i].oy >= TEST_CONFIG.top - 0.001
      const fellExpected =
        Math.abs(initialY[i] - TEST_CONFIG.fallSpeed * 0.1 - ps[i].oy) < 1e-6
      expect(wrapped || fellExpected).toBe(true)
    }
  })

  it('is a no-op on an empty pool', () => {
    const ps = tickRainParticles([], 0.1, makeRainRng(1), TEST_CONFIG)
    expect(ps).toEqual([])
  })

  it('is a no-op for non-positive dt', () => {
    const rng = makeRainRng(1)
    const ps = initRainParticles(3, rng, TEST_CONFIG)
    const before = ps.map((p) => ({ ...p }))
    tickRainParticles(ps, 0, makeRainRng(1), TEST_CONFIG)
    for (let i = 0; i < ps.length; i++) {
      expect(ps[i].ox).toBe(before[i].ox)
      expect(ps[i].oy).toBe(before[i].oy)
      expect(ps[i].oz).toBe(before[i].oz)
    }
    tickRainParticles(ps, -1, makeRainRng(1), TEST_CONFIG)
    for (let i = 0; i < ps.length; i++) {
      expect(ps[i].ox).toBe(before[i].ox)
      expect(ps[i].oy).toBe(before[i].oy)
      expect(ps[i].oz).toBe(before[i].oz)
    }
  })

  it('is a no-op for non-finite dt', () => {
    const rng = makeRainRng(1)
    const ps = initRainParticles(3, rng, TEST_CONFIG)
    const before = ps.map((p) => ({ ...p }))
    tickRainParticles(ps, NaN, makeRainRng(1), TEST_CONFIG)
    tickRainParticles(ps, Infinity, makeRainRng(1), TEST_CONFIG)
    for (let i = 0; i < ps.length; i++) {
      expect(ps[i].ox).toBe(before[i].ox)
      expect(ps[i].oy).toBe(before[i].oy)
      expect(ps[i].oz).toBe(before[i].oz)
    }
  })

  it('wraps a particle to the top when it falls below the floor', () => {
    const ps = [{ ox: 0, oy: -TEST_CONFIG.floor - 1, oz: 0 }]
    tickRainParticles(ps, 0.001, makeRainRng(1), TEST_CONFIG)
    // After falling further, the particle is below -floor by even more, so the
    // wrap branch fires and resets oy to the top.
    expect(ps[0].oy).toBe(TEST_CONFIG.top)
  })

  it('wraps horizontally on the X axis when wind drifts past the box', () => {
    // Use a config with no fall speed so the particle stays above the floor
    // and the horizontal wrap branch is what we are exercising.
    const customWind: RainConfig = {
      ...TEST_CONFIG,
      windX: 1000,
      windZ: 0,
      fallSpeed: 0,
    }
    const startX = customWind.halfWidth - 0.5
    const ps = [{ ox: startX, oy: 5, oz: 0 }]
    tickRainParticles(ps, 0.1, makeRainRng(1), customWind)
    // Drift was 100 units, would put the particle past the right edge. The
    // wrap subtracts halfWidth * 2 = 140, leaving the result back inside the
    // box and to the left of where it started.
    expect(ps[0].ox).toBeLessThanOrEqual(customWind.halfWidth)
    expect(ps[0].ox).toBeGreaterThanOrEqual(-customWind.halfWidth)
    expect(ps[0].ox).toBeLessThan(startX)
  })

  it('wraps horizontally on the Z axis when wind drifts past the box', () => {
    const customWind: RainConfig = {
      ...TEST_CONFIG,
      windX: 0,
      windZ: 1000,
      fallSpeed: 0,
    }
    const startZ = customWind.halfDepth - 0.5
    const ps = [{ ox: 0, oy: 5, oz: startZ }]
    tickRainParticles(ps, 0.1, makeRainRng(1), customWind)
    expect(ps[0].oz).toBeLessThanOrEqual(customWind.halfDepth)
    expect(ps[0].oz).toBeGreaterThanOrEqual(-customWind.halfDepth)
    expect(ps[0].oz).toBeLessThan(startZ)
  })

  it('returns the same array reference for chaining', () => {
    const rng = makeRainRng(1)
    const ps = initRainParticles(3, rng, TEST_CONFIG)
    const out = tickRainParticles(ps, 0.1, makeRainRng(1), TEST_CONFIG)
    expect(out).toBe(ps)
  })
})

describe('writeRainGeometry', () => {
  it('writes 6 floats per particle (start + end vertices)', () => {
    const ps = [
      { ox: 1, oy: 2, oz: 3 },
      { ox: 4, oy: 5, oz: 6 },
    ]
    const positions = new Float32Array(ps.length * 6)
    writeRainGeometry(ps, 0, 0, 0, RAIN_STREAK_LENGTH, positions)
    // First particle: start (1, 2, 3), end (1, 2 + len, 3).
    expect(positions[0]).toBe(1)
    expect(positions[1]).toBe(2)
    expect(positions[2]).toBe(3)
    expect(positions[3]).toBe(1)
    expect(positions[4]).toBeCloseTo(2 + RAIN_STREAK_LENGTH, 5)
    expect(positions[5]).toBe(3)
    // Second particle: start (4, 5, 6), end (4, 5 + len, 6).
    expect(positions[6]).toBe(4)
    expect(positions[7]).toBe(5)
    expect(positions[8]).toBe(6)
    expect(positions[9]).toBe(4)
    expect(positions[10]).toBeCloseTo(5 + RAIN_STREAK_LENGTH, 5)
    expect(positions[11]).toBe(6)
  })

  it('adds the follow point to every vertex', () => {
    const ps = [{ ox: 0, oy: 0, oz: 0 }]
    const positions = new Float32Array(6)
    writeRainGeometry(ps, 100, 50, -25, RAIN_STREAK_LENGTH, positions)
    // Bottom vertex sits at the follow point exactly.
    expect(positions[0]).toBe(100)
    expect(positions[1]).toBe(50)
    expect(positions[2]).toBe(-25)
    // Top vertex is one streak above.
    expect(positions[3]).toBe(100)
    expect(positions[4]).toBeCloseTo(50 + RAIN_STREAK_LENGTH, 5)
    expect(positions[5]).toBe(-25)
  })

  it('throws when the buffer is too small', () => {
    const ps = [
      { ox: 0, oy: 0, oz: 0 },
      { ox: 0, oy: 0, oz: 0 },
    ]
    const positions = new Float32Array(6) // half what is needed
    expect(() =>
      writeRainGeometry(ps, 0, 0, 0, RAIN_STREAK_LENGTH, positions),
    ).toThrow()
  })

  it('returns the same buffer for chaining', () => {
    const ps = [{ ox: 0, oy: 0, oz: 0 }]
    const positions = new Float32Array(6)
    const out = writeRainGeometry(ps, 0, 0, 0, RAIN_STREAK_LENGTH, positions)
    expect(out).toBe(positions)
  })

  it('handles an empty pool by writing nothing', () => {
    const positions = new Float32Array(0)
    const out = writeRainGeometry([], 0, 0, 0, RAIN_STREAK_LENGTH, positions)
    expect(out.length).toBe(0)
  })
})
