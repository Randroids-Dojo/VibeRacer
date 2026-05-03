import { describe, expect, it } from 'vitest'
import { DIR_OFFSETS, connectorsOf, opposite, type Dir } from '@/game/track'
import type { Piece, PieceType, Rotation } from '@/lib/schemas'

const cardinalDirs: Dir[] = [0, 2, 4, 6]
const pieceTypes: PieceType[] = [
  'straight',
  'left90',
  'right90',
  'scurve',
  'scurveLeft',
  'sweepRight',
  'sweepLeft',
  'megaSweepRight',
  'megaSweepLeft',
]
const rotations: Rotation[] = [0, 90, 180, 270]

function piece(type: PieceType, rotation: Rotation): Piece {
  return { type, row: 0, col: 0, rotation }
}

describe('8-direction connector scaffold', () => {
  it('defines cardinal and corner offsets on one compass ring', () => {
    expect(DIR_OFFSETS).toEqual({
      0: { dr: -1, dc: 0 },
      1: { dr: -1, dc: 1 },
      2: { dr: 0, dc: 1 },
      3: { dr: 1, dc: 1 },
      4: { dr: 1, dc: 0 },
      5: { dr: 1, dc: -1 },
      6: { dr: 0, dc: -1 },
      7: { dr: -1, dc: -1 },
    })
  })

  it('keeps existing pieces on cardinal connectors only', () => {
    for (const type of pieceTypes) {
      for (const rotation of rotations) {
        const dirs = connectorsOf(piece(type, rotation))
        expect(dirs.length).toBe(2)
        expect(dirs.every((dir) => cardinalDirs.includes(dir))).toBe(true)
      }
    }
  })

  it('rotates existing pieces in 90-degree steps across the 8-dir encoding', () => {
    expect(connectorsOf(piece('right90', 0))).toEqual([4, 2])
    expect(connectorsOf(piece('right90', 90))).toEqual([6, 4])
    expect(connectorsOf(piece('right90', 180))).toEqual([0, 6])
    expect(connectorsOf(piece('right90', 270))).toEqual([2, 0])
  })

  it('maps every direction to the connector four steps away', () => {
    for (let dir = 0; dir < 8; dir++) {
      expect(opposite(dir as Dir)).toBe(((dir + 4) % 8) as Dir)
    }
  })
})
