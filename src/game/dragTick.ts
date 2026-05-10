import type { CheckpointHit } from '@/lib/schemas'
import { cellKey } from './track'
import { worldToCell, type TrackPath } from './trackPath'
import {
  DEFAULT_CAR_PARAMS,
  stepPhysics,
  type CarParams,
  type PhysicsInput,
} from './physics'
import { GRAVITY, REFERENCE_WEIGHT_KG, type LaunchProfile } from './dragTuning'
import {
  projectArcLengthOnSpawnAxis,
  slopeAt,
  type VerticalProfile,
} from './dragVerticalProfile'

// Drag racing tick. Mirrors the closed-loop tick.ts shape but tailored to
// straight-line sprints: no lap repeats, no manual gearing, no auto-restart
// on a wrap-around. Adds three drag-specific concerns: a foul flag and an
// associated decaying acceleration multiplier (jump-start dampening), a
// per-frame slope-induced acceleration term derived from the strip's
// vertical profile and the car's mass, and a finish freeze on the final
// checkpoint that locks the timer until the parent component decides what
// to do next.

export interface DragGameState {
  x: number
  z: number
  heading: number
  speed: number
  angularVelocity: number
  raceStartMs: number | null
  nextCpId: number
  hits: CheckpointHit[]
  lastCellKey: string
  onTrack: boolean
  finishedAtMs: number | null
  fouled: boolean
  foulPenaltyAccelFactor: number
  preGoThrottleSeen: boolean
  topSpeed: number
  reactionTimeMs: number | null
  arcLengthS: number
}

export interface DragLapCompleteEvent {
  hits: CheckpointHit[]
  finishTimeMs: number
  reactionTimeMs: number | null
  topSpeed: number
  fouled: boolean
}

export interface DragTickResult {
  state: DragGameState
  finished: DragLapCompleteEvent | null
}

export interface DragTickConfig {
  totalWeight: number
  launch: LaunchProfile
  verticalProfile: VerticalProfile
}

// Threshold at which a throttle press counts as a foul during the countdown.
// Picked low enough that an accidental brush of the key still triggers but
// high enough that a 1-bit gamepad noise floor does not.
export const FOUL_THROTTLE_THRESHOLD = 0.05
// Threshold for "the player applied throttle after GO" used to record the
// reaction time. Identical floor; centralized so a future tuning bump moves
// both rules together.
export const REACTION_THROTTLE_THRESHOLD = FOUL_THROTTLE_THRESHOLD

export function initDragGameState(path: TrackPath): DragGameState {
  const spawn = path.spawn
  const cell = worldToCell(spawn.position.x, spawn.position.z)
  return {
    x: spawn.position.x,
    z: spawn.position.z,
    heading: spawn.heading,
    speed: 0,
    angularVelocity: 0,
    raceStartMs: null,
    nextCpId: 0,
    hits: [],
    lastCellKey: cellKey(cell.row, cell.col),
    onTrack: true,
    finishedAtMs: null,
    fouled: false,
    foulPenaltyAccelFactor: 1,
    preGoThrottleSeen: false,
    topSpeed: 0,
    reactionTimeMs: null,
    arcLengthS: 0,
  }
}

export function startDragRace(
  state: DragGameState,
  nowMs: number,
): DragGameState {
  return {
    ...state,
    raceStartMs: nowMs,
    finishedAtMs: null,
    nextCpId: 0,
    hits: [],
    arcLengthS: 0,
    topSpeed: 0,
    reactionTimeMs: null,
  }
}

// Called every frame during the countdown phase. A throttle press above the
// foul threshold flips the fouled flag once and seeds the dampening factor.
// Subsequent presses while already fouled do nothing so a player cannot
// accumulate worse penalties by holding the throttle.
export function handlePreCountdownInput(
  state: DragGameState,
  input: PhysicsInput,
  config: Pick<DragTickConfig, 'launch'>,
): DragGameState {
  if (state.preGoThrottleSeen) return state
  if (input.throttle <= FOUL_THROTTLE_THRESHOLD) return state
  return {
    ...state,
    fouled: true,
    foulPenaltyAccelFactor: config.launch.jumpStartAccelFactor,
    preGoThrottleSeen: true,
  }
}

function exponentialDecay(
  current: number,
  target: number,
  ratePerSec: number,
  dtSec: number,
): number {
  const blend = 1 - Math.exp(-ratePerSec * dtSec)
  return current + (target - current) * blend
}

function computeArcLengthFromSpawn(
  state: DragGameState,
  path: TrackPath,
): number {
  return projectArcLengthOnSpawnAxis(
    { x: state.x, z: state.z },
    { position: path.spawn.position, heading: path.spawn.heading },
  )
}

