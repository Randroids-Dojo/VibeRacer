'use client'
import { useEffect, useRef, useState } from 'react'
import {
  gamepadIsActive,
  gamepadToInput,
  pauseHeld,
  type GamepadSnapshot,
} from '@/game/gamepadInput'
import {
  DEFAULT_GAMEPAD_BINDINGS,
  type GamepadBindings,
} from '@/lib/controlSettings'
import type { KeyInput } from './useKeyboard'

// Polls the Gamepad API on rAF and writes both boolean keys (so the keyboard
// pause / SFX path keeps working) and analog axes (so triggers and stick
// deflection feed stepPhysics directly) onto the shared KeyInput ref.
//
// Notes:
// - We treat the first connected gamepad as the active one. Multi-pad is not
//   in scope for v1 racing.
// - When the gamepad has zero deflection and no buttons held, we blank the
//   `axes` override so the keyboard / touch path stays authoritative. This
//   keeps a connected-but-idle pad from clobbering active arrow keys.
// - Pause press is observed as a rising edge on Start (button 9) and the
//   caller is given a callback so Game.tsx can route it through `pause()` /
//   `resume()` without having to know about the gamepad shape.
export function useGamepad(
  keys: { current: KeyInput },
  onPauseToggle?: () => void,
  bindings: GamepadBindings = DEFAULT_GAMEPAD_BINDINGS,
): { connected: boolean; padId: string | null } {
  const [info, setInfo] = useState<{ connected: boolean; padId: string | null }>({
    connected: false,
    padId: null,
  })
  const onPauseToggleRef = useRef(onPauseToggle)
  onPauseToggleRef.current = onPauseToggle
  // Bindings are read each frame off the ref, so a Settings tweak takes effect
  // without retearing the rAF loop. Without the ref, the rebound effect would
  // restart polling on every binding change.
  const bindingsRef = useRef<GamepadBindings>(bindings)
  bindingsRef.current = bindings

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof navigator === 'undefined' || !navigator.getGamepads) {
      return
    }

    let raf = 0
    let prevStartPressed = false
    let lastSeenPadId: string | null = null
    let lastConnectedFlag = false

    function setActiveAxes(steer: number, throttle: number) {
      keys.current.axes = { steer, throttle }
    }
    function clearAxes() {
      keys.current.axes = null
    }

    function poll() {
      const pads = navigator.getGamepads()
      let pad: Gamepad | null = null
      for (let i = 0; i < pads.length; i++) {
        const candidate = pads[i]
        if (candidate && candidate.connected) {
          pad = candidate
          break
        }
      }

      const padId = pad?.id ?? null
      const connected = pad !== null
      if (connected !== lastConnectedFlag || padId !== lastSeenPadId) {
        lastConnectedFlag = connected
        lastSeenPadId = padId
        setInfo({ connected, padId })
      }

      if (!pad) {
        prevStartPressed = false
        // Drop the analog override so the keyboard / touch ref retakes control
        // when the pad disconnects mid-race.
        if (keys.current.axes !== null) clearAxes()
        raf = requestAnimationFrame(poll)
        return
      }

      const snapshot: GamepadSnapshot = {
        axes: pad.axes,
        buttons: pad.buttons,
      }
      const activeBindings = bindingsRef.current
      const input = gamepadToInput(snapshot, prevStartPressed, activeBindings)
      // Track "any pause-bound button held" rather than just button 9 so a
      // user who rebinds pause to Select still gets correct rising-edge logic.
      prevStartPressed = pauseHeld(snapshot, activeBindings)

      if (input.pausePressed && onPauseToggleRef.current) {
        onPauseToggleRef.current()
      }

      const active = gamepadIsActive(input)
      if (active) {
        setActiveAxes(input.axes.steer, input.axes.throttle)
        // Mirror booleans so SFX / lap-replay metadata that look at keys still
        // see the pad as a held key. This is a no-op when keyboard had the
        // same key down already.
        keys.current.forward = input.keys.forward
        keys.current.backward = input.keys.backward
        keys.current.left = input.keys.left
        keys.current.right = input.keys.right
        keys.current.handbrake = input.keys.handbrake
      } else if (keys.current.axes !== null) {
        // Pad idle: relinquish the analog channel so keyboard / touch can take
        // over without an axes lock-out. We do not zero the boolean keys here
        // because the keyboard hook owns those for keyboard-held input; the
        // pad would only have set them in the `active` branch above.
        clearAxes()
      }

      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)

    function onConnect(e: GamepadEvent) {
      // Polling will pick this up next frame; the listener exists so browsers
      // that gate getGamepads() until the first connect event still work.
      lastSeenPadId = e.gamepad.id
      lastConnectedFlag = true
      setInfo({ connected: true, padId: e.gamepad.id })
    }
    function onDisconnect() {
      lastSeenPadId = null
      lastConnectedFlag = false
      setInfo({ connected: false, padId: null })
    }
    window.addEventListener('gamepadconnected', onConnect)
    window.addEventListener('gamepaddisconnected', onDisconnect)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('gamepadconnected', onConnect)
      window.removeEventListener('gamepaddisconnected', onDisconnect)
      clearAxes()
    }
  }, [keys])

  return info
}
