// Stage 0.5: a single accessor that returns everything callers need to
// reason about a piece's geometry. Today the implementation derives every
// field from the existing (row, col, rotation) helpers; in Stage 1 proper
// it will read a `transform` field directly off the piece schema. Call
// sites consume only this accessor, so the schema swap touches one
// implementation file rather than the entire codebase.
//
//   transform: anchor-frame in world space: where the piece sits and how
//     it is rotated. Cell-aligned today; arbitrary later.
//   endpoints: outward-facing world-space frames for every connector.
//     The connection engine consumes these directly; nothing further down
//     the pipe needs to know about cells or cardinal directions.
//   footprint: world cells the piece occupies, for overlap / placement
//     checks in the editor.
//
// Two design rules locked in by the shim:
//
//   1. Connectors are addressed by frame, not by cardinal port. After
//      Stage 0.5 lands, the validator should never iterate
//      `connectorPortsOf` directly. Only `geometryOf(piece).endpoints`.
//      Stage 1 proper then has zero connection-engine surface to change.
//
//   2. Footprint is a list of (row, col) cells regardless of how the
//      piece's transform looks in the future. A continuous-angle piece
//      that lands between cells still reports the cells it occupies via
//      a supercover-style enumeration, so editor placement stays sane.

import type { Piece } from '@/lib/schemas'
import { connectorPortsOf } from './track'
import { type Frame, frameOfPort } from './pieceFrames'
import {
  type FootprintCell,
  footprintCells,
} from './trackFootprint'
import { CELL_SIZE } from './trackPath'

export interface PieceTransform {
  // World position of the piece's anchor point. y is implicit (0) because
  // the world is a flat ground plane.
  x: number
  z: number
  // Rotation in radians, measured CCW around the +Y axis using the same
  // sign convention as the game heading: +PI/2 = north (-Z).
  theta: number
}

export interface PieceGeometry {
  transform: PieceTransform
  endpoints: Frame[]
  footprint: FootprintCell[]
}

// Resolve the geometry for a single piece. Today every field is derived
// from (row, col, rotation); Stage 1 proper changes only this function's
// implementation. Callers must not poke piece.row / piece.col / piece.rotation
// directly when they could ask geometryOf instead.
export function geometryOf(piece: Piece): PieceGeometry {
  return {
    transform: transformOf(piece),
    endpoints: endpointsOf(piece),
    footprint: footprintCells(piece),
  }
}

// World-space anchor transform for a piece. Cell coordinates project to
// (col * CELL_SIZE, row * CELL_SIZE) on the ground plane; rotation in
// degrees becomes radians with the existing sign convention.
export function transformOf(piece: Piece): PieceTransform {
  return {
    x: piece.col * CELL_SIZE,
    z: piece.row * CELL_SIZE,
    theta: (piece.rotation * Math.PI) / 180,
  }
}

// Outward-facing world frames for every connector port on a piece. The
// returned array follows the order from connectorPortsOf so legacy code
// that still indexes by "entry / exit" position keeps working during the
// transition.
export function endpointsOf(piece: Piece): Frame[] {
  return connectorPortsOf(piece).map((port) => frameOfPort(piece, port))
}
