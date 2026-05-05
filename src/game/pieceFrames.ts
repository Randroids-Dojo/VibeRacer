// Stage 1 foundation for the continuous-angle track editor.
//
// Today every piece is addressed by integer (row, col, rotation), and two
// pieces "connect" when their cardinal/diagonal cell-edge ports line up by
// integer equality. Continuous-angle pieces need a different match: any two
// connectors whose world-space position and tangent agree (within a small
// epsilon) should be allowed to join.
//
// This module provides that connection layer without changing any existing
// piece shape:
//
//   - `Frame` is the world-space description of a single connector
//     (position + outward tangent angle).
//   - `frameOfPort(piece, port)` resolves a single connector port to a
//     world-space frame.
//   - `framesConnect(a, b, opts)` is the epsilon matcher.
//
// The validator can call `framesConnect` instead of the cell-based
// `portsConnect`, and the existing pieces all keep working because their
// world frames currently happen to fall on integer grid points. New piece
// types (continuous-angle ones) plug in by exposing world frames at any
// floating-point position and tangent.
//
// This module imports only types from track.ts to avoid runtime circular
// imports; track.ts is the runtime caller.

import type { Piece, PieceTransform } from '@/lib/schemas'
import { CELL_SIZE } from './cellSize'
import type { ConnectorPort, Dir } from './track'

export interface Frame {
  // World position on the road plane. y is implicitly 0 because the editor's
  // world is a flat ground plane.
  x: number
  z: number
  // Outward tangent angle in radians, using the game heading convention:
  // 0 = +X (east), PI/2 = north (-Z), PI = west, -PI/2 = south. Two connectors
  // align when their tangents differ by exactly PI (within an epsilon),
  // because each face points OUTWARD from its piece, so an "exit" pointing
  // east connects to an "entry" pointing west.
  theta: number
}

export interface FrameConnectOptions {
  // Maximum world-space distance between the two frame positions for them
  // to be considered the same connector. Default 0.5 world units, matching
  // the spec's recommended epsilon. Cell-aligned pieces hit zero distance.
  epsilonPos?: number
  // Maximum angular deviation from the ideal antiparallel orientation.
  // Default 2 degrees in radians. Cell-aligned pieces hit zero deviation.
  epsilonTheta?: number
}

export const DEFAULT_FRAME_EPSILON_POS = 0.5
export const DEFAULT_FRAME_EPSILON_THETA = (2 * Math.PI) / 180 // 2 degrees

// FRAME_CELL_SIZE is the world-units-per-grid-cell constant; it is the same
// value as `CELL_SIZE` and is sourced from the leaf module `./cellSize` so
// pieceFrames does not have to duplicate it. The export is kept under the
// historical name for backward compatibility with existing test imports;
// any future change to `CELL_SIZE` propagates here automatically.
export const FRAME_CELL_SIZE = CELL_SIZE
const HALF = FRAME_CELL_SIZE / 2

// Static table of edge offsets in world space for each cardinal/diagonal
// direction. Mirrors EDGE_OFFSETS in trackPath.ts.
const EDGE_DELTAS: Record<Dir, { dx: number; dz: number }> = {
  0: { dx: 0, dz: -HALF },
  1: { dx: HALF, dz: -HALF },
  2: { dx: HALF, dz: 0 },
  3: { dx: HALF, dz: HALF },
  4: { dx: 0, dz: HALF },
  5: { dx: -HALF, dz: HALF },
  6: { dx: -HALF, dz: 0 },
  7: { dx: -HALF, dz: -HALF },
}

const DIR_HEADINGS: Record<Dir, number> = {
  0: Math.PI / 2,
  1: Math.PI / 4,
  2: 0,
  3: -Math.PI / 4,
  4: -Math.PI / 2,
  5: (-3 * Math.PI) / 4,
  6: Math.PI,
  7: (3 * Math.PI) / 4,
}

// World-space frame for a single connector port on a piece. Position is the
// edge midpoint of the cell the port sits on; tangent is the outward heading
// implied by the port's direction.
export function frameOfPort(
  piece: Pick<Piece, 'row' | 'col'>,
  port: ConnectorPort,
): Frame {
  const cellCx = piece.col * FRAME_CELL_SIZE
  const cellCz = piece.row * FRAME_CELL_SIZE
  const cx = cellCx + port.dc * FRAME_CELL_SIZE
  const cz = cellCz + port.dr * FRAME_CELL_SIZE
  const delta = EDGE_DELTAS[port.dir]
  return {
    x: cx + delta.dx,
    z: cz + delta.dz,
    theta: DIR_HEADINGS[port.dir],
  }
}

