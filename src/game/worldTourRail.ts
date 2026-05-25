/**
 * Lightweight kinematic rail for World Tour opponent AI. Flattens a
 * `TrackPath` into a single closed polyline with cumulative arc length
 * so each AI car can advance a scalar "distance along the loop" and
 * sample the world position + heading at that distance.
 *
 * Pure: no Three.js imports, no IO. The renderer consumes the result
 * via the `opponentsRef` on `RaceCanvas`. Used as an MVP stand-in for
 * full multi-car physics: opponents follow the centerline at a per-car
 * target speed and lane offset, so they read as "racing alongside" the
 * player without colliding into the player's `stepPhysics` simulation.
 */

import type { OrderedPiece, SampledPoint, TrackPath } from './trackPath'

export interface WorldTourRail {
  // Flat list of (x, z, heading) samples along the loop. The first
  // sample is at the start line; the last sample is just before the
  // start line again (the loop closes at totalLength).
  readonly samples: ReadonlyArray<SampledPoint>
  // cumulative[i] is the arc length from samples[0] to samples[i].
  // cumulative[0] === 0; cumulative.at(-1) === totalLength.
  readonly cumulative: ReadonlyArray<number>
  readonly totalLength: number
}

const STRAIGHT_SUBDIVISIONS = 4

/**
 * Build the rail from a TrackPath. Pieces that carry baked samples
 * (sweeps, scurves) contribute their samples directly. Pieces without
 * samples (straights, 90 corners) are subdivided as straight chords
 * from entry to exit; this is exact for straights and a coarse chord
 * for corners (the MVP `top-gear-opener` only uses straights and
 * sweeps, so the chord fallback never trips).
 */
export function buildRail(path: TrackPath): WorldTourRail {
  const samples: SampledPoint[] = []
  for (const op of path.order) {
    const ops = pieceSamples(op)
    if (ops.length === 0) continue
    if (samples.length > 0) {
      const prev = samples[samples.length - 1]!
      const first = ops[0]!
      if (
        Math.hypot(prev.x - first.x, prev.z - first.z) < 1e-3
      ) {
        // Drop the duplicate seam sample so cumulative distance does
        // not stall at zero for one segment.
        samples.pop()
      }
    }
    samples.push(...ops)
  }
  const cumulative: number[] = new Array(samples.length).fill(0)
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!
    const b = samples[i]!
    cumulative[i] = cumulative[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z)
  }
  // Close the loop length so wrap-around is exact at the seam.
  const totalLength =
    samples.length >= 2
      ? cumulative[cumulative.length - 1]! +
        Math.hypot(
          samples[0]!.x - samples[samples.length - 1]!.x,
          samples[0]!.z - samples[samples.length - 1]!.z,
        )
      : 0
  return { samples, cumulative, totalLength }
}

function pieceSamples(op: OrderedPiece): SampledPoint[] {
  if (op.samples && op.samples.length > 0) {
    return op.samples.slice()
  }
  const dx = op.exit.x - op.entry.x
  const dz = op.exit.z - op.entry.z
  // SampledPoint heading convention: 0 = +X (east), increasing CCW.
  // See trackPath.ts sampleSweepRightLocal: `Math.atan2(-dz, dx)`.
  const heading = Math.atan2(-dz, dx)
  const out: SampledPoint[] = []
  for (let i = 0; i <= STRAIGHT_SUBDIVISIONS; i++) {
    const t = i / STRAIGHT_SUBDIVISIONS
    out.push({
      x: op.entry.x + dx * t,
      z: op.entry.z + dz * t,
      heading,
    })
  }
  return out
}

/**
 * Sample the rail at a given arc-length distance, with an optional
 * lateral offset to the "right" of travel. Distance is wrapped into
 * [0, totalLength) so callers can advance a single scalar without
 * worrying about lap rollover.
 */
