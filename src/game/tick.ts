import type { CheckpointHit } from '@/lib/schemas'
import { cellKey } from './track'
import { worldToCell, type TrackPath } from './trackPath'
import {
  DEFAULT_CAR_PARAMS,
  stepPhysics,
  type CarParams,
  type PhysicsInput,
} from './physics'
import {
  autoShiftGear,
  DEFAULT_MANUAL_GEAR,
  DEFAULT_TRANSMISSION,
  manualGearSpec,
  shiftManualGear,
  type TransmissionMode,
} from './transmission'
import { vehicleTrackContact } from './wheelContact'

// Brief torque cut on every shift. ~110ms gives the upshift a perceptible
// "click" without feeling like input lag during a 30-second drag run that
// may chain four upshifts (4 * 110ms = 440ms of cut total).
export const SHIFT_TORQUE_CUT_SEC = 0.11
// 50% residual thrust during the cut. Why: full zero feels like a stall in
// an arcade racer where players never lift; 50% keeps the car rolling so the
// chassis bob and audio rev-drop read as a shift, not a hesitation. Real
// DCT cars cut to ~10% but they're not chasing 60fps "feel."
export const SHIFT_TORQUE_CUT_THRUST = 0.5

export interface GameState {
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
  lapCount: number
  lastLapTimeMs: number | null
  gear: number
  // Counts down each tick. While > 0 the throttle is multiplied by the
  // residual-thrust constant so the player feels the shift in the chassis,
  // not just the audio.
  torqueCutSec: number
}

export interface LapCompleteEvent {
  hits: CheckpointHit[]
  lapTimeMs: number
  lapNumber: number
}

export interface TickResult {
  state: GameState
  lapComplete: LapCompleteEvent | null
  // 'up' or 'down' on the frame a shift fires; null otherwise. RaceCanvas
  // forwards this to the SFX driver to trigger the exhaust pop / rev blip.
  shiftEvent: 'up' | 'down' | null
}

export interface TickInput extends PhysicsInput {
  shiftDown?: boolean
  shiftUp?: boolean
}

export function initGameState(path: TrackPath): GameState {
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
    lapCount: 0,
    lastLapTimeMs: null,
    gear: DEFAULT_MANUAL_GEAR,
    torqueCutSec: 0,
  }
}

export function startRace(state: GameState, nowMs: number): GameState {
  return { ...state, raceStartMs: nowMs, nextCpId: 0, hits: [] }
}

