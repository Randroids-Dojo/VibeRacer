import { describe, expect, it } from 'vitest'
import {
  applyDamage,
  derbyScorePoints,
  initCarState,
  isDestroyed,
  rankCars,
  type DerbyCarState,
} from '@/game/derbyVehicleState'
import { DERBY_VEHICLES } from '@/lib/derbyVehicles'

function freshCar(carIdx: number, type: keyof typeof DERBY_VEHICLES): DerbyCarState {
  const config = DERBY_VEHICLES[type]
  return initCarState(carIdx, config, {
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
  })
}

describe('initCarState', () => {
  it('mirrors the config and starts the car at full health', () => {
    const car = freshCar(0, 'car')
    expect(car.health).toBe(DERBY_VEHICLES.car.health)
    expect(car.maxHealth).toBe(DERBY_VEHICLES.car.health)
    expect(car.status).toBe('alive')
    expect(car.kills).toBe(0)
    expect(car.aliveMs).toBe(0)
    expect(car.destroyedByIdx).toBeNull()
  })
})

describe('applyDamage', () => {
  it('subtracts damage and clamps at zero', () => {
    const car = freshCar(0, 'car')
    const before = car.health
    const r1 = applyDamage(car, 30, 1, 100)
    expect(r1.destroyed).toBe(false)
    expect(r1.clampedAmount).toBe(30)
    expect(car.health).toBe(before - 30)
    expect(car.lastHitAtMs).toBe(100)
  })

  it('marks the car destroyed and records the destroyer on the killing blow', () => {
    const car = freshCar(0, 'racecar')
    const result = applyDamage(car, 999, 2, 1500)
    expect(result.destroyed).toBe(true)
    expect(car.status).toBe('destroyed')
    expect(car.destroyedByIdx).toBe(2)
    expect(car.health).toBe(0)
    expect(isDestroyed(car)).toBe(true)
  })

  it('ignores subsequent hits on a destroyed car', () => {
    const car = freshCar(0, 'racecar')
    applyDamage(car, 999, 1, 100)
    const before = car.lastHitAtMs
    const r = applyDamage(car, 50, 2, 200)
    expect(r.destroyed).toBe(false)
    expect(r.clampedAmount).toBe(0)
    expect(car.lastHitAtMs).toBe(before)
  })

  it('rejects negative or non-finite amounts as no-ops', () => {
    const car = freshCar(0, 'car')
    const before = car.health
    applyDamage(car, -10, 1, 100)
    expect(car.health).toBe(before)
    applyDamage(car, Number.NaN, 1, 100)
    expect(car.health).toBe(before)
    applyDamage(car, Number.POSITIVE_INFINITY, 1, 100)
    // Not finite, so no-op.
    expect(car.health).toBe(before)
  })
})

describe('rankCars', () => {
  it('puts living cars ahead of destroyed cars', () => {
    const c0 = freshCar(0, 'car')
    const c1 = freshCar(1, 'racecar')
    applyDamage(c1, 999, 0, 100)
    const c2 = freshCar(2, 'bigTruck')
    const c3 = freshCar(3, 'schoolBus')
    const rank = rankCars([c0, c1, c2, c3])
    expect(rank[rank.length - 1]).toBe(1)
  })

  it('among living, higher health wins', () => {
    const c0 = freshCar(0, 'car')
    applyDamage(c0, 50, null, 100)
    const c1 = freshCar(1, 'car')
    const c2 = freshCar(2, 'car')
    applyDamage(c2, 10, null, 100)
    const rank = rankCars([c0, c1, c2])
    expect(rank[0]).toBe(1) // full health
    expect(rank[1]).toBe(2) // 90 hp
    expect(rank[2]).toBe(0) // 50 hp
  })

  it('among destroyed, longer aliveMs wins', () => {
    const c0 = freshCar(0, 'racecar')
    c0.aliveMs = 5_000
    applyDamage(c0, 999, null, 5_000)
    const c1 = freshCar(1, 'racecar')
    c1.aliveMs = 60_000
    applyDamage(c1, 999, null, 60_000)
    const rank = rankCars([c0, c1])
    expect(rank[0]).toBe(1)
    expect(rank[1]).toBe(0)
  })

  it('breaks ties deterministically by carIdx', () => {
    const c0 = freshCar(0, 'car')
    const c1 = freshCar(1, 'car')
    expect(rankCars([c0, c1])).toEqual([0, 1])
    expect(rankCars([c1, c0])).toEqual([0, 1])
  })
})

describe('derbyScorePoints', () => {
  it('credits 200 per kill and 100 per 10 alive seconds', () => {
    const c = freshCar(0, 'car')
    c.kills = 2
    c.aliveMs = 35_000
    expect(derbyScorePoints(c)).toBe(2 * 200 + 3 * 100)
  })

  it('rounds aliveMs down, never crediting a partial 10-second bucket', () => {
    const c = freshCar(0, 'car')
    c.kills = 0
    c.aliveMs = 9_999
    expect(derbyScorePoints(c)).toBe(0)
  })
})
