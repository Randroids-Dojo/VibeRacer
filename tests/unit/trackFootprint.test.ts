import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FOOTPRINT,
  MEGA_SWEEP_LEFT_FOOTPRINT,
  MEGA_SWEEP_RIGHT_FOOTPRINT,
  defaultFootprintForPiece,
  flipFootprint,
  footprintCellKeys,
  footprintCells,
  isDefaultFootprint,
  normalizedFootprint,
  pieceOccupiesCell,
  rotateFootprintClockwise,
} from '@/game/trackFootprint'
import type { Piece } from '@/lib/schemas'

describe('track footprint helpers', () => {
  const piece: Piece = {
    type: 'straight',
    row: 10,
    col: 20,
    rotation: 0,
    footprint: [
      { dr: 0, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 1, dc: 1 },
    ],
  }

  it('defaults to the origin cell', () => {
    expect(DEFAULT_FOOTPRINT).toEqual([{ dr: 0, dc: 0 }])
    expect(normalizedFootprint(undefined)).toEqual([{ dr: 0, dc: 0 }])
    expect(isDefaultFootprint(undefined)).toBe(true)
  })

  it('dedupes and sorts footprint offsets', () => {
    expect(
      normalizedFootprint([
        { dr: 1, dc: 0 },
        { dr: 0, dc: 0 },
        { dr: 1, dc: 0 },
      ]),
    ).toEqual([
      { dr: 0, dc: 0 },
      { dr: 1, dc: 0 },
    ])
  })

  it('resolves world cells and cell keys from piece origin plus offsets', () => {
    expect(footprintCells(piece)).toEqual([
      { row: 10, col: 20 },
      { row: 11, col: 20 },
      { row: 11, col: 21 },
    ])
    expect(footprintCellKeys(piece)).toEqual(['10,20', '11,20', '11,21'])
  })

  it('checks whether a piece occupies a specific world cell', () => {
    expect(pieceOccupiesCell(piece, 11, 21)).toBe(true)
    expect(pieceOccupiesCell(piece, 10, 21)).toBe(false)
  })

  it('rotates footprint offsets clockwise around the piece origin', () => {
    expect(rotateFootprintClockwise(piece.footprint)).toEqual([
      { dr: 0, dc: -1 },
      { dr: 0, dc: 0 },
      { dr: 1, dc: -1 },
    ])
  })

  it('flips footprint offsets across horizontal and vertical axes', () => {
    expect(flipFootprint(piece.footprint, 'horizontal')).toEqual([
      { dr: 0, dc: 0 },
      { dr: 1, dc: -1 },
      { dr: 1, dc: 0 },
    ])
    expect(flipFootprint(piece.footprint, 'vertical')).toEqual([
      { dr: -1, dc: 0 },
      { dr: -1, dc: 1 },
      { dr: 0, dc: 0 },
    ])
  })

  it('reserves only the swept quadrant for mega sweeps', () => {
    expect(MEGA_SWEEP_RIGHT_FOOTPRINT).toEqual([
      { dr: -1, dc: -1 },
      { dr: -1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 0 },
    ])
    expect(MEGA_SWEEP_LEFT_FOOTPRINT).toEqual([
      { dr: -1, dc: 0 },
      { dr: -1, dc: 1 },
      { dr: 0, dc: 0 },
      { dr: 0, dc: 1 },
    ])
  })

  it('rotates default mega sweep footprints with the piece', () => {
    expect(
      defaultFootprintForPiece({
        type: 'megaSweepRight',
        rotation: 90,
      }),
    ).toEqual([
      { dr: -1, dc: 0 },
      { dr: -1, dc: 1 },
      { dr: 0, dc: 0 },
      { dr: 0, dc: 1 },
    ])
  })
})
