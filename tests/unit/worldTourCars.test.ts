import { describe, it, expect } from 'vitest'
import {
  CAR_CATALOG,
  STARTER_CAR_ID,
  baseParamsFor,
  buyCarPreflight,
  findCarSpec,
} from '@/game/worldTourCars'
import {
  addOwnedCar,
  defaultCareer,
  getActiveCar,
  setActiveCar,
} from '@/game/worldTourCareer'
import { DEFAULT_CAR_PARAMS } from '@/game/physics'

describe('CAR_CATALOG', () => {
  it('has the starter as the first entry with price 0', () => {
    expect(CAR_CATALOG[0]!.id).toBe(STARTER_CAR_ID)
    expect(CAR_CATALOG[0]!.price).toBe(0)
  })

  it('orders entries by ascending price', () => {
    for (let i = 1; i < CAR_CATALOG.length; i++) {
      expect(CAR_CATALOG[i]!.price).toBeGreaterThan(CAR_CATALOG[i - 1]!.price)
    }
  })

  it('uses unique ids', () => {
    const ids = new Set(CAR_CATALOG.map((c) => c.id))
    expect(ids.size).toBe(CAR_CATALOG.length)
  })
})

describe('findCarSpec', () => {
  it('returns null for an unknown id', () => {
    expect(findCarSpec('not-a-car')).toBeNull()
  })

  it('returns the spec for a known id', () => {
    const spec = findCarSpec(STARTER_CAR_ID)
    expect(spec).not.toBeNull()
    expect(spec!.id).toBe(STARTER_CAR_ID)
  })
})

describe('baseParamsFor', () => {
  it('falls back to the default car params for an unknown id', () => {
    expect(baseParamsFor('missing')).toEqual(DEFAULT_CAR_PARAMS)
  })

  it('uses the catalog params for a known id', () => {
    expect(baseParamsFor(STARTER_CAR_ID)).toEqual(DEFAULT_CAR_PARAMS)
  })
})

describe('buyCarPreflight', () => {
  it('rejects an unknown car id', () => {
    const out = buyCarPreflight({
      carId: 'ghost',
      ownedCarIds: [],
      walletCredits: 9999,
    })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toBe('unknown-car')
  })

  it('rejects a car the player already owns', () => {
    const out = buyCarPreflight({
      carId: STARTER_CAR_ID,
      ownedCarIds: [STARTER_CAR_ID],
      walletCredits: 9999,
    })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toBe('already-owned')
  })

  it('rejects on insufficient funds', () => {
    const out = buyCarPreflight({
      carId: 'speeder',
      ownedCarIds: [STARTER_CAR_ID],
      walletCredits: 10,
    })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toBe('insufficient-funds')
  })

  it('returns ok with the price when the player can afford it', () => {
    const out = buyCarPreflight({
      carId: 'speeder',
      ownedCarIds: [STARTER_CAR_ID],
      walletCredits: 99999,
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.spent).toBeGreaterThan(0)
  })
})

describe('addOwnedCar', () => {
  it('adds the car id and a stock entry in carsById', () => {
    const career = defaultCareer()
    const next = addOwnedCar(career, 'speeder')
    expect(next.ownedCarIds).toContain('speeder')
    expect(next.carsById.speeder).toEqual({
      damage: 0,
      upgrades: { engine: 0, tires: 0, brakes: 0, body: 0 },
    })
  })

  it('is idempotent when the car is already owned', () => {
    const career = defaultCareer()
    const a = addOwnedCar(career, 'speeder')
    const b = addOwnedCar(a, 'speeder')
    expect(b).toBe(a)
  })

  it('does not mutate the input career', () => {
    const career = defaultCareer()
    addOwnedCar(career, 'speeder')
    expect(career.ownedCarIds).toEqual([STARTER_CAR_ID])
  })
})

describe('setActiveCar', () => {
  it('switches the active car when it is owned', () => {
    const career = addOwnedCar(defaultCareer(), 'speeder')
    const switched = setActiveCar(career, 'speeder')
    expect(switched.activeCarId).toBe('speeder')
  })

  it('returns the input unchanged when the target is not owned', () => {
    const career = defaultCareer()
    const out = setActiveCar(career, 'apex')
    expect(out).toBe(career)
  })

  it('preserves both cars damage states across switches', () => {
    const career = addOwnedCar(defaultCareer(), 'speeder')
    // Damage the starter at 0.5.
    career.carsById.starter!.damage = 0.5
    // Damage the speeder at 0.2 and switch to it.
    career.carsById.speeder!.damage = 0.2
    const onSpeeder = setActiveCar(career, 'speeder')
    expect(getActiveCar(onSpeeder).damage).toBe(0.2)
    expect(onSpeeder.carsById.starter!.damage).toBe(0.5)
  })
})
