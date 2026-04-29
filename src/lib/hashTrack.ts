import { createHash } from 'node:crypto'
import type { Piece } from './schemas'
import {
  DEFAULT_TRACK_TRANSMISSION,
  type TrackTransmissionMode,
} from '@/game/transmission'

export function canonicalizePieces(pieces: Piece[]): Piece[] {
  return [...pieces].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row
    if (a.col !== b.col) return a.col - b.col
    if (a.type !== b.type) return a.type < b.type ? -1 : 1
    return a.rotation - b.rotation
  })
}

// Only emit the field when it differs from the legacy default (one CP per
// piece). This preserves the hash of every track stored before the field
// existed.
function effectiveCheckpointCount(
  pieces: Piece[],
  checkpointCount: number | undefined,
): number | null {
  if (checkpointCount === undefined) return null
  if (checkpointCount === pieces.length) return null
  return checkpointCount
}

export function canonicalTrackJson(
  pieces: Piece[],
  checkpointCount?: number,
  transmission: TrackTransmissionMode = DEFAULT_TRACK_TRANSMISSION,
): string {
  const canonical = canonicalizePieces(pieces).map((p) => ({
    type: p.type,
    row: p.row,
    col: p.col,
    rotation: p.rotation,
  }))
  const cp = effectiveCheckpointCount(pieces, checkpointCount)
  const transmissionOut =
    transmission === DEFAULT_TRACK_TRANSMISSION ? null : transmission
  if (cp === null && transmissionOut === null) return JSON.stringify(canonical)
  return JSON.stringify({
    pieces: canonical,
    checkpointCount: cp ?? undefined,
    transmission: transmissionOut ?? undefined,
  })
}

export function hashTrack(
  pieces: Piece[],
  checkpointCount?: number,
  transmission: TrackTransmissionMode = DEFAULT_TRACK_TRANSMISSION,
): string {
  return createHash('sha256')
    .update(canonicalTrackJson(pieces, checkpointCount, transmission))
    .digest('hex')
}
