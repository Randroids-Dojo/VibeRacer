// Wrong-way detection. Compares the car's velocity direction to the expected
// direction of travel at its current position on the track and flips a flag
// when the car drives "backward" relative to lap direction. Used to surface
// a HUD warning so a player who turned around or drove through the start
// line in reverse knows why their lap is not progressing.
//
// All math is pure and unit-tested. The detector itself owns a small debounce
// (consecutive frames over the angle threshold) so a brief sideways slide
// does not flicker the warning on and off.

import { type OrderedPiece, type SampledPoint } from './trackPath'

// Angle (radians) between the car's heading-of-motion and the expected
// direction of travel that flips wrong-way ON. ~120 degrees: the car has to
// be pointing significantly against the loop direction, not just sliding
// sideways through a corner.
export const WRONG_WAY_ANGLE_THRESHOLD = (2 * Math.PI) / 3
// Speed (world units / second) below which detection is suppressed. A car
// crawling near zero has a noisy heading-of-motion, so we wait until it is
// actually moving before declaring intent.
export const WRONG_WAY_MIN_SPEED = 1.5
// Number of consecutive ticks over the angle threshold before the warning
// engages. At 60 FPS this is a touch under a quarter-second of sustained
// wrong-way driving.
export const WRONG_WAY_ENTER_TICKS = 12
// Number of consecutive ticks under the threshold before the warning
// disengages. Smaller than the enter count so a confident U-turn back to
// the right direction clears the alert quickly.
export const WRONG_WAY_EXIT_TICKS = 6

// Tangent vector along the direction of travel at the closest point on the
// centerline of `op` to the world position (x, z). Returned as a unit vector
// (dx, dz). Falls back to entry-to-exit for degenerate inputs so the caller
// always has a meaningful direction.
export function expectedTangent(
  op: OrderedPiece,
  x: number,
  z: number,
): { dx: number; dz: number } {
  if (op.samples !== null) {
    return tangentFromSamples(op.samples, x, z)
  }
  if (op.arcCenter === null) {
    const dx = op.exit.x - op.entry.x
    const dz = op.exit.z - op.entry.z
    return normalize(dx, dz)
  }
  return tangentFromArc(op, x, z)
}

function tangentFromSamples(
  samples: SampledPoint[],
  x: number,
  z: number,
): { dx: number; dz: number } {
  let bestIdx = 0
  let bestD2 = Infinity
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i]
    const b = samples[i + 1]
    const segDx = b.x - a.x
    const segDz = b.z - a.z
    const len2 = segDx * segDx + segDz * segDz
    let t = 0
    if (len2 > 0) {
      t = ((x - a.x) * segDx + (z - a.z) * segDz) / len2
      if (t < 0) t = 0
      else if (t > 1) t = 1
    }
    const px = a.x + t * segDx
    const pz = a.z + t * segDz
    const ddx = x - px
    const ddz = z - pz
    const d2 = ddx * ddx + ddz * ddz
    if (d2 < bestD2) {
      bestD2 = d2
      bestIdx = i
    }
  }
  const a = samples[bestIdx]
  const b = samples[bestIdx + 1]
  return normalize(b.x - a.x, b.z - a.z)
}

function tangentFromArc(
  op: OrderedPiece,
  x: number,
  z: number,
): { dx: number; dz: number } {
  // Math frame: tangent is the radius vector rotated 90 degrees toward the
  // exit. Pick the rotation sign by testing which one points more toward the
  // exit edge.
  const { cx, cz } = op.arcCenter!
  const rx = x - cx
  const rz = z - cz
  const len = Math.hypot(rx, rz)
  if (len === 0) {
    return normalize(op.exit.x - op.entry.x, op.exit.z - op.entry.z)
  }
  const ux = rx / len
  const uz = rz / len
  // Two perpendicular candidates: rotate +90 and -90 in the math frame.
  const candPlus = { dx: -uz, dz: ux }
  const candMinus = { dx: uz, dz: -ux }
  // Sample the arc midpoint of the corner (radius CORNER_ARC_RADIUS from the
  // arc center, halfway between entry and exit angles). Whichever candidate
  // dotted with (mid -> exit) is more positive is the travel direction.
  const ax = op.exit.x - op.entry.x
  const az = op.exit.z - op.entry.z
  const score = candPlus.dx * ax + candPlus.dz * az
  // Use the entry-to-exit chord as a coarse direction proxy. Works because
  // both candidates lie in the same plane and only one points roughly toward
  // the exit chord direction.
  return score >= 0 ? candPlus : candMinus
}

