import { describe, expect, it } from 'vitest'
import { derbyTick, type DerbyTickInputs } from '@/game/derbyTick'
import { initDerbyRound } from '@/game/derbyRoundState'
import { isDestroyed } from '@/game/derbyVehicleState'
import { DERBY_ARENAS } from '@/lib/derbyArenas'
import type { PhysicsInput } from '@/game/physics'

const ARENA = DERBY_ARENAS['dust-bowl']

const NEUTRAL: PhysicsInput = { throttle: 0, steer: 0, handbrake: false }

function neutralInputs(n: number): DerbyTickInputs {
  return { perCar: Array.from({ length: n }, () => ({ ...NEUTRAL })) }
}

function fullThrottleInputs(n: number): DerbyTickInputs {
  return {
    perCar: Array.from({ length: n }, () => ({
      throttle: 1,
      steer: 0,
      handbrake: false,
    })),
  }
}

describe('derbyTick', () => {
  it('flips status from pre to running on the first tick', () => {
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['car', 'car', 'car', 'car'],
    })
    expect(round.status).toBe('pre')
    derbyTick(round, neutralInputs(4), 1 / 60)
    expect(round.status).toBe('running')
  })

  it('integrates elapsedMs by dt', () => {
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['car', 'car', 'car', 'car'],
    })
    derbyTick(round, neutralInputs(4), 0.5)
    expect(round.elapsedMs).toBe(500)
  })

  it('keeps cars inside the arena perimeter', () => {
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['racecar', 'racecar', 'racecar', 'racecar'],
    })
    // Drive every car straight forward for 30 simulated seconds. Their
    // starting headings face the origin so they will pile up in the
    // middle, but with full throttle they will eventually collide and
    // some will get pushed outward; the containment clamp must hold.
    for (let i = 0; i < 30 * 60; i++) {
      derbyTick(round, fullThrottleInputs(4), 1 / 60)
      if (round.status === 'ended') break
    }
    for (const car of round.cars) {
      const r = Math.hypot(car.physics.x, car.physics.z)
      expect(r).toBeLessThanOrEqual(ARENA.radius + 1e-3)
    }
  })

  it('ends the round with outcome win when only the player is alive', () => {
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['car', 'car', 'car', 'car'],
    })
    // Forcibly kill the three CPU cars, then take a tick to evaluate the
    // round-end condition.
    round.cars[1].health = 0
    round.cars[1].status = 'destroyed'
    round.cars[2].health = 0
    round.cars[2].status = 'destroyed'
    round.cars[3].health = 0
    round.cars[3].status = 'destroyed'
    const out = derbyTick(round, neutralInputs(4), 1 / 60)
    expect(round.status).toBe('ended')
    expect(round.endOutcome).toBe('win')
    expect(out.events.some((e) => e.kind === 'roundEnd' && e.outcome === 'win')).toBe(true)
  })

  it('ends with outcome loss when the player dies', () => {
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['car', 'car', 'car', 'car'],
    })
    round.cars[0].health = 0
    round.cars[0].status = 'destroyed'
    derbyTick(round, neutralInputs(4), 1 / 60)
    expect(round.endOutcome).toBe('loss')
  })

  it('ends with outcome timeout when the duration elapses with multiple alive', () => {
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['car', 'car', 'car', 'car'],
    })
    // Jump elapsed to just under the limit, then tick once to push it over.
    round.elapsedMs = ARENA.roundDurationMs - 1
    derbyTick(round, neutralInputs(4), 1 / 60)
    expect(round.endOutcome).toBe('timeout')
    expect(round.ranking).toHaveLength(4)
  })

  it('emits a hit event when two cars collide and damage flows correctly', () => {
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['bigTruck', 'racecar', 'car', 'car'],
    })
    // Place truck and racecar at touching distance with the truck moving
    // hard at the racecar.
    round.cars[0].physics.x = 0
    round.cars[0].physics.z = 0
    round.cars[0].physics.heading = 0
    round.cars[0].physics.speed = 20
    round.cars[1].physics.x = round.configs[0].collisionRadius + round.configs[1].collisionRadius - 0.1
    round.cars[1].physics.z = 0
    round.cars[1].physics.heading = 0
    round.cars[1].physics.speed = 0
    // Park the other two cars far away so they do not contribute hits.
    round.cars[2].physics.x = -50
    round.cars[2].physics.z = 0
    round.cars[3].physics.x = 50
    round.cars[3].physics.z = 0
    const before = round.cars[1].health
    const out = derbyTick(round, neutralInputs(4), 1 / 60)
    expect(round.cars[1].health).toBeLessThan(before)
    const hit = out.events.find((e) => e.kind === 'hit' && e.victimIdx === 1)
    expect(hit).toBeDefined()
    if (hit && hit.kind === 'hit') {
      expect(hit.attackerIdx).toBe(0)
      expect(hit.amount).toBeGreaterThan(0)
    }
  })

  it('credits a kill to the attacker when a hit destroys the victim', () => {
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['bigTruck', 'racecar', 'car', 'car'],
    })
    // Same setup as above but the racecar is on its last health point so
    // any non-zero damage destroys it.
    round.cars[0].physics.x = 0
    round.cars[0].physics.z = 0
    round.cars[0].physics.heading = 0
    round.cars[0].physics.speed = 20
    round.cars[1].physics.x = round.configs[0].collisionRadius + round.configs[1].collisionRadius - 0.1
    round.cars[1].physics.z = 0
    round.cars[1].health = 1
    round.cars[2].physics.x = -50
    round.cars[3].physics.x = 50
    const before = round.cars[0].kills
    const out = derbyTick(round, neutralInputs(4), 1 / 60)
    expect(round.cars[1].status).toBe('destroyed')
    expect(round.cars[0].kills).toBe(before + 1)
    expect(out.events.some((e) => e.kind === 'destroyed' && e.victimIdx === 1)).toBe(true)
  })

  it('is a no-op once the round has ended', () => {
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['car', 'car', 'car', 'car'],
    })
    round.cars[1].health = 0
    round.cars[1].status = 'destroyed'
    round.cars[2].health = 0
    round.cars[2].status = 'destroyed'
    round.cars[3].health = 0
    round.cars[3].status = 'destroyed'
    derbyTick(round, neutralInputs(4), 1 / 60)
    expect(round.status).toBe('ended')
    const elapsedAtEnd = round.elapsedMs
    const out = derbyTick(round, fullThrottleInputs(4), 1 / 60)
    expect(round.elapsedMs).toBe(elapsedAtEnd)
    expect(out.events).toHaveLength(0)
  })

  it('keeps elapsed and physics frozen when dt is non-finite or non-positive', () => {
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['car', 'car', 'car', 'car'],
    })
    round.status = 'running'
    const elapsed = round.elapsedMs
    derbyTick(round, fullThrottleInputs(4), Number.NaN)
    expect(round.elapsedMs).toBe(elapsed)
    derbyTick(round, fullThrottleInputs(4), -1)
    expect(round.elapsedMs).toBe(elapsed)
    for (const c of round.cars) {
      expect(isDestroyed(c)).toBe(false)
    }
  })
})
