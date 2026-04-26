import { describe, it, expect } from 'vitest'
import {
  SKID_MARK_BASE_ALPHA,
  SKID_MARK_FADE_MS,
  SKID_MARK_POOL_SIZE,
  SKID_SPAWN_INTERVAL_MS,
  SKID_SPAWN_MIN_INTENSITY,
  SKID_SPAWN_MIN_SPEED,
  nextSkidMarkIndex,
  shouldSpawnSkidMark,
  skidMarkAlpha,
  skidMarkPeakAlpha,
} from '@/game/skidMarks'

describe('shouldSpawnSkidMark', () => {
  it('refuses when intensity is below threshold', () => {
    const out = shouldSpawnSkidMark(
      SKID_SPAWN_MIN_INTENSITY - 0.01,
      30,
      SKID_SPAWN_INTERVAL_MS,
    )
    expect(out.spawn).toBe(false)
  })

  it('refuses when speed is below the floor', () => {
    const out = shouldSpawnSkidMark(
      0.9,
      SKID_SPAWN_MIN_SPEED - 0.5,
      SKID_SPAWN_INTERVAL_MS * 2,
    )
    expect(out.spawn).toBe(false)
  })

  it('refuses when the spawn interval has not elapsed', () => {
    const out = shouldSpawnSkidMark(
      0.9,
      30,
      SKID_SPAWN_INTERVAL_MS - 1,
    )
    expect(out.spawn).toBe(false)
  })

  it('spawns when intensity, speed, and interval all clear', () => {
    const out = shouldSpawnSkidMark(0.9, 30, SKID_SPAWN_INTERVAL_MS)
    expect(out.spawn).toBe(true)
    expect(out.intervalMs).toBe(SKID_SPAWN_INTERVAL_MS)
  })

  it('honors a custom interval override', () => {
    const out = shouldSpawnSkidMark(0.9, 30, 49, 50)
    expect(out.spawn).toBe(false)
    const out2 = shouldSpawnSkidMark(0.9, 30, 50, 50)
    expect(out2.spawn).toBe(true)
    expect(out2.intervalMs).toBe(50)
  })
})

describe('skidMarkAlpha', () => {
  it('returns the peak at age 0', () => {
    expect(skidMarkAlpha(0, 0.5)).toBe(0.5)
  })

  it('reaches zero at the end of the fade window', () => {
    expect(skidMarkAlpha(SKID_MARK_FADE_MS, 1)).toBe(0)
    expect(skidMarkAlpha(SKID_MARK_FADE_MS + 100, 1)).toBe(0)
  })

  it('linearly interpolates between peak and zero', () => {
    const half = skidMarkAlpha(SKID_MARK_FADE_MS / 2, 1)
    expect(half).toBeCloseTo(0.5, 6)
  })

  it('clamps the peak input to [0, 1]', () => {
    expect(skidMarkAlpha(0, -1)).toBe(0)
    expect(skidMarkAlpha(0, 1.5)).toBe(1)
  })

  it('honors a custom fade window', () => {
    expect(skidMarkAlpha(50, 1, 100)).toBeCloseTo(0.5, 6)
    expect(skidMarkAlpha(100, 1, 100)).toBe(0)
  })
})

describe('skidMarkPeakAlpha', () => {
  it('scales with intensity up to the configured base', () => {
    expect(skidMarkPeakAlpha(0)).toBe(0)
    expect(skidMarkPeakAlpha(1)).toBe(SKID_MARK_BASE_ALPHA)
    expect(skidMarkPeakAlpha(0.5)).toBeCloseTo(SKID_MARK_BASE_ALPHA * 0.5, 6)
  })

  it('clamps negative intensity to zero', () => {
    expect(skidMarkPeakAlpha(-0.3)).toBe(0)
  })

  it('clamps intensity over 1 to the configured base', () => {
    expect(skidMarkPeakAlpha(2)).toBe(SKID_MARK_BASE_ALPHA)
  })
})

describe('nextSkidMarkIndex', () => {
  it('wraps at the pool boundary', () => {
    expect(nextSkidMarkIndex(SKID_MARK_POOL_SIZE - 1)).toBe(0)
  })

  it('advances by one within the pool', () => {
    expect(nextSkidMarkIndex(0)).toBe(1)
    expect(nextSkidMarkIndex(7)).toBe(8)
  })

  it('honors a custom pool size', () => {
    expect(nextSkidMarkIndex(2, 3)).toBe(0)
    expect(nextSkidMarkIndex(0, 3)).toBe(1)
  })

  it('returns 0 when pool size is zero (defensive)', () => {
    expect(nextSkidMarkIndex(5, 0)).toBe(0)
  })
})
