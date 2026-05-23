import type { PhysicsInput, PhysicsState } from '../physics'
import type { Drivability } from './drivability'

// Self-driving circle controller. Pure: takes the current physics
// state, a target circle, and the current drivability, returns the
// throttle/steer/handbrake input that would keep the car on the circle
// at the configured tangential speed.
//
// The controller treats the circle as a "rail" the car wants to ride.
// The rail's tangent at the car's current bearing tells us the
// desired heading. A proportional steer pushes toward that heading,
// clamped to [-1, 1]. A proportional throttle pushes toward the target
// speed, clamped to [-1, 1] so the AI can roll off the gas as well as
// brake.

export interface CircleTarget {
  centerX: number
  centerZ: number
  radius: number
  tangentialSpeed: number
}

// Radius tuned so the angular velocity of the car around the center
// (tangentialSpeed / radius) stays small enough that the chase
// camera's positionLerp keeps up on any aspect ratio. A tighter
// circle made the camera trail by enough heading degrees that the
// car drifted off the side of a portrait-mobile viewport.
export const DEFAULT_CIRCLE: CircleTarget = {
  centerX: 0,
  centerZ: 0,
  radius: 60,
  tangentialSpeed: 9,
}

export interface AiParams {
  // Steering aggressiveness. Higher means a snappier correction toward
  // the desired heading at the cost of more wobble.
  steerKp: number
  // Throttle response. Higher = closes the speed gap faster.
  throttleKp: number
}

export const DEFAULT_AI_PARAMS: AiParams = {
  steerKp: 1.6,
  throttleKp: 0.6,
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
// current bearing. We use the counterclockwise tangent so the AI drives
// CCW around the center. The physics module's convention is that +x is
// east, +z is north (or however the world is set up), and heading is
// the angle whose cos/sin gives the forward direction in XZ. The
// tangent at bearing theta (where theta is the angle from +x to the car
// position relative to center) is (-sin theta, cos theta).
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
  return Math.atan2(tz, tx)
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
  const desired = desiredHeading(state, target)
  const err = wrapPi(desired - state.heading)
  let steer = clamp(err * params.steerKp, -1, 1)
  // Bake in drivability's steer bias so a damaged car drifts toward
  // its wrecked side even while the AI fights it.
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
