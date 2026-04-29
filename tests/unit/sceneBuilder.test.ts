import { describe, it, expect } from 'vitest'
import { buildTrackPath } from '@/game/trackPath'
import { pieceGeometry } from '@/game/sceneBuilder'
import { validateClosedLoop } from '@/game/track'
import type { Piece } from '@/lib/schemas'

// Regression for the bug where sweep / S-curve pieces rendered as invisible
// road on /santi: polylineGeometry's triangle winding produced -Y face normals,
// and FrontSide back-face culling hid the entire ribbon. The fix flips the
// winding so the first triangle of every segment has a +Y face normal.
//
// We only check the first triangle of each segment because a few microtriangles
// at the inside apex of a sweep can still flip when the bezier curvature is
// sharper than the track half-width (the ribbon folds onto itself for ~0.1 m).
// DoubleSide on the road material covers those.
function entrySegmentNy(geom: ReturnType<typeof pieceGeometry>): number {
  const pos = geom.getAttribute('position')
  const idx = geom.getIndex()!
  const a = idx.getX(0)
  const b = idx.getX(1)
  const c = idx.getX(2)
  const ax = pos.getX(a), az = pos.getZ(a)
  const bx = pos.getX(b), bz = pos.getZ(b)
  const cx = pos.getX(c), cz = pos.getZ(c)
  const ux = bx - ax, uz = bz - az
  const vx = cx - ax, vz = cz - az
  return uz * vx - ux * vz
}

describe('pieceGeometry face normals', () => {
  it('every piece on the default track produces a +Y entry triangle', () => {
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
    const path = buildTrackPath(defaultLoop)
    for (const op of path.order) {
      expect(entrySegmentNy(pieceGeometry(op))).toBeGreaterThan(0)
    }
  })

  it('every sweep / scurve on /santi produces a +Y entry triangle', () => {
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
    const path = buildTrackPath(santi)
    expect(path.order.length).toBe(santi.length)
    for (const op of path.order) {
      const ny = entrySegmentNy(pieceGeometry(op))
      expect(ny, `${op.piece.type} rot=${op.piece.rotation} at (${op.piece.row},${op.piece.col})`).toBeGreaterThan(0)
    }
  })
})