export function tick(
  state: GameState,
  input: TickInput,
  dtMs: number,
  nowMs: number,
  path: TrackPath,
  params: CarParams = DEFAULT_CAR_PARAMS,
  transmission: TransmissionMode = DEFAULT_TRANSMISSION,
  // Opts the player into the gear-feel rework. When false (the default and
  // current shipped baseline), the function behaves exactly like the
  // pre-rework tick: legacy gear ratios, no torque cut, no shift events,
  // automatic mode locked to gear 1, linear acceleration curve.
  enhancedShifting = false,
): TickResult {
  const dtSec = dtMs / 1000
  let gear = state.gear
  let torqueCutSec = Math.max(0, state.torqueCutSec - dtSec)
  let shiftEvent: 'up' | 'down' | null = null

  if (enhancedShifting) {
    if (transmission === 'manual') {
      let nextGear = gear
      if (input.shiftDown) nextGear = shiftManualGear(nextGear, 'down')
      if (input.shiftUp) nextGear = shiftManualGear(nextGear, 'up')
      if (nextGear !== gear) {
        shiftEvent = nextGear > gear ? 'up' : 'down'
        torqueCutSec = SHIFT_TORQUE_CUT_SEC
        gear = nextGear
      }
    } else {
      // Auto: always recompute the gear from current speed so a manual->auto
      // toggle (or paused-frame catchup that crossed multiple bands) lands on
      // the correct gear without waiting for hysteresis to drag it back.
      const speedAbs = Math.abs(state.speed)
      const nextGear = autoShiftGear(speedAbs, params.maxSpeed, gear, true)
      if (nextGear !== gear) {
        // Multi-gear deltas come from transmission-mode toggles or large dt
        // catchups, not from racing. Treat as a silent snap (no rev blip)
        // so the player isn't punished for changing a setting.
        const isCascade = Math.abs(nextGear - gear) > 1
        if (!isCascade) {
          // Audio + visual feedback still fires (pitch reset, exhaust pop,
          // chassis bob) but the physics torque cut is skipped in auto. The
          // shift now happens at low accel (engine bogging into the gear
          // cap thanks to maxSpeedFactor in auto), so layering a half-thrust
          // window on top of an already-tapered pull turned into noticeable
          // jank during chained early-gear shifts. Manual keeps the cut
          // because the player chose the shift timing.
          shiftEvent = nextGear > gear ? 'up' : 'down'
        }
        gear = nextGear
      }
    }
  } else {
    // Legacy path. Matches pre-rework tick behavior exactly: manual cycles
    // gears via shift inputs, auto locks to gear 1, no torque cut, no shift
    // events. The torque cut counter still drains so a player who toggles
    // the feature off mid-cut clears it within ~110ms instead of latching.
    if (transmission === 'manual') {
      if (input.shiftDown) gear = shiftManualGear(gear, 'down')
      if (input.shiftUp) gear = shiftManualGear(gear, 'up')
    } else if (gear !== DEFAULT_MANUAL_GEAR) {
      gear = DEFAULT_MANUAL_GEAR
    }
  }

  // Gear factor selection. Enhanced mode applies the new geometric specs and
  // its accelFactor in both transmissions; legacy mode applies the legacy
  // specs only in manual (auto runs at 1x like before the rework).
  // Enhanced auto also applies maxSpeedFactor so the taper inside stepPhysics
  // kicks in within each gear's band — the upshift then fires when the
  // engine is already bogging into the cap, which is what auto-shift logic
  // expects and what makes shifts feel like transitions instead of cuts.
  const gearSpec = manualGearSpec(gear, enhancedShifting)
  const baseMaxFactor =
    transmission === 'manual' || enhancedShifting ? gearSpec.maxSpeedFactor : 1
  let baseAccelFactor: number
  if (enhancedShifting) {
    baseAccelFactor = gearSpec.accelFactor
  } else {
    baseAccelFactor = transmission === 'manual' ? gearSpec.accelFactor : 1
  }
  const cutMul =
    enhancedShifting && torqueCutSec > 0 ? SHIFT_TORQUE_CUT_THRUST : 1
  const finalAccelFactor = baseAccelFactor * cutMul

  const contactNow = vehicleTrackContact(path, state.x, state.z, state.heading)
  const onTrack = contactNow.onTrack

  const phys = state.raceStartMs === null
    ? {
        x: state.x,
        z: state.z,
        heading: state.heading,
        speed: 0,
        angularVelocity: 0,
      }
    : stepPhysics(
        {
          x: state.x,
          z: state.z,
          heading: state.heading,
          speed: state.speed,
          angularVelocity: state.angularVelocity,
        },
        input,
        dtSec,
        onTrack,
        params,
        finalAccelFactor,
        baseMaxFactor,
        0,
        // Legacy mode keeps the linear acceleration curve. Enhanced mode uses
        // the default quartic taper inside stepPhysics for the asymptotic
        // top-end pull.
        enhancedShifting ? undefined : 1,
      )

  let hits = state.hits
  let nextCpId = state.nextCpId
  let lapCount = state.lapCount
  let lastLapTimeMs = state.lastLapTimeMs
  let lapComplete: LapCompleteEvent | null = null
  let raceStartMs = state.raceStartMs

  const newCell = worldToCell(phys.x, phys.z)
  const newKey = cellKey(newCell.row, newCell.col)
  const nextContact = vehicleTrackContact(path, phys.x, phys.z, phys.heading)

  if (raceStartMs !== null && newKey !== state.lastCellKey) {
    const K = path.cpTriggerPieceIdx.length
    const expectedPieceIdx = path.cpTriggerPieceIdx[nextCpId]
    const expectedPiece = path.order[expectedPieceIdx].piece
    const expectedKey = cellKey(expectedPiece.row, expectedPiece.col)
    const startKey = cellKey(path.order[0].piece.row, path.order[0].piece.col)

    if (newKey === expectedKey) {
      const tMs = Math.max(1, Math.round(nowMs - raceStartMs))
      hits = [...hits, { cpId: nextCpId, tMs }]
      nextCpId += 1

      if (nextCpId === K) {
        const lapTimeMs = hits[hits.length - 1].tMs
        lapCount += 1
        lastLapTimeMs = lapTimeMs
        lapComplete = { hits, lapTimeMs, lapNumber: lapCount }
        hits = []
        nextCpId = 0
        raceStartMs = nowMs
      }
    } else if (newKey === startKey && nextCpId > 0) {
      hits = []
      nextCpId = 0
      raceStartMs = nowMs
    }
  }

  return {
    state: {
      x: phys.x,
      z: phys.z,
      heading: phys.heading,
      speed: phys.speed,
      angularVelocity: phys.angularVelocity ?? 0,
      raceStartMs,
      nextCpId,
      hits,
      lastCellKey: newKey,
      onTrack: nextContact.onTrack,
      lapCount,
      lastLapTimeMs,
      gear,
      torqueCutSec,
    },
    lapComplete,
    shiftEvent,
  }
}
