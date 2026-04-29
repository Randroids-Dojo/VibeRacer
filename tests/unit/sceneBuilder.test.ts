import { describe, it, expect } from 'vitest'
import { buildTrackPath } from '@/game/trackPath'
import { pieceGeometry } from '@/game/sceneBuilder'
import { validateClosedLoop } from '@/game/track'
import type { Piece } from '@/lib/schemas'

// Regression for the bug where sweep / S-curve pieces rendered as invisible
// road on /santi: polylineGeometry's triangle winding produced -Y face normals,
// FrontSide back-face culling hid the ribbon, and on top of that the sweep
// bezier curled tighter than the track half-width so the extruded ribbon
// folded onto itself at the apex (visible as z-fighting and a thin seam once
// the ribbon was made visible).
//
// We exclude the scurve piece because its arc radius is intentionally below
// the track half-width to keep the bump inside the cell; that interaction is
// a separate design tension tracked elsewhere.
function expectAllTrianglesFaceUp(pieces: Piece[]) {
  const path = buildTrackPath(pieces)
  for (const op of path.order) {
    if (op.piece.type === 'scurve' || op.piece.type === 'scurveLeft') continue
    const geom = pieceGeometry(op)
    const pos = geom.getAttribute('position')
    const idx = geom.getIndex()!
    const triCount = idx.count / 3
    for (let t = 0; t < triCount; t++) {
      const a = idx.getX(t * 3)
      const b = idx.getX(t * 3 + 1)
      const c = idx.getX(t * 3 + 2)
      const ax = pos.getX(a), az = pos.getZ(a)
      const bx = pos.getX(b), bz = pos.getZ(b)
      const cx = pos.getX(c), cz = pos.getZ(c)
      const ux = bx - ax, uz = bz - az
      const vx = cx - ax, vz = cz - az
      const ny = uz * vx - ux * vz
      expect(
        ny,
        `triangle ${t} on ${op.piece.type} rot=${op.piece.rotation} at (${op.piece.row},${op.piece.col})`,
      ).toBeGreaterThan(0)
    }
  }
}

