import type { PhysicsInput, PhysicsState } from '../physics'
import type { Drivability } from './drivability'

// Self-driving circle controller. Pure: takes the current physics
// state, a target circle, and the current drivability, returns the
// throttle/steer/handbrake input that would keep the car on the circle
// at the configured tangential speed.
//
// The controller is a three-term sum:
// 1. A feedforward steer pre-computed from the target circle radius
//    and speed. Holding this constant alone (with zero error) is the
//    steer that maintains the circle in steady state. Without it,
//    a pure proportional controller has a residual heading error and
//    the car drifts outward, eventually leaving the arena.
// 2. A heading-error proportional term. Pulls the car toward the
//    tangent at its current bearing.
// 3. A radial-error term. Pulls the car back to the target radius
//    when it has drifted too far out (or in). Without this, the car
//    can settle into a stable larger circle that still has no
//    heading error but sits at the wrong radius.
// Throttle is a proportional controller on the speed gap, clamped to
// [-1, 1] so the AI can roll off the gas as well as brake.

export interface CircleTarget {
  centerX: number
  centerZ: number
  radius: number
  tangentialSpeed: number
}

// Radius tuned so the car stays comfortably inside the Dust Bowl
// arena (radius 60) without grazing the perimeter wall, even at
// the higher cruise speed. Speed picked to feel lively (about
// 65 km/h scaled) without overshooting the rail on each lap.
export const DEFAULT_CIRCLE: CircleTarget = {
  centerX: 0,
  centerZ: 0,
  radius: 36,
  tangentialSpeed: 18,
}

export interface AiParams {
  // Heading-error proportional gain. Higher = snappier correction
  // toward the tangent at the cost of more wobble.
  steerKp: number
  // Radial-error gain. Multiplies (r_actual - r_target) / r_target
  // and steers inward (or outward) to close the radial gap. Sign is
  // negative when the car is too far out so the steer command is
  // tighter inward.
  steerRadialKp: number
  // Throttle response. Higher = closes the speed gap faster.
  throttleKp: number
  // The car's maximum heading rate at high speed. Used by the
  // feedforward term to translate the target angular velocity
  // (tangentialSpeed / radius) into a steer input. Mirrors
  // `steerRateHigh` from `DEFAULT_CAR_PARAMS`; we keep it as an AI
  // param so a future custom CarParams can pass its own value.
  steerRateHigh: number
}

export const DEFAULT_AI_PARAMS: AiParams = {
  steerKp: 2.4,
  steerRadialKp: 1.6,
  throttleKp: 0.6,
  steerRateHigh: 2.2,
}

// Wrap an angle into [-pi, pi]. The heading error feeds a proportional
// controller and needs to be signed-shortest-path; otherwise a small
// physical wobble of pi radians worth could read as a 6.2-radian error
// and saturate the steer to +1.
function wrapPi(a: number): number {
  let x = a
  while (x > Math.PI) x -= 2 * Math.PI
  while (x < -Math.PI) x += 2 * Math.PI
  return x
}

// Compute the desired heading on the circle's tangent at the car's
// current bearing. We use the counterclockwise tangent so the AI
// drives CCW around the center. The physics module's convention is
// that forward direction at heading h is (cos h, -sin h) in (x, z),
// so to convert a tangent vector (tx, tz) into a heading we use
// h = atan2(-tz, tx) (NOT atan2(tz, tx); the latter ignores the
// negated-sin convention and produces a heading whose forward is
// the CW tangent).
function desiredHeading(
  state: PhysicsState,
  target: CircleTarget,
): number {
  const dx = state.x - target.centerX
  const dz = state.z - target.centerZ
  const bearing = Math.atan2(dz, dx)
  // Tangent direction (CCW): rotated 90deg from the radial vector.
  const tx = -Math.sin(bearing)
  const tz = Math.cos(bearing)
  return Math.atan2(-tz, tx)
}

export function step(
  state: PhysicsState,
  drivability: Drivability,
  target: CircleTarget = DEFAULT_CIRCLE,
  params: AiParams = DEFAULT_AI_PARAMS,
): PhysicsInput {
  if (drivability.stalled) {
    return { throttle: 0, steer: 0, handbrake: false }
  }
  // Feedforward: the steer that maintains the circle in steady
  // state. For CCW circling around the origin the position-bearing
  // increases over time while the heading angle DECREASES (under
  // the physics module's forward = (cos h, -sin h) convention: a
  // CCW rotation of the forward direction is a heading decrease).
  // So the steer required to hold the circle is NEGATIVE, of
  // magnitude V / (R * steerRateHigh).
  const ffSteer =
    target.radius > 0
      ? -target.tangentialSpeed / (target.radius * params.steerRateHigh)
      : 0

  // Heading-error proportional term. Pulls the car onto the tangent.
  const desired = desiredHeading(state, target)
  const err = wrapPi(desired - state.heading)
  const headingTerm = err * params.steerKp

  // Radial-error term. When r_actual > target_radius the car has
  // drifted OUTWARD; we want to tighten the circle, which under the
  // same sign convention is a MORE NEGATIVE steer. So the term is
  // -(radialErr) * gain. When r_actual < target_radius the term is
  // positive, loosening the turn so the car spirals back outward.
  const dx = state.x - target.centerX
  const dz = state.z - target.centerZ
  const rActual = Math.hypot(dx, dz)
  const radialErr =
    target.radius > 0 ? (rActual - target.radius) / target.radius : 0
  const radialTerm = -radialErr * params.steerRadialKp

  let steer = clamp(ffSteer + headingTerm + radialTerm, -1, 1)
  steer = clamp(steer + drivability.steerBias, -1, 1)

  const speedErr = target.tangentialSpeed - state.speed
  const throttle = clamp(speedErr * params.throttleKp, -1, 1)
  return { throttle, steer, handbrake: false }
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < lo) return lo
  if (n > hi) return hi
  return n
}

// Exported for tests; pure derivation of the desired heading.
export function _desiredHeadingForTest(
  state: PhysicsState,
  target: CircleTarget,
): number {
  return desiredHeading(state, target)
}
