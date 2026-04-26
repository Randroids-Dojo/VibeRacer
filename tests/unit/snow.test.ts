import { describe, it, expect } from 'vitest'
import { RAIN_FALL_SPEED } from '@/game/rain'
import {
  DEFAULT_SNOW_CONFIG,
  DEFAULT_SNOW_PARTICLES,
  SNOW_BOX_FLOOR,
  SNOW_BOX_HALF_DEPTH,
  SNOW_BOX_HALF_WIDTH,
  SNOW_BOX_TOP,
  SNOW_COLOR_HEX,
  SNOW_FALL_SPEED,
  SNOW_OPACITY,
  SNOW_POINT_SIZE,
  SNOW_SWAY_AMP,
  SNOW_SWAY_FREQ_HZ,
  SNOW_WIND_X,
  SNOW_WIND_Z,
  buildSnowflakeSprite,
  initSnowParticles,
  makeSnowRng,
  snowSwayOffset,
  tickSnowParticles,
  writeSnowGeometry,
  type SnowConfig,
} from '@/game/snow'

const TEST_CONFIG: SnowConfig = {
  halfWidth: SNOW_BOX_HALF_WIDTH,
  halfDepth: SNOW_BOX_HALF_DEPTH,
  top: SNOW_BOX_TOP,
  floor: SNOW_BOX_FLOOR,
  fallSpeed: SNOW_FALL_SPEED,
  swayAmp: SNOW_SWAY_AMP,
  swayFreqHz: SNOW_SWAY_FREQ_HZ,
  windX: SNOW_WIND_X,
  windZ: SNOW_WIND_Z,
}

describe('snow constants', () => {
  it('has positive box dimensions', () => {
    expect(SNOW_BOX_HALF_WIDTH).toBeGreaterThan(0)
    expect(SNOW_BOX_HALF_DEPTH).toBeGreaterThan(0)
    expect(SNOW_BOX_TOP).toBeGreaterThan(0)
    expect(SNOW_BOX_FLOOR).toBeGreaterThanOrEqual(0)
  })

  it('default particle count is sane', () => {
    expect(DEFAULT_SNOW_PARTICLES).toBeGreaterThan(0)
    expect(DEFAULT_SNOW_PARTICLES).toBeLessThan(10_000)
  })

  it('point size is positive', () => {
    expect(SNOW_POINT_SIZE).toBeGreaterThan(0)
  })

  it('fall speed is positive (snow goes down)', () => {
    expect(SNOW_FALL_SPEED).toBeGreaterThan(0)
  })

  it('snow falls slower than rain so the eye can track flakes', () => {
    // Regression guard. If someone ever bumps SNOW_FALL_SPEED close to or
    // above the rain fall speed, the flakes will read as streaks and we will
    // silently lose the visual identity of snow vs rain.
    expect(SNOW_FALL_SPEED).toBeLessThan(RAIN_FALL_SPEED)
  })

  it('color is in 24-bit RGB range', () => {
    expect(SNOW_COLOR_HEX).toBeGreaterThanOrEqual(0)
    expect(SNOW_COLOR_HEX).toBeLessThanOrEqual(0xffffff)
  })

  it('opacity is in [0, 1]', () => {
    expect(SNOW_OPACITY).toBeGreaterThanOrEqual(0)
    expect(SNOW_OPACITY).toBeLessThanOrEqual(1)
  })

  it('sway amplitude is non-negative and frequency is positive', () => {
    expect(SNOW_SWAY_AMP).toBeGreaterThanOrEqual(0)
    expect(SNOW_SWAY_FREQ_HZ).toBeGreaterThan(0)
  })

  it('default config matches public constants', () => {
    expect(DEFAULT_SNOW_CONFIG.halfWidth).toBe(SNOW_BOX_HALF_WIDTH)
    expect(DEFAULT_SNOW_CONFIG.halfDepth).toBe(SNOW_BOX_HALF_DEPTH)
    expect(DEFAULT_SNOW_CONFIG.top).toBe(SNOW_BOX_TOP)
    expect(DEFAULT_SNOW_CONFIG.floor).toBe(SNOW_BOX_FLOOR)
    expect(DEFAULT_SNOW_CONFIG.fallSpeed).toBe(SNOW_FALL_SPEED)
    expect(DEFAULT_SNOW_CONFIG.swayAmp).toBe(SNOW_SWAY_AMP)
    expect(DEFAULT_SNOW_CONFIG.swayFreqHz).toBe(SNOW_SWAY_FREQ_HZ)
    expect(DEFAULT_SNOW_CONFIG.windX).toBe(SNOW_WIND_X)
    expect(DEFAULT_SNOW_CONFIG.windZ).toBe(SNOW_WIND_Z)
  })
})

