import { describe, it, expect } from 'vitest'
import {
  BOOLEAN_THRESHOLD,
  STICK_DEADZONE,
  TRIGGER_DEADZONE,
  gamepadIsActive,
  gamepadToInput,
  pauseHeld,
  type GamepadSnapshot,
} from '@/game/gamepadInput'
import {
  DEFAULT_GAMEPAD_BINDINGS,
  cloneDefaultGamepadBindings,
  rebindGamepadButton,
} from '@/lib/controlSettings'

// Build a minimal Gamepad-like snapshot. Browsers ship arrays of Gamepad
// buttons with `pressed`/`value`/`touched` fields; the helper only reads
// `pressed` and `value` so we keep the test stub tight.
function snapshot(opts: {
  axes?: number[]
  // Sparse map of button index -> pressed (bool) or value (number).
  buttons?: Record<number, boolean | number>
}): GamepadSnapshot {
  const axes: number[] = []
  const padAxes = opts.axes ?? []
  for (let i = 0; i < Math.max(4, padAxes.length); i++) {
    axes.push(padAxes[i] ?? 0)
  }
  // 17 covers the Standard layout (0..16).
  const buttons: Array<{ pressed: boolean; value: number }> = []
  for (let i = 0; i < 17; i++) {
    const raw = opts.buttons?.[i]
    if (raw === undefined) buttons.push({ pressed: false, value: 0 })
    else if (typeof raw === 'boolean')
      buttons.push({ pressed: raw, value: raw ? 1 : 0 })
    else buttons.push({ pressed: raw >= BOOLEAN_THRESHOLD, value: raw })
  }
  return { axes, buttons }
}

describe('gamepadToInput', () => {
  it('returns neutral input when nothing is pressed', () => {
    const out = gamepadToInput(snapshot({}))
    expect(out.axes.steer).toBe(0)
    expect(out.axes.throttle).toBe(0)
    expect(out.keys.forward).toBe(false)
    expect(out.keys.backward).toBe(false)
    expect(out.keys.left).toBe(false)
    expect(out.keys.right).toBe(false)
    expect(out.keys.handbrake).toBe(false)
    expect(out.keys.shiftDown).toBe(false)
    expect(out.keys.shiftUp).toBe(false)
    expect(out.pausePressed).toBe(false)
  })

  it('drops stick deflection inside the deadzone', () => {
    const small = STICK_DEADZONE / 2
    const out = gamepadToInput(snapshot({ axes: [small] }))
    expect(out.axes.steer).toBe(0)
    expect(out.keys.left).toBe(false)
    expect(out.keys.right).toBe(false)
  })

  it('inverts the stick X so positive steer means turn-left', () => {
    // Stick fully right -> steer should go negative (right turn).
    const right = gamepadToInput(snapshot({ axes: [1] }))
    expect(right.axes.steer).toBeCloseTo(-1, 5)
    expect(right.keys.right).toBe(true)
    expect(right.keys.left).toBe(false)
    // Stick fully left -> steer should go positive (left turn).
    const left = gamepadToInput(snapshot({ axes: [-1] }))
    expect(left.axes.steer).toBeCloseTo(1, 5)
    expect(left.keys.left).toBe(true)
    expect(left.keys.right).toBe(false)
  })

  it('lets the dpad override stick steering when held', () => {
    const out = gamepadToInput(
      snapshot({ axes: [1], buttons: { 14: true } }), // stick right + dpad left
    )
    expect(out.axes.steer).toBe(1)
    expect(out.keys.left).toBe(true)
  })

  it('blends the analog triggers into a forward / brake throttle', () => {
    // Right trigger fully pressed -> forward = +1.
    const fwd = gamepadToInput(snapshot({ buttons: { 7: 1 } }))
    expect(fwd.axes.throttle).toBeCloseTo(1, 5)
    expect(fwd.keys.forward).toBe(true)
    // Left trigger pressed -> backward = -1.
    const back = gamepadToInput(snapshot({ buttons: { 6: 1 } }))
    expect(back.axes.throttle).toBeCloseTo(-1, 5)
    expect(back.keys.backward).toBe(true)
    // Both triggers pressed -> they cancel.
    const both = gamepadToInput(snapshot({ buttons: { 6: 1, 7: 1 } }))
    expect(both.axes.throttle).toBe(0)
  })

  it('respects the trigger deadzone so resting analog stays neutral', () => {
    const out = gamepadToInput(
      snapshot({ buttons: { 7: TRIGGER_DEADZONE / 2 } }),
    )
    expect(out.axes.throttle).toBe(0)
    expect(out.keys.forward).toBe(false)
  })

  it('falls back to A / B face buttons when triggers are silent', () => {
    const fwd = gamepadToInput(snapshot({ buttons: { 0: true } }))
    expect(fwd.axes.throttle).toBe(1)
    expect(fwd.keys.forward).toBe(true)
    const back = gamepadToInput(snapshot({ buttons: { 1: true } }))
    expect(back.axes.throttle).toBe(-1)
    expect(back.keys.backward).toBe(true)
  })

  it('reads handbrake from RB or X face button', () => {
    const rb = gamepadToInput(snapshot({ buttons: { 5: true } }))
    expect(rb.keys.handbrake).toBe(true)
    const xBtn = gamepadToInput(snapshot({ buttons: { 2: true } }))
    expect(xBtn.keys.handbrake).toBe(true)
  })

  it('reads manual shift buttons from LB and Y', () => {
    const down = gamepadToInput(snapshot({ buttons: { 4: true } }))
    expect(down.keys.shiftDown).toBe(true)
    const up = gamepadToInput(snapshot({ buttons: { 3: true } }))
    expect(up.keys.shiftUp).toBe(true)
  })

  it('emits pause on the rising edge of Start, not while held', () => {
    const held = snapshot({ buttons: { 9: true } })
    const first = gamepadToInput(held, false)
    expect(first.pausePressed).toBe(true)
    const second = gamepadToInput(held, true)
    expect(second.pausePressed).toBe(false)
  })
})

