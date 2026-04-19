import { describe, it, expect } from 'vitest'
import { opposite, validateClosedLoop } from '@/game/track'
import {
  CELL_SIZE,
  TRACK_WIDTH,
  buildTrackPath,
} from '@/game/trackPath'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'

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

  it('spawn is at piece-0 center with exit-direction heading', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    expect(path.spawn.position).toEqual(path.order[0].center)
    expect(typeof path.spawn.heading).toBe('number')
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
