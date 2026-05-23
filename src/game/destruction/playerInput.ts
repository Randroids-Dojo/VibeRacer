import type { KeyInput } from '@/hooks/useKeyboard'
import { readPlayerInput } from '../playerInput'
import type { PhysicsInput } from '../physics'
import type { Drivability } from './drivability'

// Convert a keyboard / gamepad / touch input snapshot into the
// PhysicsInput the destruction lab actually drives stepPhysics with.
// Re-exports `readPlayerInput` from the shared game module so the
// destruction lab uses the same steer / throttle conventions as the
// race / drag / derby modes, then folds in drivability so a wrecked
// car pulls toward the damaged side just like the AI feels it.

export function step(keys: KeyInput, drivability: Drivability): PhysicsInput {
  if (drivability.stalled) {
    return { throttle: 0, steer: 0, handbrake: false }
  }
  const base = readPlayerInput(keys)
  const steer = clamp(base.steer + drivability.steerBias, -1, 1)
  return { throttle: base.throttle, steer, handbrake: base.handbrake }
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < lo) return lo
  if (n > hi) return hi
  return n
}
