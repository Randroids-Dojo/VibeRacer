// Stage 2 Workstream B slice 7: oriented-bounding-box overlap
// detection. The footprint contract stays a list of cells (so the
// validator's duplicate-cell check, the editor's anchor-based hit
// testing, and canonical hashing keep working unchanged); OBB-vs-
// OBB catches the geometry the cell projection misses, namely two
// non-projectable pieces whose actual rotated rectangles overlap
// even when their cardinal-snapped supercover footprints do not.
//
// `obbOfPiece` returns ONE OBB built from the AABB of the piece's
// footprint offsets and serves as a coarse-but-cheap bound (still
// useful as a pre-check or for callers that need a single rotated
// rectangle per piece). `cellObbsOfPiece` returns one OBB per
// footprint cell so non-rectangular footprints (`wideArc45*`'s
// 3-cell L, `hairpin*`'s 6-cell rectangle, `flexStraight`'s
// supercover line) are not over-approximated: the L doesn't claim
// the missing corner cell, the U doesn't claim the inside-of-U
// region, and `findOverlappingPiecePairs` only flags cell-against-
// cell collisions. The editor's overlap warning therefore stops
// firing on grid-aligned tracks where two pieces' AABB envelopes
// overlap but their actual road cells don't.
//
// Each cell-OBB is a unit cell square (CELL_SIZE on a side) at the
// world position of its anchor + cell offset, rotated by the
// piece's residual angle around the piece's transform position.
// SAT runs strict-inequality so cells that merely share an edge
// (the typical grid-aligned neighbor case) do not flag.
//
// Pipeline: spatial-hash each cell-OBB's world-AABB into integer
// cell columns / rows, group the per-piece cell-OBB lists by piece
// index, walk pieces sharing any bucket, and run cell-vs-cell SAT
// for every cross-piece pair until one overlap is found. Bucket
// keys come from the per-cell world AABB rather than the piece's
// cardinal `footprintCells`, so a translation-only perturbation
// that leaves the legacy `piece.row` / `piece.col` rounded to the
// original anchor still buckets together with the neighbor it has
// actually moved into.

import type { Piece } from '@/lib/schemas'
import { CELL_SIZE } from './cellSize'
import { residualThetaAfterCardinalSnap } from './pieceFrames'
import { transformOf } from './pieceGeometry'
import { defaultFootprintForPiece, normalizedFootprint } from './trackFootprint'

export interface OBB {
  // World coordinates of the OBB's center.
  centerX: number
  centerZ: number
  // Half-extents along the OBB's local axes (the axes that result
  // from rotating world axes by `theta`).
  halfX: number
  halfZ: number
  // Rotation of the OBB's local axes in world. Equal to the residual
  // rotation `transform.theta - cardinalSnap(transform.theta)` because
  // the cardinal portion is already baked into the footprint cells'
  // (row, col) integer offsets via `connectorPortsOf` /
  // `defaultFootprintForPiece`.
  theta: number
}

// Build the bounding OBB for a piece's footprint. The footprint's
// `(dr, dc)` offsets are relative to the piece's anchor in the
// cardinal-rotated piece-local frame; the anchor lives at
// `(transform.x, transform.z)` in world. We compute the AABB of
// the offsets in piece-local cardinal coords, then rotate the
// resulting center by the residual angle around the transform
// position. Anchoring on `transform` (rather than `piece.row` /
// `piece.col`) is what lets the OBB track translation-only
// perturbations: a piece nudged half a cell sideways via the
// numeric Transform panel keeps its legacy `piece.col` rounded to
// the original anchor, and only the transform reflects the actual
// world position.
//
// Over-approximating: for non-rectangular footprints this OBB
// claims more area than the piece's actual road cells. Use
// `cellObbsOfPiece` for the per-cell shape and overlap detection.
export function obbOfPiece(piece: Piece): OBB {
  const t = transformOf(piece)
  const offsets = normalizedFootprint(
    piece.footprint && piece.footprint.length > 0
      ? piece.footprint
      : defaultFootprintForPiece(piece),
  )
  if (offsets.length === 0) {
    return { centerX: t.x, centerZ: t.z, halfX: 0, halfZ: 0, theta: 0 }
  }
  let drMin = offsets[0].dr
  let drMax = offsets[0].dr
  let dcMin = offsets[0].dc
  let dcMax = offsets[0].dc
  for (const off of offsets) {
    if (off.dr < drMin) drMin = off.dr
    if (off.dr > drMax) drMax = off.dr
    if (off.dc < dcMin) dcMin = off.dc
    if (off.dc > dcMax) dcMax = off.dc
  }
  // Cardinal-frame center offset from the anchor (the piece's
  // (dr=0, dc=0) cell sits at the anchor's world position).
  const localCenterX = ((dcMin + dcMax) / 2) * CELL_SIZE
  const localCenterZ = ((drMin + drMax) / 2) * CELL_SIZE
  const halfX = ((dcMax - dcMin + 1) * CELL_SIZE) / 2
  const halfZ = ((drMax - drMin + 1) * CELL_SIZE) / 2
  const residual = residualThetaAfterCardinalSnap(t.theta)
  if (residual === 0) {
    return {
      centerX: t.x + localCenterX,
      centerZ: t.z + localCenterZ,
      halfX,
      halfZ,
      theta: 0,
    }
  }
  // Apply residual rotation around the piece's transform position,
  // matching `frameOfPortAtTransform`'s convention: the offsets are
  // measured in cardinal-rotated piece-local coords, and the
  // residual rotation carries the cardinal frame to the actual
  // world frame.
  const cs = Math.cos(residual)
  const sn = Math.sin(residual)
  return {
    centerX: t.x + localCenterX * cs - localCenterZ * sn,
    centerZ: t.z + localCenterX * sn + localCenterZ * cs,
    halfX,
    halfZ,
    theta: residual,
  }
}

