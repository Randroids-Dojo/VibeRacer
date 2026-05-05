// Stage 2 Workstream B: piece-level mutations that update `transform`
// continuously without going through cell coordinates. Read
// docs/CONTINUOUS_ANGLE_PLAN.md "Stage 2 Workstream B" before adding
// helpers here.
//
// These mutations are the building blocks the editor's rotate handle and
// free-placement drag will dispatch. They differ from `editor.ts`'s
// existing mutations (`withPiecePlaced`, `withPieceRotated`, ...) which
// re-project to integer cells after every change. The helpers here let
// the editor produce non-projectable transforms for the first time.
//
// Every mutation runs the v1 to v2 converter on its result so legacy
// `(row, col, rotation)` fields stay consistent for v1-projectable
// transforms (the converter re-derives them from the projection) and
// stay untouched for non-projectable transforms (the runtime already
// reads `transform` directly after Workstream A). Either way the
// returned piece satisfies the runtime invariant "transform is
// authoritative".

import type { Piece, PieceTransform } from '@/lib/schemas'
import { convertV1Piece } from '@/lib/trackVersion'
import { endpointsOf, transformOf } from './pieceGeometry'

export interface WorldPoint {
  x: number
  z: number
}

// Rotate a piece transform around a world-space pivot by `deltaTheta`
// radians clockwise (compass-wise). For deltaTheta = 0 the result is
// transform-identical to the input. The CW rotation matrix in the
// (x, z) plane matches the convention `transformSample` and
// `frameOfPortAtTransform` use elsewhere:
//   x' = x cos t - z sin t
//   z' = x sin t + z cos t
// theta accumulates: new transform.theta = transform.theta + deltaTheta.
export function rotateTransformAroundPoint(
  transform: PieceTransform,
  pivot: WorldPoint,
  deltaTheta: number,
): PieceTransform {
  if (deltaTheta === 0) return transform
  const cs = Math.cos(deltaTheta)
  const sn = Math.sin(deltaTheta)
  const dx = transform.x - pivot.x
  const dz = transform.z - pivot.z
  return {
    x: pivot.x + dx * cs - dz * sn,
    z: pivot.z + dx * sn + dz * cs,
    theta: transform.theta + deltaTheta,
  }
}

// Rotate a piece around one of its connector endpoints. After the
// rotation, the chosen endpoint is at the same world position as before
// (within float round-off) and the other endpoint, the piece's
// rendered geometry, and `transform.theta` all rotate by `deltaTheta`
// radians clockwise. The endpoint frame is captured from the current
// piece (via `endpointsOf`) at call time, so callers that hold an
// initial frame across a long drag should pass `deltaTheta` measured
// from the drag start, not the previous frame.
export function rotatePieceAroundEndpoint(
  piece: Piece,
  endpointIndex: number,
  deltaTheta: number,
): Piece {
  const endpoints = endpointsOf(piece)
  const pivot = endpoints[endpointIndex]
  if (pivot === undefined) {
    throw new Error(
      `rotatePieceAroundEndpoint: piece has no endpoint at index ${endpointIndex}`,
    )
  }
  return applyTransform(piece, rotateTransformAroundPoint(transformOf(piece), pivot, deltaTheta))
}

// Translate a piece's transform by `(dx, dz)` in world units, leaving
// theta unchanged. Used by the free-placement drag mode.
export function translatePiece(piece: Piece, dx: number, dz: number): Piece {
  if (dx === 0 && dz === 0) return piece
  const t = transformOf(piece)
  return applyTransform(piece, { x: t.x + dx, z: t.z + dz, theta: t.theta })
}

// Set the piece's transform directly. Used by the free-placement snap
// step where the editor knows the exact target frame and wants the
// piece to land there in one move. Runs the v1 to v2 converter so
// legacy cell fields stay consistent for v1-projectable results.
export function setPieceTransform(
  piece: Piece,
  transform: PieceTransform,
): Piece {
  return applyTransform(piece, transform)
}

// Internal: replace the piece's transform and run the converter so
// legacy fields are re-derived for v1-projectable results and left
// untouched otherwise. The result satisfies the runtime invariant
// "transform is authoritative".
function applyTransform(piece: Piece, transform: PieceTransform): Piece {
  return convertV1Piece({ ...piece, transform })
}
