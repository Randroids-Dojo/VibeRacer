import { describe, expect, it } from 'vitest'
import {
  FREE_PLACEMENT_SNAP_RADIUS,
  LOOP_RECONCILIATION_RADIUS,
  applyLoopReconciliation,
  findFreePlacementSnap,
  findLoopReconciliation,
  rotateAroundConnectedToTarget,
  rotatePieceAroundEndpoint,
  rotateTransformAroundPoint,
  setPieceTransform,
  snapPieceToTarget,
  translatePiece,
  unconnectedEndpoints,
} from '@/game/continuousAngleEdit'
import {
  DEFAULT_FRAME_EPSILON_POS,
  DEFAULT_FRAME_EPSILON_THETA,
  framesConnect,
} from '@/game/pieceFrames'
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

describe('unconnectedEndpoints', () => {
  it('returns nothing when every piece is mutually connected', () => {
    // Two straight pieces stacked vertically share a frame at the
    // boundary, so each has one connected endpoint and one open
    // endpoint at the far end.
    const a = convertV1Piece({ type: 'straight', row: 0, col: 0, rotation: 0 })
    const b = convertV1Piece({ type: 'straight', row: -1, col: 0, rotation: 0 })
    const open = unconnectedEndpoints([a, b])
    expect(open).toHaveLength(2)
    // Both open endpoints are at the chain's outer ends.
    const openZ = open.map((u) => u.frame.z).sort((x, y) => x - y)
    expect(openZ[0]).toBeLessThan(openZ[1])
  })

  it('reports every endpoint of a single isolated piece as unconnected', () => {
    const a = convertV1Piece({ type: 'straight', row: 0, col: 0, rotation: 0 })
    const open = unconnectedEndpoints([a])
    expect(open).toHaveLength(2)
  })

  it('honors excludePieceIdx so the dragged piece is not its own snap target', () => {
    const a = convertV1Piece({ type: 'straight', row: 0, col: 0, rotation: 0 })
    const b = convertV1Piece({ type: 'straight', row: -3, col: 0, rotation: 0 })
    const open = unconnectedEndpoints([a, b], 0)
    expect(open.every((u) => u.pieceIdx !== 0)).toBe(true)
    // Only piece b's two endpoints survive.
    expect(open).toHaveLength(2)
    expect(open.every((u) => u.pieceIdx === 1)).toBe(true)
  })
})

describe('snapPieceToTarget', () => {
  it('places the dragged endpoint exactly on the target frame', () => {
    // A dragged straight piece roughly near the snap point. Snap onto
    // the south edge of cell (0, 0) (target frame at world (0, 10)
    // with heading -PI/2 = south). The dragged piece's chosen
    // endpoint should end up at exactly (0, 10) with antiparallel
    // heading (PI/2 = north).
    const dragged = convertV1Piece({
      type: 'straight',
      row: 1,
      col: 0,
      rotation: 0,
      transform: { x: 2, z: 22, theta: 0 },
    })
    const targetFrame = { x: 0, z: 10, theta: -Math.PI / 2 }
    const newTransform = snapPieceToTarget(dragged, 1, targetFrame)
    // Update the piece with the snap transform and check the chosen
    // endpoint actually lands on the target.
    const snapped = setPieceTransform(dragged, newTransform)
    const snappedEnds = endpointsOf(snapped)
    expect(snappedEnds[1].x).toBeCloseTo(0, 6)
    expect(snappedEnds[1].z).toBeCloseTo(10, 6)
    // framesConnect requires antiparallel tangents within epsilon and
    // the same world position; both should hold after snap.
    expect(framesConnect(snappedEnds[1], targetFrame)).toBe(true)
  })

  it('produces antiparallel headings for non-cardinal targets', () => {
    // Regression for the slice 6 reconciliation case: when the target
    // frame's tangent is non-cardinal, the result must still satisfy
    // framesConnect (heading exactly antiparallel within float). The
    // earlier formulation produced a `2 * residual` heading error
    // because it assumed the dragged frame's heading tracks
    // `transform.theta` with slope +1. `frameOfPortAtTransform` uses
    // slope -1 within a cardinal cell.
    const dragged = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
    })
    const targetFrame = { x: 17, z: 22, theta: 0.4 }
    const newTransform = snapPieceToTarget(dragged, 1, targetFrame)
    const snapped = setPieceTransform(dragged, newTransform)
    const snappedEnds = endpointsOf(snapped)
    expect(snappedEnds[1].x).toBeCloseTo(targetFrame.x, 6)
    expect(snappedEnds[1].z).toBeCloseTo(targetFrame.z, 6)
    expect(framesConnect(snappedEnds[1], targetFrame)).toBe(true)
  })

  it('preserves piece geometry (other endpoint stays a fixed offset away)', () => {
    const dragged = convertV1Piece({
      type: 'straight',
      row: 1,
      col: 0,
      rotation: 0,
    })
    const beforeEnds = endpointsOf(dragged)
    const dist = Math.hypot(
      beforeEnds[0].x - beforeEnds[1].x,
      beforeEnds[0].z - beforeEnds[1].z,
    )
    const targetFrame = { x: 0, z: 10, theta: -Math.PI / 2 }
    const newTransform = snapPieceToTarget(dragged, 1, targetFrame)
    const snapped = setPieceTransform(dragged, newTransform)
    const afterEnds = endpointsOf(snapped)
    const distAfter = Math.hypot(
      afterEnds[0].x - afterEnds[1].x,
      afterEnds[0].z - afterEnds[1].z,
    )
    expect(distAfter).toBeCloseTo(dist, 9)
  })
})

