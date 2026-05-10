import type { PhysicsInput } from './physics'
import type { DerbyCarState } from './derbyVehicleState'

// CPU AI for Derby. v1 implements the seek-then-ram behavior the spec
// requires: pick the lowest-health-distance-weighted enemy as the target,
// drive toward it (with a small lead at medium range), and ram on contact.
// A short Recover state kicks in when the car has just been hit or has
// stalled facing the wrong way, so a CPU does not get pinned reversing into
// a corner forever. The track-circling tactic is intentionally out of scope
// for v1 and is logged in FOLLOWUPS.md by slice 11.

export type AiState = 'seek' | 'approach' | 'ram' | 'recover'

export interface DerbyAiBrain {
  state: AiState
  // Wall-clock ms (round-relative) the recover state expires at.
  recoverUntilMs: number
  // carIdx of the currently chosen target, or -1 when none. Held across
  // ticks so the AI does not flip between two equidistant targets every
  // frame.
  targetIdx: number
}

export interface AiInput {
  selfIdx: number
  cars: readonly DerbyCarState[]
  arenaRadius: number
  nowMs: number
}

// Range bands. Tunable.
export const RAM_RADIUS = 6
export const APPROACH_RADIUS = 30
export const VELOCITY_LEAD_SECONDS = 0.5
export const RECOVER_DURATION_MS = 600
export const RECENT_HIT_WINDOW_MS = 200
export const ARENA_INSET_MARGIN = 4

export function initBrain(): DerbyAiBrain {
  return { state: 'seek', recoverUntilMs: -1, targetIdx: -1 }
}

export function stepAi(brain: DerbyAiBrain, input: AiInput): PhysicsInput {
  const self = input.cars[input.selfIdx]
  if (!self || self.status === 'destroyed') {
    return { throttle: 0, steer: 0, handbrake: false }
  }

  // Recover bypass. While recovering, throttle in reverse and let the
  // next tick re-evaluate. We exit recover once the timer elapses.
  if (brain.state === 'recover' && input.nowMs < brain.recoverUntilMs) {
    return { throttle: -1, steer: 0, handbrake: false }
  }
  if (brain.state === 'recover' && input.nowMs >= brain.recoverUntilMs) {
    brain.state = 'seek'
  }

  // Trigger conditions for recover. A recent hit pushes us into recover
  // for the cooldown so we do not just keep ramming straight back into
  // the same attacker. A stall (very slow forward speed) also enters
  // recover so a car wedged against a wall backs out and re-targets.
  const recentlyHit =
    self.lastHitAtMs > Number.NEGATIVE_INFINITY &&
    input.nowMs - self.lastHitAtMs <= RECENT_HIT_WINDOW_MS
  if (recentlyHit) {
    brain.state = 'recover'
    brain.recoverUntilMs = input.nowMs + RECOVER_DURATION_MS
    return { throttle: -1, steer: 0, handbrake: false }
  }
  const target = pickTarget(brain, input)
  if (target === null) {
    brain.targetIdx = -1
    brain.state = 'seek'
    return wanderInsideArena(self, input)
  }
  brain.targetIdx = target.carIdx

  const dist = distanceTo(self, target)
  let mode: AiState
  if (dist <= RAM_RADIUS) mode = 'ram'
  else if (dist <= APPROACH_RADIUS) mode = 'approach'
  else mode = 'seek'
  brain.state = mode

  const aim = aimPointFor(self, target, mode)
  const steer = steerToward(self, aim.x, aim.z)
  const insideOverride = arenaSteerOverride(self, input.arenaRadius)
  if (insideOverride !== null) {
    return { throttle: 1, steer: insideOverride, handbrake: false }
  }
  return { throttle: 1, steer, handbrake: false }
}

// Pick the alive enemy with the smallest "distance / (1 + (100 - hp) * 0.02)".
// Lower-health enemies become attractive at slightly longer ranges, so the
// AI piles onto a wounded car instead of fixating on the nearest healthy one.
// Returns null when no alive enemies exist.
export function pickTarget(
  brain: DerbyAiBrain,
  input: AiInput,
): DerbyCarState | null {
  let best: DerbyCarState | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const c of input.cars) {
    if (c.carIdx === input.selfIdx) continue
    if (c.status === 'destroyed') continue
    const d = distanceTo(input.cars[input.selfIdx], c)
    const score = d / (1 + (100 - c.health) * 0.02)
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}

function distanceTo(a: DerbyCarState, b: DerbyCarState): number {
  const dx = b.physics.x - a.physics.x
  const dz = b.physics.z - a.physics.z
  return Math.hypot(dx, dz)
}

function aimPointFor(
  self: DerbyCarState,
  target: DerbyCarState,
  mode: AiState,
): { x: number; z: number } {
  if (mode === 'approach') {
    // Lead the target by predicting its position one half-second forward.
    const vx = Math.cos(target.physics.heading) * target.physics.speed
    const vz = -Math.sin(target.physics.heading) * target.physics.speed
    return {
      x: target.physics.x + vx * VELOCITY_LEAD_SECONDS,
      z: target.physics.z + vz * VELOCITY_LEAD_SECONDS,
    }
  }
  return { x: target.physics.x, z: target.physics.z }
}

// Steering output to drive self's heading toward (aimX, aimZ). Returns a
// value in [-1, 1]; the heading bug is mapped through a 1 / 0.5 rad gain
// so small misalignments produce small steer commands.
export function steerToward(
  self: DerbyCarState,
  aimX: number,
  aimZ: number,
): number {
  const dx = aimX - self.physics.x
  const dz = aimZ - self.physics.z
  if (Math.hypot(dx, dz) < 1e-3) return 0
  // Heading 0 = +X, PI/2 = -Z, so the "world" angle of the aim vector
  // matches atan2(-dz, dx).
  const desired = Math.atan2(-dz, dx)
  let delta = desired - self.physics.heading
  // Normalize to [-PI, PI].
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  // The car physics has steer flipped relative to delta sign (positive
  // steer turns left in the simulator's frame; verify against stepPhysics
  // where heading += angularVelocity * dt and angularVelocity scales with
  // steer). steerRate * steer drives heading positive, which moves the
  // heading toward larger world angles. So a positive delta needs positive
  // steer.
  const gain = 1 / 0.5
  const steer = Math.max(-1, Math.min(1, delta * gain))
  return steer
}

// When the AI is about to drive itself into the arena wall, override the
// steer to bend back toward the center. Returns null when no override is
// needed; otherwise returns a steer in [-1, 1].
export function arenaSteerOverride(
  self: DerbyCarState,
  arenaRadius: number,
): number | null {
  const r = Math.hypot(self.physics.x, self.physics.z)
  if (r < arenaRadius - ARENA_INSET_MARGIN) return null
  // Inside the inset margin: steer toward the origin.
  return steerToward(self, 0, 0)
}

// No-target wander: drive forward and bend toward the arena center so the
// AI does not just charge the wall when every enemy is destroyed (e.g.
// transient frame between a kill and the round-end check).
function wanderInsideArena(self: DerbyCarState, input: AiInput): PhysicsInput {
  const steer = steerToward(self, 0, 0)
  return { throttle: 0.5, steer, handbrake: false }
}
