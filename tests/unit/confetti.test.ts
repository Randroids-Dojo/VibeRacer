import { describe, it, expect } from 'vitest'
import {
  CONFETTI_FADE_END_MS,
  CONFETTI_FADE_START_MS,
  CONFETTI_GRAVITY,
  CONFETTI_PALETTE_PB,
  CONFETTI_PALETTE_RECORD,
  CONFETTI_PB_COUNT,
  CONFETTI_RECORD_COUNT,
  confettiAlpha,
  isBatchExpired,
  makeRng,
  spawnConfettiBatch,
  stepConfetti,
} from '@/game/confetti'

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(1234)
    const b = makeRng(1234)
    const seqA = Array.from({ length: 8 }, () => a())
    const seqB = Array.from({ length: 8 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('handles seed 0 without locking up', () => {
    const r = makeRng(0)
    const v = r()
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  })

  it('emits values in [0, 1)', () => {
    const r = makeRng(99)
    for (let i = 0; i < 200; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('spawnConfettiBatch', () => {
  it('returns the requested count of particles', () => {
    const out = spawnConfettiBatch({
      count: CONFETTI_PB_COUNT,
      palette: CONFETTI_PALETTE_PB,
      seed: 1,
    })
    expect(out.length).toBe(CONFETTI_PB_COUNT)
  })

  it('returns the larger record-count batch', () => {
    const out = spawnConfettiBatch({
      count: CONFETTI_RECORD_COUNT,
      palette: CONFETTI_PALETTE_RECORD,
      seed: 7,
    })
    expect(out.length).toBe(CONFETTI_RECORD_COUNT)
  })

  it('returns an empty batch for non-positive count', () => {
    expect(
      spawnConfettiBatch({
        count: 0,
        palette: CONFETTI_PALETTE_PB,
        seed: 1,
      }),
    ).toEqual([])
    expect(
      spawnConfettiBatch({
        count: -3,
        palette: CONFETTI_PALETTE_PB,
        seed: 1,
      }),
    ).toEqual([])
  })

  it('returns an empty batch when the palette is empty', () => {
    expect(
      spawnConfettiBatch({ count: 10, palette: [], seed: 1 }),
    ).toEqual([])
  })

  it('places every particle at the supplied origin', () => {
    const out = spawnConfettiBatch({
      count: 12,
      palette: CONFETTI_PALETTE_PB,
      seed: 2,
      origin: { x: 0.25, y: 0.6 },
    })
    for (const p of out) {
      expect(p.x).toBeCloseTo(0.25, 5)
      expect(p.y).toBeCloseTo(0.6, 5)
    }
  })

  it('paints every particle from the supplied palette', () => {
    const out = spawnConfettiBatch({
      count: 60,
      palette: CONFETTI_PALETTE_RECORD,
      seed: 3,
    })
    const palette = new Set(CONFETTI_PALETTE_RECORD)
    for (const p of out) {
      expect(palette.has(p.color)).toBe(true)
    }
  })

  it('initial vertical velocity is upward (negative y) under default spread', () => {
    const out = spawnConfettiBatch({
      count: 40,
      palette: CONFETTI_PALETTE_PB,
      seed: 5,
    })
    for (const p of out) {
      expect(p.vy).toBeLessThanOrEqual(0)
    }
  })

  it('respects velocity bounds via speed range', () => {
    const out = spawnConfettiBatch({
      count: 20,
      palette: CONFETTI_PALETTE_PB,
      seed: 9,
      speedMin: 0.5,
      speedMax: 0.5,
    })
    for (const p of out) {
      const mag = Math.hypot(p.vx, p.vy)
      expect(mag).toBeCloseTo(0.5, 5)
    }
  })

  it('respects size bounds', () => {
    const out = spawnConfettiBatch({
      count: 30,
      palette: CONFETTI_PALETTE_PB,
      seed: 11,
      sizeMin: 0.01,
      sizeMax: 0.02,
    })
    for (const p of out) {
      expect(p.size).toBeGreaterThanOrEqual(0.01)
      expect(p.size).toBeLessThanOrEqual(0.02)
    }
  })

  it('is deterministic for identical seed and inputs', () => {
    const a = spawnConfettiBatch({
      count: 25,
      palette: CONFETTI_PALETTE_PB,
      seed: 42,
    })
    const b = spawnConfettiBatch({
      count: 25,
      palette: CONFETTI_PALETTE_PB,
      seed: 42,
    })
    expect(a).toEqual(b)
  })

  it('different seeds produce different layouts', () => {
    const a = spawnConfettiBatch({
      count: 25,
      palette: CONFETTI_PALETTE_PB,
      seed: 1,
    })
    const b = spawnConfettiBatch({
      count: 25,
      palette: CONFETTI_PALETTE_PB,
      seed: 2,
    })
    // Compare by velocity magnitudes; some particles should differ.
    const speedsA = a.map((p) => Math.hypot(p.vx, p.vy)).join(',')
    const speedsB = b.map((p) => Math.hypot(p.vx, p.vy)).join(',')
    expect(speedsA).not.toBe(speedsB)
  })

  it('clamps spread to [0, PI]', () => {
    const out = spawnConfettiBatch({
      count: 20,
      palette: CONFETTI_PALETTE_PB,
      seed: 5,
      spread: 99,
    })
    expect(out.length).toBe(20)
  })
})

describe('stepConfetti', () => {
  it('applies gravity to vy', () => {
    const ps = spawnConfettiBatch({
      count: 4,
      palette: CONFETTI_PALETTE_PB,
      seed: 10,
    }).map((p) => ({ ...p, vx: 0, vy: 0 }))
    const before = ps.map((p) => p.vy)
    stepConfetti(ps, 1.0, 16, CONFETTI_GRAVITY, 1)
    for (let i = 0; i < ps.length; i++) {
      expect(ps[i]!.vy).toBeCloseTo(before[i]! + CONFETTI_GRAVITY, 5)
    }
  })

  it('moves particles by velocity * dt', () => {
    const ps = [
      {
        x: 0.5,
        y: 0.5,
        vx: 0.4,
        vy: -0.2,
        size: 0.01,
        color: '#fff',
        rot: 0,
        vrot: 0,
        ageMs: 0,
      },
    ]
    stepConfetti(ps, 0.5, 8, 0, 1)
    expect(ps[0]!.x).toBeCloseTo(0.7, 5)
    expect(ps[0]!.y).toBeCloseTo(0.4, 5)
  })

  it('applies multiplicative drag', () => {
    const ps = [
      {
        x: 0,
        y: 0,
        vx: 1,
        vy: 1,
        size: 0.01,
        color: '#fff',
        rot: 0,
        vrot: 0,
        ageMs: 0,
      },
    ]
    stepConfetti(ps, 1.0, 16, 0, 0.5)
    expect(ps[0]!.vx).toBeCloseTo(0.5, 5)
    expect(ps[0]!.vy).toBeCloseTo(0.5, 5)
  })

  it('increments ageMs by dtMs', () => {
    const ps = [
      {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 0.01,
        color: '#fff',
        rot: 0,
        vrot: 0,
        ageMs: 100,
      },
    ]
    stepConfetti(ps, 0.016, 16)
    expect(ps[0]!.ageMs).toBe(116)
  })

  it('rotates by vrot * dt', () => {
    const ps = [
      {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 0.01,
        color: '#fff',
        rot: 1,
        vrot: 4,
        ageMs: 0,
      },
    ]
    stepConfetti(ps, 0.5, 8, 0, 1)
    expect(ps[0]!.rot).toBeCloseTo(3, 5)
  })

  it('returns the same array (mutates in place)', () => {
    const ps = spawnConfettiBatch({
      count: 5,
      palette: CONFETTI_PALETTE_PB,
      seed: 1,
    })
    const out = stepConfetti(ps, 0.016, 16)
    expect(out).toBe(ps)
  })

  it('is a no-op for non-positive dtSec', () => {
    const ps = spawnConfettiBatch({
      count: 5,
      palette: CONFETTI_PALETTE_PB,
      seed: 1,
    })
    const snap = ps.map((p) => ({ ...p }))
    stepConfetti(ps, 0, 0)
    expect(ps).toEqual(snap)
  })
})

describe('confettiAlpha', () => {
  it('holds at 1 before the fade starts', () => {
    expect(confettiAlpha(0)).toBe(1)
    expect(confettiAlpha(CONFETTI_FADE_START_MS)).toBe(1)
    expect(confettiAlpha(CONFETTI_FADE_START_MS - 1)).toBe(1)
  })

  it('returns 0 once fully expired', () => {
    expect(confettiAlpha(CONFETTI_FADE_END_MS)).toBe(0)
    expect(confettiAlpha(CONFETTI_FADE_END_MS + 100)).toBe(0)
  })

  it('linearly ramps to zero across the fade window', () => {
    const mid = (CONFETTI_FADE_START_MS + CONFETTI_FADE_END_MS) / 2
    expect(confettiAlpha(mid)).toBeCloseTo(0.5, 5)
  })

  it('respects custom fade bounds', () => {
    expect(confettiAlpha(50, 0, 100)).toBeCloseTo(0.5, 5)
    expect(confettiAlpha(0, 0, 100)).toBe(1)
    expect(confettiAlpha(100, 0, 100)).toBe(0)
  })

  it('handles equal start and end without divide-by-zero', () => {
    expect(confettiAlpha(50, 100, 100)).toBe(1)
    expect(confettiAlpha(150, 100, 100)).toBe(0)
  })
})

describe('isBatchExpired', () => {
  it('returns true on an empty array', () => {
    expect(isBatchExpired([])).toBe(true)
  })

  it('returns false when any particle is still young', () => {
    const ps = [
      {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 0.01,
        color: '#fff',
        rot: 0,
        vrot: 0,
        ageMs: CONFETTI_FADE_END_MS - 1,
      },
      {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 0.01,
        color: '#fff',
        rot: 0,
        vrot: 0,
        ageMs: 0,
      },
    ]
    expect(isBatchExpired(ps)).toBe(false)
  })

  it('returns true once every particle has aged past the fade end', () => {
    const ps = [
      {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 0.01,
        color: '#fff',
        rot: 0,
        vrot: 0,
        ageMs: CONFETTI_FADE_END_MS + 10,
      },
      {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 0.01,
        color: '#fff',
        rot: 0,
        vrot: 0,
        ageMs: CONFETTI_FADE_END_MS + 100,
      },
    ]
    expect(isBatchExpired(ps)).toBe(true)
  })

  it('respects a custom fadeEndMs override', () => {
    const ps = [
      {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 0.01,
        color: '#fff',
        rot: 0,
        vrot: 0,
        ageMs: 600,
      },
    ]
    expect(isBatchExpired(ps, 500)).toBe(true)
    expect(isBatchExpired(ps, 1000)).toBe(false)
  })
})
