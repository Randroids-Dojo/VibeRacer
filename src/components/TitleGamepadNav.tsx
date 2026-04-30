'use client'
import { useEffect } from 'react'
import { isMenuNavOpen } from './MenuNav'

// Lightweight gamepad nav for the title page. Reuses the browser's natural
// tab order to walk focus between every focusable element on the page (links,
// buttons, inputs). DPad up / down step focus, A activates the focused
// element, A on a Link triggers click. Stops polling while a MenuNav-managed
// overlay is open so a launched modal owns the gamepad without arbitration.
export function TitleGamepadNav() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return

    const STICK_DEADZONE = 0.5
    const REPEAT_INITIAL_MS = 320
    const REPEAT_INTERVAL_MS = 110
    const FOCUSABLE = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')

    let raf = 0
    const prevPressed = new Map<number, boolean>()
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
      return b.pressed || b.value > 0.5
    }

    function risingEdge(pad: Gamepad, idx: number): boolean {
      const cur = buttonPressed(pad, idx)
      const prev = prevPressed.get(idx) ?? false
      prevPressed.set(idx, cur)
      return cur && !prev
    }

    function listFocusables(): HTMLElement[] {
      const all = Array.from(
        document.querySelectorAll<HTMLElement>(FOCUSABLE),
      )
      return all.filter((el) => {
        if (el.hasAttribute('inert')) return false
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
    }

    function moveFocus(delta: 1 | -1) {
      const list = listFocusables()
      if (list.length === 0) return
      const active = document.activeElement as HTMLElement | null
      const currentIdx = active ? list.indexOf(active) : -1
      let nextIdx = currentIdx + delta
      if (nextIdx < 0) nextIdx = list.length - 1
      if (nextIdx >= list.length) nextIdx = 0
      list[nextIdx].focus()
    }

    function activate() {
      const active = document.activeElement as HTMLElement | null
      if (!active) return
      if (typeof (active as HTMLButtonElement).click === 'function') {
        ;(active as HTMLButtonElement).click()
      }
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
      // Cede control while any in-page MenuNav overlay is open.
      if (isMenuNavOpen()) {
        prevPressed.clear()
        repeatNextAt.clear()
        raf = requestAnimationFrame(poll)
        return
      }
      const pad = readPad()
      if (!pad) {
        prevPressed.clear()
        repeatNextAt.clear()
        raf = requestAnimationFrame(poll)
        return
      }

      if (risingEdge(pad, 0)) activate()
      const stickY = pad.axes[1] ?? 0
      const upHeld = buttonPressed(pad, 12) || stickY < -STICK_DEADZONE
      const downHeld = buttonPressed(pad, 13) || stickY > STICK_DEADZONE
      tryDirectional(now, 'up', upHeld, () => moveFocus(-1))
      tryDirectional(now, 'down', downHeld, () => moveFocus(1))

      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)
    return () => {
      cancelAnimationFrame(raf)
      prevPressed.clear()
      repeatNextAt.clear()
    }
  }, [])
  return null
}
