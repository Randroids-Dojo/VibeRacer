export interface CarParams {
  maxSpeed: number
  maxReverseSpeed: number
  accel: number
  brake: number
  reverseAccel: number
  rollingFriction: number
  steerRate: number
  minSpeedForSteering: number
  offTrackMaxSpeed: number
  offTrackDrag: number
}

export const DEFAULT_CAR_PARAMS: CarParams = {
  maxSpeed: 26,
  maxReverseSpeed: 8,
  accel: 18,
  brake: 36,
  reverseAccel: 12,
  rollingFriction: 4,
  steerRate: 2.2,
  minSpeedForSteering: 0.8,
  offTrackMaxSpeed: 10,
  offTrackDrag: 16,
}

export interface PhysicsState {
  x: number
  z: number
  heading: number
  speed: number
}

export interface PhysicsInput {
  throttle: number
  steer: number
  handbrake: boolean
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export function stepPhysics(
  s: PhysicsState,
  input: PhysicsInput,
  dtSec: number,
  onTrack: boolean,
  params: CarParams = DEFAULT_CAR_PARAMS,
): PhysicsState {
  let speed = s.speed
  const throttle = clamp(input.throttle, -1, 1)
  const steer = clamp(input.steer, -1, 1)

  if (throttle > 0) {
    speed += params.accel * throttle * dtSec
  } else if (throttle < 0) {
    if (speed > 0) {
      speed += params.brake * throttle * dtSec
      if (speed < 0) speed = 0
    } else {
      speed += params.reverseAccel * throttle * dtSec
    }
  } else {
    const friction = params.rollingFriction * dtSec
    if (Math.abs(speed) <= friction) speed = 0
    else speed -= sign(speed) * friction
  }

  if (input.handbrake) {
    const handbrakeDrag = params.brake * 1.5 * dtSec
    if (Math.abs(speed) <= handbrakeDrag) speed = 0
    else speed -= sign(speed) * handbrakeDrag
  }

  if (!onTrack) {
    const drag = params.offTrackDrag * dtSec
    if (Math.abs(speed) <= drag) speed = 0
    else speed -= sign(speed) * drag
    speed = clamp(speed, -params.offTrackMaxSpeed, params.offTrackMaxSpeed)
  } else {
    speed = clamp(speed, -params.maxReverseSpeed, params.maxSpeed)
  }

  let heading = s.heading
  if (Math.abs(speed) >= params.minSpeedForSteering) {
    heading += params.steerRate * steer * dtSec * sign(speed)
  }

  // Heading: 0 = +X (east), PI/2 = -Z (north). Move along (cos, -sin) in XZ.
  const x = s.x + Math.cos(heading) * speed * dtSec
  const z = s.z - Math.sin(heading) * speed * dtSec

  return { x, z, heading, speed }
}
