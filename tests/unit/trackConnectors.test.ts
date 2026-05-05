import { describe, expect, it } from 'vitest'
import {
  DIR_OFFSETS,
  connectorPortsOf,
  connectorsOf,
  opposite,
  type Dir,
} from '@/game/track'
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
  'hairpin',
  'hairpinTight',
  'hairpinWide',
  'arc45',
  'arc45Left',
  'diagonal',
  'wideArc45Right',
  'wideArc45Left',
  'diagonalSweepRight',
  'diagonalSweepLeft',
  'kinkRight',
  'kinkLeft',
  'offsetStraightRight',
  'offsetStraightLeft',
  'grandSweepRight',
  'grandSweepLeft',
  'flexStraight',
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

  it('keeps pre-diagonal pieces on cardinal connectors only', () => {
    for (const type of pieceTypes) {
      if (
        type === 'arc45' ||
        type === 'arc45Left' ||
        type === 'diagonal' ||
        type === 'wideArc45Right' ||
        type === 'wideArc45Left' ||
        type === 'diagonalSweepRight' ||
        type === 'diagonalSweepLeft'
      ) {
        continue
      }
      for (const rotation of rotations) {
        const dirs = connectorsOf(piece(type, rotation))
        expect(dirs.length).toBe(2)
        expect(dirs.every((dir) => cardinalDirs.includes(dir))).toBe(true)
      }
    }
  })

  it('adds corner connectors for 45-degree pieces', () => {
    expect(connectorsOf(piece('arc45', 0))).toEqual([4, 1])
    expect(connectorsOf(piece('arc45Left', 0))).toEqual([4, 7])
    expect(connectorsOf(piece('arc45Left', 90))).toEqual([6, 1])
    expect(connectorsOf(piece('diagonal', 0))).toEqual([5, 1])
    expect(connectorsOf(piece('diagonal', 90))).toEqual([7, 3])
    expect(connectorsOf(piece('wideArc45Right', 0))).toEqual([4, 1])
    expect(connectorsOf(piece('wideArc45Left', 0))).toEqual([4, 7])
    expect(connectorsOf(piece('diagonalSweepRight', 0))).toEqual([5, 3])
    expect(connectorsOf(piece('diagonalSweepLeft', 0))).toEqual([3, 5])
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

  it('exposes flex straight ports keyed off the flex spec', () => {
    // Default spec dr=-3, dc=1 at rotation 0: entry south of anchor, exit
    // north of cell (-3, 1). connectorsOf only returns directions; assert
    // connectorPortsOf so the (dr, dc) cell offsets are pinned too.
    expect(
      connectorsOf({ type: 'flexStraight', row: 0, col: 0, rotation: 0 }),
    ).toEqual([4, 0])
    expect(
      connectorPortsOf({ type: 'flexStraight', row: 0, col: 0, rotation: 0 }),
    ).toEqual([
      { dr: 0, dc: 0, dir: 4 },
      { dr: -3, dc: 1, dir: 0 },
    ])

    // Custom spec routes the exit cell through the flex offset, not a
    // hard-coded port table.
    const customPiece: Piece = {
      type: 'flexStraight',
      row: 0,
      col: 0,
      rotation: 0,
      flex: { dr: -5, dc: 2 },
    }
    expect(connectorsOf(customPiece)).toEqual([4, 0])
    expect(connectorPortsOf(customPiece)).toEqual([
      { dr: 0, dc: 0, dir: 4 },
      { dr: -5, dc: 2, dir: 0 },
    ])

    // Rotation 90: entry maps to W, exit to E. The exit cell offset rotates
    // by one 90-degree step (clockwise on the row/col grid: (dr, dc) ->
    // (dc, -dr)). For the default spec (-3, 1) that lands at (1, 3); for
    // the custom spec (-5, 2) it lands at (2, 5).
    expect(
      connectorsOf({ type: 'flexStraight', row: 0, col: 0, rotation: 90 }),
    ).toEqual([6, 2])
    expect(
      connectorPortsOf({ type: 'flexStraight', row: 0, col: 0, rotation: 90 }),
    ).toEqual([
      { dr: 0, dc: 0, dir: 6 },
      { dr: 1, dc: 3, dir: 2 },
    ])
    expect(
      connectorPortsOf({
        type: 'flexStraight',
        row: 0,
        col: 0,
        rotation: 90,
        flex: { dr: -5, dc: 2 },
      }),
    ).toEqual([
      { dr: 0, dc: 0, dir: 6 },
      { dr: 2, dc: 5, dir: 2 },
    ])

    // Rotations 180 and 270 still match the connectorsOf direction view.
    expect(
      connectorsOf({ type: 'flexStraight', row: 0, col: 0, rotation: 180 }),
    ).toEqual([0, 4])
    expect(
      connectorPortsOf({ type: 'flexStraight', row: 0, col: 0, rotation: 180 }),
    ).toEqual([
      { dr: 0, dc: 0, dir: 0 },
      { dr: 3, dc: -1, dir: 4 },
    ])
    expect(
      connectorsOf({ type: 'flexStraight', row: 0, col: 0, rotation: 270 }),
    ).toEqual([2, 6])
    expect(
      connectorPortsOf({ type: 'flexStraight', row: 0, col: 0, rotation: 270 }),
    ).toEqual([
      { dr: 0, dc: 0, dir: 2 },
      { dr: -1, dc: -3, dir: 6 },
    ])
  })
})
