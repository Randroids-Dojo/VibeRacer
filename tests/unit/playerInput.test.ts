import { describe, expect, it } from 'vitest'
import { readPlayerInput } from '@/game/playerInput'
import type { KeyInput } from '@/hooks/useKeyboard'

function emptyKeys(): KeyInput {
  return {
    forward: false,
    backward: false,
    left: false,
    right: false,
    handbrake: false,
    shiftDown: false,
    shiftUp: false,
    axes: null,
  }
}

describe('readPlayerInput', () => {
  it('returns neutral input when nothing is pressed', () => {
    expect(readPlayerInput(emptyKeys())).toEqual({
      throttle: 0,
      steer: 0,
      handbrake: false,
    })
  })

  it('forward key produces +1 throttle', () => {
    const k = { ...emptyKeys(), forward: true }
    expect(readPlayerInput(k).throttle).toBe(1)
  })

  it('backward key produces -1 throttle', () => {
    const k = { ...emptyKeys(), backward: true }
    expect(readPlayerInput(k).throttle).toBe(-1)
  })

  it('forward + backward cancel to zero throttle', () => {
    const k = { ...emptyKeys(), forward: true, backward: true }
    expect(readPlayerInput(k).throttle).toBe(0)
  })

  it('left key produces +1 steer (loop convention: +steer turns CCW)', () => {
    const k = { ...emptyKeys(), left: true }
    expect(readPlayerInput(k).steer).toBe(1)
  })

  it('right key produces -1 steer', () => {
    const k = { ...emptyKeys(), right: true }
    expect(readPlayerInput(k).steer).toBe(-1)
  })

  it('left + right cancel to zero steer', () => {
    const k = { ...emptyKeys(), left: true, right: true }
    expect(readPlayerInput(k).steer).toBe(0)
  })

  it('handbrake passes through', () => {
    const k = { ...emptyKeys(), handbrake: true }
    expect(readPlayerInput(k).handbrake).toBe(true)
  })

  it('analog axes override the boolean keys when present', () => {
    const k: KeyInput = {
      ...emptyKeys(),
      forward: true,
      left: true,
      axes: { steer: -0.4, throttle: 0.7 },
    }
    expect(readPlayerInput(k)).toEqual({
      throttle: 0.7,
      steer: -0.4,
      handbrake: false,
    })
  })
})
