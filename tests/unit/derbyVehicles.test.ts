import { describe, expect, it } from 'vitest'
import {
  ALL_DERBY_VEHICLES,
  DERBY_VEHICLES,
  derbyVehicleCanonical,
} from '@/lib/derbyVehicles'
import { DERBY_VEHICLE_TYPES, DerbyVehicleTypeSchema } from '@/lib/schemas'

describe('derby vehicles', () => {
  it('exposes exactly the four shipping vehicle types', () => {
    expect(DERBY_VEHICLE_TYPES).toHaveLength(4)
    expect(new Set(DERBY_VEHICLE_TYPES).size).toBe(4)
    expect(ALL_DERBY_VEHICLES).toHaveLength(4)
  })

  it('every type parses through DerbyVehicleTypeSchema', () => {
    for (const t of DERBY_VEHICLE_TYPES) {
      expect(() => DerbyVehicleTypeSchema.parse(t)).not.toThrow()
    }
  })

  it('every config has plausible non-zero stats', () => {
    for (const v of ALL_DERBY_VEHICLES) {
      expect(v.health).toBeGreaterThan(0)
      expect(v.health).toBeLessThanOrEqual(500)
      expect(v.baseDamage).toBeGreaterThan(0)
      expect(v.mass).toBeGreaterThan(0)
      expect(v.collisionRadius).toBeGreaterThan(0)
      expect(v.carParams.maxSpeed).toBeGreaterThan(0)
      expect(v.carParams.brake).toBeGreaterThan(0)
      expect(v.theoreticalMinWinMs).toBeGreaterThan(0)
      expect(v.modelUrl).toMatch(/^\/models\/derby\/.+\.glb$/)
    }
  })

  it('school bus and big truck are the heaviest, racecar is the lightest', () => {
    const masses = ALL_DERBY_VEHICLES
      .map((v) => ({ type: v.type, mass: v.mass }))
      .sort((a, b) => b.mass - a.mass)
    expect(masses[0].type).toBe('schoolBus')
    expect(masses[masses.length - 1].type).toBe('racecar')
  })

  it('racecar has the highest top speed; schoolBus the lowest', () => {
    const sorted = ALL_DERBY_VEHICLES
      .map((v) => ({ type: v.type, top: v.carParams.maxSpeed }))
      .sort((a, b) => b.top - a.top)
    expect(sorted[0].type).toBe('racecar')
    expect(sorted[sorted.length - 1].type).toBe('schoolBus')
  })

  it('records lookup matches the array order', () => {
    for (const v of ALL_DERBY_VEHICLES) {
      expect(DERBY_VEHICLES[v.type]).toBe(v)
    }
  })

  it('canonical bytes ignore cosmetic fields', () => {
    const car = DERBY_VEHICLES.car
    const original = derbyVehicleCanonical(car)
    const tweaked = derbyVehicleCanonical({
      ...car,
      displayName: 'Renamed',
      blurb: 'Different blurb',
      modelUrl: '/models/derby/other.glb',
    })
    expect(tweaked).toBe(original)
  })

  it('canonical bytes change when physics fields change', () => {
    const car = DERBY_VEHICLES.car
    const original = derbyVehicleCanonical(car)
    const tweaked = derbyVehicleCanonical({ ...car, mass: car.mass + 1 })
    expect(tweaked).not.toBe(original)
  })
})
