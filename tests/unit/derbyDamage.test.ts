import { describe, expect, it } from 'vitest'
import {
  classifyAttacker,
  resolveCollision,
  DAMAGE_SCALE,
  MAX_HIT_DAMAGE,
  SPEED_DIFF_THRESHOLD,
  type ContactInfo,
} from '@/game/derbyDamage'
import {
  initCarState,
  type DerbyCarState,
} from '@/game/derbyVehicleState'
import { DERBY_VEHICLES } from '@/lib/derbyVehicles'

function makeCar(
  carIdx: number,
  type: keyof typeof DERBY_VEHICLES,
  overrides: Partial<DerbyCarState['physics']> = {},
): DerbyCarState {
  const config = DERBY_VEHICLES[type]
  return initCarState(carIdx, config, {
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    ...overrides,
  })
}

const NORMAL_PLUS_X: ContactInfo = { nx: 1, nz: 0 }

describe('classifyAttacker', () => {
  it('picks the noticeably faster car', () => {
    const a = makeCar(0, 'car', { speed: SPEED_DIFF_THRESHOLD + 4 })
    const b = makeCar(1, 'car', { speed: 1 })
    expect(classifyAttacker(a, b, NORMAL_PLUS_X)).toBe('aIsAttacker')
    const c = makeCar(0, 'car', { speed: 1 })
    const d = makeCar(1, 'car', { speed: SPEED_DIFF_THRESHOLD + 4 })
    expect(classifyAttacker(c, d, NORMAL_PLUS_X)).toBe('bIsAttacker')
  })

  it('picks whichever car drives into the contact when speeds are close', () => {
    // a heads in +X (heading 0, positive speed). b is stationary. Contact
    // points a -> b along +X, so a is moving into the contact.
    const a = makeCar(0, 'car', { speed: 8, heading: 0 })
    const b = makeCar(1, 'car', { speed: 0 })
    expect(classifyAttacker(a, b, NORMAL_PLUS_X)).toBe('aIsAttacker')
  })

  it('rear-end while reversing: the forward car is the attacker', () => {
    // b is reversing (negative speed). a is moving forward into b's rear.
    // Heading 0 = +X, speed negative => velocity in -X. Contact normal
    // points a -> b along +X, so a moves into the contact at +X * 5 = +5
    // (driving). b moves into the contact along -X dotted with +X = -5
    // (driving away). Verdict: a is attacker.
    const a = makeCar(0, 'car', { speed: 5, heading: 0 })
    const b = makeCar(1, 'car', { speed: -2, heading: 0 })
    expect(classifyAttacker(a, b, NORMAL_PLUS_X)).toBe('aIsAttacker')
  })

  it('returns split when both move slowly side-on', () => {
    // a heading +X with speed 1; b heading -X with speed 1. Neither has a
    // strong component into the +X contact normal.
    const a = makeCar(0, 'car', { speed: 1, heading: 0 })
    const b = makeCar(1, 'car', { speed: 1, heading: Math.PI })
    expect(classifyAttacker(a, b, NORMAL_PLUS_X)).toBe('split')
  })
})