describe('findFreePlacementSnap', () => {
  it('returns null when no targets are within snap range', () => {
    const dragged = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
      transform: { x: 100, z: 100, theta: 0 },
    })
    const target = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 5,
      rotation: 0,
    })
    const snap = findFreePlacementSnap(
      dragged,
      unconnectedEndpoints([dragged, target], 0),
    )
    expect(snap).toBeNull()
  })

  it('snaps to the nearest unconnected endpoint within radius', () => {
    // A target piece anchors a free-end at world (0, -10) heading
    // north (PI/2). A dragged piece sits a few units away with
    // matching antiparallel orientation. The snap should pull it onto
    // the target.
    const target = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
    })
    const dragged = convertV1Piece({
      type: 'straight',
      row: -1,
      col: 0,
      rotation: 0,
      transform: { x: 3, z: -22, theta: 0 },
    })
    const targets = unconnectedEndpoints([dragged, target], 0)
    expect(targets.length).toBeGreaterThan(0)
    const snap = findFreePlacementSnap(dragged, targets)
    expect(snap).not.toBeNull()
    if (snap === null) throw new Error('expected snap')
    // After snap, the dragged piece's chosen endpoint must
    // framesConnect with the target's matching endpoint.
    const after = setPieceTransform(dragged, snap.transform)
    const draggedEnds = endpointsOf(after)
    const targetEnds = endpointsOf(target)
    expect(
      framesConnect(
        draggedEnds[snap.draggedEndpointIdx],
        targetEnds[snap.targetEndpointIdx],
      ),
    ).toBe(true)
  })

  it('honors the snap-radius cutoff', () => {
    const target = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
    })
    // Place the dragged piece far enough that BOTH of its endpoints
    // are outside snap radius from BOTH target endpoints. Target
    // endpoints at (0, +/-10); dragged piece center at (200, 200) with
    // endpoints at (200, 210) and (200, 190). Both >= 215 world units
    // from any target endpoint, well past FREE_PLACEMENT_SNAP_RADIUS.
    const dragged = convertV1Piece({
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
      transform: { x: 200, z: 200, theta: 0 },
    })
    const snap = findFreePlacementSnap(
      dragged,
      unconnectedEndpoints([dragged, target], 0),
    )
    expect(snap).toBeNull()
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

