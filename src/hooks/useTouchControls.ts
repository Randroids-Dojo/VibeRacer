'use client'
import { useEffect, useRef, useState } from 'react'
import {
  beginJoystick,
  createJoystick,
  endJoystick,
  JOYSTICK_DEADZONE,
  moveJoystick,
  readJoystick,
  type JoystickState,
} from '@/game/virtual-joystick'
import type { KeyInput } from './useKeyboard'
import type { TouchMode } from '@/lib/controlSettings'

export interface TouchJoysticks {
  steer: JoystickState
  throttle: JoystickState
  mode: TouchMode
}

// Touch controls. Two modes share the same KeyInput ref the keyboard uses,
// so the game loop keeps a single source of truth.
//
// dual: left half spawns a steering stick on first touch, right half spawns
// a gas/brake stick. Both release on pointerup and respawn at the next tap.
//
// single: any touch anywhere spawns one stick. Horizontal axis steers;
// vertical axis is gas (up) / brake (down). The throttle joystick state is
// kept inactive in this mode so only one ring renders.
export function useTouchControls(
  keys: { current: KeyInput },
  enabled: boolean,
  mode: TouchMode = 'dual',
): TouchJoysticks {
  const sticksRef = useRef<TouchJoysticks>({
    steer: createJoystick(),
    throttle: createJoystick(),
    mode,
  })
  sticksRef.current.mode = mode
  const [, bump] = useState(0)
  const rerender = () => bump((n) => n + 1)

  useEffect(() => {
    const sticks = sticksRef.current

    function applyToKeys() {
      const s = readJoystick(sticks.steer)
      keys.current.left = s.x < -JOYSTICK_DEADZONE
      keys.current.right = s.x > JOYSTICK_DEADZONE
      if (mode === 'single') {
        keys.current.forward = s.y < -JOYSTICK_DEADZONE
        keys.current.backward = s.y > JOYSTICK_DEADZONE
      } else {
        const t = readJoystick(sticks.throttle)
        keys.current.forward = t.y < -JOYSTICK_DEADZONE
        keys.current.backward = t.y > JOYSTICK_DEADZONE
      }
    }

    function clearSticks() {
      endJoystick(sticks.steer)
      endJoystick(sticks.throttle)
      applyToKeys()
      rerender()
    }

    if (!enabled) {
      clearSticks()
      return
    }

    function isInteractiveTarget(target: EventTarget | null): boolean {
      if (!(target instanceof Element)) return false
      return target.closest('button, input, textarea, select, a') !== null
    }

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType !== 'touch') return
      if (isInteractiveTarget(e.target)) return
      if (mode === 'single') {
        if (sticks.steer.active) return
        beginJoystick(sticks.steer, e.pointerId, e.clientX, e.clientY)
      } else {
        const rightHalf = e.clientX >= window.innerWidth / 2
        const js = rightHalf ? sticks.throttle : sticks.steer
        if (js.active) return
        beginJoystick(js, e.pointerId, e.clientX, e.clientY)
      }
      applyToKeys()
      rerender()
      e.preventDefault()
    }

    function onPointerMove(e: PointerEvent) {
      if (e.pointerType !== 'touch') return
      if (sticks.steer.pointerId === e.pointerId) {
        moveJoystick(sticks.steer, e.clientX, e.clientY)
      } else if (mode !== 'single' && sticks.throttle.pointerId === e.pointerId) {
        moveJoystick(sticks.throttle, e.clientX, e.clientY)
      } else {
        return
      }
      applyToKeys()
      rerender()
    }

    function onPointerUp(e: PointerEvent) {
      if (e.pointerType !== 'touch') return
      let changed = false
      if (sticks.steer.pointerId === e.pointerId) {
        endJoystick(sticks.steer)
        changed = true
      }
      if (sticks.throttle.pointerId === e.pointerId) {
        endJoystick(sticks.throttle)
        changed = true
      }
      if (changed) {
        applyToKeys()
        rerender()
      }
    }

    window.addEventListener('pointerdown', onPointerDown, { passive: false })
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      clearSticks()
    }
  }, [enabled, keys, mode])

  return sticksRef.current
}
