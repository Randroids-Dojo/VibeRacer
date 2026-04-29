import { describe, expect, it } from 'vitest'
import { computeContinuousRumble } from '@/lib/gamepadRumble'
import { RUMBLE_EPSILON } from '@/lib/haptics'

const BASE = {
  speedAbs: 0,
  maxSpeed: 100,
  onTrack: true,
  driftIntensity: 0,
  brakeLock: false,
}

describe('computeContinuousRumble', () => {
  it('returns silent magnitudes when fully idle on track', () => {
    const out = computeContinuousRumble(BASE)
    expect(out.strongMagnitude).toBe(0)
    expect(out.weakMagnitude).toBe(0)
  })

  it('engine purr scales with speed ratio on the strong motor only', () => {
    const half = computeContinuousRumble({ ...BASE, speedAbs: 50 })
    const full = computeContinuousRumble({ ...BASE, speedAbs: 100 })
    expect(half.weakMagnitude).toBe(0)
    expect(full.weakMagnitude).toBe(0)
    expect(half.strongMagnitude).toBeGreaterThan(0)
    expect(full.strongMagnitude).toBeGreaterThan(half.strongMagnitude)
    expect(full.strongMagnitude).toBeLessThanOrEqual(1)
  })

  it('off-track adds a chassis bias on top of engine purr', () => {
    const onTrack = computeContinuousRumble({ ...BASE, speedAbs: 50, onTrack: true })
    const offTrack = computeContinuousRumble({ ...BASE, speedAbs: 50, onTrack: false })
    expect(offTrack.strongMagnitude).toBeGreaterThan(onTrack.strongMagnitude)
    expect(offTrack.weakMagnitude).toBe(0)
  })

  it('drift intensity drives the weak motor only', () => {
    const slip = computeContinuousRumble({ ...BASE, driftIntensity: 0.8 })
    expect(slip.strongMagnitude).toBe(0)
    expect(slip.weakMagnitude).toBeGreaterThan(0)
    expect(slip.weakMagnitude).toBeLessThanOrEqual(1)
  })

  it('drift intensity scales monotonically on the weak motor', () => {
    const low = computeContinuousRumble({ ...BASE, driftIntensity: 0.2 })
    const high = computeContinuousRumble({ ...BASE, driftIntensity: 0.9 })
    expect(high.weakMagnitude).toBeGreaterThan(low.weakMagnitude)
  })

  it('brake lock layers onto the weak motor without touching the strong motor', () => {
    const idle = computeContinuousRumble({ ...BASE, brakeLock: false })
    const lock = computeContinuousRumble({ ...BASE, brakeLock: true })
    expect(idle.weakMagnitude).toBe(0)
    expect(lock.weakMagnitude).toBeGreaterThan(0)
    expect(lock.strongMagnitude).toBe(0)
  })

  it('combined drift plus brake lock saturates without exceeding 1', () => {
    const out = computeContinuousRumble({
      ...BASE,
      driftIntensity: 1,
      brakeLock: true,
    })
    expect(out.weakMagnitude).toBeLessThanOrEqual(1)
    expect(out.weakMagnitude).toBeGreaterThan(0.5)
  })

  it('snaps to exact zero when both motors land below the epsilon', () => {
    const out = computeContinuousRumble({ ...BASE, speedAbs: 0.0001 })
    expect(out.strongMagnitude).toBe(0)
    expect(out.weakMagnitude).toBe(0)
  })

  it('clamps negative or oversize inputs into [0, 1]', () => {
    const out = computeContinuousRumble({
      speedAbs: 9999,
      maxSpeed: 10,
      onTrack: false,
      driftIntensity: 5,
      brakeLock: true,
    })
    expect(out.strongMagnitude).toBeGreaterThan(0)
    expect(out.strongMagnitude).toBeLessThanOrEqual(1)
    expect(out.weakMagnitude).toBeGreaterThan(0)
    expect(out.weakMagnitude).toBeLessThanOrEqual(1)
  })

  it('returns silent magnitudes when maxSpeed is non-positive (defensive)', () => {
    const zero = computeContinuousRumble({ ...BASE, maxSpeed: 0, speedAbs: 50 })
    const negative = computeContinuousRumble({ ...BASE, maxSpeed: -1, speedAbs: 50 })
    expect(zero.strongMagnitude).toBe(0)
    expect(zero.weakMagnitude).toBe(0)
    expect(negative.strongMagnitude).toBe(0)
    expect(negative.weakMagnitude).toBe(0)
  })

  it('survives NaN and Infinity inputs without throwing or returning NaN', () => {
    const out = computeContinuousRumble({
      speedAbs: NaN,
      maxSpeed: 100,
      onTrack: false,
      driftIntensity: Infinity,
      brakeLock: false,
    })
    expect(Number.isFinite(out.strongMagnitude)).toBe(true)
    expect(Number.isFinite(out.weakMagnitude)).toBe(true)
    expect(out.strongMagnitude).toBeGreaterThanOrEqual(0)
    expect(out.weakMagnitude).toBeGreaterThanOrEqual(0)
  })

  it('off-track baseline alone clears the epsilon (cue is felt immediately)', () => {
    const out = computeContinuousRumble({ ...BASE, onTrack: false })
    expect(out.strongMagnitude).toBeGreaterThan(RUMBLE_EPSILON)
  })
})