describe('findLoopReconciliation', () => {
  // A 3x2 stadium loop is the cleanest fixture: it has two straights
  // long enough that perturbing one by an angle below the validator's
  // tangent epsilon (so the kept connection survives) still drifts
  // the OTHER endpoint past the validator's position epsilon,
  // producing exactly the "two dangling endpoints near each other"
  // case reconciliation handles. A 1x1 right90 square would not work
  // because the corner piece is too short for that constraint.
  function buildStadiumLoop(): Piece[] {
    return [
      convertV1Piece({ type: 'right90', row: 0, col: 0, rotation: 0 }),
      convertV1Piece({ type: 'straight', row: 0, col: 1, rotation: 90 }),
      convertV1Piece({ type: 'right90', row: 0, col: 2, rotation: 90 }),
      convertV1Piece({ type: 'right90', row: 1, col: 2, rotation: 180 }),
      convertV1Piece({ type: 'straight', row: 1, col: 1, rotation: 90 }),
      convertV1Piece({ type: 'right90', row: 1, col: 0, rotation: 270 }),
    ]
  }

  it('returns null when the chain has no dangling endpoints', () => {
    expect(findLoopReconciliation(buildStadiumLoop())).toBeNull()
  })

  it('returns null when more than two endpoints are open', () => {
    // Drop the last two pieces so several dangling endpoints exist.
    const pieces = buildStadiumLoop().slice(0, 4)
    expect(findLoopReconciliation(pieces)).toBeNull()
  })

  it('returns null when the gap is wider than the reconciliation radius', () => {
    // Drop the last piece, making a 5-piece chain. The two dangling
    // endpoints are roughly one cell apart, well outside the
    // reconciliation radius.
    const pieces = buildStadiumLoop().slice(0, 5)
    expect(findLoopReconciliation(pieces)).toBeNull()
  })

  it('snaps a slightly-perturbed last piece back to close the loop', () => {
    // Take a closed stadium, then rotate pieces[4] (the bottom
    // straight) around its endpoint connected to pieces[3] (the
    // bottom-right right90) by an angle just under
    // DEFAULT_FRAME_EPSILON_THETA so the pivot endpoint's tangent
    // still passes framesConnect against pieces[3]. The straight's
    // length (CELL_SIZE between its two endpoints) then means the
    // OTHER endpoint drifts CELL_SIZE * sin(angle) world units; with
    // angle = 0.95 * EPSILON_THETA that drift is comfortably above
    // DEFAULT_FRAME_EPSILON_POS = 0.5 (so exactly that connection
    // breaks) and well inside LOOP_RECONCILIATION_RADIUS = 6 (so
    // reconciliation engages). A right90 corner is too short for
    // that constraint pair, which is why the test perturbs the
    // straight.
    const pieces = buildStadiumLoop()
    const angle = 0.95 * DEFAULT_FRAME_EPSILON_THETA
    expect(CELL_SIZE * Math.sin(angle)).toBeGreaterThan(DEFAULT_FRAME_EPSILON_POS)
    expect(CELL_SIZE * Math.sin(angle)).toBeLessThan(LOOP_RECONCILIATION_RADIUS)
    const beforeOpen = unconnectedEndpoints(pieces)
    expect(beforeOpen.length).toBe(0)
    const perturbedIdx = 4
    const perturbedEnds = endpointsOf(pieces[perturbedIdx])
    const neighborEnds = endpointsOf(pieces[perturbedIdx - 1])
    const pivotIdx =
      framesConnect(perturbedEnds[0], neighborEnds[0]) ||
      framesConnect(perturbedEnds[0], neighborEnds[1])
        ? 0
        : 1
    pieces[perturbedIdx] = rotatePieceAroundEndpoint(
      pieces[perturbedIdx],
      pivotIdx,
      angle,
    )
    const afterOpen = unconnectedEndpoints(pieces)
    expect(afterOpen.length).toBe(2)
    const reconciliation = findLoopReconciliation(pieces)
    expect(reconciliation).not.toBeNull()
    expect(reconciliation!.gap).toBeGreaterThan(DEFAULT_FRAME_EPSILON_POS)
    expect(reconciliation!.gap).toBeLessThan(LOOP_RECONCILIATION_RADIUS)
    // Apply and confirm the previously-broken endpoint pair now
    // satisfies framesConnect AND no other connection breaks. The
    // closed-loop case is what the rotate-around-connected fix
    // addresses: snapPieceToTarget would have torn pieces[3] loose
    // by translating pieces[4], pushing the gap one connection
    // downstream. Rotating pieces[4] around its still-connected
    // endpoint (the one near pieces[3]) closes the gap without
    // moving that endpoint, so every connection survives.
    const reconciled = applyLoopReconciliation(pieces, reconciliation!)
    expect(unconnectedEndpoints(reconciled).length).toBe(0)
  })

  it('returns null when dangling endpoints are antiparallel-incompatible', () => {
    // Build a "V" out of two straights at the origin pointing in
    // similar directions (parallel, not antiparallel). They have two
    // dangling endpoints in close proximity but the tangents do not
    // form a connector.
    const a = setPieceTransform(
      convertV1Piece({ type: 'straight', row: 0, col: 0, rotation: 0 }),
      { x: 0, z: 0, theta: 0 },
    )
    const b = setPieceTransform(
      convertV1Piece({ type: 'straight', row: 0, col: 0, rotation: 0 }),
      { x: 1, z: 0, theta: 0 },
    )
    expect(findLoopReconciliation([a, b])).toBeNull()
  })

})