export function sampleRailAt(
  rail: WorldTourRail,
  distance: number,
  lateral: number = 0,
): { x: number; z: number; heading: number } {
  const n = rail.samples.length
  if (rail.totalLength <= 0 || n < 2) {
    return { x: 0, z: 0, heading: 0 }
  }
  let d = distance % rail.totalLength
  if (d < 0) d += rail.totalLength
  const lastIdx = n - 1
  const lastCumulative = rail.cumulative[lastIdx]!
  let x0: number
  let z0: number
  let h: number
  if (d >= lastCumulative) {
    // Closing segment: interpolate between the last recorded sample
    // and the first one so a loop's seam is continuous instead of
    // collapsing to the last sample. `totalLength` already accounts
    // for the closing chord length.
    const a = rail.samples[lastIdx]!
    const b = rail.samples[0]!
    const segLen = rail.totalLength - lastCumulative
    const t = segLen > 1e-6 ? (d - lastCumulative) / segLen : 0
    x0 = a.x + (b.x - a.x) * t
    z0 = a.z + (b.z - a.z) * t
    h = lerpAngle(a.heading, b.heading, t)
  } else {
    // Linear search is fine for a few-hundred-sample rail; the AI loop
    // calls this O(opponents) times per frame, which is bounded at the
    // tour field size.
    let lo = 0
    let hi = lastIdx
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1
      if (rail.cumulative[mid]! <= d) lo = mid
      else hi = mid
    }
    const a = rail.samples[lo]!
    const b = rail.samples[hi]!
    const segLen = rail.cumulative[hi]! - rail.cumulative[lo]!
    const t = segLen > 1e-6 ? (d - rail.cumulative[lo]!) / segLen : 0
    x0 = a.x + (b.x - a.x) * t
    z0 = a.z + (b.z - a.z) * t
    h = lerpAngle(a.heading, b.heading, t)
  }
  // Right-of-travel perpendicular in this codebase's convention:
  // the road extrusion in sceneBuilder.polylineGeometry adds
  // (sin h, cos h) * halfWidth for the right edge, so the same vector
  // moves a centerline point right by `lateral` meters here.
  const lx = lateral * Math.sin(h)
  const lz = lateral * Math.cos(h)
  return { x: x0 + lx, z: z0 + lz, heading: h }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  if (d > Math.PI) d -= 2 * Math.PI
  if (d < -Math.PI) d += 2 * Math.PI
  return a + d * t
}

/**
 * Find the arc-length distance along the rail closest to a world
 * position `(x, z)`. Used by the AI tick to re-sync its `progress`
 * channel against the car's actual position so it does not drift
 * ahead of the rail over time (which causes the controller to chase
 * a phantom centerline 50 m further down the track).
 *
 * Returns 0 on a degenerate rail. When `hint` is supplied the search
 * starts from the rail sample closest to `hint` and walks outward
 * for `HINT_WINDOW_SAMPLES` samples on either side; without a hint
 * the search is linear over the full rail.
 */
const HINT_WINDOW_SAMPLES = 24

export function projectToRail(
  rail: WorldTourRail,
  x: number,
  z: number,
  hint?: number,
): number {
  const n = rail.samples.length
  if (rail.totalLength <= 0 || n < 2) return 0
  let bestIdx = 0
  let bestDist = Infinity
  if (typeof hint === 'number' && Number.isFinite(hint)) {
    let h = hint % rail.totalLength
    if (h < 0) h += rail.totalLength
    // Binary search for the sample whose cumulative arc length is
    // closest to `h`; the projection then walks a small window
    // around that index (wrapping around the seam) instead of
    // scanning the whole rail.
    let lo = 0
    let hi = n - 1
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1
      if (rail.cumulative[mid]! <= h) lo = mid
      else hi = mid
    }
    // Walk a wrap-aware window of `2 * HINT_WINDOW_SAMPLES + 1`
    // samples centered on `lo`. A naive `[lo - W, lo + W]` slice
    // misses the case where the car has just crossed the seam: the
    // hint sits near `totalLength` and the actual closest sample is
    // at index 0+. Modulo math handles the wrap.
    for (let off = -HINT_WINDOW_SAMPLES; off <= HINT_WINDOW_SAMPLES; off++) {
      let idx = (lo + off) % n
      if (idx < 0) idx += n
      const s = rail.samples[idx]!
      const dx = x - s.x
      const dz = z - s.z
      const d2 = dx * dx + dz * dz
      if (d2 < bestDist) {
        bestDist = d2
        bestIdx = idx
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      const s = rail.samples[i]!
      const dx = x - s.x
      const dz = z - s.z
      const d2 = dx * dx + dz * dz
      if (d2 < bestDist) {
        bestDist = d2
        bestIdx = i
      }
    }
  }
  // Refine the projection between the chosen sample and the neighbor
  // it forms a segment with. Picking the same-cumulative-arc-length
  // sample twice across ticks would snap the AI to discrete sample
  // points; the segment-refine gives sub-sample resolution.
  const aIdx = bestIdx
  const bIdx = bestIdx + 1 < n ? bestIdx + 1 : 0
  const a = rail.samples[aIdx]!
  const b = rail.samples[bIdx]!
  const segDx = b.x - a.x
  const segDz = b.z - a.z
  const segLen2 = segDx * segDx + segDz * segDz
  let segT = 0
  if (segLen2 > 1e-6) {
    segT = ((x - a.x) * segDx + (z - a.z) * segDz) / segLen2
    if (segT < 0) segT = 0
    if (segT > 1) segT = 1
  }
  const aArc = rail.cumulative[aIdx]!
  const bArc = bIdx === 0 ? rail.totalLength : rail.cumulative[bIdx]!
  return aArc + (bArc - aArc) * segT
}