describe('gamepadToInput with custom bindings', () => {
  it('routes throttle through user-rebound buttons', () => {
    // Move forward off RT (7) onto LB (4); leave backward on LT (6).
    const bindings = rebindGamepadButton(
      cloneDefaultGamepadBindings(),
      'forward',
      0,
      4,
    )
    // Pressing the old RT no longer drives forward.
    const oldRt = gamepadToInput(snapshot({ buttons: { 7: 1 } }), false, bindings)
    expect(oldRt.axes.throttle).toBe(0)
    // Pressing the new LB does.
    const newLb = gamepadToInput(snapshot({ buttons: { 4: 1 } }), false, bindings)
    expect(newLb.axes.throttle).toBeCloseTo(1, 5)
    expect(newLb.keys.forward).toBe(true)
  })

  it('takes the strongest analog read across multi-bound forward buttons', () => {
    // Default forward = [7, 0]. RT half-pressed plus A (digital, value=1) ->
    // throttle should snap to 1.0 because A reads max.
    const out = gamepadToInput(snapshot({ buttons: { 7: 0.5, 0: true } }))
    expect(out.axes.throttle).toBeCloseTo(1, 5)
    expect(out.keys.forward).toBe(true)
  })

  it('routes pause through any user-rebound pause button', () => {
    const bindings = rebindGamepadButton(
      cloneDefaultGamepadBindings(),
      'pause',
      0,
      8, // Back / Select
    )
    const first = gamepadToInput(snapshot({ buttons: { 8: true } }), false, bindings)
    expect(first.pausePressed).toBe(true)
    const second = gamepadToInput(snapshot({ buttons: { 8: true } }), true, bindings)
    expect(second.pausePressed).toBe(false)
    // The old Start button (9) no longer triggers pause after rebind.
    const oldStart = gamepadToInput(snapshot({ buttons: { 9: true } }), false, bindings)
    expect(oldStart.pausePressed).toBe(false)
  })

  it('routes handbrake through user-rebound buttons', () => {
    const bindings = rebindGamepadButton(
      cloneDefaultGamepadBindings(),
      'handbrake',
      0,
      3, // Y / Triangle
    )
    const out = gamepadToInput(snapshot({ buttons: { 3: true } }), false, bindings)
    expect(out.keys.handbrake).toBe(true)
    // The old RB (5) is no longer bound (rebind transferred slot 0).
    const oldRb = gamepadToInput(snapshot({ buttons: { 5: true } }), false, bindings)
    expect(oldRb.keys.handbrake).toBe(false)
  })
})

describe('pauseHeld', () => {
  it('returns false when no bound pause buttons are held', () => {
    expect(pauseHeld(snapshot({}))).toBe(false)
  })

  it('returns true when the default Start button is pressed', () => {
    expect(pauseHeld(snapshot({ buttons: { 9: true } }))).toBe(true)
  })

  it('respects custom bindings', () => {
    const bindings = rebindGamepadButton(
      cloneDefaultGamepadBindings(),
      'pause',
      0,
      8,
    )
    expect(pauseHeld(snapshot({ buttons: { 8: true } }), bindings)).toBe(true)
    expect(pauseHeld(snapshot({ buttons: { 9: true } }), bindings)).toBe(false)
  })
})

describe('gamepadIsActive', () => {
  it('flags any non-zero axis as active', () => {
    const idle = gamepadToInput(snapshot({}))
    expect(gamepadIsActive(idle)).toBe(false)
    const driving = gamepadToInput(snapshot({ buttons: { 7: 1 } }))
    expect(gamepadIsActive(driving)).toBe(true)
    const steering = gamepadToInput(snapshot({ axes: [1] }))
    expect(gamepadIsActive(steering)).toBe(true)
  })

  it('treats handbrake-only as active so the pad can lock the wheels', () => {
    const handbrake = gamepadToInput(snapshot({ buttons: { 5: true } }))
    expect(gamepadIsActive(handbrake)).toBe(true)
  })

  it('treats shift-only as active so manual gear changes are delivered', () => {
    const shift = gamepadToInput(snapshot({ buttons: { 3: true } }))
    expect(gamepadIsActive(shift)).toBe(true)
  })
})