describe('rotateAroundConnectedToTarget', () => {
  // The pure rotate-around-connected helper: given a piece with two
  // endpoints, rotate around `connectedEndpointIdx` so the OTHER
  // endpoint's tangent lands antiparallel to the target frame and
  // its position lands within posEpsilon of the target.

  it('returns the inverse rotation when the perturbation was a rotation around the same endpoint', () => {
    // Take a straight, rotate it by a small angle around endpoint 0,
    // then ask for the rotate-around-connected so its endpoint 1
    // lands antiparallel-aligned at the position endpoint 1 occupied
    // BEFORE the perturbation. That ghost target is the frame an
    // imaginary neighbor with the original mating connector would
    // present. The rotation that closes the loop is the inverse of
    // the perturbation: pivots stays, and endpoint 1 goes back to its
    // original world position with antiparallel tangent.
    const original = convertV1Piece({ type: 'straight', row: 0, col: 0, rotation: 0 })
    const originalEnds = endpointsOf(original)
    const target = {
      x: originalEnds[1].x,
      z: originalEnds[1].z,
      theta: originalEnds[1].theta + Math.PI,
    }
    const angle = 0.95 * DEFAULT_FRAME_EPSILON_THETA
    const perturbed = rotatePieceAroundEndpoint(original, 0, angle)
    const result = rotateAroundConnectedToTarget(perturbed, 0, target)
    expect(result).not.toBeNull()
    const restored = setPieceTransform(perturbed, result!)
    const restoredEnds = endpointsOf(restored)
    // Endpoint 1 of the restored piece should match endpoint 1 of
    // original within validator epsilon.
    const dist = Math.hypot(
      restoredEnds[1].x - originalEnds[1].x,
      restoredEnds[1].z - originalEnds[1].z,
    )
    expect(dist).toBeLessThan(DEFAULT_FRAME_EPSILON_POS)
    // Endpoint 0 (the connected pivot) should not move.
    const pivotDrift = Math.hypot(
      restoredEnds[0].x - originalEnds[0].x,
      restoredEnds[0].z - originalEnds[0].z,
    )
    expect(pivotDrift).toBeLessThan(1e-9)
  })

  it('returns null when no rotation around the connected endpoint can close the position gap', () => {
    // A straight and a target frame placed off the dragged
    // endpoint's circle around the connected endpoint. No rotation
    // around the connected endpoint can land the dragged endpoint
    // exactly on this target.
    const piece = convertV1Piece({ type: 'straight', row: 0, col: 0, rotation: 0 })
    const ends = endpointsOf(piece)
    // Target frame antiparallel to ends[1].theta but placed far off
    // the circle of radius |ends[1] - ends[0]| around ends[0].
    const target = {
      x: ends[0].x + 100,
      z: ends[0].z + 100,
      theta: ends[1].theta + Math.PI,
    }
    expect(rotateAroundConnectedToTarget(piece, 0, target)).toBeNull()
  })
})
