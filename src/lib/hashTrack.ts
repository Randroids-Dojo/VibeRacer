import { createHash } from 'node:crypto'
import type { Piece, TrackCheckpoint } from './schemas'
import { isDefaultFootprint, normalizedFootprint } from '@/game/trackFootprint'

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
  const canonical = canonicalizePieces(pieces).map((p) => {
    const piece = p as HashablePiece
    return {
      type: piece.type,
      row: piece.row,
      col: piece.col,
      rotation: piece.rotation,
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
  const cp = effectiveCheckpointCount(pieces, checkpointCount, checkpoints)
  const checkpointOut =
    checkpoints !== undefined && checkpoints.length > 0
      ? canonicalizeCheckpoints(checkpoints)
      : null
  const branchEdges = effectiveBranchEdges(options)
  if (cp === null && checkpointOut === null && branchEdges === null) {
    return JSON.stringify(canonical)
  }
  return JSON.stringify({
    pieces: canonical,
    checkpointCount: cp ?? undefined,
    checkpoints: checkpointOut ?? undefined,
    branchEdges: branchEdges ?? undefined,
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
