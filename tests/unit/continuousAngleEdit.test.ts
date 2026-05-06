import { describe, expect, it } from 'vitest'
import {
  rotatePieceAroundEndpoint,
  rotateTransformAroundPoint,
  setPieceTransform,
  translatePiece,
} from '@/game/continuousAngleEdit'
import { convertV1Piece } from '@/lib/trackVersion'
import { endpointsOf, isV1Projectable, transformOf } from '@/game/pieceGeometry'
import { footprintCells } from '@/game/trackFootprint'
import { CELL_SIZE } from '@/game/cellSize'
import type { Piece } from '@/lib/schemas'

describe('rotateTransformAroundPoint', () => {
  it('returns the input transform identity when deltaTheta is 0', () => {
    const transform = { x: 12.3, z: -4.5, theta: Math.PI / 7 }
    const result = rotateTransformAroundPoint(transform, { x: 0, z: 0 }, 0)
    expect(result).toBe(transform)
  })

  it('rotates the transform around a non-origin pivot', () => {
    const transform = { x: 30, z: 10, theta: 0 }
    const pivot = { x: 10, z: 10 }
    const out = rotateTransformAroundPoint(transform, pivot, Math.PI / 2)
    expect(out.x).toBeCloseTo(10, 9)
    expect(out.z).toBeCloseTo(30, 9)
    expect(out.theta).toBeCloseTo(Math.PI / 2, 9)
  })

  it('accumulates theta on the output', () => {
    const transform = { x: 0, z: 0, theta: Math.PI / 6 }
    const out = rotateTransformAroundPoint(transform, { x: 0, z: 0 }, Math.PI / 3)
    expect(out.theta).toBeCloseTo(Math.PI / 2, 12)
  })
})

describe('rotatePieceAroundEndpoint', () => {
  it('keeps the chosen endpoint at the same world position', () => {
    // A straight piece at (col=2, row=0, rotation=0): south endpoint at
    // (40, 10), north endpoint at (40, -10). Rotate around the north
    // endpoint by 14 degrees and check it has not moved while the
    // piece's transform tracked.
    const piece = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 2,
      rotation: 0,
    })
    const before = endpointsOf(piece)
    // Rotate around endpoint 1 (the north exit). Endpoint 0 is the
    // south entry that should swing under the rotation.
    const pivotIndex = 1
    const otherIdx = 0
    const pivot = before[pivotIndex]
    const delta = (14 * Math.PI) / 180
    const rotated = rotatePieceAroundEndpoint(piece, pivotIndex, delta)
    const after = endpointsOf(rotated)
    expect(after[pivotIndex].x).toBeCloseTo(pivot.x, 9)
    expect(after[pivotIndex].z).toBeCloseTo(pivot.z, 9)
    // The OTHER endpoint must rotate. Distance from pivot must be
    // preserved (rigid rotation), but position must differ from before.
    const distBefore = Math.hypot(
      before[otherIdx].x - pivot.x,
      before[otherIdx].z - pivot.z,
    )
    const distAfter = Math.hypot(
      after[otherIdx].x - pivot.x,
      after[otherIdx].z - pivot.z,
    )
    expect(distAfter).toBeCloseTo(distBefore, 9)
    expect(
      Math.hypot(
        after[otherIdx].x - before[otherIdx].x,
        after[otherIdx].z - before[otherIdx].z,
      ),
    ).toBeGreaterThan(0.1)
  })

  it('updates transform.theta by exactly deltaTheta', () => {
    const piece = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 90,
    })
    const t0 = transformOf(piece).theta
    const delta = 0.123
    const rotated = rotatePieceAroundEndpoint(piece, 0, delta)
    expect(transformOf(rotated).theta).toBeCloseTo(t0 + delta, 12)
  })

  it('produces a non-projectable transform for non-cardinal deltas', () => {
    const piece = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
    })
    const rotated = rotatePieceAroundEndpoint(piece, 0, 0.05)
    expect(isV1Projectable(rotated)).toBe(false)
    // The runtime now handles non-projectable pieces directly.
    expect(rotated.transform).toBeDefined()
  })

  it('throws when the endpoint index is out of range', () => {
    const piece = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
    })
    expect(() => rotatePieceAroundEndpoint(piece, 5, 0.1)).toThrow(/endpoint/i)
  })
})

