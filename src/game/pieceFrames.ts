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

// CELL_SIZE is duplicated here to avoid a runtime import cycle with track.ts.
// The single source of truth is trackPath.ts; if that constant ever changes,
// update both. Tests assert this stays in sync.
export const FRAME_CELL_SIZE = 20
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

// Stage 1 transform-driven sibling of frameOfPort. Uses the piece's anchor
// transform as the cell center instead of (col * CELL_SIZE, row * CELL_SIZE).
// For grid-aligned pieces this returns bit-identical values to frameOfPort
// because the v1 to v2 converter populates transform.x = col * CELL_SIZE and
// transform.z = row * CELL_SIZE exactly. The port's dr / dc / dir already
// encode piece rotation (connectorPortsOf rotates them), so transform.theta
// is not applied to the port offsets at this layer.
export function frameOfPortAtTransform(
  transform: PieceTransform,
  port: ConnectorPort,
): Frame {
  const cx = transform.x + port.dc * FRAME_CELL_SIZE
  const cz = transform.z + port.dr * FRAME_CELL_SIZE
  const delta = EDGE_DELTAS[port.dir]
  return {
    x: cx + delta.dx,
    z: cz + delta.dz,
    theta: DIR_HEADINGS[port.dir],
  }
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
