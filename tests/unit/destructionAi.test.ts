import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CIRCLE,
  step as aiStep,
  _desiredHeadingForTest,
} from '@/game/destruction/ai'
import { IDENTITY_DRIVABILITY } from '@/game/destruction/drivability'
import type { PhysicsState } from '@/game/physics'

function freshState(overrides: Partial<PhysicsState> = {}): PhysicsState {
  // Spawn the test car on the AI's circle facing the CCW tangent.
  // At (radius, 0) the CCW tangent direction is +Z, which translates
  // to heading = -PI/2 under the physics module's
  // forward = (cos h, -sin h) convention.
  return {
    x: DEFAULT_CIRCLE.radius,
    z: 0,
    heading: -Math.PI / 2,
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

  it('returns near-zero steer when on the rail at zero target speed', () => {
    // With tangentialSpeed=0 the feedforward term drops out, so the
    // car on the tangent at the target radius receives zero steer.
    const target = { ...DEFAULT_CIRCLE, tangentialSpeed: 0 }
    const state = freshState()
    state.heading = _desiredHeadingForTest(state, target)
    const out = aiStep(state, IDENTITY_DRIVABILITY, target)
    expect(Math.abs(out.steer)).toBeLessThan(0.05)
  })

  it('applies the negative feedforward steer required for CCW circling', () => {
    // At the default circle (V=18, R=36, steerRateHigh=2.2) the
    // feedforward steer is -V / (R * steerRateHigh) ~ -0.227. The
    // sign is negative because under the physics convention CCW
    // circling around the origin requires the heading angle to
    // DECREASE (forward direction rotating CCW), which in turn
    // requires negative steer.
    const state = freshState()
    state.heading = _desiredHeadingForTest(state, DEFAULT_CIRCLE)
    const out = aiStep(state, IDENTITY_DRIVABILITY)
    const expectedFf =
      -DEFAULT_CIRCLE.tangentialSpeed / (DEFAULT_CIRCLE.radius * 2.2)
    expect(out.steer).toBeCloseTo(expectedFf, 2)
  })

  it('heading-error term steers toward the desired tangent', () => {
    // With zero target speed the feedforward and radial terms drop
    // out, so only the heading proportional term remains. Setting
    // heading 0.4 rad below the desired CCW tangent (i.e. more
    // negative) should produce POSITIVE steer to raise the heading
    // back up.
    const target = { ...DEFAULT_CIRCLE, tangentialSpeed: 0 }
    const state = freshState()
    const desired = _desiredHeadingForTest(state, target)
    state.heading = desired - 0.4
    const out = aiStep(state, IDENTITY_DRIVABILITY, target)
    expect(out.steer).toBeGreaterThan(0)
  })

  it('steers inward when the car has drifted outside the target radius', () => {
    // No feedforward, no heading error: only the radial term fires.
    // Drifting outward (r > target) tightens the CCW circle, which
    // requires MORE NEGATIVE steer (heading decreasing faster).
    const target = { ...DEFAULT_CIRCLE, tangentialSpeed: 0 }
    const state = freshState({ x: target.radius * 1.5 })
    state.heading = _desiredHeadingForTest(state, target)
    const out = aiStep(state, IDENTITY_DRIVABILITY, target)
    expect(out.steer).toBeLessThan(0)
  })

  it('layers drivability steer bias on top of the combined steer', () => {
    const state = freshState()
    state.heading = _desiredHeadingForTest(state, DEFAULT_CIRCLE)
    const baseline = aiStep(state, IDENTITY_DRIVABILITY)
    const biased = aiStep(state, { ...IDENTITY_DRIVABILITY, steerBias: 0.2 })
    expect(biased.steer).toBeCloseTo(baseline.steer + 0.2, 2)
  })
})
