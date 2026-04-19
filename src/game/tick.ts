import type { CheckpointHit } from '@/lib/schemas'
import { cellKey } from './track'
import {
  TRACK_WIDTH,
  distanceToCenterline,
  worldToCell,
  type TrackPath,
} from './trackPath'
import {
  DEFAULT_CAR_PARAMS,
  stepPhysics,
  type CarParams,
  type PhysicsInput,
} from './physics'

export interface GameState {
  x: number
  z: number
  heading: number
  speed: number
  raceStartMs: number | null
  nextCpId: number
  hits: CheckpointHit[]
  lastCellKey: string
  onTrack: boolean
  lapCount: number
  lastLapTimeMs: number | null
}

export interface LapCompleteEvent {
  hits: CheckpointHit[]
  lapTimeMs: number
  lapNumber: number
}

export interface TickResult {
  state: GameState
  lapComplete: LapCompleteEvent | null
}

export function initGameState(path: TrackPath): GameState {
  const spawn = path.spawn
  const cell = worldToCell(spawn.position.x, spawn.position.z)
  return {
    x: spawn.position.x,
    z: spawn.position.z,
    heading: spawn.heading,
    speed: 0,
    raceStartMs: null,
    nextCpId: 0,
    hits: [],
    lastCellKey: cellKey(cell.row, cell.col),
    onTrack: true,
    lapCount: 0,
    lastLapTimeMs: null,
  }
}

export function startRace(state: GameState, nowMs: number): GameState {
  return { ...state, raceStartMs: nowMs, nextCpId: 0, hits: [] }
}

export function tick(
  state: GameState,
  input: PhysicsInput,
  dtMs: number,
  nowMs: number,
  path: TrackPath,
  params: CarParams = DEFAULT_CAR_PARAMS,
): TickResult {
  const dtSec = dtMs / 1000

  const cellNow = worldToCell(state.x, state.z)
  const keyNow = cellKey(cellNow.row, cellNow.col)
  const orderIdx = path.cellToOrderIdx.get(keyNow)
  const onTrack =
    orderIdx !== undefined &&
    distanceToCenterline(path.order[orderIdx], state.x, state.z) <=
      TRACK_WIDTH / 2

  const phys = state.raceStartMs === null
    ? { x: state.x, z: state.z, heading: state.heading, speed: 0 }
    : stepPhysics(
        { x: state.x, z: state.z, heading: state.heading, speed: state.speed },
        input,
        dtSec,
        onTrack,
        params,
      )

  let hits = state.hits
  let nextCpId = state.nextCpId
  let lapCount = state.lapCount
  let lastLapTimeMs = state.lastLapTimeMs
  let lapComplete: LapCompleteEvent | null = null
  let raceStartMs = state.raceStartMs

  const newCell = worldToCell(phys.x, phys.z)
  const newKey = cellKey(newCell.row, newCell.col)

  if (raceStartMs !== null && newKey !== state.lastCellKey) {
    const N = path.order.length
    const expectedPieceIdx = (nextCpId + 1) % N
    const expectedPiece = path.order[expectedPieceIdx].piece
    const expectedKey = cellKey(expectedPiece.row, expectedPiece.col)
    const startKey = cellKey(path.order[0].piece.row, path.order[0].piece.col)

    if (newKey === expectedKey) {
      const tMs = Math.max(1, Math.round(nowMs - raceStartMs))
      hits = [...hits, { cpId: nextCpId, tMs }]
      nextCpId += 1

      if (nextCpId === N) {
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
      raceStartMs,
      nextCpId,
      hits,
      lastCellKey: newKey,
      onTrack,
      lapCount,
      lastLapTimeMs,
    },
    lapComplete,
  }
}
