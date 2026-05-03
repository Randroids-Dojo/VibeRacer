import { describe, it, expect } from 'vitest'
import {
  connectorPortsOf,
  connectorsOf,
  opposite,
  validateClosedLoop,
} from '@/game/track'
import type { Piece } from '@/lib/schemas'

describe('connectorsOf', () => {
  it('straight at rotation 0 opens S and N', () => {
    expect(connectorsOf({ type: 'straight', row: 0, col: 0, rotation: 0 }))
      .toEqual([4, 0])
  })
  it('straight at rotation 90 opens W and E', () => {
    expect(connectorsOf({ type: 'straight', row: 0, col: 0, rotation: 90 }))
      .toEqual([6, 2])
  })
  it('right90 at rotation 0 opens S and E', () => {
    expect(connectorsOf({ type: 'right90', row: 0, col: 0, rotation: 0 }))
      .toEqual([4, 2])
  })
  it('scurve shares a straight\'s connectors so it slots into a straight\'s spot', () => {
    expect(connectorsOf({ type: 'scurve', row: 0, col: 0, rotation: 0 }))
      .toEqual([4, 0])
    expect(connectorsOf({ type: 'scurve', row: 0, col: 0, rotation: 90 }))
      .toEqual([6, 2])
  })
  it('scurveLeft shares the same connectors as scurve so the two are interchangeable in a layout', () => {
    expect(connectorsOf({ type: 'scurveLeft', row: 0, col: 0, rotation: 0 }))
      .toEqual([4, 0])
    expect(connectorsOf({ type: 'scurveLeft', row: 0, col: 0, rotation: 90 }))
      .toEqual([6, 2])
    expect(connectorsOf({ type: 'scurveLeft', row: 0, col: 0, rotation: 180 }))
      .toEqual([0, 4])
  })

  it('sweep turns share the matching 90-degree turn connectors', () => {
    expect(connectorsOf({ type: 'sweepRight', row: 0, col: 0, rotation: 0 }))
      .toEqual([4, 2])
    expect(connectorsOf({ type: 'sweepLeft', row: 0, col: 0, rotation: 0 }))
      .toEqual([4, 6])
    expect(connectorsOf({ type: 'sweepRight', row: 0, col: 0, rotation: 90 }))
      .toEqual([6, 4])
  })

  it('mega sweep turns share the matching 90-degree turn connectors', () => {
    expect(connectorsOf({ type: 'megaSweepRight', row: 0, col: 0, rotation: 0 }))
      .toEqual([4, 2])
    expect(connectorsOf({ type: 'megaSweepLeft', row: 0, col: 0, rotation: 0 }))
      .toEqual([4, 6])
    expect(connectorsOf({ type: 'megaSweepRight', row: 0, col: 0, rotation: 90 }))
      .toEqual([6, 4])
  })

  it('hairpins expose two same-side connector ports on different footprint rows', () => {
    const piece: Piece = { type: 'hairpin', row: 0, col: 0, rotation: 0 }
    expect(connectorsOf(piece)).toEqual([6, 6])
    expect(connectorPortsOf(piece)).toEqual([
      { dr: -1, dc: 0, dir: 6 },
      { dr: 1, dc: 0, dir: 6 },
    ])
    expect(connectorPortsOf({ ...piece, rotation: 90 })).toEqual([
      { dr: 0, dc: 1, dir: 0 },
      { dr: 0, dc: -1, dir: 0 },
    ])
  })

  it('45-degree pieces expose corner connectors', () => {
    expect(connectorsOf({ type: 'arc45', row: 0, col: 0, rotation: 0 }))
      .toEqual([4, 1])
    expect(connectorsOf({ type: 'arc45', row: 0, col: 0, rotation: 180 }))
      .toEqual([0, 5])
    expect(connectorsOf({ type: 'arc45Left', row: 0, col: 0, rotation: 0 }))
      .toEqual([4, 7])
    expect(connectorsOf({ type: 'arc45Left', row: 0, col: 0, rotation: 90 }))
      .toEqual([6, 1])
    expect(connectorsOf({ type: 'diagonal', row: 0, col: 0, rotation: 0 }))
      .toEqual([5, 1])
    expect(connectorsOf({ type: 'diagonal', row: 0, col: 0, rotation: 90 }))
      .toEqual([7, 3])
  })

  it('opposite maps every 8-direction connector across the compass', () => {
    expect(opposite(0)).toBe(4)
    expect(opposite(1)).toBe(5)
    expect(opposite(2)).toBe(6)
    expect(opposite(3)).toBe(7)
    expect(opposite(4)).toBe(0)
    expect(opposite(5)).toBe(1)
    expect(opposite(6)).toBe(2)
    expect(opposite(7)).toBe(3)
  })
})

