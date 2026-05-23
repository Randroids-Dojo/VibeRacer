import { describe, expect, it } from 'vitest'
import {
  OVERHEAD_DEFAULT_HEIGHT,
  OVERHEAD_MAX_HEIGHT,
  OVERHEAD_MIN_HEIGHT,
  OVERHEAD_PAN_MAX,
  WHEEL_STEP_RATIO,
  clampOverheadHeight,
  clampPanOffset,
  heightAfterPinch,
  heightAfterWheel,
  pixelDragToPanDelta,
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

describe('clampPanOffset', () => {
  it('passes a vector inside the radius through unchanged', () => {
    const out = clampPanOffset(20, -30)
    expect(out.x).toBeCloseTo(20, 4)
    expect(out.z).toBeCloseTo(-30, 4)
  })
  it('rescales a vector outside the radius to land on the boundary', () => {
    const farX = OVERHEAD_PAN_MAX * 3
    const farZ = OVERHEAD_PAN_MAX * 4
    const out = clampPanOffset(farX, farZ)
    const r = Math.hypot(out.x, out.z)
    expect(r).toBeCloseTo(OVERHEAD_PAN_MAX, 3)
    // Direction preserved.
    expect(Math.atan2(out.z, out.x)).toBeCloseTo(Math.atan2(farZ, farX), 4)
  })
  it('treats a custom max radius', () => {
    const out = clampPanOffset(80, 0, 50)
    expect(out.x).toBeCloseTo(50, 4)
    expect(out.z).toBeCloseTo(0, 4)
  })
  it('zeroes non-finite components', () => {
    const out = clampPanOffset(Number.NaN, 10)
    expect(out.x).toBe(0)
    expect(out.z).toBeCloseTo(10, 4)
  })
})

describe('pixelDragToPanDelta', () => {
  // Hand-wired numbers so the sign conventions stay readable. The
  // camera at H=100 with fov 60 sees a vertical extent of
  // 2 * 100 * tan(30deg) = 115.47 m at the ground.
  const W = 1000
  const H = 1000
  const camH = 100
  const fov = 60

  it('returns zeros for degenerate input', () => {
    expect(pixelDragToPanDelta(10, 10, 0, 100, 100, 60)).toEqual({ dx: 0, dz: 0 })
    expect(pixelDragToPanDelta(10, 10, 100, 0, 100, 60)).toEqual({ dx: 0, dz: 0 })
    expect(pixelDragToPanDelta(Number.NaN, 0, 100, 100, 100, 60)).toEqual({ dx: 0, dz: 0 })
  })

  it('drag right gives a negative camera dx (pan camera left)', () => {
    // 100 pixels right on a 1000 px wide square viewport = 10% of
    // horizontal extent. visibleV = 115.47 at the parameters above
    // and aspect 1, so visibleH = 115.47. 10% = 11.547. Camera
    // moves the opposite direction, so dx = -11.547.
    const out = pixelDragToPanDelta(100, 0, W, H, camH, fov)
    expect(out.dx).toBeCloseTo(-11.547, 2)
    expect(out.dz).toBeCloseTo(0, 4)
  })

  it('drag down (positive pixel dy) gives a negative camera dz', () => {
    const out = pixelDragToPanDelta(0, 100, W, H, camH, fov)
    expect(out.dx).toBeCloseTo(0, 4)
    expect(out.dz).toBeCloseTo(-11.547, 2)
  })

  it('scales with camera height (zoomed out moves faster per pixel)', () => {
    const close = pixelDragToPanDelta(100, 0, W, H, 50, fov)
    const far = pixelDragToPanDelta(100, 0, W, H, 200, fov)
    expect(Math.abs(far.dx)).toBeGreaterThan(Math.abs(close.dx) * 3)
  })
})
