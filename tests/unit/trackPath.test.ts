import { describe, it, expect } from 'vitest'
import { opposite, validateClosedLoop } from '@/game/track'
import {
  CELL_SIZE,
  TRACK_WIDTH,
  buildTrackPath,
  computeCpTriggerPieceIdx,
  distanceToCenterline,
} from '@/game/trackPath'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import type { Piece } from '@/lib/schemas'

describe('DEFAULT_TRACK_PIECES', () => {
  it('forms a valid closed loop', () => {
    expect(validateClosedLoop(DEFAULT_TRACK_PIECES).ok).toBe(true)
  })
})

describe('buildTrackPath', () => {
  it('orders every piece exactly once', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    expect(path.order.length).toBe(DEFAULT_TRACK_PIECES.length)
    const cells = new Set(path.order.map((o) => `${o.piece.row},${o.piece.col}`))
    expect(cells.size).toBe(DEFAULT_TRACK_PIECES.length)
  })

  it('neighboring pieces share opposite connectors', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    for (let i = 0; i < path.order.length; i++) {
      const cur = path.order[i]
      const next = path.order[(i + 1) % path.order.length]
      expect(next.entryDir).toBe(opposite(cur.exitDir))
    }
  })

  it('spawn stays inside piece 0 and on the centerline for a straight start', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const first = path.order[0]
    expect(first.piece.type).toBe('straight')
    expect(distanceToCenterline(first, path.spawn.position.x, path.spawn.position.z))
      .toBeLessThan(0.01)
    const cellX = first.piece.col * CELL_SIZE
    const cellZ = first.piece.row * CELL_SIZE
    expect(Math.abs(path.spawn.position.x - cellX)).toBeLessThanOrEqual(CELL_SIZE / 2)
    expect(Math.abs(path.spawn.position.z - cellZ)).toBeLessThanOrEqual(CELL_SIZE / 2)
  })

  it('spawn and finish line both sit on the arc when piece 0 is a corner', () => {
    // A minimal closed loop whose first piece is a right90: square of four right90s.
    const squarePieces: Piece[] = [
      { type: 'right90', row: 0, col: 0, rotation: 0 },
      { type: 'right90', row: 0, col: 1, rotation: 90 },
      { type: 'right90', row: 1, col: 1, rotation: 180 },
      { type: 'right90', row: 1, col: 0, rotation: 270 },
    ]
    expect(validateClosedLoop(squarePieces).ok).toBe(true)
    const path = buildTrackPath(squarePieces)
    const first = path.order[0]
    expect(first.piece.type).toBe('right90')
    expect(
      distanceToCenterline(first, path.spawn.position.x, path.spawn.position.z),
    ).toBeLessThan(0.01)
    expect(
      distanceToCenterline(
        first,
        path.finishLine.position.x,
        path.finishLine.position.z,
      ),
    ).toBeLessThan(0.01)
    // Finish line heading differs from spawn heading because the arc tangent
    // has rotated between inset 2 and inset 5.
    expect(path.finishLine.heading).not.toBeCloseTo(path.spawn.heading, 2)
  })

  it('cellToOrderIdx covers every piece', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    for (let i = 0; i < path.order.length; i++) {
      const p = path.order[i].piece
      expect(path.cellToOrderIdx.get(`${p.row},${p.col}`)).toBe(i)
    }
  })

  it('centers are one CELL_SIZE apart along the loop', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    for (let i = 0; i < path.order.length; i++) {
      const a = path.order[i].center
      const b = path.order[(i + 1) % path.order.length].center
      const d = Math.hypot(a.x - b.x, a.z - b.z)
      expect(d).toBeCloseTo(CELL_SIZE, 6)
    }
  })
})

describe('OrderedPiece.arcCenter', () => {
  it('corners get arcCenter at the cell corner where the open edges meet', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const corner = path.order.find((o) => o.piece.type !== 'straight')!
    expect(corner.arcCenter).not.toBeNull()
    const { cx, cz } = corner.arcCenter!
    const dx = Math.abs(cx - corner.center.x)
    const dz = Math.abs(cz - corner.center.z)
    expect(dx).toBeCloseTo(CELL_SIZE / 2, 6)
    expect(dz).toBeCloseTo(CELL_SIZE / 2, 6)
  })

  it('straights have arcCenter null', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const straight = path.order.find((o) => o.piece.type === 'straight')!
    expect(straight.arcCenter).toBeNull()
  })
})

describe('TRACK_WIDTH fits inside the cell', () => {
  it('leaves non-zero inner radius for corner annulus', () => {
    expect(CELL_SIZE / 2 - TRACK_WIDTH / 2).toBeGreaterThan(0)
  })
})

describe('computeCpTriggerPieceIdx', () => {
  it('matches one-CP-per-piece when K equals piece count', () => {
    const M = 8
    const idx = computeCpTriggerPieceIdx(M)
    expect(idx).toEqual([1, 2, 3, 4, 5, 6, 7, 0])
  })

  it('distributes 4 CPs evenly across an 8-piece loop', () => {
    expect(computeCpTriggerPieceIdx(8, 4)).toEqual([2, 4, 6, 0])
  })

  it('always lands the final CP on piece 0', () => {
    for (const M of [6, 8, 12, 13]) {
      for (let K = 3; K <= M; K++) {
        const idx = computeCpTriggerPieceIdx(M, K)
        expect(idx.length).toBe(K)
        expect(idx[K - 1]).toBe(0)
      }
    }
  })

  it('keeps intermediate trigger pieces strictly inside the loop', () => {
    for (const M of [6, 8, 12, 13]) {
      for (let K = 3; K < M; K++) {
        const idx = computeCpTriggerPieceIdx(M, K)
        for (let k = 0; k < K - 1; k++) {
          expect(idx[k]).toBeGreaterThan(0)
          expect(idx[k]).toBeLessThan(M)
        }
      }
    }
  })
})

describe('buildTrackPath cpTriggerPieceIdx', () => {
  it('defaults to one CP per piece when checkpointCount is omitted', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    expect(path.cpTriggerPieceIdx.length).toBe(DEFAULT_TRACK_PIECES.length)
  })

  it('honors checkpointCount when supplied', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES, 4)
    expect(path.cpTriggerPieceIdx).toEqual([2, 4, 6, 0])
  })
})
