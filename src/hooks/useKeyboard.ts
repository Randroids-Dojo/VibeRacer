'use client'
import { useEffect, useRef } from 'react'
import {
  DEFAULT_KEY_BINDINGS,
  actionForCode,
  type KeyBindings,
} from '@/lib/controlSettings'

export interface KeyInput {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  handbrake: boolean
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
