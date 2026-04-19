import { describe, it, expect } from 'vitest'
import { cycleCell, withCellCycled, getBounds } from '@/game/editor'
import type { Piece } from '@/lib/schemas'

describe('cycleCell', () => {
  it('empty cycles to straight/0', () => {
    expect(cycleCell(null)).toEqual({ type: 'straight', rotation: 0 })
  })

  it('advances rotation within a type', () => {
    expect(cycleCell({ type: 'straight', rotation: 0 }))
      .toEqual({ type: 'straight', rotation: 90 })
    expect(cycleCell({ type: 'straight', rotation: 180 }))
      .toEqual({ type: 'straight', rotation: 270 })
  })

  it('advances to next type after 270 rotation', () => {
    expect(cycleCell({ type: 'straight', rotation: 270 }))
      .toEqual({ type: 'left90', rotation: 0 })
    expect(cycleCell({ type: 'left90', rotation: 270 }))
      .toEqual({ type: 'right90', rotation: 0 })
  })

  it('cycles back to empty after the final state', () => {
    expect(cycleCell({ type: 'right90', rotation: 270 })).toBeNull()
  })
})

describe('withCellCycled', () => {
  it('adds a new piece when cell is empty', () => {
    const result = withCellCycled([], 2, 3)
    expect(result).toEqual([
      { type: 'straight', row: 2, col: 3, rotation: 0 },
    ])
  })

  it('advances an existing piece without changing position', () => {
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'left90', row: 1, col: 1, rotation: 90 },
    ]
    const result = withCellCycled(pieces, 1, 1)
    expect(result[1]).toEqual({ type: 'left90', row: 1, col: 1, rotation: 180 })
    expect(result[0]).toEqual(pieces[0])
  })

  it('removes the piece when cycling past the final state', () => {
    const pieces: Piece[] = [
      { type: 'right90', row: 0, col: 0, rotation: 270 },
      { type: 'straight', row: 1, col: 0, rotation: 0 },
    ]
    const result = withCellCycled(pieces, 0, 0)
    expect(result).toEqual([{ type: 'straight', row: 1, col: 0, rotation: 0 }])
  })

  it('returns the same array when both current and next are empty', () => {
    const pieces: Piece[] = []
    const result = withCellCycled(pieces, 0, 0)
    expect(result).toEqual([
      { type: 'straight', row: 0, col: 0, rotation: 0 },
    ])
  })
})

describe('getBounds', () => {
  it('returns zeros for an empty track', () => {
    expect(getBounds([])).toEqual({ rowMin: 0, rowMax: 0, colMin: 0, colMax: 0 })
  })

  it('covers all pieces', () => {
    const pieces: Piece[] = [
      { type: 'straight', row: -2, col: 1, rotation: 0 },
      { type: 'straight', row: 3, col: -4, rotation: 0 },
      { type: 'straight', row: 0, col: 7, rotation: 0 },
    ]
    expect(getBounds(pieces)).toEqual({
      rowMin: -2,
      rowMax: 3,
      colMin: -4,
      colMax: 7,
    })
  })
})
