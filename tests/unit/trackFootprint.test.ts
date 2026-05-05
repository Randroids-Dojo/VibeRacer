import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FOOTPRINT,
  MEGA_SWEEP_LEFT_FOOTPRINT,
  MEGA_SWEEP_RIGHT_FOOTPRINT,
  defaultFootprintForPiece,
  flexStraightFootprintLocal,
  flipFootprint,
  footprintCellKeys,
  footprintCells,
  isDefaultFootprint,
  normalizedFootprint,
  pieceOccupiesCell,
  rotateFlexStraightFootprint,
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

  it('flex straight footprint covers every cell the line crosses', () => {
    // dr=-2, dc=0 (straight 2-cell): line from (0, 0.5) to (0, -2.5).
    // Crosses cells (0, 0), (-1, 0), (-2, 0).
    const straightCells = flexStraightFootprintLocal({ dr: -2, dc: 0 })
    expect(straightCells).toContainEqual({ dr: 0, dc: 0 })
    expect(straightCells).toContainEqual({ dr: -1, dc: 0 })
    expect(straightCells).toContainEqual({ dr: -2, dc: 0 })
    expect(straightCells).toHaveLength(3)
  })

  it('flex straight footprint includes corner-touched cells', () => {
    // dr=-1, dc=1: line passes exactly through the corner where four cells
    // meet. The corner-aware supercover algorithm should claim all four so
    // adjacent pieces cannot overlap the road's painted edge.
    const cornerCells = flexStraightFootprintLocal({ dr: -1, dc: 1 })
    expect(cornerCells).toContainEqual({ dr: 0, dc: 0 })
    expect(cornerCells).toContainEqual({ dr: -1, dc: 1 })
    expect(cornerCells).toContainEqual({ dr: 0, dc: 1 })
    expect(cornerCells).toContainEqual({ dr: -1, dc: 0 })
  })

  it('flex straight footprint stays inside a long shallow run', () => {
    // dr=-5, dc=1: a long, gentle angle. Cells should march mostly forward
    // and bow once into the lateral side.
    const cells = flexStraightFootprintLocal({ dr: -5, dc: 1 })
    expect(cells).toContainEqual({ dr: 0, dc: 0 })
    expect(cells).toContainEqual({ dr: -5, dc: 1 })
    // No cell ever reaches dc = 2 because the lateral run is one cell.
    for (const cell of cells) {
      expect(cell.dc).toBeLessThanOrEqual(1)
      expect(cell.dc).toBeGreaterThanOrEqual(0)
    }
  })

  it('rotates the flex straight footprint with the piece', () => {
    const baseSpec = { dr: -3, dc: 1 }
    const rotated = rotateFlexStraightFootprint(baseSpec, 90)
    // After a 90-degree clockwise rotation in cell coords (dr, dc) -> (dc, -dr).
    // (0, 0) stays at (0, 0); (-3, 1) lands at (1, 3).
    expect(rotated).toContainEqual({ dr: 0, dc: 0 })
    expect(rotated).toContainEqual({ dr: 1, dc: 3 })
  })

  it('default flex straight footprint reads the spec', () => {
    const cells = defaultFootprintForPiece({
      type: 'flexStraight',
      rotation: 0,
      flex: { dr: -2, dc: 0 },
    })
    expect(cells).toContainEqual({ dr: 0, dc: 0 })
    expect(cells).toContainEqual({ dr: -2, dc: 0 })
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
