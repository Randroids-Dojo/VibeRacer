/**
 * World Tour multi-car race session reducer. Owns the phase transitions
 * (countdown to racing to finished), the per-car lap and DNF
 * bookkeeping, the per-pair contact damage scan, and the per-tick
 * deterministic step that calls `stepPhysics` for every car (player and
 * AI) so a tour car drives exactly like a Time Attack car at the same
 * inputs.
 *
 * Pure: no IO, no Date.now, no Math.random. Identical inputs reproduce
 * identical outputs.
 *
 * Cars are indexed 0..N-1, with index 0 always the player. AI cars are
 * indexed in grid-slot order. The per-pair contact scan walks every
 * unordered pair in (i, j) ascending order so a deterministic replay
 * applies the same kicks in the same order.
 *
 * Lap accounting is intentionally simplified for the MVP top-down 2D
 * race canvas: each car carries a `distanceTraveled` accumulator and
 * a `lap` counter that advances every `lapDistance` meters. When the
 * 3D renderer port lands, swap this for the canonical finish-line
 * cross check from `src/game/finishLine.ts`. This module keeps the
 * API stable so that swap is a one-file change.
 */

import {
  DEFAULT_CAR_PARAMS,
  stepPhysics,
  type CarParams,
  type PhysicsInput,
  type PhysicsState,
} from './physics'
import {
  INITIAL_AI_STATE,
  tickAi,
  type AiCarStats,
  type AiCarView,
  type AiState,
  type AiTrackView,
} from './worldTourAi'
import { spawnGrid, type GridDriver } from './worldTourGrid'
import {
  damageAbsorption,
  resolveCarParams,
  stockUpgrades,
  type CarUpgrades,
} from './worldTourUpgrades'
import { baseParamsFor } from './worldTourCars'

// Default countdown length in seconds. 3 seconds matches Time Attack's
// "ready, set, go" rhythm and gives the launch hold time to anchor.
export const COUNTDOWN_SECONDS_DEFAULT = 3

// Default DNF thresholds. The race-session reducer flips a car to DNF
// when it has not made meaningful forward progress for this many
// seconds, mirroring the Time Attack "no-progress" timeout pattern.
export const NO_PROGRESS_TIMEOUT_SEC = 60
export const OFF_TRACK_TIMEOUT_SEC = 30
// A car must move at least this many meters in a window of
// `NO_PROGRESS_TIMEOUT_SEC` to keep racing. Anything below this counts
// as "no progress" and the timeout accumulates.
export const NO_PROGRESS_MIN_DELTA_METERS = 1

// Default per-pair contact kick magnitude. Applied as a lateral nudge
// to both cars when they overlap. Ported from VibeGear2's
// `BUMP_KICK_BASE_MPS` constant.
export const BUMP_KICK_BASE_MPS = 4

// Lateral and longitudinal radii used to detect overlap between two
// cars. Tuned for the existing low-poly car footprint.
export const CAR_HALF_LENGTH_M = 2
export const CAR_HALF_WIDTH_M = 0.9

export type CarStatus = 'racing' | 'finished' | 'dnf'

/**
 * A single car on the field. Index 0 is the player; the rest are AI
 * cars in grid-slot order. AI cars carry a `driverId` and an `aiState`;
 * the player has neither.
 */
export interface RaceCar {
  readonly index: number
  readonly isPlayer: boolean
  readonly driverId: string | null
  readonly carId: string
  // Per-car physics params (with upgrade scalars applied) and damage
  // absorption. The race-session reducer hands these to `stepPhysics`
  // every tick so the upgrade table is the single source of truth for
  // a car's chassis feel.
  readonly params: CarParams
  readonly damageAbsorb: number
  physics: PhysicsState
  aiState: AiState | null
  lap: number
  // Total forward distance traveled in meters. Drives the simplified
  // lap rollover. Replaced by the canonical finish-line cross check
  // when the 3D renderer port lands.
  distanceTraveled: number
  status: CarStatus
  finishedAtMs: number | null
  noProgressMs: number
  offTrackMs: number
  // 0..1, where 1 is fully wrecked. The race-session reducer flips a
  // car to DNF when damage reaches 1.
  damage: number
  // Last computed distance, used by the lap-rollover and no-progress
  // accumulator. Carried so the per-tick math does not depend on a
  // separate state shape.
  lastDistance: number
}