describe('endpoints stay one cell apart across many rotations', () => {
  // PR #105 follow-up: the user reported rotate-handle rings rendering
  // several cells apart for a single-cell straight whose endpoints
  // should be exactly CELL_SIZE apart in world space. This test
  // simulates many sequential rotate-around-endpoint calls (each
  // alternating which endpoint is the pivot, the way the editor
  // dispatches them) and asserts the world distance between the two
  // endpoints stays at CELL_SIZE within float tolerance. If this
  // diverges, the rotation math has a bug; if it passes, the bug
  // lives in the renderer.
  it('preserves endpoint distance across alternating rotations', () => {
    let piece = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
    })
    for (let i = 0; i < 50; i++) {
      const pivotIndex = i % 2 === 0 ? 0 : 1
      const delta = (i + 1) * 0.137 // arbitrary non-cardinal increments
      piece = rotatePieceAroundEndpoint(piece, pivotIndex, delta)
      const [a, b] = endpointsOf(piece)
      const dist = Math.hypot(a.x - b.x, a.z - b.z)
      expect(dist).toBeCloseTo(CELL_SIZE, 6)
    }
  })

  it('preserves endpoint distance at multi-revolution thetas', () => {
    const piece = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
    })
    // Apply a single huge rotation (multiple revolutions) around
    // endpoint 0. Endpoints must still be CELL_SIZE apart.
    const rotated = rotatePieceAroundEndpoint(piece, 0, 7.5)
    const [a, b] = endpointsOf(rotated)
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(CELL_SIZE, 6)
  })

  it('preserves endpoint distance for the editor drag flow on a non-cardinal piece', () => {
    // Reproduce the editor's exact drag flow: each pointer-move computes
    // a cumulative delta (relative to drag start), then calls
    // rotatePieceAroundEndpoint(startPiece, pivotIndex, cumulativeDelta).
    // Pointer-up commits the final preview, which becomes the new
    // committed piece. The next drag starts from that committed piece.
    let piece = convertV1Piece({
      type: 'straight',
      row: 5,
      col: 5,
      rotation: 0,
    })
    // Three sequential drags, each with a sweep ending at a non-cardinal
    // delta and alternating which endpoint is the pivot.
    const drags: Array<{ pivot: number; finalDelta: number }> = [
      { pivot: 0, finalDelta: 0.95 },
      { pivot: 1, finalDelta: -1.7 },
      { pivot: 0, finalDelta: 2.3 },
    ]
    for (const drag of drags) {
      const startPiece = piece
      // Simulate intermediate pointer-move events building toward finalDelta.
      const steps = 6
      for (let s = 1; s <= steps; s++) {
        const cumulative = (drag.finalDelta * s) / steps
        const preview = rotatePieceAroundEndpoint(
          startPiece,
          drag.pivot,
          cumulative,
        )
        const [a, b] = endpointsOf(preview)
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(CELL_SIZE, 6)
      }
      // Pointer-up commits the final preview.
      piece = rotatePieceAroundEndpoint(startPiece, drag.pivot, drag.finalDelta)
      const [a, b] = endpointsOf(piece)
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(CELL_SIZE, 6)
    }
  })
})

describe('translatePiece', () => {
  it('returns the input piece identity when both deltas are zero', () => {
    const piece = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
    })
    expect(translatePiece(piece, 0, 0)).toBe(piece)
  })

  it('shifts transform.x and transform.z while leaving theta untouched', () => {
    const piece = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
    })
    const moved = translatePiece(piece, 5, -3)
    const t = transformOf(moved)
    expect(t.x).toBe(5)
    expect(t.z).toBe(-3)
    expect(t.theta).toBe(0)
  })

  it('snaps cell fields to the projection when the result is v1-projectable', () => {
    // Translating by exactly CELL_SIZE keeps the piece on the grid; the
    // converter inside translatePiece re-derives (row, col) so the
    // legacy fields stay consistent.
    const piece = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
    })
    const moved = translatePiece(piece, CELL_SIZE, 0)
    expect(moved.col).toBe(1)
    expect(moved.row).toBe(0)
    expect(moved.transform).toEqual({ x: CELL_SIZE, z: 0, theta: 0 })
  })
})