describe('validateClosedLoop', () => {
  it('rejects empty track', () => {
    expect(validateClosedLoop([]).ok).toBe(false)
  })

  it('rejects a single straight piece with dangling connectors', () => {
    const res = validateClosedLoop([
      { type: 'straight', row: 0, col: 0, rotation: 0 },
    ])
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/open connector/)
  })

  it('rejects a duplicate cell', () => {
    const res = validateClosedLoop([
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'straight', row: 0, col: 0, rotation: 90 },
    ])
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/duplicate/)
  })

  it('rejects overlap against a multi-cell footprint', () => {
    const res = validateClosedLoop([
      {
        type: 'straight',
        row: 0,
        col: 0,
        rotation: 0,
        footprint: [
          { dr: 0, dc: 0 },
          { dr: 0, dc: 1 },
        ],
      },
      { type: 'straight', row: 0, col: 1, rotation: 90 },
    ])
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/duplicate piece at 0,1/)
  })

  it('does not let a footprint cell satisfy its own connector', () => {
    const res = validateClosedLoop([
      {
        type: 'straight',
        row: 0,
        col: 0,
        rotation: 0,
        footprint: [
          { dr: 0, dc: 0 },
          { dr: -1, dc: 0 },
        ],
      },
    ])
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/open connector/)
  })

  it('allows a footprint cell to contain its directly connected neighbor anchor', () => {
    const pieces: Piece[] = [
      { type: 'megaSweepRight', row: 0, col: 0, rotation: 0 },
      { type: 'straight', row: 0, col: 1, rotation: 90 },
      { type: 'right90', row: 0, col: 2, rotation: 90 },
      { type: 'straight', row: 1, col: 2, rotation: 0 },
      { type: 'right90', row: 2, col: 2, rotation: 180 },
      { type: 'straight', row: 2, col: 1, rotation: 90 },
      { type: 'right90', row: 2, col: 0, rotation: 270 },
      { type: 'straight', row: 1, col: 0, rotation: 0 },
    ]
    expect(validateClosedLoop(pieces)).toEqual({ ok: true })
  })

  it('rejects a non-connected anchor inside a mega sweep footprint', () => {
    const res = validateClosedLoop([
      { type: 'megaSweepRight', row: 0, col: 0, rotation: 0 },
      { type: 'straight', row: 1, col: 1, rotation: 0 },
    ])
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/duplicate piece at 1,1/)
  })

  it('accepts a loop that connects to both hairpin ports', () => {
    const pieces: Piece[] = [
      { type: 'hairpin', row: 0, col: 0, rotation: 0 },
      { type: 'right90', row: 1, col: -1, rotation: 270 },
      { type: 'straight', row: 0, col: -1, rotation: 0 },
      { type: 'right90', row: -1, col: -1, rotation: 0 },
    ]
    expect(validateClosedLoop(pieces)).toEqual({ ok: true })
  })

  it('accepts a 2x2 square loop built from right90 corners', () => {
    const pieces: Piece[] = [
      { type: 'right90', row: 0, col: 0, rotation: 0 },
      { type: 'right90', row: 0, col: 1, rotation: 90 },
      { type: 'right90', row: 1, col: 1, rotation: 180 },
      { type: 'right90', row: 1, col: 0, rotation: 270 },
    ]
    expect(validateClosedLoop(pieces)).toEqual({ ok: true })
  })

  it('accepts a 3x2 stadium loop with two straights', () => {
    // corners around a 3-wide by 2-tall loop:
    //   (0,0) (0,1) (0,2)
    //   (1,0) (1,1) (1,2)
    // top row: right90, straight horizontal, right90 rotated
    // bottom row: right90 rotated, straight horizontal, right90 rotated
    const pieces: Piece[] = [
      { type: 'right90', row: 0, col: 0, rotation: 0 },
      { type: 'straight', row: 0, col: 1, rotation: 90 },
      { type: 'right90', row: 0, col: 2, rotation: 90 },
      { type: 'right90', row: 1, col: 2, rotation: 180 },
      { type: 'straight', row: 1, col: 1, rotation: 90 },
      { type: 'right90', row: 1, col: 0, rotation: 270 },
    ]
    expect(validateClosedLoop(pieces)).toEqual({ ok: true })
  })

  it('rejects two disjoint closed loops as not connected', () => {
    // loop A in top-left 2x2
    // loop B shifted to (10..11, 10..11)
    const loopA: Piece[] = [
      { type: 'right90', row: 0, col: 0, rotation: 0 },
      { type: 'right90', row: 0, col: 1, rotation: 90 },
      { type: 'right90', row: 1, col: 1, rotation: 180 },
      { type: 'right90', row: 1, col: 0, rotation: 270 },
    ]
    const loopB: Piece[] = loopA.map((p) => ({
      ...p,
      row: p.row + 10,
      col: p.col + 10,
    }))
    const res = validateClosedLoop([...loopA, ...loopB])
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/single connected component/)
  })

  it('rejects a track over the piece limit', () => {
    const pieces: Piece[] = Array.from({ length: 65 }, (_, i) => ({
      type: 'straight' as const,
      row: 0,
      col: i,
      rotation: 0 as const,
    }))
    const res = validateClosedLoop(pieces)
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/too many pieces/)
  })
})
