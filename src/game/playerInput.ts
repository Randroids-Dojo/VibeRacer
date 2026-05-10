import type { KeyInput } from '@/hooks/useKeyboard'
import type { PhysicsInput } from './physics'

// Shared keyboard / gamepad / touch -> PhysicsInput translation. Modes that
// drive the same `stepPhysics` integrator (loop, drag, derby) read player
// input through this single helper so the steer / throttle conventions stay
// in lockstep across modes.
//
// Convention: positive steer turns left (matches the physics module: +steer
// produces +angular velocity, and +angular velocity rotates heading
// counterclockwise, which is "turn left" relative to the car's motion).
// Keyboard maps A (left) -> +1 and D (right) -> -1 to match this.
//
// When a gamepad has populated the `axes` override on the KeyInput ref,
// triggers and stick deflection feed straight through. The boolean
// fallback covers keyboard and the touch joystick (which writes the same
// forward/back/left/right booleans onto the ref).
export function readPlayerInput(k: KeyInput): PhysicsInput {
  const throttle = k.axes
    ? k.axes.throttle
    : (k.forward ? 1 : 0) + (k.backward ? -1 : 0)
  const steer = k.axes
    ? k.axes.steer
    : (k.left ? 1 : 0) + (k.right ? -1 : 0)
  return { throttle, steer, handbrake: k.handbrake }
}
