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
import {
  cardinalTurnsOfTheta,
  framesConnect,
  tangentsAreAntiparallel,
  type Frame,
} from './pieceFrames'
import { thetaOfPiece } from './track'
import { rotateFootprintClockwise } from './trackFootprint'

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

// Stage 2 Workstream B slice 4 (free-placement drag): how close a
// dragged piece's endpoint has to come to a target endpoint before we
// soft-pull onto it. Wider than `framesConnect`'s default validator
// epsilon (0.5 world units / 2 degrees) because snap is a UX feedback
// loop. The user has to see the snap engage from a reasonable
// distance, then on commit the piece sits at exact alignment so the
// validator's tighter epsilon is satisfied.
export const FREE_PLACEMENT_SNAP_RADIUS = 15
export const FREE_PLACEMENT_SNAP_ANGLE_RAD = (30 * Math.PI) / 180

export interface UnconnectedEndpoint {
  pieceIdx: number
  endpointIdx: number
  frame: Frame
}

export interface FreePlacementSnap {
  targetPieceIdx: number
  targetEndpointIdx: number
  draggedEndpointIdx: number
  // The transform the dragged piece should adopt so its
  // `draggedEndpointIdx` endpoint frame is antiparallel-aligned with
  // the target frame at the same world position.
  transform: PieceTransform
}

// Endpoints that no other piece is currently connected to. Computed by
// iterating every piece's endpoints and asking the validator-style
// `framesConnect` check whether anything else matches them. The
// dragged piece itself is excluded by `excludePieceIdx` so a drag in
// flight does not consider its own endpoints as snap targets (the
// dragged piece's endpoints are the FROM side of the snap).
export function unconnectedEndpoints(
  pieces: readonly Piece[],
  excludePieceIdx?: number,
): UnconnectedEndpoint[] {
  const allFrames: { pieceIdx: number; endpointIdx: number; frame: Frame }[] = []
  for (let i = 0; i < pieces.length; i++) {
    if (i === excludePieceIdx) continue
    const ends = endpointsOf(pieces[i])
    for (let j = 0; j < ends.length; j++) {
      allFrames.push({ pieceIdx: i, endpointIdx: j, frame: ends[j] })
    }
  }
  return allFrames.filter(({ pieceIdx, frame }) => {
    for (const other of allFrames) {
      if (other.pieceIdx === pieceIdx) continue
      if (framesConnect(frame, other.frame)) return false
    }
    return true
  })
}

// Best snap target for a dragged piece, or null when nothing is in
// range. `draggedPiece` should reflect the piece's CURRENT transform
// (cursor-following position before snap is applied). `targets` is the
// unconnected-endpoint list to consider, typically `unconnectedEndpoints
// (pieces, excludePieceIdx=draggedIdx)`. Compares every dragged endpoint
// against every target; picks the lowest-distance pair that also passes
// the angle threshold. The returned `transform` is what the editor
// should apply to soft-pull the piece onto the target.
export function findFreePlacementSnap(
  draggedPiece: Piece,
  targets: readonly UnconnectedEndpoint[],
  snapRadius = FREE_PLACEMENT_SNAP_RADIUS,
  snapAngleRad = FREE_PLACEMENT_SNAP_ANGLE_RAD,
): FreePlacementSnap | null {
  const draggedEnds = endpointsOf(draggedPiece)
  let best: { dist: number; snap: FreePlacementSnap } | null = null
  for (let di = 0; di < draggedEnds.length; di++) {
    const draggedFrame = draggedEnds[di]
    for (const t of targets) {
      const dx = draggedFrame.x - t.frame.x
      const dz = draggedFrame.z - t.frame.z
      const dist = Math.hypot(dx, dz)
      if (dist > snapRadius) continue
      if (!tangentsAreAntiparallel(draggedFrame.theta, t.frame.theta, snapAngleRad)) continue
      const snapped = snapPieceToTarget(draggedPiece, di, t.frame)
      if (best === null || dist < best.dist) {
        best = {
          dist,
          snap: {
            targetPieceIdx: t.pieceIdx,
            targetEndpointIdx: t.endpointIdx,
            draggedEndpointIdx: di,
            transform: snapped,
          },
        }
      }
    }
  }
  return best?.snap ?? null
}