export interface RaceSessionConfig {
  // Total laps for the race. Must be at least 1.
  readonly totalLaps: number
  // Distance per lap in meters. Used by the simplified lap rollover.
  // The 3D renderer port swaps this for the canonical track length.
  readonly lapDistanceMeters: number
  // Countdown length in seconds. Defaults to COUNTDOWN_SECONDS_DEFAULT.
  readonly countdownSeconds?: number
  // Per-car shared physics parameters. Defaults to DEFAULT_CAR_PARAMS.
  readonly carParams?: CarParams
  // Whether a car is currently on track. Defaults to true for every
  // car. The 3D renderer port plumbs the real track surface check.
  readonly onTrackOf?: (carIndex: number, physics: PhysicsState) => boolean
}

export interface RaceSessionState {
  tick: number
  phase: 'countdown' | 'racing' | 'finished'
  countdownRemainingSec: number
  elapsedMs: number
  cars: RaceCar[]
  totalLaps: number
  finishingOrder: number[]
}

export interface CreateRaceSessionInput {
  readonly slotCount: number
  readonly laneCount: number
  readonly aiDrivers: ReadonlyArray<GridDriver>
  readonly seed: number
  readonly totalLaps: number
  readonly lapDistanceMeters: number
  readonly playerCarId: string
  readonly countdownSeconds?: number
  // Initial damage on the player car, in [0, 1]. Carried over from
  // the career's `carsById[activeCarId].damage` so the player starts
  // a race with whatever damage the previous race left them with.
  readonly playerInitialDamage?: number
  // Player upgrade tiers. Resolved into per-car physics params at
  // race start.
  readonly playerUpgrades?: CarUpgrades
  // AI upgrade tiers. A tour can declare an AI tier set so the field
  // scales with the player's wallet. Defaults to stock.
  readonly aiUpgrades?: CarUpgrades
}

/**
 * Seed a fresh race session. Builds the grid via `spawnGrid`, places
 * each car at its grid slot, and assigns the appropriate AI state to
 * every non-player car.
 */
export function createRaceSession(
  input: CreateRaceSessionInput,
): RaceSessionState {
  const grid = spawnGrid({
    slotCount: input.slotCount,
    laneCount: input.laneCount,
    aiDrivers: input.aiDrivers,
    seed: input.seed,
  })
  const playerUpgrades = input.playerUpgrades ?? stockUpgrades()
  const aiUpgrades = input.aiUpgrades ?? stockUpgrades()
  // The player's chassis base depends on which car they own; AI cars
  // share the starter chassis as a baseline. Upgrades scale on top.
  const playerParams = resolveCarParams(
    baseParamsFor(input.playerCarId),
    playerUpgrades,
  )
  const aiParams = resolveCarParams(DEFAULT_CAR_PARAMS, aiUpgrades)
  const playerAbsorb = damageAbsorption(playerUpgrades)
  const aiAbsorb = damageAbsorption(aiUpgrades)
  const cars: RaceCar[] = grid.map((slot, idx) => ({
    index: idx,
    isPlayer: idx === 0,
    driverId: slot.driverId,
    carId: idx === 0 ? input.playerCarId : (slot.driverId ?? `slot-${idx}`),
    params: idx === 0 ? playerParams : aiParams,
    damageAbsorb: idx === 0 ? playerAbsorb : aiAbsorb,
    physics: {
      x: slot.startX,
      z: slot.startZ,
      heading: 0,
      speed: 0,
    },
    aiState:
      idx === 0
        ? null
        : { ...INITIAL_AI_STATE, seed: slot.seed, progress: 0 },
    lap: 0,
    distanceTraveled: 0,
    status: 'racing',
    finishedAtMs: null,
    noProgressMs: 0,
    offTrackMs: 0,
    damage: idx === 0 ? clampDamage(input.playerInitialDamage) : 0,
    lastDistance: 0,
  }))
  return {
    tick: 0,
    phase: 'countdown',
    countdownRemainingSec:
      input.countdownSeconds !== undefined && input.countdownSeconds > 0
        ? input.countdownSeconds
        : COUNTDOWN_SECONDS_DEFAULT,
    elapsedMs: 0,
    cars,
    totalLaps: Math.max(1, Math.floor(input.totalLaps)),
    finishingOrder: [],
  }
}

export interface StepInput {
  // Player input for this tick. Ignored when `phase !== 'racing'`.
  readonly playerInput: PhysicsInput
  // Tick step in seconds. Use a fixed step (e.g. 1/60) for replay
  // determinism.
  readonly dt: number
  // Track view for the AI. Same shape the `tickAi` controller reads.
  readonly track: AiTrackView
  // Stats consumed by the AI throttle/brake controller. Provided
  // once for the whole AI roster: all AI cars share the same
  // `topSpeed` today.
  readonly aiStats: AiCarStats
}

