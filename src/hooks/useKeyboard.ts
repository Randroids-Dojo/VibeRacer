'use client'
import { useEffect, useRef } from 'react'

export interface KeyInput {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  handbrake: boolean
}

export function useKeyboard(): { current: KeyInput } {
  const state = useRef<KeyInput>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    handbrake: false,
  })

  useEffect(() => {
    function apply(e: KeyboardEvent, pressed: boolean) {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          state.current.forward = pressed
          break
        case 'KeyS':
        case 'ArrowDown':
          state.current.backward = pressed
          break
        case 'KeyA':
        case 'ArrowLeft':
          state.current.left = pressed
          break
        case 'KeyD':
        case 'ArrowRight':
          state.current.right = pressed
          break
        case 'Space':
          state.current.handbrake = pressed
          break
        default:
          return
      }
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
