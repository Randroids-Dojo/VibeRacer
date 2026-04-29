import { describe, it, expect } from 'vitest'
import {
  ANGULAR_VELOCITY_RESPONSE,
  DEFAULT_CAR_PARAMS,
  stepPhysics,
} from '@/game/physics'

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
    expect(s.angularVelocity).toBe(0)
  })

  it('steering while moving forward turns heading', () => {
    const s = stepPhysics(
      { ...s0, speed: 10 },
      { throttle: 1, steer: 1, handbrake: false },
      0.2,
      true,
    )
    expect(s.heading).not.toBe(0)
    expect(s.angularVelocity).toBeGreaterThan(0)
  })

  it('eases angular velocity toward the steering target', () => {
    const dt = 0.1
    const s = stepPhysics(
      { ...s0, speed: DEFAULT_CAR_PARAMS.maxSpeed },
      { throttle: 0, steer: 1, handbrake: false },
      dt,
      true,
    )
    const blend = 1 - Math.exp(-ANGULAR_VELOCITY_RESPONSE * dt)
    const target = DEFAULT_CAR_PARAMS.steerRateHigh
    expect(s.angularVelocity).toBeGreaterThan(0)
    expect(s.angularVelocity).toBeLessThan(target)
    expect(s.angularVelocity).toBeCloseTo(target * blend, 5)
    expect(s.heading).toBeCloseTo(s.angularVelocity! * dt, 5)
  })

  it('damps angular velocity back toward zero without steering input', () => {
    const s = stepPhysics(
      { ...s0, speed: 10, angularVelocity: 2 },
      { throttle: 0, steer: 0, handbrake: false },
      0.1,
      true,
    )
    expect(s.angularVelocity).toBeGreaterThan(0)
    expect(s.angularVelocity).toBeLessThan(2)
  })

  it('reversing flips angular velocity direction', () => {
    const s = stepPhysics(
      { ...s0, speed: -5 },
      { throttle: 0, steer: 1, handbrake: false },
      0.1,
      true,
    )
    expect(s.angularVelocity).toBeLessThan(0)
  })

  it('honors a custom CarParams override (higher accel reaches a higher speed)', () => {
    const slow = stepPhysics(
      s0,
      { throttle: 1, steer: 0, handbrake: false },
      0.5,
      true,
    )
    const fast = stepPhysics(
      s0,
      { throttle: 1, steer: 0, handbrake: false },
      0.5,
      true,
      { ...DEFAULT_CAR_PARAMS, accel: DEFAULT_CAR_PARAMS.accel * 2 },
    )
    expect(fast.speed).toBeGreaterThan(slow.speed)
  })

  it('a custom maxSpeed cap is respected', () => {
    let s = s0
    const params = { ...DEFAULT_CAR_PARAMS, maxSpeed: 12 }
    for (let i = 0; i < 30; i++) {
      s = stepPhysics(s, { throttle: 1, steer: 0, handbrake: false }, 0.5, true, params)
    }
    expect(s.speed).toBeLessThanOrEqual(params.maxSpeed + 1e-6)
  })

  it('steer rate lerps from steerRateLow at low speed to steerRateHigh at top speed', () => {
    const params = {
      ...DEFAULT_CAR_PARAMS,
      steerRateLow: 4,
      steerRateHigh: 1,
    }
    const dt = 0.1
    // Use small dt + throttle to keep the speed steady across the step. At a
    // speed just above minSpeedForSteering the rate should be closer to the
    // low-speed value; at max speed it should land on the high-speed value.
    const slow = stepPhysics(
      { ...s0, speed: 2 },
      { throttle: 1, steer: 1, handbrake: false },
      dt,
      true,
      params,
    )
    const fast = stepPhysics(
      { ...s0, speed: params.maxSpeed },
      { throttle: 1, steer: 1, handbrake: false },
      dt,
      true,
      params,
    )

    // Slow heading change should be much larger than fast heading change.
    expect(slow.heading).toBeGreaterThan(fast.heading)
    // Fast angular velocity should target the high-speed rate without snapping
    // to it on the first frame.
    expect(fast.angularVelocity).toBeLessThan(params.steerRateHigh)
    expect(fast.angularVelocity).toBeGreaterThan(0)
    // Slow heading change should not exceed the low-speed cap over the step.
    expect(slow.heading).toBeLessThanOrEqual(params.steerRateLow * dt + 1e-6)
  })

  it('symmetric steer rates reproduce the old single-rate behavior', () => {
    const params = {
      ...DEFAULT_CAR_PARAMS,
      steerRateLow: 3,
      steerRateHigh: 3,
    }
    const dt = 0.1
    const turnedSlow = stepPhysics(
      { ...s0, speed: 5 },
      { throttle: 0, steer: 1, handbrake: false },
      dt,
      true,
      params,
    )
    const turnedFast = stepPhysics(
      { ...s0, speed: 20 },
      { throttle: 0, steer: 1, handbrake: false },
      dt,
      true,
      params,
    )
    expect(turnedSlow.heading).toBeCloseTo(turnedFast.heading, 5)
  })
})
