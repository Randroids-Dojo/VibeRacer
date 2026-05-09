// Virtual joystick: float-where-you-tap controller state for touch
// input. Pointer events feed `beginJoystick` / `moveJoystick` /
// `endJoystick`; the consumer reads `readJoystick` each frame for a
// `[-1, 1]` deflection vector clamped at `JOYSTICK_RADIUS`.
// `JOYSTICK_DEADZONE` is exported as a constant so the consumer can
// pick its own threshold (the helpers do not apply it). VibeRacer
// drives a steer + throttle pair from this on mobile; any other 2D
// touch game can do the same with one or more instances.

export interface JoystickState {
  active: boolean
  pointerId: number | null
  originX: number
  originY: number
  currentX: number
  currentY: number
}

export interface JoystickVector {
  x: number
  y: number
}

export const JOYSTICK_RADIUS = 64
export const JOYSTICK_DEADZONE = 0.25

export function createJoystick(): JoystickState {
  return {
    active: false,
    pointerId: null,
    originX: 0,
    originY: 0,
    currentX: 0,
    currentY: 0,
  }
}

export function beginJoystick(
  js: JoystickState,
  pointerId: number,
  x: number,
  y: number,
): void {
  js.active = true
  js.pointerId = pointerId
  js.originX = x
  js.originY = y
  js.currentX = x
  js.currentY = y
}

export function moveJoystick(js: JoystickState, x: number, y: number): void {
  if (!js.active) return
  js.currentX = x
  js.currentY = y
}

export function endJoystick(js: JoystickState): void {
  js.active = false
  js.pointerId = null
}

// Returns a vector in [-1, 1] for each axis. Screen y grows downward, so a
// negative y means the thumb moved up.
export function readJoystick(js: JoystickState): JoystickVector {
  if (!js.active) return { x: 0, y: 0 }
  const dx = js.currentX - js.originX
  const dy = js.currentY - js.originY
  const len = Math.hypot(dx, dy)
  if (len <= JOYSTICK_RADIUS) {
    return { x: dx / JOYSTICK_RADIUS, y: dy / JOYSTICK_RADIUS }
  }
  return { x: dx / len, y: dy / len }
}
