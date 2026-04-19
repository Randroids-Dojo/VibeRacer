import { describe, it, expect } from 'vitest'
import { connectorsOf, validateClosedLoop } from '@/game/track'
import type { Piece } from '@/lib/schemas'

describe('connectorsOf', () => {
  it('straight at rotation 0 opens S and N', () => {
    expect(connectorsOf({ type: 'straight', row: 0, col: 0, rotation: 0 }))
      .toEqual([2, 0])
  })
  it('straight at rotation 90 opens W and E', () => {
    expect(connectorsOf({ type: 'straight', row: 0, col: 0, rotation: 90 }))
      .toEqual([3, 1])
  })
  it('right90 at rotation 0 opens S and E', () => {
    expect(connectorsOf({ type: 'right90', row: 0, col: 0, rotation: 0 }))
      .toEqual([2, 1])
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
