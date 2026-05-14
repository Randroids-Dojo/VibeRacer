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
import type { DerbyVehicleConfig } from '@/lib/derbyVehicles'
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
const IMPACT_RESTITUTION = 0.72
const IMPACT_MIN_CLOSING_SPEED = 0.5

export function derbyTick(
  round: DerbyRoundState,
  inputs: DerbyTickInputs,
  dtSec: number,
): DerbyTickResult {
  const events: DerbyTickEvent[] = []

  if (round.status === 'ended') return { events }

  if (!Number.isFinite(dtSec) || dtSec <= 0) {
    return { events }
  }

  if (round.status === 'pre') {
    round.status = 'running'
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
    // Derby opts out of the road-mode quartic taper (final arg = 1). Vehicle
    // catalog accel/maxSpeed values were tuned against a linear curve, and
    // closing speeds drive derbyDamage.resolveCollision. A hidden top-end
    // taper would mute every ram. Drag mode opts out the same way.
    car.physics = stepPhysics(car.physics, input, dtSec, true, params, 1, 1, 0, 1)
    car.aliveMs += dtMs
  }

  // 2. Arena containment. Clamp position and zero the outward radial speed
  // component so the wall feels solid. v1 wall contact does not damage.
  for (let i = 0; i < round.cars.length; i++) {
    const car = round.cars[i]
    if (isDestroyed(car)) continue
    clampToArena(car, round)
  }

  // 3. Pairwise contact. Broad phase = circle-vs-circle on collisionRadius
  // (cheap early-out so SAT does not run on every pair every frame); narrow
  // phase = OBB-vs-OBB SAT so a long vehicle (school bus) cannot be clipped
  // through its front or rear by a smaller car. Each contact resolves once
  // per frame; repeat hits between the same pair are OK because separate()
  // pushes the cars apart and they have to re-close.
  for (let i = 0; i < round.cars.length; i++) {
    const a = round.cars[i]
    if (isDestroyed(a)) continue
    for (let j = i + 1; j < round.cars.length; j++) {
      // Re-check `a` each pass: applyAndEmit may have destroyed it during
      // a prior pair this frame, in which case it should not collide again.
      if (isDestroyed(a)) break
      const b = round.cars[j]
      if (isDestroyed(b)) continue
      if (!circleBroadPhase(a, b, round.configs[i].collisionRadius, round.configs[j].collisionRadius)) {
        continue
      }
      const contact = obbContact(a, b, round.configs[i], round.configs[j])
      if (!contact) continue
      separate(a, b, round.configs[i].mass, round.configs[j].mass, contact.overlap, contact.nx, contact.nz)
      const damage = resolveCollision(
        a,
        b,
        round.configs[i],
        round.configs[j],
        { nx: contact.nx, nz: contact.nz },
      )
      applyImpactImpulse(
        a,
        b,
        round.configs[i].mass,
        round.configs[j].mass,
        contact.nx,
        contact.nz,
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

function circleBroadPhase(
  a: DerbyCarState,
  b: DerbyCarState,
  ra: number,
  rb: number,
): boolean {
  const dx = b.physics.x - a.physics.x
  const dz = b.physics.z - a.physics.z
  const min = ra + rb
  return dx * dx + dz * dz < min * min
}

// Forward / right basis vectors for a car. Heading 0 = +X, PI/2 = -Z
// (matching stepPhysics's velocityOf). Right is forward rotated 90 degrees
// clockwise when viewed from above (+Y), matching the chase camera's "the
// world tilts away from steering" feel.
function carAxes(heading: number): {
  fx: number
  fz: number
  rx: number
  rz: number
} {
  const fx = Math.cos(heading)
  const fz = -Math.sin(heading)
  return { fx, fz, rx: -fz, rz: fx }
}

interface ObbCorners {
  // 4 corners in world XZ, ordered: front-left, front-right, rear-right, rear-left.
  c: [number, number][]
  cx: number
  cz: number
}

function carCorners(car: DerbyCarState, cfg: DerbyVehicleConfig): ObbCorners {
  const { fx, fz, rx, rz } = carAxes(car.physics.heading)
  const hw = cfg.obbHalfWidth
  const hl = cfg.obbHalfLength
  const cx = car.physics.x
  const cz = car.physics.z
  const fxL = fx * hl
  const fzL = fz * hl
  const rxW = rx * hw
  const rzW = rz * hw
  return {
    cx,
    cz,
    c: [
      [cx + fxL - rxW, cz + fzL - rzW], // front-left
      [cx + fxL + rxW, cz + fzL + rzW], // front-right
      [cx - fxL + rxW, cz - fzL + rzW], // rear-right
      [cx - fxL - rxW, cz - fzL - rzW], // rear-left
    ],
  }
}

// Project 4 corners onto a 2D axis (ax, az). Returns the projected
// interval's half-extent (always >= 0) and its center along the axis. We
// use half + center instead of raw [lo, hi] because the MTV magnitude on
// any axis is `(halfA + halfB) - |centerDiff|`, which handles the nested
// case (one box fully inside the other) correctly. The naive
// `min(aHi, bHi) - max(aLo, bLo)` formula returns the smaller box's
// width in that case, which is not enough to separate the two when the
// caller's separate() pushes by `overlap` along the MTV.
function projectExtent(
  corners: [number, number][],
  ax: number,
  az: number,
): { center: number; half: number } {
  let lo = Infinity
  let hi = -Infinity
  for (const [px, pz] of corners) {
    const t = px * ax + pz * az
    if (t < lo) lo = t
    if (t > hi) hi = t
  }
  return { center: (lo + hi) / 2, half: (hi - lo) / 2 }
}

// OBB-vs-OBB Separating Axis Theorem. The four candidate axes are each
// car's forward and right basis vectors. Returns the minimum-translation
// vector pointing from a toward b on overlap, or null on separation.
function obbContact(
  a: DerbyCarState,
  b: DerbyCarState,
  ca: DerbyVehicleConfig,
  cb: DerbyVehicleConfig,
): ContactResult | null {
  const aCorners = carCorners(a, ca)
  const bCorners = carCorners(b, cb)
  const axesA = carAxes(a.physics.heading)
  const axesB = carAxes(b.physics.heading)
  const axes: [number, number][] = [
    [axesA.fx, axesA.fz],
    [axesA.rx, axesA.rz],
    [axesB.fx, axesB.fz],
    [axesB.rx, axesB.rz],
  ]
  let minOverlap = Infinity
  let mtvAx = 0
  let mtvAz = 0
  for (const [ax, az] of axes) {
    const aExt = projectExtent(aCorners.c, ax, az)
    const bExt = projectExtent(bCorners.c, ax, az)
    const overlap = aExt.half + bExt.half - Math.abs(aExt.center - bExt.center)
    if (overlap <= 0) return null
    if (overlap < minOverlap) {
      minOverlap = overlap
      mtvAx = ax
      mtvAz = az
    }
  }
  // Orient the normal so it points from a's center toward b's center; the
  // separation step expects nx,nz to push b away from a.
  const dx = bCorners.cx - aCorners.cx
  const dz = bCorners.cz - aCorners.cz
  if (mtvAx * dx + mtvAz * dz < 0) {
    mtvAx = -mtvAx
    mtvAz = -mtvAz
  }
  // Contact point: midway between the two centers along the MTV. Good
  // enough for the HUD popup anchor; a real contact-manifold solve would
  // pick the deepest penetrating vertex, but that is overkill for v1.
  const cx = (aCorners.cx + bCorners.cx) * 0.5
  const cz = (aCorners.cz + bCorners.cz) * 0.5
  return { nx: mtvAx, nz: mtvAz, overlap: minOverlap, x: cx, z: cz }
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

function velocityOf(car: DerbyCarState): { vx: number; vz: number } {
  return {
    vx: Math.cos(car.physics.heading) * car.physics.speed,
    vz: -Math.sin(car.physics.heading) * car.physics.speed,
  }
}

function writeVelocity(
  car: DerbyCarState,
  vx: number,
  vz: number,
): void {
  const speed = Math.hypot(vx, vz)
  if (speed < 1e-4) {
    car.physics.speed = 0
    return
  }
  car.physics.speed = speed
  car.physics.heading = Math.atan2(-vz, vx)
}

function applyImpactImpulse(
  a: DerbyCarState,
  b: DerbyCarState,
  ma: number,
  mb: number,
  nx: number,
  nz: number,
): void {
  const va = velocityOf(a)
  const vb = velocityOf(b)
  const closingSpeed = (va.vx - vb.vx) * nx + (va.vz - vb.vz) * nz
  if (closingSpeed <= IMPACT_MIN_CLOSING_SPEED) return

  const invMassA = 1 / Math.max(1, ma)
  const invMassB = 1 / Math.max(1, mb)
  const impulse =
    ((1 + IMPACT_RESTITUTION) * closingSpeed) / (invMassA + invMassB)
  const impulseX = impulse * nx
  const impulseZ = impulse * nz

  writeVelocity(a, va.vx - impulseX * invMassA, va.vz - impulseZ * invMassA)
  writeVelocity(b, vb.vx + impulseX * invMassB, vb.vz + impulseZ * invMassB)
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
