// Pure gamepad helpers. Kept free of DOM / React so they can be unit-tested
// against synthetic Gamepad snapshots and reused if we ever wire a server
// replay tool.
//
// Mapping rules (Standard layout, see https://w3c.github.io/gamepad/#remapping):
//
//   Steering: left stick X (axes[0]) plus dpad left/right (buttons 14/15).
//   Throttle: right trigger (button 7) goes forward, left trigger (button 6)
//             brakes / reverses. Falling back to face buttons A (0) for
//             forward and B (1) for brake so D-input pads without analog
//             triggers still work.
//   Handbrake: right shoulder (button 5) or X face button (2).
//   Pause: Start / Options (button 9).
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
  }
  // True only on the rising edge of the Start / Options button. Caller is
  // responsible for tracking the previous frame's state.
  pausePressed: boolean
}

export const STICK_DEADZONE = 0.18
export const TRIGGER_DEADZONE = 0.08
export const BOOLEAN_THRESHOLD = 0.45

function readButton(
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

  const rt = readButton(pad.buttons, 7) // right trigger
  const lt = readButton(pad.buttons, 6) // left trigger
  const aBtn = readButton(pad.buttons, 0)
  const bBtn = readButton(pad.buttons, 1)

  const forwardAnalog = applyDeadzone(rt.value, TRIGGER_DEADZONE)
  const backwardAnalog = applyDeadzone(lt.value, TRIGGER_DEADZONE)
  let throttle = forwardAnalog - backwardAnalog
  if (throttle === 0) {
    if (aBtn.pressed) throttle = 1
    else if (bBtn.pressed) throttle = -1
  }

  const handbrake =
    readButton(pad.buttons, 5).pressed || readButton(pad.buttons, 2).pressed

  const startPressedNow = readButton(pad.buttons, 9).pressed
  const pausePressed = startPressedNow && !prevStartPressed

  return {
    axes: { steer, throttle },
    keys: {
      forward: throttle > BOOLEAN_THRESHOLD,
      backward: throttle < -BOOLEAN_THRESHOLD,
      left: steer > BOOLEAN_THRESHOLD,
      right: steer < -BOOLEAN_THRESHOLD,
      handbrake,
    },
    pausePressed,
  }
}

// True when any meaningful input is present on the snapshot. RaceCanvas reads
// this each frame to decide whether to prefer the analog axes over the
// boolean keyboard / touch path. Without this, a paused gamepad would zero
// out the keys ref and clobber the keyboard's currently-held arrows.
export function gamepadIsActive(input: GamepadInput): boolean {
  return (
    Math.abs(input.axes.steer) > 0 ||
    Math.abs(input.axes.throttle) > 0 ||
    input.keys.handbrake
  )
}
