import { stepPhysics, type PhysicsInput } from './physics'
import {
  resolveCollision,
  type CollisionDamage,
} from './derbyDamage'
import {
  applyDamage,
  isDestroyed,
  rankCars,
  type DerbyCarState,
} from './derbyVehicleState'
import { clampInsideArena } from './derbyArena'
import type { DerbyRoundState } from './derbyRoundState'
import type { DerbyRoundOutcome } from '@/lib/schemas'

// Per-frame engine for a Derby round. derbyTick runs:
//   1. stepPhysics for every alive car using its per-car PhysicsInput
//   2. arena containment: clamp each car back inside the perimeter and zero
//      its outward radial velocity component (no real bounce in v1)
//   3. pairwise circle-vs-circle contact (collisionRadius from the vehicle
//      catalog). Each contact runs through derbyDamage.resolveCollision and
//      the resulting deltas land on the cars via applyDamage.
//   4. round-end check (player destroyed, last alive, time limit)
// Everything is driven by world state plus a small list of inputs so the
// round can be ticked deterministically from unit tests.

export interface DerbyTickInputs {
  // One input per car, indexed by carIdx. Destroyed cars' entries are
  // ignored; callers can pass a no-op for them.
  perCar: PhysicsInput[]
}

export type DerbyTickEvent =
  | {
      kind: 'hit'
      victimIdx: number
      attackerIdx: number | null
      amount: number
      x: number
      z: number
      relativeSpeed: number
    }
  | {
      kind: 'destroyed'
      victimIdx: number
      attackerIdx: number | null
      nowMs: number
    }
  | {
      kind: 'roundEnd'
      outcome: DerbyRoundOutcome
      nowMs: number
    }

export interface DerbyTickResult {
  events: DerbyTickEvent[]
}

const PLAYER_IDX = 0

export function derbyTick(
  round: DerbyRoundState,
  inputs: DerbyTickInputs,
  dtSec: number,
): DerbyTickResult {
  const events: DerbyTickEvent[] = []

  if (round.status === 'ended') return { events }
  if (round.status === 'pre') {
    round.status = 'running'
  }

  if (!Number.isFinite(dtSec) || dtSec <= 0) {
    return { events }
  }

  const dtMs = dtSec * 1000
  round.elapsedMs += dtMs

  // 1. Physics integration. Derby v1 has no off-track concept (the arena is
  // one open dirt disk), so onTrack is always true; off-track tuning would
  // throttle the cars artificially.
  for (let i = 0; i < round.cars.length; i++) {
    const car = round.cars[i]
    if (isDestroyed(car)) continue
    const input = inputs.perCar[i] ?? { throttle: 0, steer: 0, handbrake: false }
    const params = round.configs[i].carParams
    car.physics = stepPhysics(car.physics, input, dtSec, true, params)
    car.aliveMs += dtMs
  }

  // 2. Arena containment. Clamp position and zero the outward radial speed
  // component so the wall feels solid. v1 wall contact does not damage.
  for (let i = 0; i < round.cars.length; i++) {
    const car = round.cars[i]
    if (isDestroyed(car)) continue
    clampToArena(car, round)
  }

  // 3. Pairwise contact. Circle-vs-circle on collisionRadius is enough for
  // v1; OBB refinement is a later slice if it becomes necessary. Each
  // contact resolves once per frame; repeat hits between the same pair are
  // OK because cars get separated and have to re-close to hit again.
  for (let i = 0; i < round.cars.length; i++) {
    const a = round.cars[i]
    if (isDestroyed(a)) continue
    for (let j = i + 1; j < round.cars.length; j++) {
      const b = round.cars[j]
      if (isDestroyed(b)) continue
      const contact = checkContact(a, b, round.configs[i].collisionRadius, round.configs[j].collisionRadius)
      if (!contact) continue
      // Push the cars apart along the normal so they do not get stuck.
      separate(a, b, round.configs[i].mass, round.configs[j].mass, contact.overlap, contact.nx, contact.nz)
      const damage = resolveCollision(
        a,
        b,
        round.configs[i],
        round.configs[j],
        { nx: contact.nx, nz: contact.nz },
      )
      applyAndEmit(round, events, a, b, damage, contact.x, contact.z)
    }
  }

  // 4. Round-end check.
  const aliveCount = round.cars.reduce(
    (n, c) => (isDestroyed(c) ? n : n + 1),
    0,
  )
  const playerAlive = !isDestroyed(round.cars[PLAYER_IDX])
  let outcome: DerbyRoundOutcome | null = null
  if (!playerAlive) outcome = 'loss'
  else if (aliveCount === 1) outcome = 'win'
  else if (round.elapsedMs >= round.arena.roundDurationMs) outcome = 'timeout'

  if (outcome !== null) {
    round.status = 'ended'
    round.endOutcome = outcome
    round.ranking = rankCars(round.cars)
    events.push({ kind: 'roundEnd', outcome, nowMs: round.elapsedMs })
  }

  return { events }
}