describe('pieceGeometry face normals', () => {
  it('every triangle on the default track faces up', () => {
    const defaultLoop: Piece[] = [
      { type: 'straight', row: 1, col: 0, rotation: 0 },
      { type: 'right90', row: 0, col: 0, rotation: 0 },
      { type: 'straight', row: 0, col: 1, rotation: 90 },
      { type: 'right90', row: 0, col: 2, rotation: 90 },
      { type: 'straight', row: 1, col: 2, rotation: 0 },
      { type: 'right90', row: 2, col: 2, rotation: 180 },
      { type: 'straight', row: 2, col: 1, rotation: 90 },
      { type: 'right90', row: 2, col: 0, rotation: 270 },
    ]
    expect(validateClosedLoop(defaultLoop).ok).toBe(true)
    expectAllTrianglesFaceUp(defaultLoop)
  })

  it('every triangle on the saved /santi track faces up', () => {
    // Saved /santi pieces: many sweepRight / sweepLeft, one scurve. Before the
    // fix every sample-based entry triangle had ny < 0; after the fix every
    // one has ny > 0.
    const santi: Piece[] = [
      { type: 'straight', row: -2, col: -1, rotation: 90 },
      { type: 'straight', row: -2, col: 0, rotation: 90 },
      { type: 'straight', row: -2, col: 1, rotation: 90 },
      { type: 'straight', row: -2, col: 2, rotation: 90 },
      { type: 'straight', row: -2, col: 3, rotation: 90 },
      { type: 'straight', row: -2, col: 4, rotation: 90 },
      { type: 'straight', row: -1, col: 4, rotation: 270 },
      { type: 'straight', row: -1, col: 3, rotation: 270 },
      { type: 'right90', row: -1, col: 2, rotation: 0 },
      { type: 'straight', row: 0, col: 2, rotation: 0 },
      { type: 'sweepLeft', row: 1, col: 2, rotation: 180 },
      { type: 'sweepRight', row: 1, col: 3, rotation: 180 },
      { type: 'sweepRight', row: 0, col: 3, rotation: 0 },
      { type: 'straight', row: 0, col: 4, rotation: 90 },
      { type: 'sweepRight', row: 0, col: 5, rotation: 90 },
      { type: 'sweepRight', row: -2, col: 5, rotation: 90 },
      { type: 'sweepRight', row: -1, col: 5, rotation: 180 },
      { type: 'straight', row: 1, col: 5, rotation: 180 },
      { type: 'sweepLeft', row: 2, col: 5, rotation: 90 },
      { type: 'straight', row: 2, col: 4, rotation: 270 },
      { type: 'straight', row: 2, col: 3, rotation: 270 },
      { type: 'straight', row: 2, col: 2, rotation: 270 },
      { type: 'sweepRight', row: 2, col: 1, rotation: 270 },
      { type: 'sweepRight', row: 1, col: 1, rotation: 90 },
      { type: 'straight', row: 1, col: 0, rotation: 270 },
      { type: 'straight', row: 1, col: -1, rotation: 270 },
      { type: 'sweepRight', row: 1, col: -2, rotation: 270 },
      { type: 'sweepRight', row: 0, col: -2, rotation: 0 },
      { type: 'sweepRight', row: 0, col: -1, rotation: 180 },
      { type: 'sweepRight', row: -1, col: -1, rotation: 90 },
      { type: 'scurve', row: -1, col: -2, rotation: 270 },
      { type: 'straight', row: -1, col: -3, rotation: 270 },
      { type: 'sweepRight', row: -1, col: -4, rotation: 270 },
      { type: 'sweepRight', row: -2, col: -4, rotation: 0 },
      { type: 'straight', row: -2, col: -3, rotation: 270 },
      { type: 'straight', row: -2, col: -2, rotation: 270 },
    ]
    expect(validateClosedLoop(santi).ok).toBe(true)
    expectAllTrianglesFaceUp(santi)
  })

  it('sweep entry / exit road corners land exactly on the cell edge', () => {
    // Regression for the thin grass seam at every sweep boundary on /santi.
    // polylineGeometry used to compute the perpendicular by differencing
    // neighbouring samples; with the new wider sweep bezier sample[1] has a
    // small lateral offset, so the entry vertices ended up rotated ~2° and
    // shifted ~0.12 units off the connecting piece's edge. Using each
    // sample's analytical heading instead lands them exactly on the edge.
    const sweepLoop: Piece[] = [
      { type: 'sweepRight', row: 0, col: 0, rotation: 0 },
      { type: 'right90', row: 0, col: 1, rotation: 90 },
      { type: 'right90', row: 1, col: 1, rotation: 180 },
      { type: 'right90', row: 1, col: 0, rotation: 270 },
    ]
    expect(validateClosedLoop(sweepLoop).ok).toBe(true)
    const path = buildTrackPath(sweepLoop)
    const sweep = path.order.find((o) => o.piece.type === 'sweepRight')!
    const geom = pieceGeometry(sweep)
    const pos = geom.getAttribute('position')
    const last = pos.count - 1
    // Entry: south edge of cell (0, 0) at z = +CELL/2 = 10. Road corners at
    // x = ±TRACK_WIDTH/2 = ±4.
    expect(pos.getZ(0)).toBeCloseTo(10, 9)
    expect(pos.getZ(1)).toBeCloseTo(10, 9)
    expect(Math.abs(pos.getX(0))).toBeCloseTo(4, 9)
    expect(Math.abs(pos.getX(1))).toBeCloseTo(4, 9)
    // Exit: east edge of cell (0, 0) at x = +CELL/2 = 10. Road corners at
    // z = ±TRACK_WIDTH/2 = ±4.
    expect(pos.getX(last - 1)).toBeCloseTo(10, 9)
    expect(pos.getX(last)).toBeCloseTo(10, 9)
    expect(Math.abs(pos.getZ(last - 1))).toBeCloseTo(4, 9)
    expect(Math.abs(pos.getZ(last))).toBeCloseTo(4, 9)
  })
})