describe('resolveCollision', () => {
  it('only the victim takes damage when there is a clear attacker', () => {
    const a = makeCar(0, 'bigTruck', { speed: 20, heading: 0 })
    const b = makeCar(1, 'car', { speed: 0 })
    const out = resolveCollision(
      a,
      b,
      DERBY_VEHICLES.bigTruck,
      DERBY_VEHICLES.car,
      NORMAL_PLUS_X,
    )
    expect(out.attacker).toBe('aIsAttacker')
    expect(out.aDelta).toBe(0)
    expect(out.bDelta).toBeGreaterThan(0)
  })

  it('lands a visible truck hit from a high closing speed', () => {
    const a = makeCar(0, 'bigTruck', { speed: 40, heading: 0 })
    const b = makeCar(1, 'car', { speed: 0 })
    const out = resolveCollision(
      a,
      b,
      DERBY_VEHICLES.bigTruck,
      DERBY_VEHICLES.car,
      NORMAL_PLUS_X,
    )
    expect(DAMAGE_SCALE).toBe(30)
    expect(out.bDelta).toBeGreaterThanOrEqual(10)
  })

  it('faster car wins by speed even when the slow car is heavier', () => {
    // Racecar at high speed into a stationary big truck. The racecar's
    // speed advantage is well above SPEED_DIFF_THRESHOLD so it is the
    // attacker and the truck takes damage.
    const a = makeCar(0, 'racecar', { speed: 30, heading: 0 })
    const b = makeCar(1, 'bigTruck', { speed: 0 })
    const out = resolveCollision(
      a,
      b,
      DERBY_VEHICLES.racecar,
      DERBY_VEHICLES.bigTruck,
      NORMAL_PLUS_X,
    )
    expect(out.attacker).toBe('aIsAttacker')
    expect(out.bDelta).toBeGreaterThan(0)
    expect(out.aDelta).toBe(0)
  })

  it('split-case: the lighter car takes more damage', () => {
    // Both closing along +X at low speed: a heads forward (+X), b heads
    // backward toward a (-X). Neither's speed-into-contact crosses the
    // VELOCITY_INTO_CONTACT_THRESHOLD so classifyAttacker returns split.
    // The closing motion exists along the contact normal so the impact
    // term is non-zero and the mass-weighted split path is exercised.
    const a = makeCar(0, 'racecar', { speed: 1, heading: 0 })
    const b = makeCar(1, 'bigTruck', { speed: 1, heading: Math.PI })
    const out = resolveCollision(
      a,
      b,
      DERBY_VEHICLES.racecar,
      DERBY_VEHICLES.bigTruck,
      NORMAL_PLUS_X,
    )
    expect(out.attacker).toBe('split')
    // Lighter racecar takes more damage than the heavier bigTruck.
    expect(out.aDelta).toBeGreaterThan(out.bDelta)
  })

  it('preserves tiny non-zero hit damage', () => {
    const a = makeCar(0, 'car', { speed: 0.05, heading: 0 })
    const b = makeCar(1, 'car', { speed: 0, heading: 0 })
    const out = resolveCollision(
      a,
      b,
      DERBY_VEHICLES.car,
      DERBY_VEHICLES.car,
      NORMAL_PLUS_X,
    )
    expect(out.aDelta + out.bDelta).toBeGreaterThan(0)
    expect(out.aDelta + out.bDelta).toBeLessThan(1)
  })

  it('keeps fractional split damage instead of rounding it away', () => {
    const a = makeCar(0, 'racecar', { speed: 1, heading: 0 })
    const b = makeCar(1, 'bigTruck', { speed: 1, heading: Math.PI })
    const out = resolveCollision(
      a,
      b,
      DERBY_VEHICLES.racecar,
      DERBY_VEHICLES.bigTruck,
      NORMAL_PLUS_X,
    )
    expect(out.attacker).toBe('split')
    expect(out.aDelta).toBeGreaterThan(0)
    expect(Number.isInteger(out.aDelta)).toBe(false)
    expect(out.bDelta).toBeGreaterThan(0)
    expect(Number.isInteger(out.bDelta)).toBe(false)
  })

  it('zero relative speed produces zero damage regardless of verdict', () => {
    const a = makeCar(0, 'car', { speed: 5, heading: 0 })
    const b = makeCar(1, 'car', { speed: 5, heading: 0 })
    const out = resolveCollision(
      a,
      b,
      DERBY_VEHICLES.car,
      DERBY_VEHICLES.car,
      NORMAL_PLUS_X,
    )
    expect(out.aDelta).toBe(0)
    expect(out.bDelta).toBe(0)
    expect(out.relativeSpeed).toBe(0)
  })

  it('clamps a single hit to the max-hit ceiling', () => {
    // Fabricate an absurd closing speed by overriding physics. The clamp
    // should keep bDelta bounded.
    const a = makeCar(0, 'bigTruck', { speed: 100, heading: 0 })
    const b = makeCar(1, 'racecar', { speed: 0 })
    const out = resolveCollision(
      a,
      b,
      DERBY_VEHICLES.bigTruck,
      DERBY_VEHICLES.racecar,
      NORMAL_PLUS_X,
    )
    expect(out.bDelta).toBe(MAX_HIT_DAMAGE)
  })

  it('reports a non-zero relativeSpeed for a clear hit', () => {
    const a = makeCar(0, 'car', { speed: 18, heading: 0 })
    const b = makeCar(1, 'car', { speed: 0 })
    const out = resolveCollision(
      a,
      b,
      DERBY_VEHICLES.car,
      DERBY_VEHICLES.car,
      NORMAL_PLUS_X,
    )
    expect(out.relativeSpeed).toBeCloseTo(18, 5)
  })
})