// Compute the transform the dragged piece needs so its
// `draggedEndpointIdx` endpoint frame ends up at the target frame's
// world position with antiparallel tangents. The piece's other
// endpoint follows rigidly via the existing piece geometry. Used by
// `findFreePlacementSnap` as the soft-pull target; callers can also
// invoke it directly when they already know which endpoints to align.
//
// Math: in the dragged piece's CURRENT pose, the local-frame offset
// from the piece's transform.(x, z) to the dragged endpoint is
// (`draggedFrame.x - currentTransform.x`, `draggedFrame.z -
// currentTransform.z`). After snap, the piece's theta rotates so the
// dragged endpoint's outward heading is antiparallel to the target's
// (`targetFrame.theta + PI`), i.e. `draggedFrame.theta - currentPieceTheta`
// stays constant relative to the piece. The piece's position is then
// chosen so the rotated offset lands on the target.
export function snapPieceToTarget(
  piece: Piece,
  draggedEndpointIdx: number,
  targetFrame: Frame,
): PieceTransform {
  const currentTransform = transformOf(piece)
  const draggedEnds = endpointsOf(piece)
  const draggedFrame = draggedEnds[draggedEndpointIdx]
  if (draggedFrame === undefined) return currentTransform
  // `frameOfPortAtTransform` decomposes `transform.theta` into a
  // cardinal-snapped portion (integer multiple of PI/2 used to rotate
  // the port's `dir` and `(dr, dc)` via `connectorPortsOf`) plus a
  // continuous residual that rotates the resulting offset by `cos /
  // sin(residual)` and shifts the heading by `-residual`. Within one
  // cardinal cell (i.e., when the new transform.theta keeps the same
  // cardinalTurns mod 4 as the current one), `frame.theta + transform
  // .theta` is therefore a CONSTANT: changing transform.theta by
  // `dTheta` changes the residual by `dTheta` and the heading by
  // `-dTheta`. Use that invariant to choose `newPieceTheta` so the
  // dragged endpoint's heading lands antiparallel to the target.
  // The earlier formulation `(target.theta + PI) - (frame.theta -
  // transform.theta)` assumed slope `+1` instead of `-1`, which agreed
  // with cardinal targets only because their residual is zero on both
  // sides; it produced a `2 * residual` heading error for non-cardinal
  // targets (the slice 6 reconciliation case).
  const cardinalInvariant = draggedFrame.theta + currentTransform.theta
  const desiredEndpointTheta = targetFrame.theta + Math.PI
  const newPieceTheta = cardinalInvariant - desiredEndpointTheta
  // Piece-local offset from piece center to the dragged endpoint at
  // theta = 0 (un-rotated). Rotate the current world offset back by
  // -currentTransform.theta to recover the local offset.
  const dxCurrent = draggedFrame.x - currentTransform.x
  const dzCurrent = draggedFrame.z - currentTransform.z
  const csBack = Math.cos(-currentTransform.theta)
  const snBack = Math.sin(-currentTransform.theta)
  const localOffsetX = dxCurrent * csBack - dzCurrent * snBack
  const localOffsetZ = dxCurrent * snBack + dzCurrent * csBack
  // Rotate the local offset forward by the new piece theta to get the
  // world offset under the new pose.
  const csFwd = Math.cos(newPieceTheta)
  const snFwd = Math.sin(newPieceTheta)
  const newOffsetX = localOffsetX * csFwd - localOffsetZ * snFwd
  const newOffsetZ = localOffsetX * snFwd + localOffsetZ * csFwd
  // Place the piece so the rotated offset lands at the target.
  return {
    x: targetFrame.x - newOffsetX,
    z: targetFrame.z - newOffsetZ,
    theta: newPieceTheta,
  }
}

// Stage 2 Workstream B slice 6 (loop reconciliation): how close the
// two dangling endpoints of a nearly-closed chain have to be before
// the editor offers to snap them shut. Wider than `framesConnect`'s
// validator default (0.5 world units / 2 degrees) but narrower than
// the free-placement snap radius (15 / 30 degrees) so reconciliation
// only kicks in for chains the user has already brought into close
// alignment manually. The angle threshold is small because the
// reconciled snap moves only one piece; if the residual angular
// misalignment between the two dangling tangents is larger than this,
// snapping one piece to the other would rotate the moving piece
// enough that its OTHER endpoint (the connection back to its
// predecessor in the chain) would drift past `framesConnect`'s 0.5-
// unit validator threshold.
export const LOOP_RECONCILIATION_RADIUS = 6
export const LOOP_RECONCILIATION_ANGLE_RAD = (8 * Math.PI) / 180

