import { describe, it, expect } from 'vitest'
import { DEFAULT_CAR_PARAMS, stepPhysics } from '@/game/physics'

const s0 = { x: 0, z: 0, heading: 0, speed: 0 }

describe('stepPhysics', () => {
  it('full throttle accelerates forward', () => {
    const s = stepPhysics(s0, { throttle: 1, steer: 0, handbrake: false }, 1, true)
    expect(s.speed).toBeGreaterThan(0)
    expect(s.speed).toBeLessThanOrEqual(DEFAULT_CAR_PARAMS.maxSpeed)
    // Heading 0 = +X, so we move in +X.
    expect(s.x).toBeGreaterThan(0)
    expect(Math.abs(s.z)).toBeLessThan(1e-9)
  })

  it('caps at max speed on track', () => {
    let s = s0
    for (let i = 0; i < 30; i++) {
      s = stepPhysics(s, { throttle: 1, steer: 0, handbrake: false }, 0.5, true)
    }
    expect(s.speed).toBeLessThanOrEqual(DEFAULT_CAR_PARAMS.maxSpeed + 1e-6)
  })

  it('off-track caps speed even under full throttle', () => {
    let s = s0
    for (let i = 0; i < 30; i++) {
      s = stepPhysics(s, { throttle: 1, steer: 0, handbrake: false }, 0.5, false)
    }
    expect(s.speed).toBeLessThanOrEqual(DEFAULT_CAR_PARAMS.offTrackMaxSpeed + 1e-6)
  })

  it('brake while moving slows the car', () => {
    const moving = { x: 0, z: 0, heading: 0, speed: 20 }
    const s = stepPhysics(moving, { throttle: -1, steer: 0, handbrake: false }, 0.2, true)
    expect(s.speed).toBeLessThan(20)
  })

  it('coasting with no input decays toward 0', () => {
    let s = { ...s0, speed: 5 }
    for (let i = 0; i < 10; i++) {
      s = stepPhysics(s, { throttle: 0, steer: 0, handbrake: false }, 0.2, true)
    }
    expect(s.speed).toBeCloseTo(0, 1)
  })

  it('steering below min speed does not change heading', () => {
    const s = stepPhysics(
      { ...s0, speed: 0.1 },
      { throttle: 0, steer: 1, handbrake: false },
      0.2,
      true,
    )
    expect(s.heading).toBe(0)
  })

  it('steering while moving forward turns heading', () => {
    const s = stepPhysics(
      { ...s0, speed: 10 },
      { throttle: 1, steer: 1, handbrake: false },
      0.2,
      true,
    )
    expect(s.heading).not.toBe(0)
  })
})
