import { describe, expect, it } from 'vitest'
import {
  initDerbyRound,
  mulberry32,
  startingPlacements,
} from '@/game/derbyRoundState'
import { DERBY_ARENAS } from '@/lib/derbyArenas'

const ARENA = DERBY_ARENAS['dust-bowl']

describe('initDerbyRound', () => {
  it('produces 4 cars at full health, status pre, elapsed 0', () => {
    const state = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['car', 'schoolBus', 'bigTruck', 'racecar'],
    })
    expect(state.cars).toHaveLength(4)
    expect(state.status).toBe('pre')
    expect(state.elapsedMs).toBe(0)
    expect(state.endOutcome).toBeNull()
    expect(state.ranking).toEqual([])
    for (const car of state.cars) {
      expect(car.health).toBe(car.maxHealth)
      expect(car.status).toBe('alive')
    }
  })

  it('throws when the vehicle list does not match the arena cpuCount + 1', () => {
    expect(() =>
      initDerbyRound({
        arena: ARENA,
        vehicleTypes: ['car', 'schoolBus'],
      }),
    ).toThrow()
  })

  it('places each car at non-overlapping positions facing the center', () => {
    const state = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['car', 'schoolBus', 'bigTruck', 'racecar'],
    })
    for (let i = 0; i < state.cars.length; i++) {
      for (let j = i + 1; j < state.cars.length; j++) {
        const a = state.cars[i].physics
        const b = state.cars[j].physics
        const d = Math.hypot(a.x - b.x, a.z - b.z)
        expect(d).toBeGreaterThan(state.configs[i].collisionRadius + state.configs[j].collisionRadius)
      }
    }
    // Each placement faces the origin: heading vector points from car to (0,0).
    for (const car of state.cars) {
      const desiredHx = -car.physics.x
      const desiredHz = -car.physics.z
      const len = Math.hypot(desiredHx, desiredHz)
      const hx = Math.cos(car.physics.heading)
      const hz = -Math.sin(car.physics.heading)
      expect(hx).toBeCloseTo(desiredHx / len, 4)
      expect(hz).toBeCloseTo(desiredHz / len, 4)
    }
  })
})

describe('startingPlacements', () => {
  it('produces N placements equally spread on the half-radius ring', () => {
    const placements = startingPlacements(ARENA, 4)
    expect(placements).toHaveLength(4)
    for (const p of placements) {
      const r = Math.hypot(p.x, p.z)
      expect(r).toBeCloseTo(ARENA.radius * 0.5, 4)
    }
  })
})

describe('mulberry32', () => {
  it('produces a deterministic sequence given a seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b())
    }
  })

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    let same = true
    for (let i = 0; i < 5; i++) {
      if (a() !== b()) same = false
    }
    expect(same).toBe(false)
  })

  it('returns values in [0, 1)', () => {
    const r = mulberry32(7)
    for (let i = 0; i < 100; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})