describe('makeSnowRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeSnowRng(42)
    const b = makeSnowRng(42)
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b())
    }
  })

  it('returns values in [0, 1)', () => {
    const rng = makeSnowRng(1)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('different seeds produce different sequences', () => {
    const a = makeSnowRng(1)
    const b = makeSnowRng(2)
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
    const rng = makeSnowRng(0)
    const v = rng()
    expect(Number.isFinite(v)).toBe(true)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  })
})

describe('initSnowParticles', () => {
  it('returns the requested count', () => {
    const rng = makeSnowRng(1)
    const ps = initSnowParticles(50, rng, TEST_CONFIG)
    expect(ps.length).toBe(50)
  })

  it('returns an empty list for zero or negative count', () => {
    const rng = makeSnowRng(1)
    expect(initSnowParticles(0, rng, TEST_CONFIG)).toEqual([])
    expect(initSnowParticles(-5, rng, TEST_CONFIG)).toEqual([])
  })

  it('every particle starts inside the snow box', () => {
    const rng = makeSnowRng(7)
    const ps = initSnowParticles(500, rng, TEST_CONFIG)
    for (const p of ps) {
      expect(p.ox).toBeGreaterThanOrEqual(-TEST_CONFIG.halfWidth)
      expect(p.ox).toBeLessThanOrEqual(TEST_CONFIG.halfWidth)
      expect(p.oz).toBeGreaterThanOrEqual(-TEST_CONFIG.halfDepth)
      expect(p.oz).toBeLessThanOrEqual(TEST_CONFIG.halfDepth)
      expect(p.oy).toBeGreaterThanOrEqual(-TEST_CONFIG.floor)
      expect(p.oy).toBeLessThanOrEqual(TEST_CONFIG.top)
    }
  })

  it('every particle has a phase in [0, 2*PI)', () => {
    const rng = makeSnowRng(13)
    const ps = initSnowParticles(200, rng, TEST_CONFIG)
    for (const p of ps) {
      expect(p.phase).toBeGreaterThanOrEqual(0)
      expect(p.phase).toBeLessThan(2 * Math.PI)
    }
  })

  it('every particle has a freqScale in [0.5, 1.5)', () => {
    const rng = makeSnowRng(13)
    const ps = initSnowParticles(200, rng, TEST_CONFIG)
    for (const p of ps) {
      expect(p.freqScale).toBeGreaterThanOrEqual(0.5)
      expect(p.freqScale).toBeLessThan(1.5)
    }
  })

  it('is deterministic with a stable seed', () => {
    const a = initSnowParticles(20, makeSnowRng(99), TEST_CONFIG)
    const b = initSnowParticles(20, makeSnowRng(99), TEST_CONFIG)
    for (let i = 0; i < 20; i++) {
      expect(a[i].ox).toBe(b[i].ox)
      expect(a[i].oy).toBe(b[i].oy)
      expect(a[i].oz).toBe(b[i].oz)
      expect(a[i].phase).toBe(b[i].phase)
      expect(a[i].freqScale).toBe(b[i].freqScale)
    }
  })
})

