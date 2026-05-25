/**
 * AiTrackView built from the existing world-tour rail. The
 * pure-pursuit controller reads three things from the track:
 *
 *   `projectToRail(x, z, hint)`  - closest arc length on the rail
 *   `sampleAt(arc, lateral)`     - world pose at arc length, with a
 *                                  lateral offset to the right of travel
 *   `curveAt(arc)`               - signed curve in [-1, 1] for braking
 *
 * `projectToRail` keeps a wrap-aware search window around the hint
 * and refines to sub-sample resolution against the closest segment.
 * `sampleAt` wraps `arc` into `[0, totalLength)` and delegates to
 * `sampleRailAt`. `curveAt` is a finite difference of the rail's
 * heading over a short arc window, normalized so the tightest
 * authored sweeps map to a unit curve.
 *
 * Pure. No three.js imports, no IO.
 */

import type { AiTrackView } from './worldTourAi'
import {
  projectToRail,
  sampleRailAt,
  type WorldTourRail,
} from './worldTourRail'
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
 * (no per-call allocations beyond closure capture) that wraps arc
 * lengths around `rail.totalLength` so callers can advance a single
 * scalar without worrying about lap rollover.
 *
 * A degenerate rail (zero length or fewer than two samples) yields a
 * flat-straight view at x = 0 so the AI does not crash; the renderer
 * guards against that case before mounting.
 */
export function buildAiTrackView(rail: WorldTourRail): AiTrackView {
  const halfWidth = DEFAULT_TRACK_WIDTH / 2
  if (rail.totalLength <= 0 || rail.samples.length < 2) {
    return {
      totalLength: 0,
      projectToRail: () => 0,
      sampleAt: () => ({ x: 0, z: 0, heading: 0 }),
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
    totalLength: rail.totalLength,
    projectToRail: (x: number, z: number, hint: number) =>
      projectToRail(rail, x, z, hint),
    sampleAt: (arcLength: number, lateral: number) =>
      sampleRailAt(rail, wrap(arcLength), lateral),
    curveAt: (arcLength: number) => {
      const here = wrap(arcLength)
      const behind = sampleRailAt(rail, here - CURVE_SAMPLE_HALF_WINDOW_M, 0)
      const ahead = sampleRailAt(rail, here + CURVE_SAMPLE_HALF_WINDOW_M, 0)
      const delta = shortestHeadingDelta(behind.heading, ahead.heading)
      // Heading convention in worldTourRail samples: 0 = +X (east),
      // increasing CCW. A road that bends to the right (CW from the
      // driver's frame) decreases the heading, so the raw delta is
      // negative. `worldTourAi.ts` expects positive curve to mean
      // "bends right," so we flip the sign here.
      const referenceArc = CURVE_REFERENCE_ARC_M
      const ratio =
        -delta / (Math.PI / 2) * (referenceArc / (2 * CURVE_SAMPLE_HALF_WINDOW_M))
      if (ratio > 1) return 1
      if (ratio < -1) return -1
      return ratio
    },
    roadHalfWidth: halfWidth,
  }
}