/**
 * Advance the race session by one tick. Returns a fresh state; never
 * mutates the input. The function:
 *
 * 1. Decrements the countdown until it hits zero, then flips to
 *    `racing`. During countdown every car stays in place.
 * 2. Calls `stepPhysics` for every car still racing, with player input
 *    on car 0 and AI input on cars 1..N (via `tickAi`).
 * 3. Accumulates per-car distance and resolves lap rollover. A car
 *    that finishes the final lap is moved to `status === 'finished'`
 *    and added to `finishingOrder`.
 * 4. Detects DNF for no-progress, off-track, or full damage.
 * 5. Runs a deterministic per-pair contact scan and applies a small
 *    lateral kick plus damage on overlap.
 * 6. Flips `phase` to `'finished'` once every car is either finished
 *    or DNF'd.
 */
export function stepRaceSession(
  state: Readonly<RaceSessionState>,
  step: Readonly<StepInput>,
  config: Readonly<RaceSessionConfig>,
): RaceSessionState {
  const dt = Math.max(0, step.dt)
  if (state.phase === 'finished') {
    return { ...state, tick: state.tick + 1 }
  }

  const next: RaceSessionState = {
    tick: state.tick + 1,
    phase: state.phase,
    countdownRemainingSec: state.countdownRemainingSec,
    elapsedMs: state.elapsedMs,
    cars: state.cars.map(cloneCar),
    totalLaps: state.totalLaps,
    finishingOrder: state.finishingOrder.slice(),
  }

  if (next.phase === 'countdown') {
    next.countdownRemainingSec = Math.max(0, next.countdownRemainingSec - dt)
    if (next.countdownRemainingSec <= 0) {
      next.phase = 'racing'
      next.countdownRemainingSec = 0
    }
    return next
  }

  // Racing phase. Step each car still racing.
  next.elapsedMs += dt * 1000
  // `config.carParams` overrides every car's params (used by tests
  // that want a single deterministic chassis); otherwise each car
  // uses its per-car params resolved at create time.
  const overrideParams = config.carParams
  const onTrackOf = config.onTrackOf ?? (() => true)

  // First pass: build the AI car view for every car (used for follow-
  // distance throttle on the AI tick).
  const carViews: AiCarView[] = next.cars.map((c) => ({
    x: c.physics.x,
    z: c.physics.z,
    heading: c.physics.heading,
    speed: c.physics.speed,
  }))

  for (let i = 0; i < next.cars.length; i++) {
    const car = next.cars[i]!
    if (car.status !== 'racing') continue
    const onTrack = onTrackOf(i, car.physics)
    let input: PhysicsInput
    if (car.isPlayer) {
      input = step.playerInput
    } else if (car.aiState) {
      const others = carViews.filter((_, j) => j !== i)
      const result = tickAi(
        car.aiState,
        carViews[i]!,
        step.aiStats,
        step.track,
        { others, dt, racing: true },
      )
      input = result.input
      car.aiState = result.nextAiState
    } else {
      input = { throttle: 0, steer: 0, handbrake: false }
    }

    const prev = car.physics
    car.physics = integrateCarPosition(
      prev,
      input,
      dt,
      overrideParams ?? car.params,
      onTrack,
    )

    // Accumulate forward distance from the speed magnitude. A
    // reversing car still counts as "moving" so it does not trigger
    // the no-progress timeout; lap rollover only fires on positive
    // forward delta.
    const fwdDelta = Math.max(0, car.physics.speed) * dt
    car.distanceTraveled += fwdDelta
    const totalDistance = car.distanceTraveled
    const newLap = Math.floor(totalDistance / config.lapDistanceMeters)
    if (newLap > car.lap) {
      car.lap = newLap
      if (car.lap >= next.totalLaps) {
        car.status = 'finished'
        car.finishedAtMs = next.elapsedMs
        next.finishingOrder.push(i)
        car.lastDistance = totalDistance
        continue
      }
    }

    // No-progress timer: if the car barely moved this tick, accumulate
    // toward the DNF timeout.
    const moved = totalDistance - car.lastDistance
    if (moved < NO_PROGRESS_MIN_DELTA_METERS * dt) {
      car.noProgressMs += dt * 1000
    } else {
      car.noProgressMs = 0
    }
    car.lastDistance = totalDistance

    if (!onTrack) {
      car.offTrackMs += dt * 1000
    } else {
      car.offTrackMs = 0
    }

    if (
      car.noProgressMs / 1000 >= NO_PROGRESS_TIMEOUT_SEC ||
      car.offTrackMs / 1000 >= OFF_TRACK_TIMEOUT_SEC ||
      car.damage >= 1
    ) {
      car.status = 'dnf'
      car.finishedAtMs = next.elapsedMs
      next.finishingOrder.push(i)
    }
  }

  // Per-pair contact scan. Walks every unordered pair in ascending
  // (i, j) order so identical inputs reproduce identical kicks across
  // replays.
  for (let i = 0; i < next.cars.length; i++) {
    const a = next.cars[i]!
    if (a.status !== 'racing') continue
    for (let j = i + 1; j < next.cars.length; j++) {
      const b = next.cars[j]!
      if (b.status !== 'racing') continue
      const overlap = carsOverlap(a.physics, b.physics)
      if (!overlap) continue
      // Lateral kick: push the cars apart along the x axis. A small
      // damage accrual per contact lets a long pile-up actually DNF a
      // car instead of silently rubbing forever.
      const dx = b.physics.x - a.physics.x
      const dir = dx >= 0 ? 1 : -1
      a.physics = { ...a.physics, x: a.physics.x - dir * BUMP_KICK_BASE_MPS * dt }
      b.physics = { ...b.physics, x: b.physics.x + dir * BUMP_KICK_BASE_MPS * dt }
      a.damage = Math.min(1, a.damage + 0.02 * a.damageAbsorb)
      b.damage = Math.min(1, b.damage + 0.02 * b.damageAbsorb)
    }
  }

  // Phase transition: every car is either finished or DNF'd.
  if (next.cars.every((c) => c.status !== 'racing')) {
    next.phase = 'finished'
  }
  return next
}

