import type { PhysicsState } from './physics'
import type { DerbyVehicleConfig } from '@/lib/derbyVehicles'
import type { DerbyVehicleType } from '@/lib/schemas'

// Per-car runtime state for a single Derby round. Lives outside physics.ts on
// purpose: physics stays single-vehicle and pure, derbyVehicleState carries
// the survival-derby concerns (health, status, kills, alive-time tracking).
// derbyTick mutates these in place each frame; tests treat them as plain
// data.

export type DerbyCarStatus = 'alive' | 'destroyed'

export interface DerbyCarState {
  // Stable index in the round, 0..(N-1). carIdx === 0 is always the player
  // in v1. The index is set at round start and never reassigned, so a
  // destroyed car keeps its slot for ranking.
  carIdx: number
  type: DerbyVehicleType
  physics: PhysicsState
  // Maximum health for this car, copied from DerbyVehicleConfig.health at
  // round start so the round logic does not need to re-look-up the config.
  maxHealth: number
  health: number
  status: DerbyCarStatus
  // Wall-clock milliseconds this car has been alive within the round. The
  // round driver advances this by dt for every alive car each tick. Used
  // both for the HUD score formula and as a timeout-ranking tiebreak: a
  // car that survived longer beats one destroyed earlier.
  aliveMs: number
  // Number of enemy destroys this car landed. HUD echo only; the
  // leaderboard does not rank by kills.
  kills: number
  // Time of the most recent hit dealt to this car, in ms since round start.
  // -Infinity means "never hit". Used by the AI Recover state and by the
  // panel-detach trigger.
  lastHitAtMs: number
  // carIdx of whichever car landed the killing blow. null until destroyed.
  destroyedByIdx: number | null
}

export function initCarState(
  carIdx: number,
  config: DerbyVehicleConfig,
  physics: PhysicsState,
): DerbyCarState {
  return {
    carIdx,
    type: config.type,
    physics,
    maxHealth: config.health,
    health: config.health,
    status: 'alive',
    aliveMs: 0,
    kills: 0,
    lastHitAtMs: Number.NEGATIVE_INFINITY,
    destroyedByIdx: null,
  }
}

export function isDestroyed(state: DerbyCarState): boolean {
  return state.status === 'destroyed'
}

// Apply a damage delta to a car. Returns whether this hit pushed the car to
// destroyed. Negative amounts are clamped to zero (no healing in derby v1).
// destroyerIdx is recorded onto the destroyed car only if this hit kills it;
// the caller is responsible for crediting the kill to the destroyer's state.
export function applyDamage(
  state: DerbyCarState,
  amount: number,
  destroyerIdx: number | null,
  nowMs: number,
): { destroyed: boolean; clampedAmount: number } {
  if (state.status === 'destroyed') {
    return { destroyed: false, clampedAmount: 0 }
  }
  const clamped = amount > 0 && Number.isFinite(amount) ? amount : 0
  if (clamped === 0) {
    return { destroyed: false, clampedAmount: 0 }
  }
  state.lastHitAtMs = nowMs
  state.health = Math.max(0, state.health - clamped)
  if (state.health === 0) {
    state.status = 'destroyed'
    state.destroyedByIdx = destroyerIdx
    return { destroyed: true, clampedAmount: clamped }
  }
  return { destroyed: false, clampedAmount: clamped }
}

// Rank cars at round end. Carries the carIdx so the round driver can map
// rank back to the slot. Living beats destroyed; among living, higher
// health wins; among destroyed, longer aliveMs at destruction wins; ties
// break by carIdx ascending so the order is deterministic.
export function rankCars(cars: readonly DerbyCarState[]): number[] {
  const indices = cars.map((c) => c.carIdx)
  indices.sort((ai, bi) => {
    const a = cars.find((c) => c.carIdx === ai)!
    const b = cars.find((c) => c.carIdx === bi)!
    if (a.status !== b.status) return a.status === 'alive' ? -1 : 1
    if (a.status === 'alive') {
      if (a.health !== b.health) return b.health - a.health
    } else {
      if (a.aliveMs !== b.aliveMs) return b.aliveMs - a.aliveMs
    }
    return a.carIdx - b.carIdx
  })
  return indices
}

// Score formula used by the HUD (place chip plus points). Not tied to the
// leaderboard, which ranks by roundTimeMs alone. Pure function so the HUD
// can call it on every render.
export function derbyScorePoints(state: DerbyCarState): number {
  return state.kills * 200 + Math.floor(state.aliveMs / 10_000) * 100
}
