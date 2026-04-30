'use client'
import { useEffect } from 'react'

// Standard W3C gamepad button indices used for menu navigation. We do not
// reuse src/lib/controlSettings since menu binds are intentionally fixed and
// independent of the racing-control rebinding UI.
const BTN_A = 0
const BTN_B = 1
const BTN_LB = 4
const BTN_RB = 5
const BTN_DPAD_UP = 12
const BTN_DPAD_DOWN = 13
const BTN_DPAD_LEFT = 14
const BTN_DPAD_RIGHT = 15

const STICK_DEADZONE = 0.5
const REPEAT_INITIAL_MS = 320
const REPEAT_INTERVAL_MS = 110

export interface MenuGamepadHandlers {
  move: (dir: 'up' | 'down' | 'left' | 'right') => void
  activate: () => void
  back: () => void
  prevTab: () => void
  nextTab: () => void
  // When the focused element is a range input, gamepad left/right adjusts its
  // value rather than moving focus. The provider passes a probe that returns
  // the current document.activeElement so we don't have to capture state.
  getFocused: () => HTMLElement | null
}

export function useMenuGamepadNav(
  active: boolean,
  handlers: MenuGamepadHandlers,
) {
  useEffect(() => {
    if (!active) return
    if (typeof window === 'undefined') return
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return

    let raf = 0
    const prevPressed = new Map<number, boolean>()
    // Auto-repeat scheduling per directional channel (dpad / stick combined).
    const repeatNextAt = new Map<string, number>()

    function readPad(): Gamepad | null {
      const pads = navigator.getGamepads()
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i]
        if (p && p.connected) return p
      }
      return null
    }

    function buttonPressed(pad: Gamepad, idx: number): boolean {
      const b = pad.buttons[idx]
      if (!b) return false
      if (typeof b === 'number') return (b as unknown as number) > 0.5
      return b.pressed || b.value > 0.5
    }

    function risingEdge(pad: Gamepad, idx: number): boolean {
      const cur = buttonPressed(pad, idx)
      const prev = prevPressed.get(idx) ?? false
      prevPressed.set(idx, cur)
      return cur && !prev
    }

    function adjustRange(el: HTMLInputElement, sign: 1 | -1) {
      const stepStr = el.step && el.step !== 'any' ? el.step : '1'
      const step = Number(stepStr) || 1
      const min = el.min !== '' ? Number(el.min) : -Infinity
      const max = el.max !== '' ? Number(el.max) : Infinity
      const cur = Number(el.value)
      let next = cur + sign * step
      if (next < min) next = min
      if (next > max) next = max
      // Round to step grid to avoid floating drift on small steps.
      if (step < 1) {
        const decimals = (stepStr.split('.')[1] ?? '').length
        next = Number(next.toFixed(decimals))
      }
      if (next === cur) return
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      if (setter) setter.call(el, String(next))
      else el.value = String(next)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }

    function tryDirectional(
      now: number,
      key: string,
      held: boolean,
      run: () => void,
    ) {
      if (!held) {
        repeatNextAt.delete(key)
        return
      }
      const due = repeatNextAt.get(key)
      if (due === undefined) {
        run()
        repeatNextAt.set(key, now + REPEAT_INITIAL_MS)
      } else if (now >= due) {
        run()
        repeatNextAt.set(key, now + REPEAT_INTERVAL_MS)
      }
    }

    function poll(now: number) {
      const pad = readPad()
      if (!pad) {
        prevPressed.clear()
        repeatNextAt.clear()
        raf = requestAnimationFrame(poll)
        return
      }

      // Rising-edge actions: A confirm, B back, LB / RB tab nav.
      if (risingEdge(pad, BTN_A)) handlers.activate()
      if (risingEdge(pad, BTN_B)) handlers.back()
      if (risingEdge(pad, BTN_LB)) handlers.prevTab()
      if (risingEdge(pad, BTN_RB)) handlers.nextTab()

      // Directional with auto-repeat. DPad and stick share channels so users
      // can use whichever they prefer without double-firing.
      const stickX = pad.axes[0] ?? 0
      const stickY = pad.axes[1] ?? 0
      const upHeld = buttonPressed(pad, BTN_DPAD_UP) || stickY < -STICK_DEADZONE
      const downHeld =
        buttonPressed(pad, BTN_DPAD_DOWN) || stickY > STICK_DEADZONE
      const leftHeld =
        buttonPressed(pad, BTN_DPAD_LEFT) || stickX < -STICK_DEADZONE
      const rightHeld =
        buttonPressed(pad, BTN_DPAD_RIGHT) || stickX > STICK_DEADZONE

      tryDirectional(now, 'up', upHeld, () => handlers.move('up'))
      tryDirectional(now, 'down', downHeld, () => handlers.move('down'))
      tryDirectional(now, 'left', leftHeld, () => {
        const focused = handlers.getFocused()
        if (
          focused &&
          focused.tagName === 'INPUT' &&
          (focused as HTMLInputElement).type === 'range'
        ) {
          adjustRange(focused as HTMLInputElement, -1)
        } else {
          handlers.move('left')
        }
      })
      tryDirectional(now, 'right', rightHeld, () => {
        const focused = handlers.getFocused()
        if (
          focused &&
          focused.tagName === 'INPUT' &&
          (focused as HTMLInputElement).type === 'range'
        ) {
          adjustRange(focused as HTMLInputElement, 1)
        } else {
          handlers.move('right')
        }
      })

      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)

    return () => {
      cancelAnimationFrame(raf)
      prevPressed.clear()
      repeatNextAt.clear()
    }
  }, [active, handlers])
}
