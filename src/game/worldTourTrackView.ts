/**
 * AiTrackView built from the existing world-tour rail. The AI tick reads
 * three things from the track:
 *
 *   `centerXAt(progress)`  - the centerline world x at this arc-length.
 *   `curveAt(progress)`    - signed curve in [-1, 1] for braking decisions.
 *   `roadHalfWidth`        - lateral budget for the racing line.
 *
 * The session already has a `WorldTourRail` (a closed polyline with
 * per-sample heading and cumulative arc length). `centerXAt` is just a
 * rail sample on the centerline; `curveAt` is a finite difference of
 * heading over a short arc window normalized against the tightest
 * authored corner so a 90-degree corner over a few meters reads as a
 * unit-magnitude curve. Positive curve means the road bends to the
 * right, matching `worldTourAi.ts` convention.
 *
 * Pure. No three.js imports, no IO. Used by the tour route to feed the
 * AI tick with the actual rendered track instead of the legacy flat
 * straight stub.
 */

import type { AiTrackView } from './worldTourAi'
import { sampleRailAt, type WorldTourRail } from './worldTourRail'
import { DEFAULT_TRACK_WIDTH } from './trackWidth'

// Arc-length window used to estimate curve via heading finite
// difference. Two meters in either direction keeps the estimate stable
// against single-sample noise on the rail while still resolving the
// tightest authored sweeps.
const CURVE_SAMPLE_HALF_WINDOW_M = 2

// Reference corner the curve estimate is normalized against. A turn
// that sweeps PI / 2 radians (90 degrees) over CURVE_REFERENCE_ARC_M
// meters maps to a unit curve magnitude. Picked to match the tightest
// authored sweeps in `trackTemplates.ts` so the AI brakes meaningfully
// on real corners without saturating on every gentle bend.
const CURVE_REFERENCE_ARC_M = 14

/**
 * Build an `AiTrackView` over a closed rail. Returns a stable object
 * (no per-call allocations beyond closure capture) that wraps progress
 * around `rail.totalLength` so callers can advance a single scalar
 * without worrying about lap rollover.
 *
 * If the rail is degenerate (zero length or fewer than two samples)
 * the view falls back to a flat straight at x = 0 so the AI does not
 * crash; the renderer guards against that case before mounting.
 */
export function buildAiTrackView(rail: WorldTourRail): AiTrackView {
  const halfWidth = DEFAULT_TRACK_WIDTH / 2
  if (rail.totalLength <= 0 || rail.samples.length < 2) {
    return {
      centerXAt: () => 0,
      curveAt: () => 0,
      roadHalfWidth: halfWidth,
    }
  }

  function wrap(d: number): number {
    let v = d % rail.totalLength
    if (v < 0) v += rail.totalLength
    return v
  }

  // Heading change from one rail-sample heading to another, taking the
  // shortest arc through the unit circle so a wrap across +/- PI does
  // not register as a near-full-turn spike.
  function shortestHeadingDelta(a: number, b: number): number {
    let d = b - a
    if (d > Math.PI) d -= 2 * Math.PI
    if (d < -Math.PI) d += 2 * Math.PI
    return d
  }

  return {
    centerXAt: (progress: number) => sampleRailAt(rail, wrap(progress), 0).x,
    curveAt: (progress: number) => {
      const here = wrap(progress)
      const behind = sampleRailAt(rail, here - CURVE_SAMPLE_HALF_WINDOW_M, 0)
      const ahead = sampleRailAt(rail, here + CURVE_SAMPLE_HALF_WINDOW_M, 0)
      const delta = shortestHeadingDelta(behind.heading, ahead.heading)
      // Heading convention in worldTourRail samples: 0 = +X (east),
      // increasing CCW. A road that bends to the right (CW from the
      // driver's frame) decreases the heading, so the raw delta is
      // negative. `worldTourAi.ts` expects positive curve to mean
      // "bends right," so we flip the sign here.
      const referenceArc = CURVE_REFERENCE_ARC_M
      const ratio = -delta / (Math.PI / 2) * (referenceArc / (2 * CURVE_SAMPLE_HALF_WINDOW_M))
      if (ratio > 1) return 1
      if (ratio < -1) return -1
      return ratio
    },
    centerlineAt: (progress: number) => sampleRailAt(rail, wrap(progress), 0),
    roadHalfWidth: halfWidth,
  }
}