// Per-cell OBBs for a piece. Each footprint cell becomes its own
// CELL_SIZE-on-a-side rotated square anchored at the piece's
// transform with the residual angle applied. Two pieces overlap
// (for the editor's warning) when any cell-OBB of one overlaps
// any cell-OBB of the other, which is strictly tighter than the
// AABB-of-footprint bound `obbOfPiece` provides: an L-shaped
// 3-cell footprint no longer claims the missing 4th corner cell.
export function cellObbsOfPiece(piece: Piece): OBB[] {
  const t = transformOf(piece)
  const offsets = normalizedFootprint(
    piece.footprint && piece.footprint.length > 0
      ? piece.footprint
      : defaultFootprintForPiece(piece),
  )
  if (offsets.length === 0) {
    return [{ centerX: t.x, centerZ: t.z, halfX: 0, halfZ: 0, theta: 0 }]
  }
  const half = CELL_SIZE / 2
  const residual = residualThetaAfterCardinalSnap(t.theta)
  if (residual === 0) {
    return offsets.map((off) => ({
      centerX: t.x + off.dc * CELL_SIZE,
      centerZ: t.z + off.dr * CELL_SIZE,
      halfX: half,
      halfZ: half,
      theta: 0,
    }))
  }
  const cs = Math.cos(residual)
  const sn = Math.sin(residual)
  return offsets.map((off) => {
    const localX = off.dc * CELL_SIZE
    const localZ = off.dr * CELL_SIZE
    return {
      centerX: t.x + localX * cs - localZ * sn,
      centerZ: t.z + localX * sn + localZ * cs,
      halfX: half,
      halfZ: half,
      theta: residual,
    }
  })
}

