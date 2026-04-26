// Racing line overlay helpers. Given a Replay's [x, z, heading][] sample list,
// produce the geometry data needed to draw a thin colored polyline on top of
// the road that traces the path the ghost car will drive. The line is purely
// visual and lives behind a Settings toggle (showRacingLine, default off so
// the affordance is opt-in for players who want a coaching aid).
//
// Pure module: no Three.js imports. The renderer side
// (`buildRacingLineLayer` in `sceneBuilder.ts`) consumes these helpers and
// owns the actual `Line` mesh.

import type { Replay } from '@/lib/replay'

// World-Y lift. Slightly above the asphalt (y = 0) and the kerbs (y = 0.04)
// so the line reads as a coaching overlay floating just over the road instead
// of fighting z-buffer with the track surface or the curb stones.
export const RACING_LINE_LIFT_Y = 0.06

// Cyan to match the ghost car's emissive tint. Keeps the visual language
// consistent: the line is "where the ghost will drive".
export const RACING_LINE_COLOR_HEX = 0x55e0ff

// Line width hint for the renderer. Note: Three.js's WebGL `LineBasicMaterial`
// ignores `linewidth` on most platforms (it always renders at 1px), so the
// renderer typically falls back to the default width. Kept here so a future
// `Line2`-based renderer (which respects width) can pick this up.
export const RACING_LINE_WIDTH_PX = 2

// Convert a Replay's samples into a flat Float32Array of XYZ vertices suitable
// for `BufferAttribute('position', vertices, 3)` on a `BufferGeometry`. Y is
// constant at `liftY` so the line floats above the road.
//
// Returns `null` for fewer than 2 samples (a single point is not a line) or
// for non-finite coordinates so the caller can skip rebuild instead of pushing
// a malformed geometry into the GPU.
export function samplesToPolyline(
  samples: Replay['samples'] | null | undefined,
  liftY: number = RACING_LINE_LIFT_Y,
): Float32Array | null {
  if (!samples || samples.length < 2) return null
  if (!Number.isFinite(liftY)) return null
  const out = new Float32Array(samples.length * 3)
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    const x = s[0]
    const z = s[1]
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null
    const base = i * 3
    out[base] = x
    out[base + 1] = liftY
    out[base + 2] = z
  }
  return out
}

// Pure equality check for the rebuild gate. Returns true when the renderer
// needs to throw away its current geometry and build a fresh one. Reference
// equality is enough for the common case (the same Replay object is reused
// across frames) so this is a single pointer compare 99% of the time.
export function racingLineNeedsRebuild(
  prev: Replay | null | undefined,
  next: Replay | null | undefined,
): boolean {
  return prev !== next
}