// Stage 2 transform-driven sibling of frameOfPort. Uses the piece's anchor
// transform as the cell center instead of (col * CELL_SIZE, row * CELL_SIZE),
// and rotates the port offset / heading by the residual angle that
// `connectorPortsOf` did not already apply.
//
// Decomposition: every port produced by `connectorPortsOf` has its `dr`,
// `dc`, and `dir` rotated by the cardinal-snapped projection of
// `transform.theta` (an integer multiple of PI/2 within
// `THETA_PROJECTION_EPSILON`). The remaining residual = transform.theta
// minus that projection, in radians. For grid-aligned pieces (every Stage 1
// piece) the residual is exactly zero, and this function reduces to the
// legacy "translate the rotated port relative to transform" arithmetic, so
// the snapshot wall in tests/unit/pieceGeometry.test.ts and the existing
// hashTrack template digests stay pinned bit-for-bit. For non-projectable
// pieces the residual is non-zero and we apply it via cos / sin so the
// world frame matches `transform.theta` exactly.
export function frameOfPortAtTransform(
  transform: PieceTransform,
  port: ConnectorPort,
): Frame {
  const offsetX = port.dc * FRAME_CELL_SIZE + EDGE_DELTAS[port.dir].dx
  const offsetZ = port.dr * FRAME_CELL_SIZE + EDGE_DELTAS[port.dir].dz
  const residual = residualThetaAfterCardinalSnap(transform.theta)
  if (residual === 0) {
    return {
      x: transform.x + offsetX,
      z: transform.z + offsetZ,
      theta: DIR_HEADINGS[port.dir],
    }
  }
  // Clockwise rotation by `residual` radians in the (x, z) plane, matching
  // the convention `transformSample` uses elsewhere: x' = x cos t - z sin t,
  // z' = x sin t + z cos t. Heading rotates by -residual because heading is
  // measured CCW from +X.
  const cs = Math.cos(residual)
  const sn = Math.sin(residual)
  return {
    x: transform.x + offsetX * cs - offsetZ * sn,
    z: transform.z + offsetX * sn + offsetZ * cs,
    theta: DIR_HEADINGS[port.dir] - residual,
  }
}

// Mirror of `V1_PROJECTABLE_ROTATION_EPSILON` from `pieceGeometry`. Defined
// here to avoid an import cycle (pieceGeometry imports this module). The
// value is the rotation epsilon spec'd in docs/CONTINUOUS_ANGLE_PLAN.md
// "Rule 1": two orders of magnitude looser than the position epsilon
// because rotations accumulate sin / cos error through composed editor
// operations. Keep this in sync with pieceGeometry's constant.
const THETA_PROJECTION_EPSILON = 1e-4

const HALF_PI_RAD = Math.PI / 2

// Residual rotation after snapping `theta` to the nearest multiple of PI/2
// within THETA_PROJECTION_EPSILON. For cardinal thetas the residual is
// exactly zero so callers can short-circuit to the integer arithmetic path.
// `connectorPortsOf` does the cardinal snap for the integer-rotation table;
// this helper exposes the leftover continuous angle for the world-frame
// step.
export function residualThetaAfterCardinalSnap(theta: number): number {
  const turns = ((Math.round(theta / HALF_PI_RAD) % 4) + 4) % 4
  const residual = theta - turns * HALF_PI_RAD
  if (Math.abs(residual) <= THETA_PROJECTION_EPSILON) return 0
  return residual
}

// Cardinal-snapped turn count (0..3) for `theta`. Used by `connectorPortsOf`
// to drive the integer rotation table for `dir` and `(dr, dc)`. For
// v1-projectable thetas this returns the same value as `piece.rotation / 90`
// did, so grid-aligned ports stay bit-equal. For non-projectable thetas it
// snaps to the nearest cardinal so cell-based diagnostics (footprint, port
// dir) still produce a sensible discrete answer.
export function cardinalTurnsOfTheta(theta: number): number {
  return ((Math.round(theta / HALF_PI_RAD) % 4) + 4) % 4
}

// Check whether two frames represent the same join. Frames must agree in
// position (within epsilonPos) and have antiparallel tangents (within
// epsilonTheta). The 180-degree offset is intrinsic: every frame faces
// outward, so an aligned join always wraps the tangent by PI.
export function framesConnect(
  a: Frame,
  b: Frame,
  options: FrameConnectOptions = {},
): boolean {
  const epsilonPos = options.epsilonPos ?? DEFAULT_FRAME_EPSILON_POS
  const epsilonTheta = options.epsilonTheta ?? DEFAULT_FRAME_EPSILON_THETA
  const dx = a.x - b.x
  const dz = a.z - b.z
  if (Math.hypot(dx, dz) > epsilonPos) return false
  return tangentsAreAntiparallel(a.theta, b.theta, epsilonTheta)
}

// Return whether two angles differ by exactly PI within the given epsilon.
// Wraps the residual into [-PI, PI] so the comparison handles 359-vs-1 cleanly.
export function tangentsAreAntiparallel(
  a: number,
  b: number,
  epsilon: number,
): boolean {
  let delta = a - b - Math.PI
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  return Math.abs(delta) <= epsilon
}
