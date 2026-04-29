'use client'
import { useEffect, useRef } from 'react'
import {
  DEFAULT_KEY_BINDINGS,
  actionForCode,
  isContinuousAction,
  type KeyBindings,
} from '@/lib/controlSettings'

export interface KeyInput {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  handbrake: boolean
  shiftDown: boolean
  shiftUp: boolean
  // Optional analog override populated by the gamepad path. RaceCanvas reads
  // this each frame and prefers it over the boolean derivation when set, so
  // triggers and stick deflection feed straight into stepPhysics. null when
  // no gamepad is active so keyboard / touch keep their boolean semantics.
  axes: { steer: number; throttle: number } | null
}

// Subscribes to window keydown / keyup and writes booleans into a shared ref
// the game loop reads each frame. Bindings are user-configurable; the latest
// value lives in a ref so the listener picks up changes without re-binding
// (and without losing the held-key state on every settings tweak).
export function useKeyboard(
  bindings: KeyBindings = DEFAULT_KEY_BINDINGS,
): { current: KeyInput } {
  const state = useRef<KeyInput>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    handbrake: false,
    shiftDown: false,
    shiftUp: false,
    axes: null,
  })
  const bindingsRef = useRef<KeyBindings>(bindings)
  bindingsRef.current = bindings

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }
    function apply(e: KeyboardEvent, pressed: boolean) {
      // Let editable targets (feedback textarea, initials input) handle typing.
      // Always process keyup so a held key clears if focus shifts mid-press.
      if (pressed && isEditableTarget(e.target)) return
      const action = actionForCode(bindingsRef.current, e.code)
      if (!action) return
      // One-shot actions (e.g. restartLap) are dispatched by their own
      // listener and never enter the held-down state. Skip them here so the
      // KeyInput ref stays clean.
      if (!isContinuousAction(action)) return
      state.current[action] = pressed
      e.preventDefault()
    }
    const down = (e: KeyboardEvent) => apply(e, true)
    const up = (e: KeyboardEvent) => apply(e, false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  return state
}
