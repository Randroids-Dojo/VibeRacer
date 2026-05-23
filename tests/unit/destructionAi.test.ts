import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CIRCLE,
  step as aiStep,
  _desiredHeadingForTest,
} from '@/game/destruction/ai'
import { IDENTITY_DRIVABILITY } from '@/game/destruction/drivability'
import type { PhysicsState } from '@/game/physics'

function freshState(overrides: Partial<PhysicsState> = {}): PhysicsState {
  return {
    x: 18,
    z: 0,
    heading: Math.PI / 2,
    speed: 0,
    angularVelocity: 0,
    ...overrides,
  }
}

describe('ai.step (circle controller)', () => {
  it('zeros inputs when the car is stalled', () => {
    const out = aiStep(
      freshState(),
      { ...IDENTITY_DRIVABILITY, stalled: true },
    )
    expect(out.throttle).toBe(0)
    expect(out.steer).toBe(0)
    expect(out.handbrake).toBe(false)
  })

  it('throttles up when the car is below the target speed', () => {
    const out = aiStep(
      freshState({ speed: 0 }),
      IDENTITY_DRIVABILITY,
    )
    expect(out.throttle).toBeGreaterThan(0)
  })

  it('rolls off the throttle when the car is at the target speed', () => {
    const out = aiStep(
      freshState({ speed: DEFAULT_CIRCLE.tangentialSpeed }),
      IDENTITY_DRIVABILITY,
    )
    expect(out.throttle).toBeCloseTo(0, 1)
  })

  it('returns near-zero steer when heading equals the circle tangent', () => {
    const state = freshState()
    state.heading = _desiredHeadingForTest(state, DEFAULT_CIRCLE)
    const out = aiStep(state, IDENTITY_DRIVABILITY)
    expect(Math.abs(out.steer)).toBeLessThan(0.05)
  })

  it('steers to correct toward the tangent when off-heading', () => {
    const state = freshState()
    const desired = _desiredHeadingForTest(state, DEFAULT_CIRCLE)
    state.heading = desired - 0.4
    const out = aiStep(state, IDENTITY_DRIVABILITY)
    expect(out.steer).toBeGreaterThan(0)
  })

  it('layers drivability steer bias on top of the proportional steer', () => {
    const state = freshState()
    state.heading = _desiredHeadingForTest(state, DEFAULT_CIRCLE)
    const out = aiStep(
      state,
      { ...IDENTITY_DRIVABILITY, steerBias: 0.2 },
    )
    expect(out.steer).toBeCloseTo(0.2, 2)
  })
})
