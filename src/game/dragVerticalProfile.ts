// Vertical profile for drag strips. A strip is laid out flat in the (row, col)
// grid for the existing track-piece system, but visually and physically it can
// rise and fall along its length. The profile stores keyframes of (s, height)
// where s is arc length in world units along the strip and height is the y
// offset in world units. heightAt and slopeAt are pure piecewise smoothstep
// interpolations between adjacent keyframes, so adjacent segments join with
// zero local slope at every keyframe (C1 across the whole profile). The
// per-frame physics term in dragTick reads slopeAt and converts it into a
// gravity-along-slope acceleration; the renderer reads heightAt to extrude
// the road ribbon and to place the car y at runtime.
//
// The profile lives on the strip config, not on the persisted Track schema.
// That keeps closed-loop tracks and existing leaderboards entirely unaffected.

export interface VerticalProfileKeyframe {
  s: number
  height: number
}

export type VerticalProfile = readonly VerticalProfileKeyframe[]

export const FLAT_PROFILE: VerticalProfile = [
  { s: 0, height: 0 },
  { s: 1, height: 0 },
]

// Build a keyframe list from a normalized profile (s in [0, 1]) by scaling to
// the strip's world length. Keeps strip configs scannable: authors think in
// fractions of the strip, the math runs in world units.
export function verticalProfileFromNormalized(
  worldLength: number,
  points: readonly { sFrac: number; height: number }[],
): VerticalProfile {
  if (points.length < 2) {
    return FLAT_PROFILE
  }
  return points.map((p) => ({
    s: clamp(p.sFrac, 0, 1) * worldLength,
    height: p.height,
  }))
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function findSegment(
  profile: VerticalProfile,
  s: number,
): { a: VerticalProfileKeyframe; b: VerticalProfileKeyframe; t: number } {
  const sClamped = clamp(s, profile[0].s, profile[profile.length - 1].s)
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i]
    const b = profile[i + 1]
    if (sClamped <= b.s) {
      const span = b.s - a.s
      const t = span > 1e-9 ? (sClamped - a.s) / span : 0
      return { a, b, t }
    }
  }
  const last = profile[profile.length - 1]
  return { a: last, b: last, t: 0 }
}

// Smoothstep: t * t * (3 - 2 * t). Derivative: 6 * t * (1 - t). Zero at the
// segment endpoints, so adjacent segments join with continuous derivative.
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function smoothstepDerivative(t: number): number {
  return 6 * t * (1 - t)
}

export function heightAt(profile: VerticalProfile, s: number): number {
  if (profile.length === 0) return 0
  const { a, b, t } = findSegment(profile, s)
  return a.height + (b.height - a.height) * smoothstep(t)
}

// Local pitch in radians. Positive means uphill in the +s direction. Returns
// the angle whose tangent is dHeight/ds (rise over run); a 5 percent grade is
// atan(0.05) which is about 0.05 rad.
export function slopeAt(profile: VerticalProfile, s: number): number {
  if (profile.length < 2) return 0
  const { a, b, t } = findSegment(profile, s)
  const span = b.s - a.s
  if (span <= 1e-9) return 0
  const dHeightDs = ((b.height - a.height) * smoothstepDerivative(t)) / span
  return Math.atan(dHeightDs)
}

// Project a planar (x, z) position onto the spawn-direction axis to recover
// arc length along a straight strip. All four shipping drag strips lay
// out cells along a single column so the spawn-direction projection is
// monotonic and lossless. The convention matches the rest of the game
// engine: heading 0 points along +x and increases CCW, so the unit
// tangent is (cos(heading), -sin(heading)).
//
// Used by the physics tick (to look up slope under the car), the scene
// builder (to bake y into the road and skirt vertices), and the rAF
// loop (to place the player and ghost meshes at the right height).
// Centralizing the projection keeps the three paths from drifting in
// sign or basis.
export interface SpawnAxis {
  position: { x: number; z: number }
  heading: number
}

export function projectArcLengthOnSpawnAxis(
  point: { x: number; z: number },
  spawn: SpawnAxis,
): number {
  const dx = point.x - spawn.position.x
  const dz = point.z - spawn.position.z
  const tx = Math.cos(spawn.heading)
  const tz = -Math.sin(spawn.heading)
  const projection = dx * tx + dz * tz
  if (!Number.isFinite(projection)) return 0
  return Math.max(0, projection)
}

export interface PathLikePoint {
  x: number
  z: number
  y?: number
  pitch?: number
}

// Returns a fresh array with y and pitch populated from the profile based on
// each point's arc length along the path, computed cumulatively from the
// supplied (x, z) samples. Callers that already have an arc-length value per
// sample can use the lower-level heightAt / slopeAt directly; this helper
// covers the common path-flatten-then-bake case.
export function bakeProfileIntoPath(
  points: readonly PathLikePoint[],
  profile: VerticalProfile,
): PathLikePoint[] {
  if (points.length === 0) return []
  let cum = 0
  const out: PathLikePoint[] = [
    {
      x: points[0].x,
      z: points[0].z,
      y: heightAt(profile, 0),
      pitch: slopeAt(profile, 0),
    },
  ]
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dz = points[i].z - points[i - 1].z
    cum += Math.hypot(dx, dz)
    out.push({
      x: points[i].x,
      z: points[i].z,
      y: heightAt(profile, cum),
      pitch: slopeAt(profile, cum),
    })
  }
  return out
}

// Total arc length spanned by the profile keyframes. Useful for renderers that
// need to know the visual extent without re-deriving it from the path.
export function profileLength(profile: VerticalProfile): number {
  if (profile.length === 0) return 0
  return profile[profile.length - 1].s - profile[0].s
}
