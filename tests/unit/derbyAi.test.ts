import { describe, expect, it } from 'vitest'
import {
  arenaSteerOverride,
  initBrain,
  pickTarget,
  RAM_RADIUS,
  RECOVER_DURATION_MS,
  steerToward,
  stepAi,
} from '@/game/derbyAi'
import { initCarState, type DerbyCarState } from '@/game/derbyVehicleState'
import { DERBY_VEHICLES } from '@/lib/derbyVehicles'

function carAt(
  idx: number,
  type: keyof typeof DERBY_VEHICLES,
  x: number,
  z: number,
  heading = 0,
  speed = 0,
): DerbyCarState {
  return initCarState(idx, DERBY_VEHICLES[type], { x, z, heading, speed })
}

describe('pickTarget', () => {
  it('picks the nearest alive enemy when health is uniform', () => {
    const cars: DerbyCarState[] = [
      carAt(0, 'car', 0, 0),
      carAt(1, 'car', 50, 0),
      carAt(2, 'car', 10, 0),
      carAt(3, 'car', -30, 0),
    ]
    const brain = initBrain()
    const t = pickTarget(brain, {
      selfIdx: 0,
      cars,
      arenaRadius: 60,
      nowMs: 0,
    })
    expect(t).not.toBeNull()
    expect(t!.carIdx).toBe(2)
  })

  it('prefers a wounded farther target over a healthy nearer one when wounded enough', () => {
    const cars: DerbyCarState[] = [
      carAt(0, 'car', 0, 0),
      carAt(1, 'car', 10, 0), // healthy, near
      carAt(2, 'car', 25, 0), // wounded, farther
    ]
    cars[2].health = 5
    const t = pickTarget(initBrain(), {
      selfIdx: 0,
      cars,
      arenaRadius: 60,
      nowMs: 0,
    })
    expect(t!.carIdx).toBe(2)
  })

  it('skips destroyed cars', () => {
    const cars: DerbyCarState[] = [
      carAt(0, 'car', 0, 0),
      carAt(1, 'car', 5, 0),
      carAt(2, 'car', 50, 0),
    ]
    cars[1].status = 'destroyed'
    cars[1].health = 0
    const t = pickTarget(initBrain(), {
      selfIdx: 0,
      cars,
      arenaRadius: 60,
      nowMs: 0,
    })
    expect(t!.carIdx).toBe(2)
  })

  it('returns null when no alive enemies remain', () => {
    const cars: DerbyCarState[] = [
      carAt(0, 'car', 0, 0),
      carAt(1, 'car', 5, 0),
    ]
    cars[1].status = 'destroyed'
    cars[1].health = 0
    const t = pickTarget(initBrain(), {
      selfIdx: 0,
      cars,
      arenaRadius: 60,
      nowMs: 0,
    })
    expect(t).toBeNull()
  })
})

describe('steerToward', () => {
  it('returns near-zero steer when already heading at the aim point', () => {
    const self = carAt(0, 'car', 0, 0, 0, 0) // heading +X
    expect(Math.abs(steerToward(self, 10, 0))).toBeLessThan(0.05)
  })

  it('returns positive steer for a leftward aim point', () => {
    const self = carAt(0, 'car', 0, 0, 0, 0) // heading +X
    // Aim at +X, -Z (north) which is a leftward aim from +X heading.
    // Delta heading should be positive.
    const steer = steerToward(self, 10, -10)
    expect(steer).toBeGreaterThan(0)
  })

  it('returns negative steer for a rightward aim point', () => {
    const self = carAt(0, 'car', 0, 0, 0, 0)
    const steer = steerToward(self, 10, 10)
    expect(steer).toBeLessThan(0)
  })

  it('clamps steer in [-1, 1]', () => {
    const self = carAt(0, 'car', 0, 0, 0, 0)
    const aim = steerToward(self, -10, 0) // 180 degrees off
    expect(aim).toBeLessThanOrEqual(1)
    expect(aim).toBeGreaterThanOrEqual(-1)
  })
})

