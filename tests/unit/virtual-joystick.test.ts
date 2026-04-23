import { describe, it, expect } from 'vitest'
import {
  beginJoystick,
  createJoystick,
  endJoystick,
  JOYSTICK_RADIUS,
  moveJoystick,
  readJoystick,
} from '@/game/virtual-joystick'

describe('virtual joystick', () => {
  it('is inactive on creation and reads zero', () => {
    const js = createJoystick()
    expect(js.active).toBe(false)
    expect(readJoystick(js)).toEqual({ x: 0, y: 0 })
  })

  it('begin sets origin and activates', () => {
    const js = createJoystick()
    beginJoystick(js, 1, 100, 200)
    expect(js.active).toBe(true)
    expect(js.pointerId).toBe(1)
    expect(js.originX).toBe(100)
    expect(js.originY).toBe(200)
    // No drag yet, vector is zero.
    expect(readJoystick(js)).toEqual({ x: 0, y: 0 })
  })

  it('move within radius returns a proportional vector', () => {
    const js = createJoystick()
    beginJoystick(js, 1, 0, 0)
    moveJoystick(js, JOYSTICK_RADIUS / 2, 0)
    const v = readJoystick(js)
    expect(v.x).toBeCloseTo(0.5)
    expect(v.y).toBeCloseTo(0)
  })

  it('move past radius clamps magnitude to 1', () => {
    const js = createJoystick()
    beginJoystick(js, 1, 0, 0)
    moveJoystick(js, JOYSTICK_RADIUS * 3, 0)
    const v = readJoystick(js)
    expect(v.x).toBeCloseTo(1)
    expect(v.y).toBeCloseTo(0)
  })

  it('diagonal past radius stays unit length', () => {
    const js = createJoystick()
    beginJoystick(js, 1, 0, 0)
    moveJoystick(js, 1000, 1000)
    const v = readJoystick(js)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1)
  })

  it('negative y means thumb moved up', () => {
    const js = createJoystick()
    beginJoystick(js, 1, 100, 100)
    moveJoystick(js, 100, 40)
    const v = readJoystick(js)
    expect(v.y).toBeLessThan(0)
  })

  it('move is a no-op when inactive', () => {
    const js = createJoystick()
    moveJoystick(js, 50, 50)
    expect(js.currentX).toBe(0)
    expect(js.currentY).toBe(0)
  })

  it('end clears active state and vector', () => {
    const js = createJoystick()
    beginJoystick(js, 1, 0, 0)
    moveJoystick(js, 40, 0)
    endJoystick(js)
    expect(js.active).toBe(false)
    expect(js.pointerId).toBeNull()
    expect(readJoystick(js)).toEqual({ x: 0, y: 0 })
  })
})
