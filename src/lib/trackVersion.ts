// Stage 1 (continuous-angle): the v1 to v2 schema converter and the version
// gate. Read docs/CONTINUOUS_ANGLE_PLAN.md "Schema model, pinned" before
// changing anything here.
//
// The converter populates `transform` on every piece using the deterministic
// projection from cell coordinates to world space. It runs once, immediately
// after schema parse, on every load path so downstream code can treat
// `piece.transform` as always present without branching.
//
// The version gate (SchemaTooNew) protects clients from reading payloads that
// were written by a newer server. It is an explicit field check, not zod
// strict mode, so the schema can keep accepting additive future fields on
// the same major version.

import {
  MAX_SCHEMA_VERSION,
  type Piece,
  type PieceTransform,
  type TrackVersion,
} from './schemas'
import { isV1Projectable, projectToV1Cells } from '@/game/pieceGeometry'

// CELL_SIZE is duplicated here to avoid a runtime import cycle with track
// path: trackPath imports this module so it can normalize raw pieces at the
// buildTrackPath / validateClosedLoop entry points. The single source of
// truth is `src/game/trackPath.ts`; if that constant ever changes, update
// this duplicate too. Tests pin the two values together.
const CELL_SIZE = 20

// Thrown when a parsed TrackVersion declares a schemaVersion this build does
// not support. Callers translate this into a "track not found" or "please
// upgrade" response on the read path.
export class SchemaTooNewError extends Error {
  constructor(
    public readonly schemaVersion: number,
    public readonly maxSupported: number = MAX_SCHEMA_VERSION,
  ) {
    super(
      `track schema version ${schemaVersion} exceeds supported ${maxSupported}`,
    )
    this.name = 'SchemaTooNewError'
  }
}

// Throw SchemaTooNewError when the parsed payload's schemaVersion exceeds
// MAX_SCHEMA_VERSION. Missing schemaVersion is treated as v1 (no throw).
export function assertSchemaVersionSupported(parsed: {
  schemaVersion?: number | undefined
}): void {
  const v = parsed.schemaVersion
  if (v === undefined) return
  if (v > MAX_SCHEMA_VERSION) {
    throw new SchemaTooNewError(v)
  }
}

// Project a v1 piece's (row, col, rotation) into world space. Exact and
// lossless: x = col * CELL_SIZE, z = row * CELL_SIZE, theta = rotation in
// radians using the existing clockwise (compass) convention. Floating-point
// arithmetic on integer multiples of CELL_SIZE is bit-exact, and rotation
// values are 0 / 90 / 180 / 270 so theta is one of 0, PI/2, PI, 3*PI/2.
export function deriveTransformFromCells(
  piece: Pick<Piece, 'row' | 'col' | 'rotation'>,
): PieceTransform {
  return {
    x: piece.col * CELL_SIZE,
    z: piece.row * CELL_SIZE,
    theta: (piece.rotation * Math.PI) / 180,
  }
}

// Idempotent. Two cases:
//
//   1. Wire format omits transform (v1 payload): derive transform from the
//      legacy (row, col, rotation) so downstream code can read transform
//      without branching.
//   2. Wire format carries transform (v2 payload): transform is the
//      authoritative geometry. For v1-projectable transforms (every Stage 1
//      track), re-derive (row, col, rotation) from the projection so the
//      legacy fields can never disagree with the transform. This collapses
//      the "transform vs cells" reconciliation problem into a single point:
//      after the converter runs, validator / sort / canonical emit / sampler
//      all read the same world geometry whether they touch transform or
//      (row, col, rotation). Stage 2 introduces non-projectable transforms
//      and decouples cells from transform; for now we leave them untouched
//      so the rest of the pipeline can decide whether to error on them.
export function convertV1Piece(piece: Piece): Piece {
  if (piece.transform === undefined) {
    return { ...piece, transform: deriveTransformFromCells(piece) }
  }
  if (isV1Projectable(piece)) {
    const cells = projectToV1Cells(piece.transform)
    if (
      cells.row === piece.row &&
      cells.col === piece.col &&
      cells.rotation === piece.rotation
    ) {
      return piece
    }
    return { ...piece, ...cells }
  }
  return piece
}

// Convenience for arrays of pieces. Same idempotent contract as convertV1Piece.
export function convertV1Pieces(pieces: readonly Piece[]): Piece[] {
  return pieces.map(convertV1Piece)
}

// Run the v1 to v2 converter on a parsed TrackVersion. Returns a new object
// with every piece's transform populated. The schemaVersion field is left
// untouched: writers decide what to emit, readers only need pieces with
// transform set.
export function convertV1Track(parsed: TrackVersion): TrackVersion {
  return { ...parsed, pieces: convertV1Pieces(parsed.pieces) }
}
