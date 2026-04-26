// Pure helpers for the inside-of-corner kerbs (the classic alternating red /
// white curb stones at the apex of every turn). The renderer side that turns
// these into three.js meshes lives in sceneBuilder.ts; the math lives here so
// it can be unit-tested without instantiating WebGL.
//
// Each kerb is built from a row of small flat tiles laid along the inside of
// a corner's centerline arc. Tiles alternate red and white, sit slightly above
// the road plane so they read on top, and straddle the inner road edge so half
// of each tile sits on the grass and half on the asphalt. This matches how
// real-world kerbs read at the apex of a racing corner.
//
// S-curves and straight pieces have no kerbs in v1: kerbs are a corner-only
// affordance because they communicate "this is the apex, hug it" to the
// player. Adding them to straights would just be visual noise.

import { CELL_SIZE, TRACK_WIDTH, type OrderedPiece, type TrackPath } from './trackPath'

// Visible kerb tile dimensions. KERB_TILE_LENGTH is the arc-aligned dimension
// (i.e., how long each colored stripe reads as you drive past). KERB_DEPTH is
// the radial dimension (perpendicular to travel). Numbers chosen so a 90-degree
// turn fits roughly KERB_SEGMENTS_PER_CORNER tiles end to end with a small
// inter-tile gap so the alternating pattern reads cleanly.
export const KERB_DEPTH = 1.2
export const KERB_TILE_LENGTH = 1.5
export const KERB_TILE_GAP = 0.0
// Vertical lift above the road plane (which sits at y = 0.01) so the kerb
// renders above asphalt without z-fighting and below the gate banner.
export const KERB_Y = 0.04
// Number of tiles per 90-degree corner. The inner-edge arc length is
// `(CELL_SIZE/2 - TRACK_WIDTH/2) * PI/2 = 6 * PI/2 ≈ 9.42`, so 8 tiles of
// length ~1.18 fit cleanly along the arc. Tile length is recomputed per call
// from the actual arc length so the spacing always lands flush.
export const KERB_SEGMENTS_PER_CORNER = 8
// Color palette. Two-color alternation; the (0, 0) tile starts red so a kerb
// approached from the entry side reads as "red, white, red, white" from the
// driver's perspective.
export const KERB_COLOR_RED = 0xd41a1a
export const KERB_COLOR_WHITE = 0xf5f5f5

export interface KerbTile {
  // World-space center of the tile, in the y=0 plane (the layer's vertical
  // lift is applied at render time via KERB_Y).
  x: number
  z: number
  // Rotation about the +Y axis in radians. The tile's local +X axis is the
  // arc-tangent direction (length axis); local +Z is the radial direction
  // (depth axis pointing outward toward the asphalt).
  rotationY: number
  // Tile dimensions. Length matches KERB_TILE_LENGTH minus the inter-tile gap
  // so a row of tiles reads as evenly spaced; depth is constant.
  length: number
  depth: number
  // Hex color. Alternates red / white along the row.
  colorHex: number
}

// Build the kerb tiles for a single corner. The arc geometry is identical to
// what `cornerGeometry` in sceneBuilder.ts builds: a quarter circle of radius
// CELL_SIZE/2 centered on `arcCenter`. We tile along the inner edge (radius
// = CELL_SIZE/2 - TRACK_WIDTH/2) so the kerb sits at the apex. Each tile is
// rotated to match the local arc-tangent direction so it reads as a flat
// stripe of stones rather than a tilted lozenge.
//
// Returns an empty array if the piece is not a corner (defensive: callers
// already filter, but this lets unit tests assert behavior on every piece
// type without branching).
export function buildCornerKerbTiles(
  op: OrderedPiece,
  segmentCount: number = KERB_SEGMENTS_PER_CORNER,
): KerbTile[] {
  if (op.arcCenter === null) return []
  if (op.piece.type !== 'left90' && op.piece.type !== 'right90') return []
  if (segmentCount < 1 || !Number.isFinite(segmentCount)) return []

  const { cx, cz } = op.arcCenter
  const innerRadius = CELL_SIZE / 2 - TRACK_WIDTH / 2

  // Replicate the angle-sweep math from cornerGeometry so the kerb tiles
  // follow the exact same arc the road does.
  const a1 = Math.atan2(op.entry.z - cz, op.entry.x - cx)
  const a2 = Math.atan2(op.exit.z - cz, op.exit.x - cx)
  let delta = a2 - a1
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI

  const tiles: KerbTile[] = []
  // Each tile occupies an equal angular slice of the sweep. The center of
  // tile k sits at parameter t = (k + 0.5) / segmentCount along the sweep.
  const tileLengthArc = (Math.abs(delta) * innerRadius) / segmentCount
  const tileLength = Math.max(0.05, tileLengthArc - KERB_TILE_GAP)
  for (let k = 0; k < segmentCount; k++) {
    const t = (k + 0.5) / segmentCount
    const a = a1 + delta * t
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    // Tile position: on the inner-radius arc.
    const x = cx + innerRadius * ca
    const z = cz + innerRadius * sa
    // Tile rotation: local +X (length axis) should align with the arc tangent
    // at this point. The tangent direction depends on the sign of the sweep
    // (CCW vs CW). For a quarter circle the unit tangent at angle a is
    // sign(delta) * (-sin a, cos a). The kerb's local +X faces the tangent
    // direction; the rotation about +Y that achieves this is
    // atan2(-tz, tx) (matching the game's heading convention).
    const sign = delta >= 0 ? 1 : -1
    const tx = sign * -sa
    const tz = sign * ca
    const rotationY = Math.atan2(-tz, tx)
    tiles.push({
      x,
      z,
      rotationY,
      length: tileLength,
      depth: KERB_DEPTH,
      colorHex: k % 2 === 0 ? KERB_COLOR_RED : KERB_COLOR_WHITE,
    })
  }
  return tiles
}

// Build kerb tiles for every corner in the track. Returns one flat array so
// the renderer can drop them into a single Group without per-piece bookkeeping.
export function buildTrackKerbTiles(
  path: TrackPath,
  segmentCount: number = KERB_SEGMENTS_PER_CORNER,
): KerbTile[] {
  const out: KerbTile[] = []
  for (const op of path.order) {
    const tiles = buildCornerKerbTiles(op, segmentCount)
    for (const t of tiles) out.push(t)
  }
  return out
}

// Counts every corner piece (left90 or right90) in path order. Useful for
// callers that want to size a mesh pool ahead of time.
export function countCorners(path: TrackPath): number {
  let n = 0
  for (const op of path.order) {
    if (op.piece.type === 'left90' || op.piece.type === 'right90') n++
  }
  return n
}
