import { describe, expect, it } from 'vitest'
import {
  derbyTick,
  pairKey,
  PAIR_DAMAGE_COOLDOWN_MS,
  type DerbyTickInputs,
} from '@/game/derbyTick'
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

function parkAway(round: ReturnType<typeof initDerbyRound>): void {
  round.cars[2].physics.x = -50
  round.cars[2].physics.z = 0
  round.cars[3].physics.x = 50
  round.cars[3].physics.z = 0
}

function placeHeadOnOverlap(
  round: ReturnType<typeof initDerbyRound>,
  aIdx: number,
  bIdx: number,
): void {
  round.cars[aIdx].physics.x = 0
  round.cars[aIdx].physics.z = 0
  round.cars[aIdx].physics.heading = 0
  round.cars[bIdx].physics.x =
    round.configs[aIdx].obbHalfLength + round.configs[bIdx].obbHalfLength - 0.1
  round.cars[bIdx].physics.z = 0
  round.cars[bIdx].physics.heading = 0
}

describe('derbyTick', () => {
  it('uses canonical pair keys regardless of input order', () => {
    expect(pairKey(1, 3)).toBe('1:3')
    expect(pairKey(3, 1)).toBe('1:3')
    expect(pairKey(2, 2)).toBe('2:2')
  })

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
      // clampToArena keeps each car center within radius minus its
      // collisionRadius, not just inside the raw radius. Asserting against
      // the buffered limit catches the case where a car clipped halfway
      // through the wall.
      const limit = ARENA.radius - round.configs[car.carIdx].collisionRadius
      expect(r).toBeLessThanOrEqual(limit + 1e-3)
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
    // Head-on along X: OBB touching distance is the sum of the two cars'
    // half-lengths along the forward axis. Pull the second car 0.1 m inside
    // that boundary so the SAT pass finds a small overlap.
    round.cars[1].physics.x = round.configs[0].obbHalfLength + round.configs[1].obbHalfLength - 0.1
    round.cars[1].physics.z = 0
    round.cars[1].physics.heading = 0
    round.cars[1].physics.speed = 0
    // Park the other two cars far away so they do not contribute hits.
    round.cars[2].physics.x = -50
    round.cars[2].physics.z = 0
    round.cars[3].physics.x = 50
    round.cars[3].physics.z = 0
    const before = round.cars[1].health
    const truckSpeedBefore = round.cars[0].physics.speed
    const out = derbyTick(round, neutralInputs(4), 1 / 60)
    expect(round.cars[1].health).toBeLessThan(before)
    expect(round.cars[0].physics.speed).toBeLessThan(truckSpeedBefore)
    expect(round.cars[1].physics.speed).toBeGreaterThan(20)
    const hit = out.events.find((e) => e.kind === 'hit' && e.victimIdx === 1)
    expect(hit).toBeDefined()
    if (hit && hit.kind === 'hit') {
      expect(hit.attackerIdx).toBe(0)
      expect(hit.amount).toBeGreaterThan(0)
    }
  })

  it('gates repeated pair damage while cooldown is active', () => {
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['bigTruck', 'racecar', 'car', 'car'],
    })
    placeHeadOnOverlap(round, 0, 1)
    round.cars[0].physics.speed = 20
    round.cars[1].physics.speed = 0
    parkAway(round)
    const key = pairKey(0, 1)
    round.pairDamageCooldownUntilMs.set(key, PAIR_DAMAGE_COOLDOWN_MS)
    const before = round.cars[1].health
    const out = derbyTick(round, neutralInputs(4), 1 / 60)
    expect(round.cars[1].health).toBe(before)
    expect(out.events.some((e) => e.kind === 'hit')).toBe(false)
  })

  it('does not let a destroyed car damage a live car', () => {
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['bigTruck', 'racecar', 'car', 'car'],
    })
    placeHeadOnOverlap(round, 0, 1)
    round.cars[0].status = 'destroyed'
    round.cars[0].health = 0
    round.cars[0].physics.speed = 20
    round.cars[1].physics.speed = 0
    parkAway(round)
    const before = round.cars[1].health
    const out = derbyTick(round, neutralInputs(4), 1 / 60)
    expect(round.cars[1].health).toBe(before)
    expect(out.events.some((e) => e.kind === 'hit')).toBe(false)
  })

  it('only applies wreck impulse above the closing-speed threshold', () => {
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['racecar', 'bigTruck', 'car', 'car'],
    })
    placeHeadOnOverlap(round, 0, 1)
    round.cars[0].status = 'destroyed'
    round.cars[0].health = 0
    round.cars[0].physics.speed = 0
    round.cars[1].physics.speed = 0.1
    parkAway(round)
    derbyTick(round, neutralInputs(4), 1 / 60)
    expect(round.pairWreckImpulseUntilMs.has(pairKey(0, 1))).toBe(false)
  })

  it('transfers more wreck impulse speed to the lighter wreck', () => {
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['racecar', 'bigTruck', 'car', 'car'],
    })
    placeHeadOnOverlap(round, 0, 1)
    round.cars[0].status = 'destroyed'
    round.cars[0].health = 0
    round.cars[0].physics.speed = 0
    round.cars[1].physics.heading = Math.PI
    round.cars[1].physics.speed = 18
    parkAway(round)
    const pusherBefore = round.cars[1].physics.speed
    derbyTick(round, neutralInputs(4), 1 / 60)
    const pusherLoss = pusherBefore - round.cars[1].physics.speed
    expect(round.cars[0].physics.speed).toBeGreaterThan(pusherLoss)
    expect(round.pairWreckImpulseUntilMs.has(pairKey(0, 1))).toBe(true)
  })

  it('pushes the unpinned car away when the other car is wall pinned', () => {
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['schoolBus', 'car', 'car', 'car'],
    })
    const busLimit = ARENA.radius - round.configs[0].collisionRadius
    round.cars[0].physics.z = 0
    round.cars[0].physics.heading = 0
    round.cars[0].physics.speed = 0
    round.cars[0].physics.x = busLimit
    round.cars[1].physics.x =
      busLimit - round.configs[0].obbHalfLength - round.configs[1].obbHalfLength + 0.1
    round.cars[1].physics.z = 0
    round.cars[1].physics.heading = 0
    round.cars[1].physics.speed = 0
    parkAway(round)
    const busBefore = round.cars[0].physics.x
    const carBefore = round.cars[1].physics.x
    derbyTick(round, neutralInputs(4), 1 / 60)
    expect(Math.abs(round.cars[1].physics.x - carBefore)).toBeGreaterThan(
      Math.abs(round.cars[0].physics.x - busBefore),
    )
    expect(round.cars[0].physics.x).toBeLessThanOrEqual(busLimit + 1e-3)
  })

  it('applies friction decay to destroyed cars', () => {
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['car', 'car', 'car', 'car'],
    })
    round.cars[0].status = 'destroyed'
    round.cars[0].health = 0
    round.cars[0].physics.x = 0
    round.cars[0].physics.z = 0
    round.cars[0].physics.speed = 10
    parkAway(round)
    derbyTick(round, neutralInputs(4), 0.1)
    expect(round.cars[0].physics.speed).toBeLessThan(10)
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
    // Head-on along X: OBB touching distance is the sum of the two cars'
    // half-lengths along the forward axis. Pull the second car 0.1 m inside
    // that boundary so the SAT pass finds a small overlap. Heading must
    // match the first car's so both forward axes are +X; otherwise the
    // racecar inherits the starting-ring heading and faces sideways.
    round.cars[1].physics.x = round.configs[0].obbHalfLength + round.configs[1].obbHalfLength - 0.1
    round.cars[1].physics.z = 0
    round.cars[1].physics.heading = 0
    round.cars[1].health = 1
    round.cars[2].physics.x = -50
    round.cars[3].physics.x = 50
    const before = round.cars[0].kills
    const out = derbyTick(round, neutralInputs(4), 1 / 60)
    expect(round.cars[1].status).toBe('destroyed')
    expect(round.cars[0].kills).toBe(before + 1)
    expect(out.events.some((e) => e.kind === 'destroyed' && e.victimIdx === 1)).toBe(true)
  })

  it('OBB pass: a sedan parked inside the school bus length-wise gap gets pushed out', () => {
    // Regression for "I clip through the back of the bus". The legacy
    // circle test enforced only ~4.10m around the bus center, so a sedan
    // parked at ~1.30m on the bus's local +X axis was completely inside
    // the bus rectangle yet outside both circles. After the OBB switch
    // the SAT pass detects this overlap and separate() pushes the cars
    // apart along the smallest-overlap axis (the bus's local Z = sides).
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['schoolBus', 'car', 'car', 'racecar'],
    })
    round.cars[0].physics.x = 0
    round.cars[0].physics.z = 0
    round.cars[0].physics.heading = 0
    round.cars[0].physics.speed = 0
    const cfgBus = round.configs[0]
    const cfgSedan = round.configs[1]
    // Park the sedan well inside the bus rectangle but outside both
    // legacy collision circles.
    round.cars[1].physics.x = cfgBus.obbHalfLength - cfgSedan.obbHalfLength - 0.5
    round.cars[1].physics.z = 0
    round.cars[1].physics.heading = 0
    round.cars[1].physics.speed = 0
    round.cars[2].physics.x = -50
    round.cars[3].physics.x = 50
    derbyTick(round, neutralInputs(4), 1 / 60)
    // Verify the cars no longer overlap on every SAT axis. The shared
    // forward axis at heading=0 is X and side axis is Z; both intervals
    // must be disjoint or just touching.
    const bus = round.cars[0]
    const sedan = round.cars[1]
    const busHl = cfgBus.obbHalfLength
    const busHw = cfgBus.obbHalfWidth
    const sedanHl = cfgSedan.obbHalfLength
    const sedanHw = cfgSedan.obbHalfWidth
    const busXLo = bus.physics.x - busHl, busXHi = bus.physics.x + busHl
    const busZLo = bus.physics.z - busHw, busZHi = bus.physics.z + busHw
    const sedanXLo = sedan.physics.x - sedanHl, sedanXHi = sedan.physics.x + sedanHl
    const sedanZLo = sedan.physics.z - sedanHw, sedanZHi = sedan.physics.z + sedanHw
    const xOverlap = Math.min(busXHi, sedanXHi) - Math.max(busXLo, sedanXLo)
    const zOverlap = Math.min(busZHi, sedanZHi) - Math.max(busZLo, sedanZLo)
    // At least one axis must be a separating axis (no overlap, modulo eps).
    expect(xOverlap < 1e-3 || zOverlap < 1e-3).toBe(true)
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

  it('cuts the victim throttle while the stun window is active', () => {
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['bigTruck', 'racecar', 'car', 'car'],
    })
    placeHeadOnOverlap(round, 0, 1)
    round.cars[0].physics.speed = 22
    round.cars[1].physics.speed = 0
    parkAway(round)
    // First tick lands a hit and stuns the racecar.
    derbyTick(round, fullThrottleInputs(4), 1 / 60)
    expect(round.cars[1].stunUntilMs).toBeGreaterThan(round.elapsedMs - 1)
    // Move the racecar away so it can no longer be re-hit by the truck on
    // the same path; we are testing that ITS throttle is muted, not that
    // it sits still under continued ramming.
    round.cars[1].physics.x = 60
    round.cars[1].physics.z = 60
    const speedBefore = round.cars[1].physics.speed
    // Tick a few frames with full throttle on the racecar; with stun
    // attenuating the input by 0.25 the racecar gains far less speed
    // than it would unstunned.
    for (let i = 0; i < 4; i++) {
      derbyTick(round, fullThrottleInputs(4), 1 / 60)
    }
    const speedAfterStunned = round.cars[1].physics.speed
    // Reset and re-run unstunned for comparison: same setup, but skip the
    // initial collision. Use a fresh round so config and physics start
    // identical.
    const fresh = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['bigTruck', 'racecar', 'car', 'car'],
    })
    fresh.cars[1].physics.x = 60
    fresh.cars[1].physics.z = 60
    fresh.cars[1].physics.speed = speedBefore
    parkAway(fresh)
    fresh.cars[0].physics.x = -60
    for (let i = 0; i < 4; i++) {
      derbyTick(fresh, fullThrottleInputs(4), 1 / 60)
    }
    expect(speedAfterStunned).toBeLessThan(fresh.cars[1].physics.speed)
  })

  it('adds an angular wobble to the victim on an off-center hit', () => {
    const round = initDerbyRound({
      arena: ARENA,
      vehicleTypes: ['bigTruck', 'racecar', 'car', 'car'],
    })
    // Off-center head-on overlap: the contact midpoint sits noticeably
    // off the racecar's centerline so the lever arm picks up a tangential
    // (right-axis) component, which is what applyHitWobble keys on. A
    // pure on-axis ram has zero torque by construction (the lever arm
    // and the impulse direction are collinear).
    round.cars[0].physics.x = 0
    round.cars[0].physics.z = 0
    round.cars[0].physics.heading = 0
    round.cars[0].physics.speed = 22
    round.cars[1].physics.x = round.configs[0].obbHalfLength + round.configs[1].obbHalfLength - 0.3
    // Offset enough that the OBB still overlaps on Z (sum of half-widths
    // is plenty) but the centers line is angled, giving the lever arm a
    // tangential component.
    round.cars[1].physics.z = 1.0
    round.cars[1].physics.heading = 0
    round.cars[1].physics.speed = 0
    round.cars[1].physics.angularVelocity = 0
    parkAway(round)
    derbyTick(round, neutralInputs(4), 1 / 60)
    expect(Math.abs(round.cars[1].physics.angularVelocity ?? 0)).toBeGreaterThan(0)
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
