// Stage 1 (continuous-angle): the single accessor for piece geometry. After
// the v1 to v2 schema swap shipped, every loaded piece carries a populated
// `transform` field that is the authoritative source of position and rotation.
// `transformOf`, `endpointsOf`, and `geometryOf` read from `transform`
// directly. There is no fallback to cell derivation: the v1 to v2 converter
// (src/lib/trackVersion.ts) runs immediately after schema parse on every load
// path so unstamped pieces never reach this layer in production.
//
// Two design rules locked in by the shim:
//
//   1. Connectors are addressed by frame, not by cardinal port. The validator
//      consumes `endpointsOf(piece)` and never iterates `connectorPortsOf`
//      directly for matching. Stage 2's continuous-angle pieces plug in by
//      reporting their endpoints in world space; nothing about the matching
//      pipeline cares whether the piece's transform is grid-aligned.
//
//   2. Footprint is a list of (row, col) cells regardless of how the piece's
//      transform looks. A continuous-angle piece that lands between cells
//      still reports the cells it occupies via a supercover-style enumeration,
//      so editor placement stays sane.

import type { Piece, PieceTransform } from '@/lib/schemas'
import { connectorPortsOf } from './track'
import { type Frame, frameOfPortAtTransform } from './pieceFrames'
import {
  type FootprintCell,
  footprintCells,
} from './trackFootprint'
import {
  CELL_SIZE,
  V1_PROJECTABLE_POSITION_EPSILON,
  V1_PROJECTABLE_ROTATION_EPSILON,
} from './cellSize'

export type { PieceTransform } from '@/lib/schemas'

export interface PieceGeometry {
  transform: PieceTransform
  endpoints: Frame[]
  footprint: FootprintCell[]
}

// Re-export the projectability epsilons under their long-standing names so
// external callers (the canonicalizer, editor snap-on-save, tests) keep
// working. The values themselves live in the leaf module `./cellSize`
// alongside CELL_SIZE because both `pieceGeometry` and `pieceFrames` need
// them, and routing through either of those would form an import cycle.
export {
  V1_PROJECTABLE_POSITION_EPSILON,
  V1_PROJECTABLE_ROTATION_EPSILON,
}
const HALF_PI = Math.PI / 2

// Resolve the geometry for a single piece. Reads from `piece.transform` (which
// the v1 to v2 converter populates on load). Stage 2's continuous-angle pieces
// just plug in different transforms; this function does not change.
export function geometryOf(piece: Piece): PieceGeometry {
  return {
    transform: transformOf(piece),
    endpoints: endpointsOf(piece),
    footprint: footprintCells(piece),
  }
}

// World-space anchor transform for a piece. Reads `piece.transform` directly;
// the v1 to v2 converter ensures every loaded piece has it populated, so this
// is a strict read with no derivation fallback. If you hit the throw, the
// caller skipped the converter; see src/lib/trackVersion.ts.
export function transformOf(piece: Piece): PieceTransform {
  if (piece.transform === undefined) {
    throw new Error(
      'piece.transform missing; run the v1 to v2 converter (convertV1Piece) before reading geometry',
    )
  }
  return piece.transform
}

// Outward-facing world frames for every connector port on a piece.
// Stage 1 contract: position is transform-driven (`frameOfPortAtTransform`
// reads `transform.x` and `transform.z`), but orientation comes from
// `connectorPortsOf` which is keyed off `piece.rotation`. The v1 to v2
// converter in `src/lib/trackVersion.ts` re-derives `(row, col, rotation)`
// from the projection at converter entry whenever the transform is
// v1-projectable, so `transform.theta` and `piece.rotation * PI / 180`
// are guaranteed equal for every piece that reaches this layer in Stage 1.
// Stage 2 introduces non-projectable transforms and rewires
// `connectorPortsOf` (or the helper layer) to consume `transform.theta`
// directly so `endpointsOf` becomes fully transform-driven.
export function endpointsOf(piece: Piece): Frame[] {
  const transform = transformOf(piece)
  return connectorPortsOf(piece).map((port) =>
    frameOfPortAtTransform(transform, port),
  )
}

// Derived check: does this piece's transform project exactly back to integer
// cell coordinates and a cardinal rotation? Pure function, no caching, called
// fresh on every read by both the canonicalizer and any editor test that
// asserts mutations preserve grid alignment. See FOLLOWUPS Rule 2 for why
// this is derived rather than stored. Non-finite components (NaN, Infinity)
// short-circuit to false because epsilon comparisons against NaN are always
// false and would let a malformed transform sneak past the projectability
// gate; PieceTransformSchema rejects non-finite values at the wire boundary,
// but in-memory pieces created from non-validated sources stay defended here.
export function isV1Projectable(piece: Piece): boolean {
  const t = piece.transform
  if (t === undefined) return false
  if (!Number.isFinite(t.x) || !Number.isFinite(t.z) || !Number.isFinite(t.theta)) {
    return false
  }
  const colReal = t.x / CELL_SIZE
  const rowReal = t.z / CELL_SIZE
  const col = Math.round(colReal)
  const row = Math.round(rowReal)
  if (Math.abs(colReal - col) > V1_PROJECTABLE_POSITION_EPSILON) return false
  if (Math.abs(rowReal - row) > V1_PROJECTABLE_POSITION_EPSILON) return false
  // theta mod PI/2 within rotation epsilon. Reduce theta into [0, PI/2) and
  // check the residual against zero with wrap on both sides so values like
  // -0.000001 don't read as PI/2 - 0.000001.
  const wrapped = ((t.theta % HALF_PI) + HALF_PI) % HALF_PI
  const residual = Math.min(wrapped, HALF_PI - wrapped)
  if (residual > V1_PROJECTABLE_ROTATION_EPSILON) return false
  return true
}

// Project a v1-projectable transform back to its (row, col, rotation) form.
// Snaps to the nearest integer cell and 90-degree multiple within the same
// epsilons isV1Projectable uses. Caller is responsible for checking
// isV1Projectable first; this function returns deterministic snapped values
// for finite input and (0, 0, 0) for non-finite input as a safety net.
export function projectToV1Cells(transform: PieceTransform): {
  row: number
  col: number
  rotation: 0 | 90 | 180 | 270
} {
  if (
    !Number.isFinite(transform.x) ||
    !Number.isFinite(transform.z) ||
    !Number.isFinite(transform.theta)
  ) {
    return { row: 0, col: 0, rotation: 0 }
  }
  const col = Math.round(transform.x / CELL_SIZE)
  const row = Math.round(transform.z / CELL_SIZE)
  const turns = ((Math.round(transform.theta / HALF_PI) % 4) + 4) % 4
  const rotation = (turns * 90) as 0 | 90 | 180 | 270
  return { row, col, rotation }
}
