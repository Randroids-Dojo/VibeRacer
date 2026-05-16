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
// straight-line sprints: no lap repeats, no auto-restart on a wrap-around.
// Drag mode forces a 7-gear manual box (the player shifts; auto is not
// offered) so reaching the strip's top end is a timing task, not a
// hold-the-pedal task. Adds three further drag-specific concerns: a foul
// flag and an associated decaying acceleration multiplier (jump-start
// dampening), a per-frame slope-induced acceleration term derived from
// the strip's vertical profile and the car's mass, and a finish freeze on
// the final checkpoint that locks the timer until the parent component
// decides what to do next.

// Brief torque cut on every shift -- mirrors tick.ts. ~110 ms gives the
// upshift a perceptible "click" without feeling like input lag on a 15 s
// drag run that may chain six upshifts.
export const DRAG_SHIFT_TORQUE_CUT_SEC = 0.11
export const DRAG_SHIFT_TORQUE_CUT_THRUST = 0.5

// Drag-specific 7-speed gearbox. Kept separate from the road tick's
// 5-speed table in transmission.ts so changes here never reach into
// closed-loop racing. Each gear caps at `maxSpeedFactor * params.maxSpeed`
// and applies `accelFactor` to base accel. Accel falls off in the higher
// gears so the player feels the difference between off-the-line gears 1-3
// and the long-pull top gears 6-7.
export const DRAG_MANUAL_GEAR_MIN = 1
export const DRAG_MANUAL_GEAR_MAX = 7
export const DRAG_DEFAULT_GEAR = 1
export interface DragGearSpec {
  gear: number
  maxSpeedFactor: number
  accelFactor: number
}
export const DRAG_MANUAL_GEAR_SPECS: readonly DragGearSpec[] = [
  { gear: 1, maxSpeedFactor: 0.22, accelFactor: 1.7 },
  { gear: 2, maxSpeedFactor: 0.36, accelFactor: 1.45 },
  { gear: 3, maxSpeedFactor: 0.5, accelFactor: 1.25 },
  { gear: 4, maxSpeedFactor: 0.64, accelFactor: 1.1 },
  { gear: 5, maxSpeedFactor: 0.77, accelFactor: 0.95 },
  { gear: 6, maxSpeedFactor: 0.89, accelFactor: 0.85 },
  { gear: 7, maxSpeedFactor: 1.0, accelFactor: 0.75 },
]

export function clampDragGear(gear: number): number {
  if (!Number.isFinite(gear)) return DRAG_DEFAULT_GEAR
  return Math.max(
    DRAG_MANUAL_GEAR_MIN,
    Math.min(DRAG_MANUAL_GEAR_MAX, Math.round(gear)),
  )
}

export function shiftDragGear(
  currentGear: number,
  direction: 'up' | 'down',
): number {
  const gear = clampDragGear(currentGear)
  return clampDragGear(direction === 'up' ? gear + 1 : gear - 1)
}

export function dragGearSpec(gear: number): DragGearSpec {
  return DRAG_MANUAL_GEAR_SPECS[clampDragGear(gear) - 1]
}

// Shift-quality thresholds. These two split apart on purpose:
//   - SHIFT_PERFECT_MIN_RATIO is the lower edge of the "great shift"
//     window in the classifier. Shifts in [SHIFT_PERFECT_MIN_RATIO .. 1]
//     of the gear cap with no bog earn PERFECT; below that earns EARLY.
//   - DRAG_REDLINE_RATIO is the speed-vs-cap threshold the HUD uses to
//     start ticking the gearPeakHoldSec bog accumulator and lighting the
//     red-edge tint. Set right at the gear cap so the tint appears WHEN
//     the needle reaches the gear-number tick on the dial -- the gear
//     number is the visual shift cue, and red signals "you've hit it,
//     you're bogging". The perfect-shift window opens earlier (5 percent
//     below the cap) so a shift right before the bog actually starts
//     still earns PERFECT.
//   - SHIFT_LATE_HOLD_SEC is the maximum tolerable bog at the redline
//     before the classifier flips to LATE.
export const SHIFT_PERFECT_MIN_RATIO = 0.95
export const DRAG_REDLINE_RATIO = 0.99
export const SHIFT_LATE_HOLD_SEC = 0.4

export type DragShiftQuality = 'early' | 'perfect' | 'late'

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
  // Manual gearbox state. Drag mode runs forced manual: gear starts at 1
  // and only moves when the player presses shiftDown / shiftUp. The
  // torqueCutSec counter dampens accel for ~110 ms after every shift so
  // the cut reads in the chassis, not just the audio.
  gear: number
  torqueCutSec: number
  // Time the speed has been at or above DRAG_REDLINE_RATIO of the current
  // gear's cap, in seconds. Resets to 0 the moment the speed dips below
  // the redline and on every successful shift. Feeds two surfaces: the
  // 'late' classifier for the next upshift, and the HUD's red-edge tint
  // that intensifies the longer the player bogs.
  gearPeakHoldSec: number
}

