import { describe, expect, it } from 'vitest'
import {
  FINISH_GATE_POLE_INSET,
  FINISH_STRIPE_CHECK_COLUMNS,
  FINISH_STRIPE_CHECK_ROWS,
  FINISH_TEXTURE_PIXELS_PER_SQUARE,
  buildCheckerTexturePixels,
  computeGatePolePositions,
  gatePoleSeparation,
} from '@/game/finishLine'

describe('buildCheckerTexturePixels', () => {
  it('produces an RGBA buffer sized columns*ppr by rows*ppr', () => {
    const out = buildCheckerTexturePixels(8, 2, 16)
    expect(out.width).toBe(128)
    expect(out.height).toBe(32)
    expect(out.pixels.length).toBe(128 * 32 * 4)
  })

  it('starts black at the top-left corner', () => {
    const { pixels } = buildCheckerTexturePixels(2, 2, 4)
    expect(pixels[0]).toBe(0)
    expect(pixels[1]).toBe(0)
    expect(pixels[2]).toBe(0)
    expect(pixels[3]).toBe(255)
  })

  it('alternates parity each square', () => {
    const ppr = 4
    const cols = 4
    const { pixels, width } = buildCheckerTexturePixels(cols, 1, ppr)
    function sampleSquareCenter(sx: number, sy: number): number {
      const x = sx * ppr + Math.floor(ppr / 2)
      const y = sy * ppr + Math.floor(ppr / 2)
      return pixels[(y * width + x) * 4]
    }
    expect(sampleSquareCenter(0, 0)).toBe(0)
    expect(sampleSquareCenter(1, 0)).toBe(255)
    expect(sampleSquareCenter(2, 0)).toBe(0)
    expect(sampleSquareCenter(3, 0)).toBe(255)
  })

  it('flips parity row to row to keep checkered alignment', () => {
    const ppr = 2
    const { pixels, width } = buildCheckerTexturePixels(2, 2, ppr)
    function sampleSquareCenter(sx: number, sy: number): number {
      const x = sx * ppr + 1
      const y = sy * ppr + 1
      return pixels[(y * width + x) * 4]
    }
    expect(sampleSquareCenter(0, 0)).toBe(0)
    expect(sampleSquareCenter(1, 0)).toBe(255)
    expect(sampleSquareCenter(0, 1)).toBe(255)
    expect(sampleSquareCenter(1, 1)).toBe(0)
  })

  it('writes opaque alpha for every pixel', () => {
    const { pixels } = buildCheckerTexturePixels(3, 3, 2)
    for (let i = 3; i < pixels.length; i += 4) {
      expect(pixels[i]).toBe(255)
    }
  })

  it('rejects non-integer or non-positive dimensions', () => {
    expect(() => buildCheckerTexturePixels(0, 2, 4)).toThrow()
    expect(() => buildCheckerTexturePixels(2, 0, 4)).toThrow()
    expect(() => buildCheckerTexturePixels(2, 2, 0)).toThrow()
    expect(() => buildCheckerTexturePixels(2.5, 2, 4)).toThrow()
    expect(() => buildCheckerTexturePixels(2, 2, 1.5)).toThrow()
  })

  it('exports the constants the renderer wires into the texture', () => {
    expect(FINISH_STRIPE_CHECK_COLUMNS).toBeGreaterThan(1)
    expect(FINISH_STRIPE_CHECK_ROWS).toBeGreaterThan(0)
    expect(FINISH_TEXTURE_PIXELS_PER_SQUARE).toBeGreaterThan(0)
  })
})

describe('computeGatePolePositions', () => {
  it('places poles perpendicular to heading on each side of the road', () => {
    // Heading 0 means traveling along +X (east); perpendicular is the Z axis.
    // Road half-width 4 + inset 0.6 -> poles at z = +/-4.6.
    const out = computeGatePolePositions(0, 0, 0, 4)
    expect(out.left.x).toBeCloseTo(0, 6)
    expect(out.right.x).toBeCloseTo(0, 6)
    expect(out.left.z).toBeCloseTo(-(4 + FINISH_GATE_POLE_INSET), 6)
    expect(out.right.z).toBeCloseTo(4 + FINISH_GATE_POLE_INSET, 6)
  })

  it('respects custom inset', () => {
    const out = computeGatePolePositions(10, 20, 0, 4, 1)
    expect(out.left.z).toBeCloseTo(20 - 5, 6)
    expect(out.right.z).toBeCloseTo(20 + 5, 6)
    expect(out.left.x).toBeCloseTo(10, 6)
    expect(out.right.x).toBeCloseTo(10, 6)
  })

  it('rotates with heading so a north-bound stretch puts poles east / west', () => {
    // Game convention: heading PI/2 means traveling along -Z (north). The
    // driver's right is +X (east), left is -X (west).
    const out = computeGatePolePositions(0, 0, Math.PI / 2, 4, 0)
    expect(out.left.x).toBeCloseTo(-4, 6)
    expect(out.right.x).toBeCloseTo(4, 6)
    expect(out.left.z).toBeCloseTo(0, 6)
    expect(out.right.z).toBeCloseTo(0, 6)
  })

  it('places poles perpendicular to travel on diagonal headings', () => {
    // Regression: the previous formula (sin h, -cos h) collapsed onto the
    // travel axis at heading PI/4, putting both poles in front of and behind
    // the finish line instead of beside it. The fix is (sin h, cos h).
    const out = computeGatePolePositions(0, 0, Math.PI / 4, 4, 0)
    // Travel direction at h = PI/4 is (cos h, -sin h); the pole separation
    // vector should be perpendicular to it (zero dot product).
    const tx = Math.cos(Math.PI / 4)
    const tz = -Math.sin(Math.PI / 4)
    const dx = out.right.x - out.left.x
    const dz = out.right.z - out.left.z
    expect(tx * dx + tz * dz).toBeCloseTo(0, 6)
  })

  it('keeps poles centered on the finish-line point', () => {
    const out = computeGatePolePositions(7, -3, Math.PI / 4, 5, 0.5)
    const midX = (out.left.x + out.right.x) / 2
    const midZ = (out.left.z + out.right.z) / 2
    expect(midX).toBeCloseTo(7, 6)
    expect(midZ).toBeCloseTo(-3, 6)
  })

  it('separation equals 2 * (halfWidth + inset)', () => {
    const out = computeGatePolePositions(0, 0, 1.234, 4, 0.6)
    expect(gatePoleSeparation(out)).toBeCloseTo(2 * (4 + 0.6), 6)
  })
})