describe('custom footprint rotation', () => {
  // Stage 2 Workstream B regression (PR #104 review): when the editor's
  // continuous-angle helpers change a piece's transform, any custom
  // `piece.footprint` array must rotate alongside the transform so
  // `footprintCells()`, duplicate-cell validation, hit-testing, and
  // canonical hashing all see the piece occupying the right world
  // cells. Without this a 90-degree rotate-around-endpoint would mutate
  // the transform while leaving footprint offsets keyed off the prior
  // orientation, silently corrupting validation.
  it('rotates a custom footprint by the cardinal turn delta', () => {
    // A two-cell horizontal footprint at rotation 0. After rotating to
    // theta = PI/2 (one cardinal turn CW) the footprint should also
    // rotate: (0, 0) stays put, (0, 1) maps to (1, 0).
    const piece: Piece = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
      footprint: [
        { dr: 0, dc: 0 },
        { dr: 0, dc: 1 },
      ],
    })
    const before = footprintCells(piece)
    expect(before).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ])
    const rotated = setPieceTransform(piece, {
      x: 0,
      z: 0,
      theta: Math.PI / 2,
    })
    const after = footprintCells(rotated)
    expect(after).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 0 },
    ])
  })

  it('leaves the footprint untouched when the cardinal turn does not change', () => {
    // A non-cardinal rotation (residual 0.05 rad on top of the same
    // cardinal multiple) should keep the cardinal-snapped footprint
    // bit-identical, since the snapped turn count is unchanged.
    const piece = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
      footprint: [
        { dr: 0, dc: 0 },
        { dr: 0, dc: 1 },
      ],
    })
    const rotated = setPieceTransform(piece, { x: 0, z: 0, theta: 0.05 })
    expect(rotated.footprint).toEqual(piece.footprint)
  })

  it('rotates by the full cardinal delta for a 270-degree turn', () => {
    // PI * 3 / 2 is three CW turns from rotation 0. (0, 1) should land
    // at (-1, 0) after three rotations: (0,1) -> (1,0) -> (0,-1) ->
    // (-1, 0).
    const piece = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
      footprint: [
        { dr: 0, dc: 0 },
        { dr: 0, dc: 1 },
      ],
    })
    const rotated = setPieceTransform(piece, {
      x: 0,
      z: 0,
      theta: (3 * Math.PI) / 2,
    })
    expect(footprintCells(rotated)).toEqual([
      { row: -1, col: 0 },
      { row: 0, col: 0 },
    ])
  })

  it('leaves a default (undefined) footprint untouched', () => {
    const piece = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
    })
    expect(piece.footprint).toBeUndefined()
    const rotated = setPieceTransform(piece, {
      x: 0,
      z: 0,
      theta: Math.PI / 2,
    })
    expect(rotated.footprint).toBeUndefined()
  })
})

describe('setPieceTransform', () => {
  it('replaces the transform wholesale and runs the v1 to v2 converter', () => {
    const piece: Piece = {
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
    }
    const placed = setPieceTransform(piece, {
      x: 3 * CELL_SIZE,
      z: 5 * CELL_SIZE,
      theta: Math.PI,
    })
    expect(placed.transform).toEqual({
      x: 3 * CELL_SIZE,
      z: 5 * CELL_SIZE,
      theta: Math.PI,
    })
    // v1-projectable input: cell fields update.
    expect(placed.col).toBe(3)
    expect(placed.row).toBe(5)
    expect(placed.rotation).toBe(180)
  })
})