export interface LoopReconciliation {
  // Index of the piece whose transform will change.
  pieceIdx: number
  // The piece's new transform after snapping its dangling endpoint to
  // the target frame.
  transform: PieceTransform
  // Which endpoint of the moving piece is being snapped, and which
  // endpoint of which other piece is the snap target.
  draggedEndpointIdx: number
  targetPieceIdx: number
  targetEndpointIdx: number
  // Distance (world units) the dangling endpoint has to travel to
  // reach the target frame. Surfaced so the UI can tell the user how
  // big the gap was, and so the test wall can pin the chosen pair.
  gap: number
}

// Detect whether the chain has exactly two dangling endpoints that
// are within reconciliation epsilon of each other and antiparallel-
// compatible. When so, return a `snapPieceToTarget`-driven plan that
// moves the second piece's endpoint exactly onto the first's frame.
// Returns null otherwise (no chain to reconcile, more than two open
// endpoints, or the gap is wider than the reconciliation radius).
//
// Convention: the moving piece is the one with the higher piece
// index. This keeps the choice deterministic across undo / redo and
// matches the typical authoring flow where the user appended a chain
// piece-by-piece and the last piece (highest index) is the one
// dangling near the start.
export function findLoopReconciliation(
  pieces: readonly Piece[],
  radius = LOOP_RECONCILIATION_RADIUS,
  angleRad = LOOP_RECONCILIATION_ANGLE_RAD,
): LoopReconciliation | null {
  const open = unconnectedEndpoints(pieces)
  if (open.length !== 2) return null
  const [first, second] = open
  const dx = first.frame.x - second.frame.x
  const dz = first.frame.z - second.frame.z
  const gap = Math.hypot(dx, dz)
  if (gap > radius) return null
  if (!tangentsAreAntiparallel(first.frame.theta, second.frame.theta, angleRad)) {
    return null
  }
  const movingIsSecond = second.pieceIdx > first.pieceIdx
  const movingEnd = movingIsSecond ? second : first
  const targetEnd = movingIsSecond ? first : second
  const movingPiece = pieces[movingEnd.pieceIdx]
  const transform = snapPieceToTarget(
    movingPiece,
    movingEnd.endpointIdx,
    targetEnd.frame,
  )
  return {
    pieceIdx: movingEnd.pieceIdx,
    transform,
    draggedEndpointIdx: movingEnd.endpointIdx,
    targetPieceIdx: targetEnd.pieceIdx,
    targetEndpointIdx: targetEnd.endpointIdx,
    gap,
  }
}

// Apply a reconciliation plan to the pieces array, returning a new
// array with the moving piece's transform replaced. Pure / immutable;
// callers wire this into their history stack.
export function applyLoopReconciliation(
  pieces: readonly Piece[],
  reconciliation: LoopReconciliation,
): Piece[] {
  return pieces.map((p, i) =>
    i === reconciliation.pieceIdx
      ? setPieceTransform(p, reconciliation.transform)
      : p,
  )
}

// Internal: replace the piece's transform and run the converter so
// legacy fields are re-derived for v1-projectable results and left
// untouched otherwise. Custom multi-cell footprints (`piece.footprint`)
// are rotated by the cardinal turn delta between the old and new
// transform so `footprintCells()`, duplicate-cell validation, hit
// testing, and canonical hashing all see the piece occupying the right
// world cells. Without this step a rotation would mutate the transform
// while leaving footprint offsets keyed off the prior orientation,
// silently corrupting validation. Pieces with default footprints
// (`piece.footprint === undefined`) skip the loop because
// `defaultFootprintForPiece` already snaps to the new
// `transform.theta` via `snappedRotationFromPiece` (PR #103).
function applyTransform(piece: Piece, transform: PieceTransform): Piece {
  const oldTurns = cardinalTurnsOfTheta(thetaOfPiece(piece))
  const newTurns = cardinalTurnsOfTheta(transform.theta)
  const turnDelta = (((newTurns - oldTurns) % 4) + 4) % 4
  let footprint = piece.footprint
  if (footprint !== undefined && footprint.length > 0 && turnDelta !== 0) {
    for (let i = 0; i < turnDelta; i++) {
      footprint = rotateFootprintClockwise(footprint)
    }
  }
  return convertV1Piece({ ...piece, transform, footprint })
}
