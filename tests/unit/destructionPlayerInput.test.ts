import { describe, expect, it } from 'vitest'
import { step as playerInputStep } from '@/game/destruction/playerInput'
import { IDENTITY_DRIVABILITY } from '@/game/destruction/drivability'
import type { KeyInput } from '@/hooks/useKeyboard'

function blankKeys(overrides: Partial<KeyInput> = {}): KeyInput {
  return {
    forward: false,
    backward: false,
    left: false,
    right: false,
    handbrake: false,
    shiftDown: false,
    shiftUp: false,
    axes: null,
    ...overrides,
  }
}

describe('playerInput.step', () => {
  it('clamps throttle to zero when stalled', () => {
    const out = playerInputStep(
      blankKeys({ forward: true }),
      { ...IDENTITY_DRIVABILITY, stalled: true },
    )
    expect(out.throttle).toBe(0)
    expect(out.steer).toBe(0)
    expect(out.handbrake).toBe(false)
  })

  it('forwards throttle on W key', () => {
    const out = playerInputStep(blankKeys({ forward: true }), IDENTITY_DRIVABILITY)
    expect(out.throttle).toBeGreaterThan(0)
  })

  it('steers positive on A key (physics convention: +steer turns left)', () => {
    const out = playerInputStep(blankKeys({ left: true }), IDENTITY_DRIVABILITY)
    expect(out.steer).toBeGreaterThan(0)
  })

  it('steers negative on D key', () => {
    const out = playerInputStep(blankKeys({ right: true }), IDENTITY_DRIVABILITY)
    expect(out.steer).toBeLessThan(0)
  })

  it('drivability steer bias shifts neutral steer', () => {
    const out = playerInputStep(
      blankKeys(),
      { ...IDENTITY_DRIVABILITY, steerBias: 0.25 },
    )
    expect(out.steer).toBeCloseTo(0.25, 3)
  })

  it('clamps the steer at +/- 1 when bias and key push the same way', () => {
    const out = playerInputStep(
      blankKeys({ left: true }),
      { ...IDENTITY_DRIVABILITY, steerBias: 0.7 },
    )
    expect(out.steer).toBeCloseTo(1, 6)
  })

  it('handbrake passes through', () => {
    const out = playerInputStep(
      blankKeys({ handbrake: true }),
      IDENTITY_DRIVABILITY,
    )
    expect(out.handbrake).toBe(true)
  })
})