function clampToArena(car: DerbyCarState, round: DerbyRoundState): void {
  const collisionRadius = round.configs[car.carIdx].collisionRadius
  const clamped = clampInsideArena(
    round.arena,
    car.physics.x,
    car.physics.z,
    collisionRadius,
  )
  if (!clamped.clamped) return
  // Apply the position clamp.
  car.physics.x = clamped.x
  car.physics.z = clamped.z
  // Inward normal at the contact point. Built directly here rather than
  // routing through arenaWallNormalAt because we have the original
  // pre-clamp distance handy and want to avoid a second hypot.
  const dist = Math.hypot(car.physics.x, car.physics.z)
  const inv = dist > 1e-6 ? 1 / dist : 1
  const nx = -car.physics.x * inv
  const nz = -car.physics.z * inv
  // Decompose velocity onto the inward normal and zero the outward part
  // so the car comes to rest against the wall instead of skating along it.
  const speed = car.physics.speed
  const heading = car.physics.heading
  const vx = Math.cos(heading) * speed
  const vz = -Math.sin(heading) * speed
  const outward = -(vx * nx + vz * nz)
  if (outward > 0) {
    const newVx = vx + outward * nx
    const newVz = vz + outward * nz
    const newSpeed = Math.hypot(newVx, newVz)
    if (newSpeed < 1e-4) {
      car.physics.speed = 0
    } else {
      car.physics.speed = newSpeed
      car.physics.heading = Math.atan2(-newVz, newVx)
    }
  }
}

interface ContactResult {
  nx: number
  nz: number
  overlap: number
  x: number
  z: number
}

function checkContact(
  a: DerbyCarState,
  b: DerbyCarState,
  ra: number,
  rb: number,
): ContactResult | null {
  const dx = b.physics.x - a.physics.x
  const dz = b.physics.z - a.physics.z
  const dist = Math.hypot(dx, dz)
  const min = ra + rb
  if (dist >= min) return null
  if (dist < 1e-6) {
    // Cars at the same position. Pick an arbitrary normal so separation
    // does not divide by zero. This case is rare; a previous frame should
    // have separated them.
    return { nx: 1, nz: 0, overlap: min, x: a.physics.x, z: a.physics.z }
  }
  const nx = dx / dist
  const nz = dz / dist
  const overlap = min - dist
  // Contact point: midway between the two centers, biased by radius so the
  // popup anchors at the actual point of impact.
  const t = ra / min
  return {
    nx,
    nz,
    overlap,
    x: a.physics.x + dx * t,
    z: a.physics.z + dz * t,
  }
}

function separate(
  a: DerbyCarState,
  b: DerbyCarState,
  ma: number,
  mb: number,
  overlap: number,
  nx: number,
  nz: number,
): void {
  // Move each car along the normal in inverse proportion to its mass so
  // the heavier car barely budges and the lighter car gets shoved away.
  const totalMass = Math.max(1, ma + mb)
  const aShare = mb / totalMass
  const bShare = ma / totalMass
  a.physics.x -= nx * overlap * aShare
  a.physics.z -= nz * overlap * aShare
  b.physics.x += nx * overlap * bShare
  b.physics.z += nz * overlap * bShare
}

function applyAndEmit(
  round: DerbyRoundState,
  events: DerbyTickEvent[],
  a: DerbyCarState,
  b: DerbyCarState,
  damage: CollisionDamage,
  contactX: number,
  contactZ: number,
): void {
  const nowMs = round.elapsedMs
  if (damage.aDelta > 0) {
    const attackerIdx = damage.attacker === 'bIsAttacker' ? b.carIdx : null
    const r = applyDamage(a, damage.aDelta, attackerIdx, nowMs)
    events.push({
      kind: 'hit',
      victimIdx: a.carIdx,
      attackerIdx,
      amount: r.clampedAmount,
      x: contactX,
      z: contactZ,
      relativeSpeed: damage.relativeSpeed,
    })
    if (r.destroyed) {
      if (attackerIdx !== null) {
        round.cars[attackerIdx].kills += 1
      }
      events.push({
        kind: 'destroyed',
        victimIdx: a.carIdx,
        attackerIdx,
        nowMs,
      })
    }
  }
  if (damage.bDelta > 0) {
    const attackerIdx = damage.attacker === 'aIsAttacker' ? a.carIdx : null
    const r = applyDamage(b, damage.bDelta, attackerIdx, nowMs)
    events.push({
      kind: 'hit',
      victimIdx: b.carIdx,
      attackerIdx,
      amount: r.clampedAmount,
      x: contactX,
      z: contactZ,
      relativeSpeed: damage.relativeSpeed,
    })
    if (r.destroyed) {
      if (attackerIdx !== null) {
        round.cars[attackerIdx].kills += 1
      }
      events.push({
        kind: 'destroyed',
        victimIdx: b.carIdx,
        attackerIdx,
        nowMs,
      })
    }
  }
}
