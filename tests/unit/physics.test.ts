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

  it('quartic taper: near-launch accel matches linear, near-vMax accel approaches zero', () => {
    // From standstill with a tiny dt, taper at v=0 is ~1 so the speed gain
    // should be very close to accel*dt.
    const dt = 0.05
    const launch = stepPhysics(
      s0,
      { throttle: 1, steer: 0, handbrake: false },
      dt,
      true,
    )
    const linearGain = DEFAULT_CAR_PARAMS.accel * dt
    expect(launch.speed).toBeGreaterThan(linearGain * 0.95)
    expect(launch.speed).toBeLessThanOrEqual(linearGain + 1e-9)

    // At 99% of vMax the taper is 1 - 0.99^4 = ~0.039, so the per-second
    // speed gain should be ~4% of accel.
    const nearTop = stepPhysics(
      { ...s0, speed: DEFAULT_CAR_PARAMS.maxSpeed * 0.99 },
      { throttle: 1, steer: 0, handbrake: false },
      0.1,
      true,
    )
    const gain = nearTop.speed - DEFAULT_CAR_PARAMS.maxSpeed * 0.99
    expect(gain).toBeGreaterThan(0)
    expect(gain).toBeLessThan(DEFAULT_CAR_PARAMS.accel * 0.1 * 0.1)
  })

  it('linear taper exponent recovers the legacy curve', () => {
    // Pass exponent=1 (or 0) to opt out - drag mode does this. Per-tick
    // gain should match the pre-taper formula speed += accel * throttle * dt.
    const dt = 0.5
    const result = stepPhysics(
      { ...s0, speed: 5 },
      { throttle: 1, steer: 0, handbrake: false },
      dt,
      true,
      DEFAULT_CAR_PARAMS,
      1,
      1,
      0,
      1,
    )
    const expected = 5 + DEFAULT_CAR_PARAMS.accel * dt
    expect(result.speed).toBeCloseTo(
      Math.min(expected, DEFAULT_CAR_PARAMS.maxSpeed),
      6,
    )
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

  it('off-track from a standstill still accelerates with throttle (not stuck at zero)', () => {
    let s = s0
    for (let i = 0; i < 60; i++) {
      s = stepPhysics(s, { throttle: 1, steer: 0, handbrake: false }, 1 / 60, false)
    }
    expect(s.speed).toBeGreaterThan(1)
    expect(s.speed).toBeLessThanOrEqual(DEFAULT_CAR_PARAMS.offTrackMaxSpeed + 1e-6)
  })

  it('off-track partial throttle still escapes a standstill', () => {
    let s = s0
    for (let i = 0; i < 120; i++) {
      s = stepPhysics(s, { throttle: 0.5, steer: 0, handbrake: false }, 1 / 60, false)
    }
    expect(s.speed).toBeGreaterThan(0.5)
  })

  it('off-track reverse from a standstill builds speed (not stuck)', () => {
    let s = s0
    for (let i = 0; i < 60; i++) {
      s = stepPhysics(s, { throttle: -1, steer: 0, handbrake: false }, 1 / 60, false)
    }
    expect(s.speed).toBeLessThan(-0.5)
    expect(s.speed).toBeGreaterThanOrEqual(-DEFAULT_CAR_PARAMS.offTrackMaxSpeed - 1e-6)
  })

  it('off-track entry at high speed still gets pulled down to the cap', () => {
    let s = { ...s0, speed: 20 }
    for (let i = 0; i < 30; i++) {
      s = stepPhysics(s, { throttle: 1, steer: 0, handbrake: false }, 0.5, false)
    }
    expect(s.speed).toBeLessThanOrEqual(DEFAULT_CAR_PARAMS.offTrackMaxSpeed + 1e-6)
  })

  it('off-track coasting decays speed to zero', () => {
    let s = { ...s0, speed: 5 }
    for (let i = 0; i < 60; i++) {
      s = stepPhysics(s, { throttle: 0, steer: 0, handbrake: false }, 1 / 60, false)
    }
    expect(s.speed).toBeCloseTo(0, 1)
  })

  it('handbrake bleeds speed faster than coasting at the same starting speed', () => {
    const moving = { x: 0, z: 0, heading: 0, speed: 15 }
    const coasted = stepPhysics(
      moving,
      { throttle: 0, steer: 0, handbrake: false },
      0.1,
      true,
    )
    const handbraked = stepPhysics(
      moving,
      { throttle: 0, steer: 0, handbrake: true },
      0.1,
      true,
    )
    expect(handbraked.speed).toBeLessThan(coasted.speed)
    expect(handbraked.speed).toBeGreaterThanOrEqual(0)
  })

  it('handbrake produces a snappier yaw response than coasting at the same input', () => {
    const dt = 0.1
    const moving = { x: 0, z: 0, heading: 0, speed: 15 }
    const coasted = stepPhysics(
      moving,
      { throttle: 0, steer: 1, handbrake: false },
      dt,
      true,
    )
    const handbraked = stepPhysics(
      moving,
      { throttle: 0, steer: 1, handbrake: true },
      dt,
      true,
    )
    // HANDBRAKE_ANGULAR_VELOCITY_RESPONSE > ANGULAR_VELOCITY_RESPONSE so the
    // exponential blend reaches the target faster on the handbrake tick.
    expect(handbraked.angularVelocity).toBeGreaterThan(coasted.angularVelocity ?? 0)
  })

  it('handbrake clamps speed to 0 once the drag exceeds the remaining velocity', () => {
    const slow = { x: 0, z: 0, heading: 0, speed: 0.05 }
    const r = stepPhysics(
      slow,
      { throttle: 0, steer: 0, handbrake: true },
      0.1,
      true,
    )
    expect(r.speed).toBe(0)
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
