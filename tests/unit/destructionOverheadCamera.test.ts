import { describe, expect, it } from 'vitest'
import {
  OVERHEAD_DEFAULT_HEIGHT,
  OVERHEAD_MAX_HEIGHT,
  OVERHEAD_MIN_HEIGHT,
  WHEEL_STEP_RATIO,
  clampOverheadHeight,
  heightAfterPinch,
  heightAfterWheel,
} from '@/game/destruction/overheadCamera'

describe('clampOverheadHeight', () => {
  it('passes values inside the range through', () => {
    expect(clampOverheadHeight(OVERHEAD_DEFAULT_HEIGHT)).toBe(OVERHEAD_DEFAULT_HEIGHT)
    expect(clampOverheadHeight(100)).toBe(100)
  })
  it('clamps below the minimum', () => {
    expect(clampOverheadHeight(OVERHEAD_MIN_HEIGHT - 10)).toBe(OVERHEAD_MIN_HEIGHT)
    expect(clampOverheadHeight(0)).toBe(OVERHEAD_MIN_HEIGHT)
    expect(clampOverheadHeight(-50)).toBe(OVERHEAD_MIN_HEIGHT)
  })
  it('clamps above the maximum', () => {
    expect(clampOverheadHeight(OVERHEAD_MAX_HEIGHT + 100)).toBe(OVERHEAD_MAX_HEIGHT)
  })
  it('falls back to default for non-finite input', () => {
    expect(clampOverheadHeight(Number.NaN)).toBe(OVERHEAD_DEFAULT_HEIGHT)
    expect(clampOverheadHeight(Number.POSITIVE_INFINITY)).toBe(OVERHEAD_MAX_HEIGHT)
  })
})

describe('heightAfterWheel', () => {
  it('zoom out (deltaY > 0) raises the camera by stepRatio', () => {
    const before = 100
    const after = heightAfterWheel(before, 100)
    expect(after).toBeCloseTo(before * WHEEL_STEP_RATIO, 4)
  })
  it('zoom in (deltaY < 0) lowers the camera by stepRatio', () => {
    const before = 100
    const after = heightAfterWheel(before, -100)
    expect(after).toBeCloseTo(before / WHEEL_STEP_RATIO, 4)
  })
  it('clamps at the maximum on repeated zoom-out', () => {
    let h = OVERHEAD_MAX_HEIGHT - 10
    for (let i = 0; i < 30; i++) h = heightAfterWheel(h, 100)
    expect(h).toBe(OVERHEAD_MAX_HEIGHT)
  })
  it('clamps at the minimum on repeated zoom-in', () => {
    let h = OVERHEAD_MIN_HEIGHT + 10
    for (let i = 0; i < 30; i++) h = heightAfterWheel(h, -100)
    expect(h).toBe(OVERHEAD_MIN_HEIGHT)
  })
  it('returns the clamped current height on zero / non-finite deltaY', () => {
    expect(heightAfterWheel(120, 0)).toBe(120)
    expect(heightAfterWheel(120, Number.NaN)).toBe(120)
  })
  it('treats any positive deltaY as a single step (not magnitude-scaled)', () => {
    // Common mistake: scaling height by deltaY linearly. We use a
    // fixed ratio per notch so a trackpad's tiny deltas do not
    // create micro-zoom drift.
    expect(heightAfterWheel(100, 1)).toBe(heightAfterWheel(100, 9999))
  })
})

describe('heightAfterPinch', () => {
  it('fingers spreading apart lowers the camera (zoom in)', () => {
    const initialH = 100
    const out = heightAfterPinch(initialH, 50, 100)
    // ratio = 50 / 100 = 0.5, new height = 50.
    expect(out).toBeCloseTo(50, 4)
  })
  it('fingers closing together raises the camera (zoom out)', () => {
    const initialH = 100
    const out = heightAfterPinch(initialH, 100, 50)
    // ratio = 100 / 50 = 2, new height = 200.
    expect(out).toBeCloseTo(200, 4)
  })
  it('keeps the initial height when fingers stay at the same distance', () => {
    const initialH = 100
    expect(heightAfterPinch(initialH, 80, 80)).toBeCloseTo(initialH, 4)
  })
  it('clamps the result into the valid range', () => {
    expect(heightAfterPinch(OVERHEAD_MAX_HEIGHT, 100, 1)).toBe(OVERHEAD_MAX_HEIGHT)
    expect(heightAfterPinch(OVERHEAD_MIN_HEIGHT, 1, 100)).toBe(OVERHEAD_MIN_HEIGHT)
  })
  it('falls back to the initial height on degenerate input', () => {
    expect(heightAfterPinch(120, 0, 50)).toBe(120)
    expect(heightAfterPinch(120, 50, 0)).toBe(120)
    expect(heightAfterPinch(120, -10, 50)).toBe(120)
    expect(heightAfterPinch(120, 50, Number.NaN)).toBe(120)
  })
})
