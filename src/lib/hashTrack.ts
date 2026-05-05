import { createHash } from 'node:crypto'
import type { Piece, TrackCheckpoint } from './schemas'
import { isDefaultFootprint, normalizedFootprint } from '@/game/trackFootprint'
import { isV1Projectable, projectToV1Cells } from '@/game/pieceGeometry'
import { convertV1Pieces } from './trackVersion'

export type HashablePiece = Piece & {
  widthClass?: string
}

export interface HashTrackOptions {
  branchEdges?: readonly unknown[]
}

export function canonicalizePieces(pieces: Piece[]): Piece[] {
  return [...pieces].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row
    if (a.col !== b.col) return a.col - b.col
    if (a.type !== b.type) return a.type < b.type ? -1 : 1
    return a.rotation - b.rotation
  })
}

function canonicalizeHashValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeHashValue(item))
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalizeHashValue(item)]),
    )
  }
  return value
}

function stableHashValueJson(value: unknown): string {
  return JSON.stringify(canonicalizeHashValue(value))
}

export function canonicalizeBranchEdges(
  branchEdges: readonly unknown[] = [],
): unknown[] {
  return branchEdges
    .map((edge) => canonicalizeHashValue(edge))
    .sort((a, b) => stableHashValueJson(a).localeCompare(stableHashValueJson(b)))
}

function effectiveWidthClass(piece: HashablePiece): string | null {
  if (piece.widthClass === undefined) return null
  if (piece.widthClass === 'standard') return null
  return piece.widthClass
}

function effectiveBranchEdges(
  options: HashTrackOptions | undefined,
): unknown[] | null {
  if (options?.branchEdges === undefined) return null
  if (options.branchEdges.length === 0) return null
  return canonicalizeBranchEdges(options.branchEdges)
}

// Only emit the field when it differs from the legacy default (one CP per
// piece). This preserves the hash of every track stored before the field
// existed.
function effectiveCheckpointCount(
  pieces: Piece[],
  checkpointCount: number | undefined,
  checkpoints: TrackCheckpoint[] | undefined,
): number | null {
  if (checkpoints !== undefined) return null
  if (checkpointCount === undefined) return null
  if (checkpointCount === pieces.length) return null
  return checkpointCount
}

export function canonicalizeCheckpoints(
  checkpoints: TrackCheckpoint[] = [],
): TrackCheckpoint[] {
  return [...checkpoints].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row
    return a.col - b.col
  })
}

export function canonicalTrackJson(
  pieces: Piece[],
  checkpointCount?: number,
  checkpoints?: TrackCheckpoint[],
  options?: HashTrackOptions,
): string {
  // Stage 1: normalize to v2 so isV1Projectable can read transform on every
  // piece. Idempotent on already-converted pieces. v1-projectable pieces
  // canonicalize to byte-identical legacy form (omit transform, emit
  // (row, col, rotation) projected from transform), so unedited v1 tracks
  // hash unchanged. See docs/CONTINUOUS_ANGLE_PLAN.md "Schema model, pinned"
  // and FOLLOWUPS Rule 1 / Rule 2.
  const populated = convertV1Pieces(pieces)
  let anyV2 = false
  const canonical = canonicalizePieces(populated).map((p) => {
    const piece = p as HashablePiece
    if (isV1Projectable(piece)) {
      const cells = projectToV1Cells(piece.transform!)
      return {
        type: piece.type,
        row: cells.row,
        col: cells.col,
        rotation: cells.rotation,
        footprint: isDefaultFootprint(piece.footprint)
          ? undefined
          : normalizedFootprint(piece.footprint),
        widthClass: effectiveWidthClass(piece) ?? undefined,
        flex:
          piece.type === 'flexStraight' && piece.flex !== undefined
            ? { dr: piece.flex.dr, dc: piece.flex.dc }
            : undefined,
      }
    }
    anyV2 = true
    return {
      type: piece.type,
      transform: {
        x: piece.transform!.x,
        z: piece.transform!.z,
        theta: piece.transform!.theta,
      },
      footprint: isDefaultFootprint(piece.footprint)
        ? undefined
        : normalizedFootprint(piece.footprint),
      widthClass: effectiveWidthClass(piece) ?? undefined,
      flex:
        piece.type === 'flexStraight' && piece.flex !== undefined
          ? { dr: piece.flex.dr, dc: piece.flex.dc }
          : undefined,
    }
  })
  const cp = effectiveCheckpointCount(populated, checkpointCount, checkpoints)
  const checkpointOut =
    checkpoints !== undefined && checkpoints.length > 0
      ? canonicalizeCheckpoints(checkpoints)
      : null
  const branchEdges = effectiveBranchEdges(options)
  const schemaVersion = anyV2 ? 2 : null
  if (
    cp === null &&
    checkpointOut === null &&
    branchEdges === null &&
    schemaVersion === null
  ) {
    return JSON.stringify(canonical)
  }
  return JSON.stringify({
    pieces: canonical,
    checkpointCount: cp ?? undefined,
    checkpoints: checkpointOut ?? undefined,
    branchEdges: branchEdges ?? undefined,
    schemaVersion: schemaVersion ?? undefined,
  })
}

export function hashTrack(
  pieces: Piece[],
  checkpointCount?: number,
  checkpoints?: TrackCheckpoint[],
  options?: HashTrackOptions,
): string {
  return createHash('sha256')
    .update(canonicalTrackJson(pieces, checkpointCount, checkpoints, options))
    .digest('hex')
}