describe('tickSnowParticles', () => {
  it('moves every particle downward by fallSpeed * dt', () => {
    const rng = makeSnowRng(1)
    const ps = initSnowParticles(5, rng, TEST_CONFIG)
    const initialY = ps.map((p) => p.oy)
    tickSnowParticles(ps, 0.1, 0, makeSnowRng(1000), TEST_CONFIG)
    for (let i = 0; i < ps.length; i++) {
      // Either still falling (oy decreased) or wrapped to top after impact.
      const wrapped = ps[i].oy >= TEST_CONFIG.top - 0.001
      const fellExpected =
        Math.abs(initialY[i] - TEST_CONFIG.fallSpeed * 0.1 - ps[i].oy) < 1e-6
      expect(wrapped || fellExpected).toBe(true)
    }
  })

  it('is a no-op on an empty pool', () => {
    const ps = tickSnowParticles([], 0.1, 0, makeSnowRng(1), TEST_CONFIG)
    expect(ps).toEqual([])
  })

  it('is a no-op for non-positive dt', () => {
    const rng = makeSnowRng(1)
    const ps = initSnowParticles(3, rng, TEST_CONFIG)
    const before = ps.map((p) => ({ ...p }))
    tickSnowParticles(ps, 0, 0, makeSnowRng(1), TEST_CONFIG)
    for (let i = 0; i < ps.length; i++) {
      expect(ps[i].ox).toBe(before[i].ox)
      expect(ps[i].oy).toBe(before[i].oy)
      expect(ps[i].oz).toBe(before[i].oz)
    }
    tickSnowParticles(ps, -1, 0, makeSnowRng(1), TEST_CONFIG)
    for (let i = 0; i < ps.length; i++) {
      expect(ps[i].ox).toBe(before[i].ox)
      expect(ps[i].oy).toBe(before[i].oy)
      expect(ps[i].oz).toBe(before[i].oz)
    }
  })

  it('is a no-op for non-finite dt', () => {
    const rng = makeSnowRng(1)
    const ps = initSnowParticles(3, rng, TEST_CONFIG)
    const before = ps.map((p) => ({ ...p }))
    tickSnowParticles(ps, NaN, 0, makeSnowRng(1), TEST_CONFIG)
    tickSnowParticles(ps, Infinity, 0, makeSnowRng(1), TEST_CONFIG)
    for (let i = 0; i < ps.length; i++) {
      expect(ps[i].ox).toBe(before[i].ox)
      expect(ps[i].oy).toBe(before[i].oy)
      expect(ps[i].oz).toBe(before[i].oz)
    }
  })

  it('is a no-op for non-finite nowSec', () => {
    const rng = makeSnowRng(1)
    const ps = initSnowParticles(3, rng, TEST_CONFIG)
    const before = ps.map((p) => ({ ...p }))
    tickSnowParticles(ps, 0.1, NaN, makeSnowRng(1), TEST_CONFIG)
    tickSnowParticles(ps, 0.1, Infinity, makeSnowRng(1), TEST_CONFIG)
    for (let i = 0; i < ps.length; i++) {
      expect(ps[i].ox).toBe(before[i].ox)
      expect(ps[i].oy).toBe(before[i].oy)
      expect(ps[i].oz).toBe(before[i].oz)
    }
  })

  it('wraps a particle to the top when it falls below the floor', () => {
    const ps = [
      {
        ox: 0,
        oy: -TEST_CONFIG.floor - 1,
        oz: 0,
        phase: 0,
        freqScale: 1,
      },
    ]
    tickSnowParticles(ps, 0.001, 0, makeSnowRng(1), TEST_CONFIG)
    expect(ps[0].oy).toBe(TEST_CONFIG.top)
  })

  it('refreshes phase and freqScale when wrapping a wrapped particle', () => {
    const ps = [
      {
        ox: 0,
        oy: -TEST_CONFIG.floor - 1,
        oz: 0,
        // Pin a sentinel phase / freqScale so we can assert they were
        // overwritten with fresh draws after the wrap.
        phase: 99,
        freqScale: 99,
      },
    ]
    tickSnowParticles(ps, 0.001, 0, makeSnowRng(1), TEST_CONFIG)
    expect(ps[0].phase).not.toBe(99)
    expect(ps[0].freqScale).not.toBe(99)
    expect(ps[0].phase).toBeGreaterThanOrEqual(0)
    expect(ps[0].phase).toBeLessThan(2 * Math.PI)
    expect(ps[0].freqScale).toBeGreaterThanOrEqual(0.5)
    expect(ps[0].freqScale).toBeLessThan(1.5)
  })

  it('wraps horizontally on the X axis when wind drifts past the box', () => {
    const customWind: SnowConfig = {
      ...TEST_CONFIG,
      windX: 1000,
      windZ: 0,
      fallSpeed: 0,
    }
    const startX = customWind.halfWidth - 0.5
    const ps = [{ ox: startX, oy: 5, oz: 0, phase: 0, freqScale: 1 }]
    tickSnowParticles(ps, 0.1, 0, makeSnowRng(1), customWind)
    expect(ps[0].ox).toBeLessThanOrEqual(customWind.halfWidth)
    expect(ps[0].ox).toBeGreaterThanOrEqual(-customWind.halfWidth)
    expect(ps[0].ox).toBeLessThan(startX)
  })

  it('wraps horizontally on the Z axis when wind drifts past the box', () => {
    const customWind: SnowConfig = {
      ...TEST_CONFIG,
      windX: 0,
      windZ: 1000,
      fallSpeed: 0,
    }
    const startZ = customWind.halfDepth - 0.5
    const ps = [{ ox: 0, oy: 5, oz: startZ, phase: 0, freqScale: 1 }]
    tickSnowParticles(ps, 0.1, 0, makeSnowRng(1), customWind)
    expect(ps[0].oz).toBeLessThanOrEqual(customWind.halfDepth)
    expect(ps[0].oz).toBeGreaterThanOrEqual(-customWind.halfDepth)
    expect(ps[0].oz).toBeLessThan(startZ)
  })

  it('returns the same array reference for chaining', () => {
    const rng = makeSnowRng(1)
    const ps = initSnowParticles(3, rng, TEST_CONFIG)
    const out = tickSnowParticles(ps, 0.1, 0, makeSnowRng(1), TEST_CONFIG)
    expect(out).toBe(ps)
  })
})