describe('arenaSteerOverride', () => {
  it('returns null comfortably inside the arena', () => {
    const self = carAt(0, 'car', 0, 0)
    expect(arenaSteerOverride(self, 60)).toBeNull()
  })

  it('returns a steer command near the boundary', () => {
    const self = carAt(0, 'car', 58, 0, 0)
    const steer = arenaSteerOverride(self, 60)
    expect(steer).not.toBeNull()
  })
})

describe('stepAi', () => {
  it('outputs zero on a destroyed car', () => {
    const self = carAt(0, 'car', 0, 0)
    self.status = 'destroyed'
    const out = stepAi(initBrain(), {
      selfIdx: 0,
      cars: [self],
      arenaRadius: 60,
      nowMs: 0,
    })
    expect(out).toEqual({ throttle: 0, steer: 0, handbrake: false })
  })

  it('issues full throttle in ram mode when target is in contact range', () => {
    const cars: DerbyCarState[] = [
      carAt(0, 'car', 0, 0, 0, 5),
      carAt(1, 'car', RAM_RADIUS - 0.1, 0, 0, 0),
    ]
    const brain = initBrain()
    const out = stepAi(brain, {
      selfIdx: 0,
      cars,
      arenaRadius: 60,
      nowMs: 1000,
    })
    expect(out.throttle).toBe(1)
    expect(brain.state).toBe('ram')
  })

  it('switches to approach at medium range', () => {
    const cars: DerbyCarState[] = [
      carAt(0, 'car', 0, 0, 0, 5),
      carAt(1, 'car', 20, 0, 0, 0),
    ]
    const brain = initBrain()
    stepAi(brain, { selfIdx: 0, cars, arenaRadius: 60, nowMs: 1000 })
    expect(brain.state).toBe('approach')
  })

  it('enters recover for the cooldown after a recent hit', () => {
    const cars: DerbyCarState[] = [
      carAt(0, 'car', 0, 0, 0, 5),
      carAt(1, 'car', 5, 0, 0, 0),
    ]
    cars[0].lastHitAtMs = 950
    const brain = initBrain()
    const out = stepAi(brain, {
      selfIdx: 0,
      cars,
      arenaRadius: 60,
      nowMs: 1000,
    })
    expect(brain.state).toBe('recover')
    expect(brain.recoverUntilMs).toBe(1000 + RECOVER_DURATION_MS)
    expect(out.throttle).toBe(-1)
    expect(out.steer).toBe(0)
  })

  it('exits recover once the timer elapses', () => {
    const cars: DerbyCarState[] = [
      carAt(0, 'car', 0, 0, 0, 5),
      carAt(1, 'car', 5, 0, 0, 0),
    ]
    const brain = initBrain()
    brain.state = 'recover'
    brain.recoverUntilMs = 500
    cars[0].lastHitAtMs = Number.NEGATIVE_INFINITY
    const out = stepAi(brain, {
      selfIdx: 0,
      cars,
      arenaRadius: 60,
      nowMs: 600,
    })
    expect(brain.state).not.toBe('recover')
    expect(out.throttle).toBe(1)
  })

  it('produces no NaN outputs across a battery of inputs', () => {
    const arenaRadius = 60
    for (const dx of [-50, -10, 0, 10, 50]) {
      for (const dz of [-50, 0, 50]) {
        for (const h of [0, Math.PI / 4, Math.PI, -Math.PI / 2]) {
          const cars: DerbyCarState[] = [
            carAt(0, 'car', 0, 0, h, 5),
            carAt(1, 'car', dx, dz, 0, 0),
          ]
          const out = stepAi(initBrain(), {
            selfIdx: 0,
            cars,
            arenaRadius,
            nowMs: 0,
          })
          expect(Number.isFinite(out.throttle)).toBe(true)
          expect(Number.isFinite(out.steer)).toBe(true)
        }
      }
    }
  })
})