export interface DragTickInput extends PhysicsInput {
  shiftDown?: boolean
  shiftUp?: boolean
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
  // 'up' or 'down' on the frame a shift fires; null otherwise. Hosts forward
  // this to SFX / camera bob in the same shape tick.ts uses.
  shiftEvent: 'up' | 'down' | null
  // Quality classification for the upshift on this frame. Null for
  // downshifts and for frames without a shift. Used to drive the
  // EARLY / PERFECT / LATE chip on the drag HUD.
  shiftQuality: DragShiftQuality | null
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
    gear: DRAG_DEFAULT_GEAR,
    torqueCutSec: 0,
    gearPeakHoldSec: 0,
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
    gear: DRAG_DEFAULT_GEAR,
    torqueCutSec: 0,
    gearPeakHoldSec: 0,
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
  input: DragTickInput,
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

  // Forced-manual gearbox. Shifts are edge-triggered by the input booleans
  // (the host is expected to debounce key repeats before calling). Drag
  // never auto-shifts: missing a shift is a skill check, not something the
  // game smooths over. The torque-cut counter drains every frame and
  // re-seeds on a successful shift.
  let gear = state.gear
  let torqueCutSec = Math.max(0, state.torqueCutSec - dtSec)
  let shiftEvent: 'up' | 'down' | null = null
  let shiftQuality: DragShiftQuality | null = null
  if (state.raceStartMs !== null && state.finishedAtMs === null) {
    let nextGear = gear
    if (input.shiftDown) nextGear = shiftDragGear(nextGear, 'down')
    if (input.shiftUp) nextGear = shiftDragGear(nextGear, 'up')
    if (nextGear !== gear) {
      shiftEvent = nextGear > gear ? 'up' : 'down'
      // Classify the upshift against the OLD gear's cap. Downshifts and
      // ineffective shifts at gear boundaries (e.g. shiftUp at gear 5)
      // produce no chip; the gear-equality guard above already filtered
      // those out, so any 'up' here is a real upshift.
      if (shiftEvent === 'up') {
        const oldGearSpec = dragGearSpec(gear)
        const oldGearCap = Math.max(1, params.maxSpeed * oldGearSpec.maxSpeedFactor)
        const completion = Math.abs(state.speed) / oldGearCap
        if (state.gearPeakHoldSec >= SHIFT_LATE_HOLD_SEC) {
          shiftQuality = 'late'
        } else if (completion < SHIFT_PERFECT_MIN_RATIO) {
          shiftQuality = 'early'
        } else {
          shiftQuality = 'perfect'
        }
      }
      torqueCutSec = DRAG_SHIFT_TORQUE_CUT_SEC
      gear = nextGear
    }
  }

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
        gear,
        torqueCutSec,
        foulPenaltyAccelFactor,
        arcLengthS,
        lastCellKey: cellKey(cell.row, cell.col),
        gearPeakHoldSec: 0,
      },
      finished: null,
      shiftEvent: null,
      shiftQuality: null,
    }
  }

  // Per-gear accel and max speed factors. Linear accel curve (last arg = 1)
  // because the player needs a clean cap to bounce off so the shift timing
  // becomes a real skill check; the quartic taper's asymptote would never
  // hit the gear ceiling and make shifts feel optional.
  const gearSpec = dragGearSpec(gear)
  const gearAccelMul = gearSpec.accelFactor * (
    torqueCutSec > 0 ? DRAG_SHIFT_TORQUE_CUT_THRUST : 1
  )
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
    foulPenaltyAccelFactor * gearAccelMul,
    gearSpec.maxSpeedFactor,
    slopeAccelTerm,
    1,
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

  // Redline hold accumulator. Resets to 0 whenever speed falls below the
  // redline threshold for the *new* gear (so an upshift that opens the cap
  // immediately drops the hold to 0 because the same speed is now below
  // the wider band), and also resets on a shift this tick. Otherwise it
  // counts up by dt so the player has been "bogging at the redline" for
  // gearPeakHoldSec seconds.
  const currentGearCap = Math.max(
    1,
    params.maxSpeed * dragGearSpec(gear).maxSpeedFactor,
  )
  const atRedline = Math.abs(phys.speed) >= currentGearCap * DRAG_REDLINE_RATIO
  const gearPeakHoldSec = shiftEvent !== null
    ? 0
    : atRedline
      ? state.gearPeakHoldSec + dtSec
      : 0

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
      gear,
      torqueCutSec,
      gearPeakHoldSec,
    },
    finished,
    shiftEvent,
    shiftQuality,
  }
}
