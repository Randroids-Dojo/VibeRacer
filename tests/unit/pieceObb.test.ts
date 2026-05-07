import { describe, expect, it } from 'vitest'
import {
  aabbOfObb,
  aabbsOverlap,
  findOverlappingPiecePairs,
  obbOfPiece,
  obbsOverlap,
  type OBB,
} from '@/game/pieceObb'
import { CELL_SIZE } from '@/game/cellSize'
import { rotatePieceAroundEndpoint, setPieceTransform } from '@/game/continuousAngleEdit'
import { convertV1Piece } from '@/lib/trackVersion'

describe('obbOfPiece', () => {
  it('produces a CELL_SIZE square at the piece transform for a single-cell straight at origin', () => {
    const piece = convertV1Piece({ type: 'straight', row: 0, col: 0, rotation: 0 })
    const obb = obbOfPiece(piece)
    expect(obb.centerX).toBeCloseTo(0, 9)
    expect(obb.centerZ).toBeCloseTo(0, 9)
    expect(obb.halfX).toBeCloseTo(CELL_SIZE / 2, 9)
    expect(obb.halfZ).toBeCloseTo(CELL_SIZE / 2, 9)
    expect(obb.theta).toBe(0)
  })

  it('produces a residual-rotated OBB for a non-projectable transform', () => {
    const base = convertV1Piece({ type: 'straight', row: 0, col: 0, rotation: 0 })
    const rotated = setPieceTransform(base, { x: 0, z: 0, theta: (10 * Math.PI) / 180 })
    const obb = obbOfPiece(rotated)
    // 10 degrees lands inside the first cardinal cell (under PI/4),
    // so cardinal turn = 0 and residual = 10 degrees.
    expect(obb.theta).toBeCloseTo((10 * Math.PI) / 180, 9)
    // Single-cell footprint, so the AABB center sits at the
    // transform position before residual rotation; rotating zero
    // offset around the same pivot leaves the center at the origin.
    expect(obb.centerX).toBeCloseTo(0, 9)
    expect(obb.centerZ).toBeCloseTo(0, 9)
  })

  it('expands halfExtents to cover a multi-cell footprint', () => {
    // A hairpin's footprint covers 2 cols (0..1) by 3 rows (-1..1),
    // so the OBB has halfX = CELL_SIZE (2 cells / 2) and halfZ =
    // 1.5 * CELL_SIZE (3 cells / 2). The OBB sits at the geometric
    // center of those cells in cardinal-rotated frame.
    const piece = convertV1Piece({ type: 'hairpin', row: 0, col: 0, rotation: 0 })
    const obb = obbOfPiece(piece)
    expect(obb.halfX).toBeCloseTo(CELL_SIZE, 9)
    expect(obb.halfZ).toBeCloseTo(1.5 * CELL_SIZE, 9)
    // Center: cols (0 + 1) / 2 = 0.5 -> world 0.5 * CELL_SIZE; rows
    // (-1 + 1) / 2 = 0 -> world 0.
    expect(obb.centerX).toBeCloseTo(0.5 * CELL_SIZE, 9)
    expect(obb.centerZ).toBeCloseTo(0, 9)
  })
})

describe('aabbOfObb', () => {
  it('returns the OBB rectangle for a non-rotated OBB', () => {
    const obb: OBB = { centerX: 5, centerZ: 7, halfX: 3, halfZ: 4, theta: 0 }
    const aabb = aabbOfObb(obb)
    expect(aabb.minX).toBeCloseTo(2, 9)
    expect(aabb.maxX).toBeCloseTo(8, 9)
    expect(aabb.minZ).toBeCloseTo(3, 9)
    expect(aabb.maxZ).toBeCloseTo(11, 9)
  })

  it('expands to fit a 45-degree rotated OBB', () => {
    // A square OBB rotated 45 degrees has world AABB extent
    // halfX * sqrt(2) on each axis (since cos and sin are equal).
    const obb: OBB = { centerX: 0, centerZ: 0, halfX: 1, halfZ: 1, theta: Math.PI / 4 }
    const aabb = aabbOfObb(obb)
    expect(aabb.minX).toBeCloseTo(-Math.SQRT2, 9)
    expect(aabb.maxX).toBeCloseTo(Math.SQRT2, 9)
    expect(aabb.minZ).toBeCloseTo(-Math.SQRT2, 9)
    expect(aabb.maxZ).toBeCloseTo(Math.SQRT2, 9)
  })
})

