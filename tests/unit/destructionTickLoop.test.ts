import { describe, expect, it } from 'vitest'
import { stepPhysics, type PhysicsState } from '@/game/physics'
import {
  DEFAULT_CIRCLE,
  step as aiStep,
} from '@/game/destruction/ai'
import { IDENTITY_DRIVABILITY } from '@/game/destruction/drivability'

// Integration test for the lab's tick loop. Drives the AI + stepPhysics
// together for a handful of simulated frames and asserts the car
// actually moves. This catches the "discarded stepPhysics return" bug
// pattern (RULE 12): stepPhysics returns a new state and does not
// mutate; a caller that ignores the return value sees a frozen
// simulation but type-check + lint stay clean.

describe('destruction lab tick loop', () => {
  it('AI step + stepPhysics moves the car over time', () => {
    let state: PhysicsState = {
      x: DEFAULT_CIRCLE.radius,
      z: 0,
      heading: Math.PI / 2,
      speed: 0,
      angularVelocity: 0,
    }
    const startX = state.x
    const startZ = state.z

    // Run sixty 16 ms frames, mirroring the rAF loop pattern in
    // DestructionLab. If the caller fails to capture stepPhysics's
    // return, `state` will not change and this test will fail.
    const dt = 1 / 60
    for (let i = 0; i < 60; i++) {
      const input = aiStep(state, IDENTITY_DRIVABILITY)
      state = stepPhysics(
        state,
        input,
        dt,
        true,
        undefined,
        IDENTITY_DRIVABILITY.accelFactor,
        IDENTITY_DRIVABILITY.maxSpeedFactor,
      )
    }

    expect(state.speed).toBeGreaterThan(2)
    const distance = Math.hypot(state.x - startX, state.z - startZ)
    expect(distance).toBeGreaterThan(0.5)
  })

  it('AI step with stalled drivability leaves the car stationary', () => {
    let state: PhysicsState = {
      x: DEFAULT_CIRCLE.radius,
      z: 0,
      heading: Math.PI / 2,
      speed: 0,
      angularVelocity: 0,
    }
    const startX = state.x
    const startZ = state.z
    const dt = 1 / 60
    for (let i = 0; i < 60; i++) {
      const input = aiStep(state, { ...IDENTITY_DRIVABILITY, stalled: true })
      state = stepPhysics(
        state,
        input,
        dt,
        true,
        undefined,
        IDENTITY_DRIVABILITY.accelFactor,
        IDENTITY_DRIVABILITY.maxSpeedFactor,
      )
    }
    expect(state.speed).toBe(0)
    expect(state.x).toBe(startX)
    expect(state.z).toBe(startZ)
  })
})