/**
 * Resolve final standings for all cars. Used by the race-result
 * builder. Cars that finished the race appear first, in finish order;
 * DNFs appear after, in the order they exited the race. The list
 * length always equals the car count.
 */
export function finishingStandings(
  state: Readonly<RaceSessionState>,
): number[] {
  const order = state.finishingOrder.slice()
  // Any car that is still racing (the rare case where the session
  // halted before the field cleared) is appended in index order so the
  // result is always full-length.
  for (let i = 0; i < state.cars.length; i++) {
    if (!order.includes(i)) order.push(i)
  }
  return order
}

function cloneCar(c: RaceCar): RaceCar {
  return {
    index: c.index,
    isPlayer: c.isPlayer,
    driverId: c.driverId,
    carId: c.carId,
    params: c.params,
    damageAbsorb: c.damageAbsorb,
    physics: { ...c.physics },
    aiState: c.aiState ? { ...c.aiState } : null,
    lap: c.lap,
    distanceTraveled: c.distanceTraveled,
    status: c.status,
    finishedAtMs: c.finishedAtMs,
    noProgressMs: c.noProgressMs,
    offTrackMs: c.offTrackMs,
    damage: c.damage,
    lastDistance: c.lastDistance,
  }
}

function integrateCarPosition(
  prev: PhysicsState,
  input: PhysicsInput,
  dt: number,
  params: CarParams,
  onTrack: boolean,
): PhysicsState {
  // `stepPhysics` only updates `speed`. The race-session reducer is
  // responsible for advancing position and heading. The math here is
  // the canonical kinematic update the Time Attack loop uses; pinned
  // to the same convention so a tour car drives identically to a Time
  // Attack car at the same inputs.
  const next = stepPhysics(prev, input, dt, onTrack, params)
  // Heading advances from the steer input. The angular response model
  // follows the convention in `physics.ts`: positive steer turns left
  // (heading increases counterclockwise).
  const headingDelta = input.steer * params.steerRateLow * dt
  const heading = prev.heading + headingDelta
  // Position update: speed times forward axis. VibeRacer's world axis
  // convention places forward along negative z when heading is zero.
  const fwdX = -Math.sin(heading)
  const fwdZ = -Math.cos(heading)
  const x = prev.x + next.speed * fwdX * dt
  const z = prev.z + next.speed * fwdZ * dt
  return { x, z, heading, speed: next.speed }
}

function clampDamage(v: number | undefined): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  return Math.min(1, Math.max(0, v))
}

function carsOverlap(a: PhysicsState, b: PhysicsState): boolean {
  const dx = b.x - a.x
  const dz = b.z - a.z
  if (Math.abs(dx) > CAR_HALF_WIDTH_M * 2) return false
  if (Math.abs(dz) > CAR_HALF_LENGTH_M * 2) return false
  return true
}