describe('snowSwayOffset', () => {
  it('returns 0 at nowSec = 0 when phase = 0', () => {
    const p = { ox: 0, oy: 0, oz: 0, phase: 0, freqScale: 1 }
    expect(snowSwayOffset(p, 0, TEST_CONFIG)).toBe(0)
  })

  it('returns within the [-amp, +amp] range for any input', () => {
    const p = { ox: 0, oy: 0, oz: 0, phase: 1.7, freqScale: 1.2 }
    for (const t of [0, 0.5, 1, 2.7, 60, 1000]) {
      const v = snowSwayOffset(p, t, TEST_CONFIG)
      expect(v).toBeGreaterThanOrEqual(-TEST_CONFIG.swayAmp)
      expect(v).toBeLessThanOrEqual(TEST_CONFIG.swayAmp)
    }
  })

  it('is deterministic for the same particle and time', () => {
    const p = { ox: 0, oy: 0, oz: 0, phase: 0.42, freqScale: 0.9 }
    const a = snowSwayOffset(p, 1.5, TEST_CONFIG)
    const b = snowSwayOffset(p, 1.5, TEST_CONFIG)
    expect(a).toBe(b)
  })

  it('returns 0 on non-finite nowSec (defensive)', () => {
    const p = { ox: 0, oy: 0, oz: 0, phase: 1, freqScale: 1 }
    expect(snowSwayOffset(p, NaN, TEST_CONFIG)).toBe(0)
    expect(snowSwayOffset(p, Infinity, TEST_CONFIG)).toBe(0)
  })

  it('two particles with the same freqScale but different phase diverge', () => {
    const a = { ox: 0, oy: 0, oz: 0, phase: 0, freqScale: 1 }
    const b = { ox: 0, oy: 0, oz: 0, phase: Math.PI, freqScale: 1 }
    // 180-degree phase shift means the two values are negatives of each other
    // at the same time t.
    const va = snowSwayOffset(a, 0.7, TEST_CONFIG)
    const vb = snowSwayOffset(b, 0.7, TEST_CONFIG)
    expect(va).toBeCloseTo(-vb, 5)
  })
})

