import { stepPhysics, type PhysicsInput } from './physics'
import {
  resolveCollision,
  type CollisionDamage,
} from './derbyDamage'
import {
  applyDamage,
  isDestroyed,
  isStunned,
  rankCars,
  STUN_INPUT_SCALE,
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

// Minimum elapsedMs between damage hits within the same car pair. Position
// separation still runs every frame (so cars don't clip), but only the
// first hit per cooldown window applies damage. Without this, a sustained
// pile-up or a head-on pin against a wreck stacks the same hit every frame
// and tears through HP in under a second.
export const PAIR_DAMAGE_COOLDOWN_MS = 350

// Linear damping applied to a destroyed car's signed speed each tick. The
// wreck still receives kinetic pushes from live cars via applyWreckImpulse;
// this just bleeds momentum off so a coasting wreck slows quickly instead
// of drifting across the arena under its own residual velocity.
const WRECK_FRICTION_PER_SEC = 4

// Coefficient of restitution for live-car-vs-wreck collisions. The
// impulse is mostly inelastic (energy lost on impact) but a small bounce
// pulls the wreck slightly ahead of the pusher so the pair separates
// instead of locking together at a steady-state contact speed.
const WRECK_RESTITUTION = 0.2
// Per-pair cooldown between wreck impulses. Without this gate, a sustained
// touch fires the impulse every frame and drains the pusher's speed to
// zero in a few frames. Positional separation still runs every frame, so
// the cars don't clip; only the velocity exchange is gated.
export const PAIR_WRECK_IMPULSE_COOLDOWN_MS = 220
// Minimum closing rate (m/s) required to trigger the impulse. Below this
// the contact is a graze and applying the impulse would jitter both cars'
// velocities every cooldown window without producing visible motion.
const WRECK_MIN_CLOSING_MPS = 0.5

export function pairKey(i: number, j: number): string {
  return i < j ? `${i}:${j}` : `${j}:${i}`
}

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
  // throttle the cars artificially. Destroyed cars still step physics so a
  // wreck pushed by a live car coasts the rest of the way out; their input
  // is forced to zero (no thrust, no steering, no handbrake) and an extra
  // damping term bleeds their residual speed so wrecks don't drift forever.
  for (let i = 0; i < round.cars.length; i++) {
    const car = round.cars[i]
    const dead = isDestroyed(car)
    const rawInput = inputs.perCar[i] ?? { throttle: 0, steer: 0, handbrake: false }
    let input: PhysicsInput
    if (dead) {
      input = { throttle: 0, steer: 0, handbrake: false }
    } else if (isStunned(car, round.elapsedMs)) {
      // Stun: scale throttle and steer toward zero so a victim of a clean
      // hit feels briefly sluggish. Handbrake is forced off so a stunned
      // car cannot lock its wheels mid-rattle. The position-only physics
      // tick keeps integrating velocity, so the car still drifts; we just
      // take the wheel out of the player's (or AI's) hands.
      input = {
        throttle: rawInput.throttle * STUN_INPUT_SCALE,
        steer: rawInput.steer * STUN_INPUT_SCALE,
        handbrake: false,
      }
    } else {
      input = rawInput
    }
    const params = round.configs[i].carParams
    // Derby opts out of the road-mode quartic taper (final arg = 1). Vehicle
    // catalog accel/maxSpeed values were tuned against a linear curve, and
    // closing speeds drive derbyDamage.resolveCollision. A hidden top-end
    // taper would mute every ram. Drag mode opts out the same way.
    car.physics = stepPhysics(car.physics, input, dtSec, true, params, 1, 1, 0, 1)
    if (dead) {
      const damp = Math.max(0, 1 - WRECK_FRICTION_PER_SEC * dtSec)
      car.physics.speed *= damp
      car.physics.angularVelocity = 0
    } else {
      car.aliveMs += dtMs
    }
  }

  // 2. Arena containment. Clamp position and zero the outward radial speed
  // component so the wall feels solid. v1 wall contact does not damage.
  // Destroyed cars get clamped too so a wreck shoved by a heavy truck can't
  // pile up outside the perimeter.
  for (let i = 0; i < round.cars.length; i++) {
    const car = round.cars[i]
    clampToArena(car, round)
  }

  // 3. Pairwise contact. Broad phase = circle-vs-circle on collisionRadius
  // (cheap early-out so SAT does not run on every pair every frame); narrow
  // phase = OBB-vs-OBB SAT so a long vehicle (school bus) cannot be clipped
  // through its front or rear by a smaller car. Each contact resolves once
  // per frame; repeat hits between the same pair are gated by a per-pair
  // damage cooldown so a sustained ram cannot stack hits every frame.
  // Destroyed cars participate in the contact pass. separate() keeps a
  // wreck from being driven through, and applyWreckImpulse lets a live car
  // shove it around, but neither side takes damage when one of the pair
  // is dead.
  for (let i = 0; i < round.cars.length; i++) {
    const a = round.cars[i]
    for (let j = i + 1; j < round.cars.length; j++) {
      const b = round.cars[j]
      if (!circleBroadPhase(a, b, round.configs[i].collisionRadius, round.configs[j].collisionRadius)) {
        continue
      }
      const contact = obbContact(a, b, round.configs[i], round.configs[j])
      if (!contact) continue
      separate(
        a,
        b,
        round.configs[i].mass,
        round.configs[j].mass,
        contact.overlap,
        contact.nx,
        contact.nz,
        round.arena.radius,
        round.configs[i].collisionRadius,
        round.configs[j].collisionRadius,
      )
      const aDead = isDestroyed(a)
      const bDead = isDestroyed(b)
      if (aDead && bDead) {
        // Two wrecks bumping into each other: positional separation only.
        continue
      }
      if (aDead || bDead) {
        // Live car shoves a wreck. The MTV normal (nx, nz) points a -> b,
        // so the wreck is on the side opposite its pusher: separate() has
        // already pushed it in that direction; applyWreckImpulse exchanges
        // momentum across the pair so the wreck coasts forward and the
        // pusher loses some speed. Without the pusher slowdown, the
        // wreck reaches a steady-state ~88% of pusher speed and rides
        // along on the bumper forever.
        const key = pairKey(i, j)
        const impulseUntil = round.pairWreckImpulseUntilMs.get(key) ?? 0
        if (round.elapsedMs >= impulseUntil) {
          const applied = aDead
            ? applyWreckImpulse(a, b, round.configs[i].mass, round.configs[j].mass, -contact.nx, -contact.nz)
            : applyWreckImpulse(b, a, round.configs[j].mass, round.configs[i].mass, contact.nx, contact.nz)
          if (applied) {
            round.pairWreckImpulseUntilMs.set(
              key,
              round.elapsedMs + PAIR_WRECK_IMPULSE_COOLDOWN_MS,
            )
          }
        }
        continue
      }
      // Per-pair damage cooldown. separate() already ran above so the cars
      // are not clipped; we just skip damage emission while a hit between
      // this pair is on cooldown.
      const key = pairKey(i, j)
      const cooldownUntil = round.pairDamageCooldownUntilMs.get(key) ?? 0
      if (round.elapsedMs < cooldownUntil) continue
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
      if (damage.aDelta > 0 || damage.bDelta > 0) {
        round.pairDamageCooldownUntilMs.set(
          key,
          round.elapsedMs + PAIR_DAMAGE_COOLDOWN_MS,
        )
      }
      applyAndEmit(round, events, a, b, damage, contact.x, contact.z)
    }
  }

  // 3b. Re-clamp every car after contact resolution. separate() and the
  // wreck impulse can shove a car a fraction of a unit past the arena
  // perimeter on a hard collision; without this second clamp the test
  // invariant "every car ends the frame inside (radius - collisionRadius)"
  // fails on the last frame before the round ends, because the up-front
  // clamp in step 2 already ran before contact pushed the car out.
  for (let i = 0; i < round.cars.length; i++) {
    clampToArena(round.cars[i], round)
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

// Momentum-conserving impulse for a live-car-vs-wreck contact. dirNx,dirNz
// is the unit vector along which the wreck is being pushed (pointing
// AWAY from the pusher). The wreck gains speed along +dir; the pusher
// loses speed along +dir. With a small restitution > 0 the wreck pulls
// slightly faster than the pusher and the pair separates instead of
// locking together. Returns true when the impulse was applied.
function applyWreckImpulse(
  wreck: DerbyCarState,
  pusher: DerbyCarState,
  massWreck: number,
  massPusher: number,
  dirNx: number,
  dirNz: number,
): boolean {
  const ws = wreck.physics.speed
  const wh = wreck.physics.heading
  const wreckVx = Math.cos(wh) * ws
  const wreckVz = -Math.sin(wh) * ws
  const ps = pusher.physics.speed
  const ph = pusher.physics.heading
  const pusherVx = Math.cos(ph) * ps
  const pusherVz = -Math.sin(ph) * ps
  const closing =
    (pusherVx - wreckVx) * dirNx + (pusherVz - wreckVz) * dirNz
  if (closing < WRECK_MIN_CLOSING_MPS) return false
  const invMp = 1 / Math.max(1, massPusher)
  const invMw = 1 / Math.max(1, massWreck)
  const J = ((1 + WRECK_RESTITUTION) * closing) / (invMp + invMw)
  const wreckDelta = J * invMw
  const pusherDelta = J * invMp
  // Apply to wreck along +dir.
  const newWVx = wreckVx + wreckDelta * dirNx
  const newWVz = wreckVz + wreckDelta * dirNz
  const newWSpeed = Math.hypot(newWVx, newWVz)
  if (newWSpeed < 1e-4) {
    wreck.physics.speed = 0
  } else {
    wreck.physics.speed = newWSpeed
    wreck.physics.heading = Math.atan2(-newWVz, newWVx)
  }
  // Apply to pusher along -dir (Newton's third law). Note the pusher's
  // heading may rotate slightly if the contact normal isn't aligned with
  // its forward axis; that's intentional and matches how a real side-
  // swipe would kick the pusher off-line.
  const newPVx = pusherVx - pusherDelta * dirNx
  const newPVz = pusherVz - pusherDelta * dirNz
  const newPSpeed = Math.hypot(newPVx, newPVz)
  if (newPSpeed < 1e-4) {
    pusher.physics.speed = 0
  } else {
    pusher.physics.speed = newPSpeed
    pusher.physics.heading = Math.atan2(-newPVz, newPVx)
  }
  return true
}

function separate(
  a: DerbyCarState,
  b: DerbyCarState,
  ma: number,
  mb: number,
  overlap: number,
  nx: number,
  nz: number,
  arenaRadius: number,
  aCollisionRadius: number,
  bCollisionRadius: number,
): void {
  // Move each car along the normal in inverse proportion to its mass so
  // the heavier car barely budges and the lighter car gets shoved away.
  const totalMass = Math.max(1, ma + mb)
  let aShare = mb / totalMass
  let bShare = ma / totalMass
  // Wall-pin override: when a car is already pressed against the arena
  // wall AND the separation would push it further outward, the next
  // arena-clamp pass undoes that motion, leaving the OTHER car overlapping
  // by the heavy car's share of the overlap. To resolve cleanly, transfer
  // the full overlap onto the unpinned car along the contact normal. This
  // also fixes the "lighter car clips into the heavier one" feel a player
  // sees when they ram a school-bus pinned against the wall.
  const ar = Math.hypot(a.physics.x, a.physics.z)
  const br = Math.hypot(b.physics.x, b.physics.z)
  const aAtWall = ar >= arenaRadius - aCollisionRadius - 0.05
  const bAtWall = br >= arenaRadius - bCollisionRadius - 0.05
  // Outward = radial direction from origin. If the proposed displacement
  // for a (-n) has a positive component along a's outward direction, a
  // would be pushed further into the wall.
  const aPushOutward = ar > 1e-3 ? (-nx) * (a.physics.x / ar) + (-nz) * (a.physics.z / ar) > 0 : false
  const bPushOutward = br > 1e-3 ? nx * (b.physics.x / br) + nz * (b.physics.z / br) > 0 : false
  if (aAtWall && aPushOutward && !(bAtWall && bPushOutward)) {
    aShare = 0
    bShare = 1
  } else if (bAtWall && bPushOutward && !(aAtWall && aPushOutward)) {
    aShare = 1
    bShare = 0
  }
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

// Angular kick magnitude (rad/sec) per unit of clamped damage on a pure
// side-impact. A head-on or rear-end hit imparts no yaw (the lever arm
// is parallel to the impulse); a 90-degree door hit gets the full kick.
// Kept modest so a hard ram rotates by ~25 degrees over the next half
// second instead of spinning the car like a top.
const HIT_ANGULAR_KICK_PER_DAMAGE = 0.18

function applyHitWobble(
  victim: DerbyCarState,
  amount: number,
  contactX: number,
  contactZ: number,
): void {
  if (amount <= 0) return
  const lx = contactX - victim.physics.x
  const lz = contactZ - victim.physics.z
  const len = Math.hypot(lx, lz)
  if (len < 1e-4) return
  // Project the lever arm onto the victim's local right axis. carAxes()
  // gives forward = (cos h, -sin h) and right = (sin h, cos h); a
  // contact landing on the right side has positive localRight, on the
  // left side has negative localRight, and on the nose / tail has zero.
  // Scaling by the unit lever arm gives a smooth interpolation between
  // pure head-on (no kick) and pure side hit (full kick).
  const h = victim.physics.heading
  const rx = Math.sin(h)
  const rz = Math.cos(h)
  const localRight = lx * rx + lz * rz
  const ratio = localRight / len
  // Sign: a hit on the right side pushes the rear to the right and the
  // nose to the left, which in the simulator's convention is positive
  // angularVelocity (heading 0 = +X, PI/2 = -Z; positive angVel rotates
  // forward toward -Z, i.e. nose to the left when the car faces +X).
  const kick = HIT_ANGULAR_KICK_PER_DAMAGE * amount * ratio
  const current = victim.physics.angularVelocity ?? 0
  // Add rather than overwrite so a stack of hits compounds the spin
  // briefly. The car physics damps angular velocity back toward the
  // steered target via ANGULAR_VELOCITY_RESPONSE so the wobble decays
  // on its own within a few ticks.
  victim.physics.angularVelocity = current + kick
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
    applyHitWobble(a, r.clampedAmount, contactX, contactZ)
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
    applyHitWobble(b, r.clampedAmount, contactX, contactZ)
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
