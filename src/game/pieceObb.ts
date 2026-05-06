// Stage 2 Workstream B slice 7: oriented-bounding-box overlap
// detection. The footprint contract stays a list of cells (so the
// validator's duplicate-cell check, the editor's anchor-based hit
// testing, and canonical hashing keep working unchanged); OBB-vs-
// OBB catches the geometry the cell projection misses, namely two
// non-projectable pieces whose actual rotated rectangles overlap
// even when their cardinal-snapped supercover footprints do not.
// For grid-aligned (residual = 0) pieces the OBB collapses to the
// cell-AABB, so OBB overlap is equivalent to footprint-cell
// duplication for those pieces and the existing duplicate-cell
// detection covers the same ground.
//
// Pipeline: spatial-hash pieces by their footprint cells (cheap,
// reuses the same cells the validator and editor already enumerate),
// pull each cell's piece list into pairwise candidates, AABB-prune
// (cheap world-axis bounding box, cuts most far-apart pairs without
// the trig of full SAT), then full OBB Separating Axis Theorem.
// Each stage is a strict superset of the next, so a SAT pass implies
// the AABB and cell-bucket pre-checks are also true.

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

// Build the OBB enclosing a piece's footprint. The footprint's
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

// Pairs of pieces whose OBBs overlap. Uses the OBB's world-AABB to
// bucket pieces into integer cell columns / rows (cheaper than full
// SAT for far-apart pairs); then full SAT on the candidates. We
// bucket by the WORLD AABB rather than the piece's cardinal-rotated
// `footprintCells`, because for non-projectable pieces the legacy
// `piece.row` / `piece.col` anchor does not always move with the
// transform: a slider that translates a piece into a neighbor's
// space without changing its v1-projectable cell would have its
// AABB intersect the neighbor's bucket while the legacy footprint
// would not, and the cell-bucket pre-check would miss the overlap.
// Bucketing by the AABB closes that hole and reduces to the same
// behavior as `footprintCells` when the cells happen to coincide
// (the typical grid-aligned case).
export function findOverlappingPiecePairs(
  pieces: readonly Piece[],
): PieceOverlap[] {
  if (pieces.length < 2) return []
  const obbs: OBB[] = pieces.map(obbOfPiece)
  const aabbs: AABB[] = obbs.map(aabbOfObb)
  const cellBuckets = new Map<string, number[]>()
  for (let i = 0; i < pieces.length; i++) {
    const aabb = aabbs[i]
    const colMin = Math.floor(aabb.minX / CELL_SIZE)
    const colMax = Math.floor(aabb.maxX / CELL_SIZE)
    const rowMin = Math.floor(aabb.minZ / CELL_SIZE)
    const rowMax = Math.floor(aabb.maxZ / CELL_SIZE)
    for (let r = rowMin; r <= rowMax; r++) {
      for (let c = colMin; c <= colMax; c++) {
        const key = `${r},${c}`
        const arr = cellBuckets.get(key)
        if (arr === undefined) {
          cellBuckets.set(key, [i])
        } else if (arr[arr.length - 1] !== i) {
          arr.push(i)
        }
      }
    }
  }
  const seenPairs = new Set<string>()
  const candidates: Array<[number, number]> = []
  for (const arr of cellBuckets.values()) {
    if (arr.length < 2) continue
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const lo = arr[i] < arr[j] ? arr[i] : arr[j]
        const hi = arr[i] < arr[j] ? arr[j] : arr[i]
        const k = `${lo}|${hi}`
        if (seenPairs.has(k)) continue
        seenPairs.add(k)
        candidates.push([lo, hi])
      }
    }
  }
  const out: PieceOverlap[] = []
  for (const [a, b] of candidates) {
    if (!aabbsOverlap(aabbs[a], aabbs[b])) continue
    if (!obbsOverlap(obbs[a], obbs[b])) continue
    out.push({ a, b })
  }
  return out
}
