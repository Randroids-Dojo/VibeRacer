import {
  DERBY_VEHICLES,
  type DerbyVehicleConfig,
} from '@/lib/derbyVehicles'
import type { DerbyArenaConfig } from '@/lib/derbyArenas'
import type {
  DerbyArenaSlug,
  DerbyRoundOutcome,
  DerbyVehicleType,
} from '@/lib/schemas'
import {
  initCarState,
  type DerbyCarState,
} from './derbyVehicleState'

// One Derby round. Lives entirely in this module so derbyTick can mutate it
// in place each frame without callers reaching into the arena geometry or
// the vehicle catalog. Cars are stored in an array indexed by carIdx; the
// array is never reordered, so a destroyed car keeps its slot and ranking
// can refer to it by index.

export interface DerbyRoundState {
  arena: DerbyArenaConfig
  // Per-carIdx config snapshot. Held by reference into the catalog; the
  // round driver reads damage and mass from here every tick.
  configs: DerbyVehicleConfig[]
  cars: DerbyCarState[]
  // Total milliseconds simulated so far this round.
  elapsedMs: number
  status: 'pre' | 'running' | 'ended'
  // Set when status flips to 'ended'.
  endOutcome: DerbyRoundOutcome | null
  // carIdx in finishing order (rank 1 first). Empty until the round ends.
  ranking: number[]
  // Seed used by the round's deterministic RNG. Surfaced so a tick driver
  // can fork a private RNG for AI choices without touching round state.
  rngSeed: number
  // Per-car-pair damage cooldown. Key is `${min(i,j)}:${max(i,j)}`; value is
  // the earliest elapsedMs at which the next damage hit between that pair
  // may be applied. derbyTick still runs positional separation every frame
  // for cars in contact, but skips damage emission while the cooldown is
  // active so a sustained pile-up cannot stack three hits per frame.
  pairDamageCooldownUntilMs: Map<string, number>
  // Per-car-pair wreck-impulse cooldown. Same shape and motivation as the
  // damage cooldown, but gates the momentum transfer applied when a live
  // car contacts a destroyed wreck. Without the gate the pusher loses
  // velocity every frame and stalls after a few frames of contact.
  pairWreckImpulseUntilMs: Map<string, number>
}

export interface InitDerbyRoundInput {
  arena: DerbyArenaConfig
  // Vehicle types in carIdx order. Index 0 is the player by convention; the
  // remaining entries are CPU opponents. Length must match arena.cpuCount + 1.
  vehicleTypes: DerbyVehicleType[]
  // Seed for placement / future RNG use. Round behavior is fully
  // deterministic given the same seed and the same per-tick inputs.
  rngSeed?: number
}

const DEFAULT_RNG_SEED = 0x6a09e667

export function initDerbyRound(input: InitDerbyRoundInput): DerbyRoundState {
  const { arena, vehicleTypes } = input
  const expectedCount = arena.cpuCount + 1
  if (vehicleTypes.length !== expectedCount) {
    throw new Error(
      `derby init: arena ${arena.slug} expects ${expectedCount} vehicles, got ${vehicleTypes.length}`,
    )
  }
  const configs = vehicleTypes.map((t) => DERBY_VEHICLES[t])
  const placements = startingPlacements(arena, vehicleTypes.length)
  const cars = vehicleTypes.map((_, idx) =>
    initCarState(idx, configs[idx], placements[idx]),
  )
  return {
    arena,
    configs,
    cars,
    elapsedMs: 0,
    status: 'pre',
    endOutcome: null,
    ranking: [],
    rngSeed: input.rngSeed ?? DEFAULT_RNG_SEED,
    pairDamageCooldownUntilMs: new Map(),
    pairWreckImpulseUntilMs: new Map(),
  }
}

// Lay cars out around the arena center on a ring at half the arena radius,
// each facing inward toward the center. Spread is uniform so the four cars
// start equidistant. Deterministic and side-effect-free.
export function startingPlacements(
  arena: DerbyArenaConfig,
  count: number,
): { x: number; z: number; heading: number; speed: number }[] {
  const ringRadius = arena.radius * 0.5
  const out: { x: number; z: number; heading: number; speed: number }[] = []
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2
    const x = Math.cos(theta) * ringRadius
    const z = Math.sin(theta) * ringRadius
    // Heading 0 = +X, PI/2 = -Z. To face the origin from (x, z) we want
    // velocity vector (-x, -z), i.e. heading = atan2(z, -x) so that
    // (cos(h), -sin(h)) = (-x, -z) / |(-x, -z)|.
    const heading = Math.atan2(z, -x)
    out.push({ x, z, heading, speed: 0 })
  }
  return out
}

export function arenaSlug(state: DerbyRoundState): DerbyArenaSlug {
  return state.arena.slug
}

// Deterministic RNG. Mulberry32 is a tiny well-tested 32-bit PRNG; reused
// by AI and any future placement randomness so test runs can pin a seed
// and assert exact outputs.
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return function next(): number {
    t = (t + 0x6d2b79f5) >>> 0
    let r = t
    r = Math.imul(r ^ (r >>> 15), r | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