describe('aabbsOverlap', () => {
  it('returns true for overlapping AABBs', () => {
    expect(
      aabbsOverlap(
        { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
        { minX: 5, maxX: 15, minZ: 5, maxZ: 15 },
      ),
    ).toBe(true)
  })

  it('returns false for AABBs separated on either axis', () => {
    expect(
      aabbsOverlap(
        { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
        { minX: 11, maxX: 20, minZ: 0, maxZ: 10 },
      ),
    ).toBe(false)
    expect(
      aabbsOverlap(
        { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
        { minX: 0, maxX: 10, minZ: 11, maxZ: 20 },
      ),
    ).toBe(false)
  })

  it('returns false for AABBs touching at an edge (strict comparison)', () => {
    expect(
      aabbsOverlap(
        { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
        { minX: 10, maxX: 20, minZ: 0, maxZ: 10 },
      ),
    ).toBe(false)
  })
})

describe('obbsOverlap', () => {
  it('returns true for two unit boxes at the same position', () => {
    const obb: OBB = { centerX: 0, centerZ: 0, halfX: 1, halfZ: 1, theta: 0 }
    expect(obbsOverlap(obb, obb)).toBe(true)
  })

  it('returns false for unit boxes separated past their half-extents', () => {
    const a: OBB = { centerX: 0, centerZ: 0, halfX: 1, halfZ: 1, theta: 0 }
    const b: OBB = { centerX: 3, centerZ: 0, halfX: 1, halfZ: 1, theta: 0 }
    expect(obbsOverlap(a, b)).toBe(false)
  })

  it('detects rotation-induced overlap that an axis-aligned check would miss', () => {
    // Two unit-square boxes at distance 1.2 along world x. Axis-
    // aligned, they are clearly disjoint (A's right edge at 0.5,
    // B's left edge at 0.7). Rotate B by 45 degrees: its diagonal
    // corner now reaches in to world x = 1.2 - sqrt(2)/2 ~= 0.493,
    // which is inside A's right edge at 0.5, so the two boxes
    // overlap.
    const a: OBB = { centerX: 0, centerZ: 0, halfX: 0.5, halfZ: 0.5, theta: 0 }
    const b: OBB = { centerX: 1.2, centerZ: 0, halfX: 0.5, halfZ: 0.5, theta: 0 }
    expect(obbsOverlap(a, b)).toBe(false)
    const bRotated: OBB = { ...b, theta: Math.PI / 4 }
    expect(obbsOverlap(a, bRotated)).toBe(true)
  })

  it('returns false for boxes whose world AABBs overlap but SAT finds a separating axis', () => {
    // Two parallel thin rectangles oriented at 30 degrees, offset
    // perpendicular to their length. Their world AABBs are large
    // (the rotation projects the long dimension onto both axes) so
    // the AABBs overlap heavily, but SAT projecting onto either
    // box's narrow local axis sees a clean separation.
    const a: OBB = {
      centerX: 0,
      centerZ: 0,
      halfX: 10,
      halfZ: 0.5,
      theta: Math.PI / 6,
    }
    const b: OBB = {
      centerX: 1,
      centerZ: 5,
      halfX: 10,
      halfZ: 0.5,
      theta: Math.PI / 6,
    }
    // Sanity: world AABBs do overlap (both span x ~[-9, 10], z ~[-5,
    // 10]).
    expect(aabbsOverlap(aabbOfObb(a), aabbOfObb(b))).toBe(true)
    // SAT: projecting onto a's narrow local z axis (-sin30, cos30)
    // separates them because the perpendicular offset (1, 5)
    // projects to ~3.83, outside the sum of half-z extents (1.0).
    expect(obbsOverlap(a, b)).toBe(false)
  })
})

describe('findOverlappingPiecePairs', () => {
  it('returns no pairs for a closed loop with no perturbations', () => {
    const pieces = [
      convertV1Piece({ type: 'right90', row: 0, col: 0, rotation: 0 }),
      convertV1Piece({ type: 'right90', row: 0, col: 1, rotation: 90 }),
      convertV1Piece({ type: 'right90', row: 1, col: 1, rotation: 180 }),
      convertV1Piece({ type: 'right90', row: 1, col: 0, rotation: 270 }),
    ]
    expect(findOverlappingPiecePairs(pieces)).toEqual([])
  })

  it('reports a pair when two pieces sit on the same cell', () => {
    const pieces = [
      convertV1Piece({ type: 'straight', row: 0, col: 0, rotation: 0 }),
      convertV1Piece({ type: 'straight', row: 0, col: 0, rotation: 90 }),
    ]
    expect(findOverlappingPiecePairs(pieces)).toEqual([{ a: 0, b: 1 }])
  })

  it('skips pairs that share no cell bucket', () => {
    const pieces = [
      convertV1Piece({ type: 'straight', row: 0, col: 0, rotation: 0 }),
      convertV1Piece({ type: 'straight', row: 5, col: 5, rotation: 0 }),
    ]
    expect(findOverlappingPiecePairs(pieces)).toEqual([])
  })

  it('flags a translation-only perturbation that puts an OBB into a neighbor cell', () => {
    // Two straights one cell apart in cardinal coords. Their OBBs
    // touch at the cell boundary, which the strict-inequality SAT
    // does not flag.
    const aBase = convertV1Piece({ type: 'straight', row: 0, col: 0, rotation: 0 })
    const bBase = convertV1Piece({ type: 'straight', row: 0, col: 1, rotation: 0 })
    expect(findOverlappingPiecePairs([aBase, bBase])).toEqual([])
    // Now translate piece a halfway into b's cell. The OBB anchors
    // on transform.x, so this works even though piece.col stays
    // at 0; the spatial hash buckets by world AABB cells (covering
    // both col 0 and col 1 once a's center is at world (10, 0)),
    // and SAT confirms the overlap.
    const aShifted = setPieceTransform(aBase, { x: CELL_SIZE / 2, z: 0, theta: 0 })
    expect(findOverlappingPiecePairs([aShifted, bBase])).toEqual([{ a: 0, b: 1 }])
    // A residual rotation that swings a's far endpoint toward b's
    // cell also produces overlap (no translation needed).
    const aRotated = rotatePieceAroundEndpoint(aBase, 0, Math.PI / 6)
    const overlaps = findOverlappingPiecePairs([aRotated, bBase])
    expect(overlaps).toEqual([{ a: 0, b: 1 }])
  })

  it('reports each pair only once even when they share multiple cells', () => {
    // Two mega-sweeps at the same anchor share several cells; the
    // pair should be returned exactly once thanks to seenPairs.
    const pieces = [
      convertV1Piece({ type: 'megaSweepRight', row: 0, col: 0, rotation: 0 }),
      convertV1Piece({ type: 'megaSweepRight', row: 0, col: 0, rotation: 0 }),
    ]
    const result = findOverlappingPiecePairs(pieces)
    expect(result).toEqual([{ a: 0, b: 1 }])
  })
})