describe('writeSnowGeometry', () => {
  it('writes 3 floats per particle (one vertex)', () => {
    const ps = [
      { ox: 1, oy: 2, oz: 3, phase: 0, freqScale: 1 },
      { ox: 4, oy: 5, oz: 6, phase: 0, freqScale: 1 },
    ]
    const positions = new Float32Array(ps.length * 3)
    writeSnowGeometry(ps, 0, 0, 0, 0, positions, TEST_CONFIG)
    // Sway at (phase=0, freqScale=1, t=0) is exactly 0 so the vertices land at
    // the raw offsets.
    expect(positions[0]).toBe(1)
    expect(positions[1]).toBe(2)
    expect(positions[2]).toBe(3)
    expect(positions[3]).toBe(4)
    expect(positions[4]).toBe(5)
    expect(positions[5]).toBe(6)
  })

  it('adds the follow point to every vertex', () => {
    const ps = [{ ox: 0, oy: 0, oz: 0, phase: 0, freqScale: 1 }]
    const positions = new Float32Array(3)
    writeSnowGeometry(ps, 100, 50, -25, 0, positions, TEST_CONFIG)
    expect(positions[0]).toBe(100)
    expect(positions[1]).toBe(50)
    expect(positions[2]).toBe(-25)
  })

  it('applies the X sway offset to the vertex', () => {
    const ps = [{ ox: 0, oy: 0, oz: 0, phase: Math.PI / 2, freqScale: 1 }]
    const positions = new Float32Array(3)
    // sin(2*PI*freqHz*1*t + PI/2) at t=0 = sin(PI/2) = 1, so the offset is
    // exactly +amp.
    writeSnowGeometry(ps, 0, 0, 0, 0, positions, TEST_CONFIG)
    expect(positions[0]).toBeCloseTo(TEST_CONFIG.swayAmp, 5)
    expect(positions[1]).toBe(0)
    expect(positions[2]).toBe(0)
  })

  it('throws when the buffer is too small', () => {
    const ps = [
      { ox: 0, oy: 0, oz: 0, phase: 0, freqScale: 1 },
      { ox: 0, oy: 0, oz: 0, phase: 0, freqScale: 1 },
    ]
    const positions = new Float32Array(3) // half what is needed
    expect(() =>
      writeSnowGeometry(ps, 0, 0, 0, 0, positions, TEST_CONFIG),
    ).toThrow()
  })

  it('returns the same buffer for chaining', () => {
    const ps = [{ ox: 0, oy: 0, oz: 0, phase: 0, freqScale: 1 }]
    const positions = new Float32Array(3)
    const out = writeSnowGeometry(ps, 0, 0, 0, 0, positions, TEST_CONFIG)
    expect(out).toBe(positions)
  })

  it('handles an empty pool by writing nothing', () => {
    const positions = new Float32Array(0)
    const out = writeSnowGeometry([], 0, 0, 0, 0, positions, TEST_CONFIG)
    expect(out.length).toBe(0)
  })

  it('treats a non-finite nowSec as 0 instead of writing NaN', () => {
    const ps = [{ ox: 1, oy: 2, oz: 3, phase: 0, freqScale: 1 }]
    const positions = new Float32Array(3)
    writeSnowGeometry(ps, 0, 0, 0, NaN, positions, TEST_CONFIG)
    expect(Number.isFinite(positions[0])).toBe(true)
    expect(positions[1]).toBe(2)
    expect(positions[2]).toBe(3)
  })
})

describe('buildSnowflakeSprite', () => {
  it('returns a (size * size * 4) byte buffer', () => {
    const out = buildSnowflakeSprite(8)
    expect(out.length).toBe(8 * 8 * 4)
  })

  it('rejects zero or negative size', () => {
    expect(() => buildSnowflakeSprite(0)).toThrow()
    expect(() => buildSnowflakeSprite(-3)).toThrow()
  })

  it('rejects non-integer size', () => {
    expect(() => buildSnowflakeSprite(2.5)).toThrow()
  })

  it('writes white RGB for every pixel', () => {
    const size = 8
    const out = buildSnowflakeSprite(size)
    for (let i = 0; i < size * size; i++) {
      expect(out[i * 4 + 0]).toBe(255)
      expect(out[i * 4 + 1]).toBe(255)
      expect(out[i * 4 + 2]).toBe(255)
    }
  })

  it('alpha is fully opaque at the center pixel', () => {
    // Picking an odd size means the geometric center sits exactly on a
    // pixel, so the alpha there must be 255.
    const size = 9
    const out = buildSnowflakeSprite(size)
    const mid = (size - 1) / 2
    const idx = (mid * size + mid) * 4 + 3
    expect(out[idx]).toBe(255)
  })

  it('alpha is fully transparent at the corner pixel', () => {
    const size = 16
    const out = buildSnowflakeSprite(size)
    // Corner (0, 0) is well outside the outer radius so alpha should be 0.
    expect(out[3]).toBe(0)
  })

  it('alpha decreases monotonically as we move outward from the center', () => {
    const size = 17
    const out = buildSnowflakeSprite(size)
    const mid = (size - 1) / 2
    let prev = 256 // strictly greater than any byte
    for (let r = 0; r <= mid; r++) {
      // Sample along the +X ray from the center.
      const x = mid + r
      const y = mid
      const a = out[(y * size + x) * 4 + 3]
      expect(a).toBeLessThanOrEqual(prev)
      prev = a
    }
  })

  it('every alpha byte is in [0, 255]', () => {
    const out = buildSnowflakeSprite(12)
    for (let i = 0; i < 12 * 12; i++) {
      const a = out[i * 4 + 3]
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThanOrEqual(255)
    }
  })
})
