// Pure helpers for the start / finish line gate. The actual three.js mesh and
// texture wiring live in sceneBuilder.ts; these helpers exist so the math can
// be unit-tested without instantiating WebGL.

// Visual constants for the checkered start / finish stripe. Numbers chosen so
// the stripe reads as classic 8-square checks (roughly one square per 1u of
// world width) and is wide enough to feel like a real finish line, not a thin
// painted strip.
export const FINISH_STRIPE_DEPTH = 2.4 // Z extent (along travel direction)
export const FINISH_STRIPE_CHECK_COLUMNS = 8 // squares across the road
export const FINISH_STRIPE_CHECK_ROWS = 2 // squares deep (one row up, one down)
export const FINISH_TEXTURE_PIXELS_PER_SQUARE = 16

// Gate constants for the optional overhead banner / poles. Banner is drawn
// like a rectangular sign hanging between two side poles right at the finish
// line. Heights are in world units (the car is ~2.5 long for reference).
export const FINISH_GATE_POLE_HEIGHT = 5.5
export const FINISH_GATE_POLE_THICKNESS = 0.35
export const FINISH_GATE_BANNER_HEIGHT = 1.6
export const FINISH_GATE_BANNER_DEPTH = 0.2
// Pole sits just outside the road, banner spans the full road width plus a bit
// on each side so the supports are not crammed onto the asphalt edge.
export const FINISH_GATE_POLE_INSET = 0.6 // extra outward offset beyond the road's half-width
export const FINISH_GATE_BANNER_OVERHANG = 0.4

// Returns a Uint8Array of RGBA pixels encoding the classic black / white
// checkered pattern used for the finish stripe. The texture is sized to map
// `checkColumns x checkRows` checks onto a `pixelsPerSquare`-pixel-per-square
// canvas so the resulting bitmap stays crisp regardless of how the stripe is
// stretched in world space. Black squares are (0, 0, 0, 255); white squares
// are (255, 255, 255, 255). The (0, 0) corner is black so the pattern matches
// the classic checkered-flag convention with the same parity at each corner.
export function buildCheckerTexturePixels(
  checkColumns: number,
  checkRows: number,
  pixelsPerSquare: number,
): { pixels: Uint8Array; width: number; height: number } {
  if (
    !Number.isInteger(checkColumns) ||
    !Number.isInteger(checkRows) ||
    !Number.isInteger(pixelsPerSquare) ||
    checkColumns < 1 ||
    checkRows < 1 ||
    pixelsPerSquare < 1
  ) {
    throw new Error(
      `buildCheckerTexturePixels requires positive integer dimensions; got ${checkColumns}x${checkRows} @ ${pixelsPerSquare}px`,
    )
  }
  const width = checkColumns * pixelsPerSquare
  const height = checkRows * pixelsPerSquare
  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sy = Math.floor(y / pixelsPerSquare)
    for (let x = 0; x < width; x++) {
      const sx = Math.floor(x / pixelsPerSquare)
      const isWhite = (sx + sy) % 2 === 1
      const off = (y * width + x) * 4
      const v = isWhite ? 255 : 0
      pixels[off] = v
      pixels[off + 1] = v
      pixels[off + 2] = v
      pixels[off + 3] = 255
    }
  }
  return { pixels, width, height }
}

// Compute the world-space pole positions for the finish gate given the
// finish-line midpoint, the heading along travel direction, and the road's
// half-width. Returns two points, one on the left-hand side and one on the
// right, each pushed `inset` beyond the road edge. Coordinates are in the
// y=0 plane (caller stacks vertical extent).
export interface PolePositions {
  left: { x: number; z: number }
  right: { x: number; z: number }
}
export function computeGatePolePositions(
  finishX: number,
  finishZ: number,
  heading: number,
  trackHalfWidth: number,
  inset: number = FINISH_GATE_POLE_INSET,
): PolePositions {
  // Right-hand perpendicular for a +Y-up frame heading in (cos h, 0, sin h):
  // perpendicular is (sin h, 0, -cos h). The left side is the negation.
  const offset = trackHalfWidth + inset
  const px = Math.sin(heading) * offset
  const pz = -Math.cos(heading) * offset
  return {
    left: { x: finishX - px, z: finishZ - pz },
    right: { x: finishX + px, z: finishZ + pz },
  }
}

// Distance between the two gate poles. Useful for sizing the banner span.
export function gatePoleSeparation(positions: PolePositions): number {
  return Math.hypot(
    positions.right.x - positions.left.x,
    positions.right.z - positions.left.z,
  )
}