function normalize(dx: number, dz: number): { dx: number; dz: number } {
  const len = Math.hypot(dx, dz)
  if (len === 0) return { dx: 1, dz: 0 }
  return { dx: dx / len, dz: dz / len }
}

// Heading (radians) -> unit direction vector. Matches the project convention
// atan2(-z, x), so heading 0 = +X (east), heading PI/2 = -Z (north).
export function headingToVector(heading: number): { dx: number; dz: number } {
  return { dx: Math.cos(heading), dz: -Math.sin(heading) }
}

// Angle (in radians, 0 to PI) between two 2D vectors. NaN-safe: returns 0
// for any non-finite input so the caller can fall back to "not wrong-way".
export function angleBetween(
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dot = ax * bx + az * bz
  const la = Math.hypot(ax, az)
  const lb = Math.hypot(bx, bz)
  if (!Number.isFinite(dot) || la === 0 || lb === 0) return 0
  let c = dot / (la * lb)
  if (c > 1) c = 1
  else if (c < -1) c = -1
  return Math.acos(c)
}

// Single-frame check: is the car currently pointing against the expected
// direction of travel? Suppressed below WRONG_WAY_MIN_SPEED to avoid
// false positives at near-zero speed where heading-of-motion is noisy.
export function isWrongWayInstant(
  carHeading: number,
  speed: number,
  expected: { dx: number; dz: number },
  threshold: number = WRONG_WAY_ANGLE_THRESHOLD,
): boolean {
  if (!Number.isFinite(carHeading) || !Number.isFinite(speed)) return false
  if (Math.abs(speed) < WRONG_WAY_MIN_SPEED) return false
  const v = headingToVector(carHeading)
  // Reverse driving flips the velocity direction.
  const sign = speed >= 0 ? 1 : -1
  const dirX = v.dx * sign
  const dirZ = v.dz * sign
  const ang = angleBetween(dirX, dirZ, expected.dx, expected.dz)
  return ang >= threshold
}

// Debounced wrong-way state. Call `update(...)` once per tick with the
// current frame's instant-detection result; the returned `active` flag flips
// only after `enterTicks` consecutive frames over threshold (or
// `exitTicks` consecutive frames under).
export interface WrongWayDetectorState {
  active: boolean
  // Consecutive frames of instant=true. Reset to 0 when instant=false.
  enterStreak: number
  // Consecutive frames of instant=false while active=true. Reset to 0 when
  // instant=true.
  exitStreak: number
}

export function initWrongWayDetector(): WrongWayDetectorState {
  return { active: false, enterStreak: 0, exitStreak: 0 }
}

export function updateWrongWayDetector(
  prev: WrongWayDetectorState,
  instantWrong: boolean,
  enterTicks: number = WRONG_WAY_ENTER_TICKS,
  exitTicks: number = WRONG_WAY_EXIT_TICKS,
): WrongWayDetectorState {
  if (instantWrong) {
    const enterStreak = prev.enterStreak + 1
    if (!prev.active && enterStreak >= enterTicks) {
      return { active: true, enterStreak, exitStreak: 0 }
    }
    return { active: prev.active, enterStreak, exitStreak: 0 }
  }
  // instant=false
  const exitStreak = prev.active ? prev.exitStreak + 1 : 0
  if (prev.active && exitStreak >= exitTicks) {
    return { active: false, enterStreak: 0, exitStreak: 0 }
  }
  return { active: prev.active, enterStreak: 0, exitStreak }
}