// World-axis-aligned bounding box of an OBB. Used as a cheap pre-
// check before SAT; if the world-AABBs are disjoint, the OBBs
// definitely are. Computed via "x and z extents of a rotated box"
// formula: an OBB at angle theta with half-extents (hx, hz) projects
// onto the world x-axis with half-extent `|hx cos t| + |hz sin t|`,
// and onto the world z-axis with `|hx sin t| + |hz cos t|`.
export interface AABB {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export function aabbOfObb(obb: OBB): AABB {
  const cs = Math.abs(Math.cos(obb.theta))
  const sn = Math.abs(Math.sin(obb.theta))
  const projX = obb.halfX * cs + obb.halfZ * sn
  const projZ = obb.halfX * sn + obb.halfZ * cs
  return {
    minX: obb.centerX - projX,
    maxX: obb.centerX + projX,
    minZ: obb.centerZ - projZ,
    maxZ: obb.centerZ + projZ,
  }
}

// Strict-inequality overlap: AABBs that merely touch at an edge are
// NOT reported. Adjacent cell-aligned pieces (the typical valid
// track configuration) share an edge at their boundary, so a
// non-strict `>=` would flag every pair of grid-aligned neighbors.
export function aabbsOverlap(a: AABB, b: AABB): boolean {
  return a.maxX > b.minX && a.minX < b.maxX && a.maxZ > b.minZ && a.minZ < b.maxZ
}

// Separating Axis Theorem on two OBBs. Tests four axes (the local
// x and z of each box). If any axis separates the projected
// intervals, the boxes are disjoint.
export function obbsOverlap(a: OBB, b: OBB): boolean {
  const aXax = { x: Math.cos(a.theta), z: Math.sin(a.theta) }
  const aZax = { x: -Math.sin(a.theta), z: Math.cos(a.theta) }
  const bXax = { x: Math.cos(b.theta), z: Math.sin(b.theta) }
  const bZax = { x: -Math.sin(b.theta), z: Math.cos(b.theta) }
  for (const axis of [aXax, aZax, bXax, bZax]) {
    if (!projectedIntervalsOverlap(a, b, axis, aXax, aZax, bXax, bZax)) {
      return false
    }
  }
  return true
}

function projectedIntervalsOverlap(
  a: OBB,
  b: OBB,
  axis: { x: number; z: number },
  aXax: { x: number; z: number },
  aZax: { x: number; z: number },
  bXax: { x: number; z: number },
  bZax: { x: number; z: number },
): boolean {
  const dx = b.centerX - a.centerX
  const dz = b.centerZ - a.centerZ
  const centerDist = Math.abs(dx * axis.x + dz * axis.z)
  const aHalf =
    Math.abs(a.halfX * (aXax.x * axis.x + aXax.z * axis.z)) +
    Math.abs(a.halfZ * (aZax.x * axis.x + aZax.z * axis.z))
  const bHalf =
    Math.abs(b.halfX * (bXax.x * axis.x + bXax.z * axis.z)) +
    Math.abs(b.halfZ * (bZax.x * axis.x + bZax.z * axis.z))
  // Strict-inequality SAT for the same reason as aabbsOverlap:
  // adjacent grid-aligned pieces share an OBB boundary, and a non-
  // strict comparison would flag every neighbor pair.
  return centerDist < aHalf + bHalf
}

export interface PieceOverlap {
  // Piece array indices, with `a < b` so each unordered pair is
  // reported exactly once.
  a: number
  b: number
}

// Pairs of pieces whose road cells overlap. Each piece is expanded
// into its per-cell OBB list; cell-OBBs are bucketed into integer
// cell columns / rows by their world-AABB. Two pieces are flagged
// only when at least one cross-piece cell-OBB pair passes both AABB
// pre-check and full SAT. Same-piece cell pairs are never compared
// (a piece's footprint is internally consistent by construction;
// flagging it as self-overlap would be a permanent warning on every
// multi-cell piece). Bucketing per cell rather than per piece is
// what eliminates the slice 7 false positives: an L-shaped wideArc45
// piece next to its neighbor used to bucket-overlap on the missing
// corner cell of the L envelope and trigger SAT, but with per-cell
// buckets the missing corner cell never enters the bucket map.
export function findOverlappingPiecePairs(
  pieces: readonly Piece[],
): PieceOverlap[] {
  if (pieces.length < 2) return []
  // Per-piece cell-OBB lists with their world AABBs.
  const cellObbsByPiece: OBB[][] = pieces.map(cellObbsOfPiece)
  const cellAabbsByPiece: AABB[][] = cellObbsByPiece.map((obbs) =>
    obbs.map(aabbOfObb),
  )
  // Spatial hash: each (row, col) bucket lists `(pieceIdx, cellIdx)`
  // entries for cell-OBBs whose world-AABB touches that cell.
  const cellBuckets = new Map<string, Array<[number, number]>>()
  for (let p = 0; p < pieces.length; p++) {
    const aabbs = cellAabbsByPiece[p]
    for (let c = 0; c < aabbs.length; c++) {
      const aabb = aabbs[c]
      const colMin = Math.floor(aabb.minX / CELL_SIZE)
      const colMax = Math.floor(aabb.maxX / CELL_SIZE)
      const rowMin = Math.floor(aabb.minZ / CELL_SIZE)
      const rowMax = Math.floor(aabb.maxZ / CELL_SIZE)
      for (let r = rowMin; r <= rowMax; r++) {
        for (let cc = colMin; cc <= colMax; cc++) {
          const key = `${r},${cc}`
          const arr = cellBuckets.get(key)
          if (arr === undefined) cellBuckets.set(key, [[p, c]])
          else arr.push([p, c])
        }
      }
    }
  }
  // For each bucket, walk every cross-piece cell pair and check
  // AABB then SAT. Track flagged piece pairs so we report each
  // unordered pair once even if multiple cell pairs overlap.
  const flagged = new Set<string>()
  const out: PieceOverlap[] = []
  for (const arr of cellBuckets.values()) {
    if (arr.length < 2) continue
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const [pi, ci] = arr[i]
        const [pj, cj] = arr[j]
        if (pi === pj) continue
        const lo = pi < pj ? pi : pj
        const hi = pi < pj ? pj : pi
        const key = `${lo}|${hi}`
        if (flagged.has(key)) continue
        const aAabb = cellAabbsByPiece[pi][ci]
        const bAabb = cellAabbsByPiece[pj][cj]
        if (!aabbsOverlap(aAabb, bAabb)) continue
        const aObb = cellObbsByPiece[pi][ci]
        const bObb = cellObbsByPiece[pj][cj]
        if (!obbsOverlap(aObb, bObb)) continue
        flagged.add(key)
        out.push({ a: lo, b: hi })
      }
    }
  }
  return out
}