export function dragTick(
  state: DragGameState,
  input: PhysicsInput,
  dtMs: number,
  nowMs: number,
  path: TrackPath,
  params: CarParams = DEFAULT_CAR_PARAMS,
  config: DragTickConfig = {
    totalWeight: REFERENCE_WEIGHT_KG,
    launch: { jumpStartAccelFactor: 1, decayPerSec: 1.5, minDuration: 0 },
    verticalProfile: [],
  },
): DragTickResult {
  const dtSec = dtMs / 1000

  // Decay foul penalty toward 1 (no penalty). The decay rate is the launch
  // profile's own; minDuration is enforced by clamping to the floor for the
  // first window so a microscopic foul still costs measurable speed.
  let foulPenaltyAccelFactor = state.foulPenaltyAccelFactor
  if (state.fouled && foulPenaltyAccelFactor < 1) {
    foulPenaltyAccelFactor = exponentialDecay(
      foulPenaltyAccelFactor,
      1,
      config.launch.decayPerSec,
      dtSec,
    )
  } else {
    foulPenaltyAccelFactor = 1
  }

  // Slope acceleration. Read the strip's local pitch at the car's current
  // arc-length position and convert into a world-frame longitudinal
  // acceleration scaled by mass.
  const arcLengthS = computeArcLengthFromSpawn(state, path)
  const slopeRad =
    config.verticalProfile.length > 1
      ? slopeAt(config.verticalProfile, arcLengthS)
      : 0
  const massRatio = config.totalWeight / REFERENCE_WEIGHT_KG
  const slopeAccelTerm =
    slopeRad === 0 ? 0 : -GRAVITY * Math.sin(slopeRad) * massRatio

  // Pre-race: physics frozen except for the foul flag tracking. Position
  // does not drift so the player can stage at the line without rolling.
  if (state.raceStartMs === null || state.finishedAtMs !== null) {
    const cell = worldToCell(state.x, state.z)
    return {
      state: {
        ...state,
        foulPenaltyAccelFactor,
        arcLengthS,
        lastCellKey: cellKey(cell.row, cell.col),
      },
      finished: null,
    }
  }

  const phys = stepPhysics(
    {
      x: state.x,
      z: state.z,
      heading: state.heading,
      speed: state.speed,
      angularVelocity: state.angularVelocity,
    },
    input,
    dtSec,
    state.onTrack,
    params,
    foulPenaltyAccelFactor,
    1,
    slopeAccelTerm,
  )

  const newCell = worldToCell(phys.x, phys.z)
  const newKey = cellKey(newCell.row, newCell.col)
  const newArcLength = computeArcLengthFromSpawn(
    { ...state, x: phys.x, z: phys.z },
    path,
  )

  let hits = state.hits
  let nextCpId = state.nextCpId
  let finished: DragLapCompleteEvent | null = null
  let finishedAtMs: number | null = state.finishedAtMs

  // Reaction time: first throttle press after raceStart that is not a foul
  // recovery artifact. We record on the first frame the player applies
  // forward throttle after GO so a fouled jump-start still produces a real
  // reaction time once the timer is running.
  let reactionTimeMs = state.reactionTimeMs
  if (
    reactionTimeMs === null &&
    input.throttle >= REACTION_THROTTLE_THRESHOLD
  ) {
    reactionTimeMs = Math.max(0, Math.round(nowMs - state.raceStartMs))
  }

  // Checkpoint walk identical to the closed-loop tick but with a finish
  // freeze on the final checkpoint instead of a lap wrap. The closed-loop
  // builder appends a synthetic wrap-back-to-start entry to cpTriggerPieceIdx;
  // drag races finish at the explicit last checkpoint, so K excludes that
  // trailing entry.
  if (newKey !== state.lastCellKey) {
    const K = path.cpTriggerPieceIdx.length - 1
    const expectedPieceIdx = path.cpTriggerPieceIdx[nextCpId]
    const expectedPiece = path.order[expectedPieceIdx].piece
    const expectedKey = cellKey(expectedPiece.row, expectedPiece.col)

    if (newKey === expectedKey) {
      const tMs = Math.max(1, Math.round(nowMs - state.raceStartMs))
      hits = [...hits, { cpId: nextCpId, tMs }]
      nextCpId += 1
      if (nextCpId === K) {
        const finishTimeMs = hits[hits.length - 1].tMs
        const topSpeedFinal = Math.max(state.topSpeed, Math.abs(phys.speed))
        finished = {
          hits,
          finishTimeMs,
          reactionTimeMs,
          topSpeed: topSpeedFinal,
          fouled: state.fouled,
        }
        finishedAtMs = finishTimeMs
      }
    }
  }

  const topSpeed = Math.max(state.topSpeed, Math.abs(phys.speed))

  return {
    state: {
      x: phys.x,
      z: phys.z,
      heading: phys.heading,
      speed: phys.speed,
      angularVelocity: phys.angularVelocity ?? 0,
      raceStartMs: state.raceStartMs,
      nextCpId,
      hits,
      lastCellKey: newKey,
      onTrack: true,
      finishedAtMs,
      fouled: state.fouled,
      foulPenaltyAccelFactor,
      preGoThrottleSeen: state.preGoThrottleSeen,
      topSpeed,
      reactionTimeMs,
      arcLengthS: newArcLength,
    },
    finished,
  }
}
