// Pure gamepad helpers. Kept free of DOM / React so they can be unit-tested
// against synthetic Gamepad snapshots and reused if we ever wire a server
// replay tool.
//
// Mapping rules (Standard layout, see https://w3c.github.io/gamepad/#remapping):
//
//   Steering: left stick X (axes[0]) plus dpad left/right (buttons 14/15).
//             Steering source is fixed (not user-rebindable today).
//   Throttle / brake / handbrake / pause: each action carries a list of
//             button indices (per `GamepadBindings`). The helper takes the
//             max analog `value` across that list, which lets analog triggers
//             feed continuous throttle while digital face-button fallbacks
//             snap to 0/1 the same as before.
//
// We export both a continuous `axes` payload (for analog physics) and a
// boolean `keys` payload so the same gamepad can drive the existing keyboard
// path on devices where booleans are good enough (and so the touch / keyboard
// flush logic on pause keeps working).

export interface GamepadSnapshot {
  // Subset of the live Gamepad object. Browsers return `readonly` arrays;
  // accept anything array-like with the same shape so tests can pass plain
  // number[] without ceremony.
  axes: ArrayLike<number>
  buttons: ArrayLike<{ pressed: boolean; value?: number }>
}

export interface GamepadInputAxes {
  // Both in [-1, 1]. Steer is positive-left (matches the existing
  // `(left ? 1 : 0) + (right ? -1 : 0)` convention in RaceCanvas), throttle
  // is positive-forward.
  steer: number
  throttle: number
}

export interface GamepadInput {
  axes: GamepadInputAxes
  keys: {
    forward: boolean
    backward: boolean
    left: boolean
    right: boolean
    handbrake: boolean
    shiftDown: boolean
    shiftUp: boolean
  }
  // True only on the rising edge of the Start / Options button. Caller is
  // responsible for tracking the previous frame's state.
  pausePressed: boolean
}

export const STICK_DEADZONE = 0.18
export const TRIGGER_DEADZONE = 0.08
export const BOOLEAN_THRESHOLD = 0.45

import {
  DEFAULT_GAMEPAD_BINDINGS,
  type GamepadBindings,
} from '@/lib/controlSettings'

export function readButton(
  buttons: ArrayLike<{ pressed: boolean; value?: number }>,
  i: number,
): { pressed: boolean; value: number } {
  if (i < 0 || i >= buttons.length) return { pressed: false, value: 0 }
  const b = buttons[i]
  if (!b) return { pressed: false, value: 0 }
  // value is the analog read (triggers); pressed is the digital read. Some
  // browsers report only one, so fall back gracefully in either direction.
  const value = typeof b.value === 'number' ? b.value : b.pressed ? 1 : 0
  return { pressed: !!b.pressed || value >= BOOLEAN_THRESHOLD, value }
}

// Sum the analog values across a list of bound button indices, picking the
// maximum so a fully-pressed trigger and a digital face button feel the same
// at the physics layer. Pressed flag is true when any bound button is down.
function readBound(
  buttons: ArrayLike<{ pressed: boolean; value?: number }>,
  indices: number[],
): { pressed: boolean; value: number } {
  let maxValue = 0
  let anyPressed = false
  for (const i of indices) {
    const b = readButton(buttons, i)
    if (b.value > maxValue) maxValue = b.value
    if (b.pressed) anyPressed = true
  }
  return { pressed: anyPressed, value: maxValue }
}

function applyDeadzone(value: number, deadzone: number): number {
  if (Math.abs(value) <= deadzone) return 0
  // Re-scale so the live range is [deadzone, 1] -> [0, 1]; preserves sign.
  const sign = value < 0 ? -1 : 1
  const scaled = (Math.abs(value) - deadzone) / (1 - deadzone)
  return sign * Math.min(1, scaled)
}

export function gamepadToInput(
  pad: GamepadSnapshot,
  prevStartPressed = false,
  bindings: GamepadBindings = DEFAULT_GAMEPAD_BINDINGS,
): GamepadInput {
  const stickXRaw = pad.axes.length > 0 ? pad.axes[0] : 0
  const stickX = applyDeadzone(stickXRaw, STICK_DEADZONE)

  const dpadLeft = readButton(pad.buttons, 14).pressed
  const dpadRight = readButton(pad.buttons, 15).pressed

  // The dpad overrides the stick when held (matches arcade expectations).
  // The `+ 0` strip normalizes -0 to +0 so toBe(0) tests stay tidy and the
  // boolean threshold check below behaves consistently.
  let steer = -stickX + 0 // browser axes go +1 right, our convention is +1 left
  if (dpadLeft) steer = 1
  else if (dpadRight) steer = -1

  // Throttle: take the strongest analog read across all bound forward and
  // backward buttons. A fully-pulled trigger reads 1.0; a digital face button
  // reads 1.0 when pressed. Both feed the same `throttle` axis so analog and
  // digital pads feel identical at the physics layer.
  const fwdRead = readBound(pad.buttons, bindings.forward)
  const backRead = readBound(pad.buttons, bindings.backward)
  const forwardAnalog = applyDeadzone(fwdRead.value, TRIGGER_DEADZONE)
  const backwardAnalog = applyDeadzone(backRead.value, TRIGGER_DEADZONE)
  let throttle = forwardAnalog - backwardAnalog
  if (throttle === 0) {
    // No analog channel registered. Fall back to digital pressed state so a
    // bound face button still drives even below the trigger deadzone.
    if (fwdRead.pressed && !backRead.pressed) throttle = 1
    else if (backRead.pressed && !fwdRead.pressed) throttle = -1
  }

  const handbrake = readBound(pad.buttons, bindings.handbrake).pressed
  const shiftDown = readBound(pad.buttons, bindings.shiftDown).pressed
  const shiftUp = readBound(pad.buttons, bindings.shiftUp).pressed

  // Pause: rising-edge detection across all bound pause buttons. We let the
  // caller persist the prior frame's "any-pause-pressed" state in a single
  // boolean so multi-button rebinds (Start + Select, say) all behave the same.
  const pauseRead = readBound(pad.buttons, bindings.pause)
  const pausePressed = pauseRead.pressed && !prevStartPressed

  return {
    axes: { steer, throttle },
    keys: {
      forward: throttle > BOOLEAN_THRESHOLD,
      backward: throttle < -BOOLEAN_THRESHOLD,
      left: steer > BOOLEAN_THRESHOLD,
      right: steer < -BOOLEAN_THRESHOLD,
      handbrake,
      shiftDown,
      shiftUp,
    },
    pausePressed,
  }
}

// True when any of the pause-bound buttons is currently held. The hook
// stores this value across frames and compares it to detect a rising edge.
export function pauseHeld(
  pad: GamepadSnapshot,
  bindings: GamepadBindings = DEFAULT_GAMEPAD_BINDINGS,
): boolean {
  return readBound(pad.buttons, bindings.pause).pressed
}

// True when any meaningful input is present on the snapshot. RaceCanvas reads
// this each frame to decide whether to prefer the analog axes over the
// boolean keyboard / touch path. Without this, a paused gamepad would zero
// out the keys ref and clobber the keyboard's currently-held arrows.
export function gamepadIsActive(input: GamepadInput): boolean {
  return (
    Math.abs(input.axes.steer) > 0 ||
    Math.abs(input.axes.throttle) > 0 ||
    input.keys.handbrake ||
    input.keys.shiftDown ||
    input.keys.shiftUp
  )
}
