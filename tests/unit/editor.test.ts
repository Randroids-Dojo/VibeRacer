import { describe, it, expect } from 'vitest'
import {
  countSelectedPieces,
  flipSelectedPieces,
  flipSelectionKeys,
  getBounds,
  getStartExitDir,
  moveStartTo,
  moveSelectedPieces,
  nextRotation,
  rectangleSelectionKeys,
  reverseStartDirection,
  rotateSelectedPieces,
  selectedCellKey,
  shiftSelectionKeys,
  withPiecePlaced,
  withPieceRemoved,
  withPieceRotated,
} from '@/game/editor'
import { buildTrackPath } from '@/game/trackPath'
import type { Piece } from '@/lib/schemas'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'

describe('nextRotation', () => {
  it('advances 0 to 90 to 180 to 270 to 0', () => {
    expect(nextRotation(0)).toBe(90)
    expect(nextRotation(90)).toBe(180)
    expect(nextRotation(180)).toBe(270)
    expect(nextRotation(270)).toBe(0)
  })
})

describe('withPiecePlaced', () => {
  it('appends a new piece when the cell is empty', () => {
    const result = withPiecePlaced([], 2, 3, 'straight', 90)
    expect(result).toEqual([{ type: 'straight', row: 2, col: 3, rotation: 90 }])
  })

  it('replaces an existing piece in place without changing array order', () => {
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'left90', row: 1, col: 1, rotation: 90 },
    ]
    const result = withPiecePlaced(pieces, 1, 1, 'right90', 270)
    expect(result[0]).toEqual(pieces[0])
    expect(result[1]).toEqual({ type: 'right90', row: 1, col: 1, rotation: 270 })
  })

  it('replaces a piece when the target cell is inside its footprint', () => {
    const pieces: Piece[] = [
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
    ]

    expect(withPiecePlaced(pieces, 0, 1, 'right90', 90)).toEqual([
      { type: 'right90', row: 0, col: 1, rotation: 90 },
    ])
  })
})

describe('withPieceRotated', () => {
  it('rotates the piece at the cell by 90', () => {
    const pieces: Piece[] = [
      { type: 'left90', row: 1, col: 1, rotation: 90 },
    ]
    const result = withPieceRotated(pieces, 1, 1)
    expect(result[0]).toEqual({ type: 'left90', row: 1, col: 1, rotation: 180 })
  })

  it('returns the same array when the cell is empty', () => {
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
    ]
    expect(withPieceRotated(pieces, 5, 5)).toBe(pieces)
  })

  it('wraps from 270 back to 0', () => {
    const pieces: Piece[] = [
      { type: 'right90', row: 0, col: 0, rotation: 270 },
    ]
    const result = withPieceRotated(pieces, 0, 0)
    expect(result[0].rotation).toBe(0)
  })

  it('rotates a piece by any occupied footprint cell', () => {
    const pieces: Piece[] = [
      {
        type: 'straight',
        row: 0,
        col: 0,
        rotation: 0,
        footprint: [
          { dr: 0, dc: 0 },
          { dr: 1, dc: 0 },
        ],
      },
    ]
    expect(withPieceRotated(pieces, 1, 0)).toEqual([
      {
        type: 'straight',
        row: 0,
        col: 0,
        rotation: 90,
        footprint: [
          { dr: 0, dc: -1 },
          { dr: 0, dc: 0 },
        ],
      },
    ])
  })
})

describe('withPieceRemoved', () => {
  it('removes the piece at the cell', () => {
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'left90', row: 1, col: 1, rotation: 0 },
    ]
    const result = withPieceRemoved(pieces, 0, 0)
    expect(result).toEqual([{ type: 'left90', row: 1, col: 1, rotation: 0 }])
  })

  it('returns the same array when the cell is empty', () => {
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
    ]
    expect(withPieceRemoved(pieces, 5, 5)).toBe(pieces)
  })

  it('removes a piece by any occupied footprint cell', () => {
    const pieces: Piece[] = [
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
      { type: 'left90', row: 2, col: 2, rotation: 0 },
    ]
    expect(withPieceRemoved(pieces, 0, 1)).toEqual([
      { type: 'left90', row: 2, col: 2, rotation: 0 },
    ])
  })
})

describe('moveStartTo', () => {
  it('rotates the default track so a chosen cell becomes pieces[0]', () => {
    const target = DEFAULT_TRACK_PIECES[3]
    const rotated = moveStartTo(DEFAULT_TRACK_PIECES, target.row, target.col)
    expect(rotated[0]).toEqual(target)
    expect(rotated.length).toBe(DEFAULT_TRACK_PIECES.length)
    // Every original piece is still present.
    const expectSet = new Set(
      DEFAULT_TRACK_PIECES.map((p) => `${p.row},${p.col}`),
    )
    const gotSet = new Set(rotated.map((p) => `${p.row},${p.col}`))
    expect(gotSet).toEqual(expectSet)
  })

  it('preserves the travel order after rotation', () => {
    const target = DEFAULT_TRACK_PIECES[2]
    const rotated = moveStartTo(DEFAULT_TRACK_PIECES, target.row, target.col)
    const beforePath = buildTrackPath(DEFAULT_TRACK_PIECES)
    const afterPath = buildTrackPath(rotated)
    // After rotating, the sequence should be the same loop traversal starting
    // at the new index. So afterPath.order[i].piece should equal
    // beforePath.order[(i + 2) % N].piece.
    const N = beforePath.order.length
    for (let i = 0; i < N; i++) {
      expect(afterPath.order[i].piece).toEqual(
        beforePath.order[(i + 2) % N].piece,
      )
    }
  })

  it('returns unchanged pieces when target is already start', () => {
    const result = moveStartTo(
      DEFAULT_TRACK_PIECES,
      DEFAULT_TRACK_PIECES[0].row,
      DEFAULT_TRACK_PIECES[0].col,
    )
    expect(result).toBe(DEFAULT_TRACK_PIECES)
  })

  it('returns unchanged pieces when target is not on the track', () => {
    const result = moveStartTo(DEFAULT_TRACK_PIECES, 99, 99)
    expect(result).toBe(DEFAULT_TRACK_PIECES)
  })

  it('promotes the picked piece to index 0 on an open track without dropping any', () => {
    // A dangling straight at (0, 0) and an orphan piece at (5, 5). The walker
    // from pieces[0] can't reach the orphan, and the loop isn't closed.
    const dangling: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'straight', row: 5, col: 5, rotation: 0 },
    ]
    const result = moveStartTo(dangling, 5, 5)
    expect(result.length).toBe(dangling.length)
    expect(result[0]).toEqual(dangling[1])
    const before = new Set(dangling.map((p) => `${p.row},${p.col}`))
    const after = new Set(result.map((p) => `${p.row},${p.col}`))
    expect(after).toEqual(before)
  })
})

describe('reverseStartDirection', () => {
  it('keeps pieces[0] and reverses the rest', () => {
    const reversed = reverseStartDirection(DEFAULT_TRACK_PIECES)
    expect(reversed[0]).toEqual(DEFAULT_TRACK_PIECES[0])
    for (let i = 1; i < DEFAULT_TRACK_PIECES.length; i++) {
      expect(reversed[i]).toEqual(
        DEFAULT_TRACK_PIECES[DEFAULT_TRACK_PIECES.length - i],
      )
    }
  })

  it('flips the exit direction used by buildTrackPath', () => {
    const originalExit = buildTrackPath(DEFAULT_TRACK_PIECES).order[0].exitDir
    const reversedExit = buildTrackPath(
      reverseStartDirection(DEFAULT_TRACK_PIECES),
    ).order[0].exitDir
    expect(reversedExit).not.toBe(originalExit)
  })
})

describe('getStartExitDir', () => {
  it('returns null for an empty track', () => {
    expect(getStartExitDir([])).toBeNull()
  })

  it('returns the connector that points at pieces[1]', () => {
    // pieces[0] straight at (1,0) rot 0 has connectors [S(2), N(0)].
    // pieces[1] at (0, 0) is one cell north, so exit is N = 0.
    expect(getStartExitDir(DEFAULT_TRACK_PIECES)).toBe(0)
  })

  it('flips after reverseStartDirection', () => {
    const before = getStartExitDir(DEFAULT_TRACK_PIECES)
    const after = getStartExitDir(reverseStartDirection(DEFAULT_TRACK_PIECES))
    expect(after).not.toBe(before)
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

describe('rectangleSelectionKeys', () => {
  it('selects a single cell when anchor and target match', () => {
    expect(rectangleSelectionKeys({ row: 2, col: 3 }, { row: 2, col: 3 })).toEqual([
      selectedCellKey(2, 3),
    ])
  })

  it('selects every cell inside the rectangle regardless of drag direction', () => {
    const forward = rectangleSelectionKeys({ row: 1, col: 2 }, { row: 3, col: 4 })
    const reverse = rectangleSelectionKeys({ row: 3, col: 4 }, { row: 1, col: 2 })

    expect(forward).toEqual(reverse)
    expect(forward).toEqual([
      '1,2',
      '1,3',
      '1,4',
      '2,2',
      '2,3',
      '2,4',
      '3,2',
      '3,3',
      '3,4',
    ])
  })

  it('handles negative coordinates', () => {
    expect(rectangleSelectionKeys({ row: -1, col: -2 }, { row: 0, col: -1 })).toEqual([
      '-1,-2',
      '-1,-1',
      '0,-2',
      '0,-1',
    ])
  })
})

describe('countSelectedPieces', () => {
  it('counts selected pieces and ignores selected empty cells', () => {
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'left90', row: 0, col: 1, rotation: 90 },
      { type: 'right90', row: 2, col: 2, rotation: 180 },
    ]
    const selected = new Set(['0,0', '0,1', '1,1'])

    expect(countSelectedPieces(pieces, selected)).toBe(2)
  })

  it('returns zero for an empty selection', () => {
    expect(countSelectedPieces(DEFAULT_TRACK_PIECES, new Set())).toBe(0)
  })

  it('counts a footprinted piece when any occupied cell is selected', () => {
    const pieces: Piece[] = [
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
    ]
    expect(countSelectedPieces(pieces, new Set(['0,1']))).toBe(1)
  })
})

describe('moveSelectedPieces', () => {
  it('moves only selected pieces and keeps unselected pieces in place', () => {
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'left90', row: 0, col: 1, rotation: 90 },
      { type: 'right90', row: 3, col: 3, rotation: 180 },
    ]
    const selected = new Set(['0,0', '0,1'])

    expect(moveSelectedPieces(pieces, selected, 2, -1)).toEqual([
      { type: 'straight', row: 2, col: -1, rotation: 0 },
      { type: 'left90', row: 2, col: 0, rotation: 90 },
      { type: 'right90', row: 3, col: 3, rotation: 180 },
    ])
  })

  it('allows selected pieces to move through their own current cells', () => {
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'straight', row: 0, col: 1, rotation: 0 },
    ]
    const selected = new Set(['0,0', '0,1'])

    expect(moveSelectedPieces(pieces, selected, 0, 1)).toEqual([
      { type: 'straight', row: 0, col: 1, rotation: 0 },
      { type: 'straight', row: 0, col: 2, rotation: 0 },
    ])
  })

  it('blocks moves into unselected pieces', () => {
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'straight', row: 0, col: 1, rotation: 0 },
    ]
    const selected = new Set(['0,0'])

    expect(moveSelectedPieces(pieces, selected, 0, 1)).toBe(pieces)
  })

  it('shifts selected cell keys by the same delta', () => {
    expect(shiftSelectionKeys(new Set(['0,0', '-1,2']), 2, -3)).toEqual(
      new Set(['2,-3', '1,-1']),
    )
  })

  it('moves a footprinted piece atomically when any occupied cell is selected', () => {
    const pieces: Piece[] = [
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
    ]

    expect(moveSelectedPieces(pieces, new Set(['0,1']), 1, 0)).toEqual([
      {
        type: 'straight',
        row: 1,
        col: 0,
        rotation: 0,
        footprint: [
          { dr: 0, dc: 0 },
          { dr: 0, dc: 1 },
        ],
      },
    ])
  })

  it('blocks footprint moves into unselected occupied cells', () => {
    const pieces: Piece[] = [
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
      { type: 'straight', row: 0, col: 2, rotation: 90 },
    ]

    expect(moveSelectedPieces(pieces, new Set(['0,0']), 0, 1)).toBe(pieces)
  })
})

describe('rotateSelectedPieces', () => {
  it('rotates every selected piece by one step', () => {
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'left90', row: 1, col: 1, rotation: 270 },
      { type: 'right90', row: 2, col: 2, rotation: 180 },
    ]
    const selected = new Set(['0,0', '1,1'])

    expect(rotateSelectedPieces(pieces, selected)).toEqual([
      { type: 'straight', row: 0, col: 0, rotation: 90 },
      { type: 'left90', row: 1, col: 1, rotation: 0 },
      { type: 'right90', row: 2, col: 2, rotation: 180 },
    ])
  })

  it('returns the original array when no pieces are selected', () => {
    expect(rotateSelectedPieces(DEFAULT_TRACK_PIECES, new Set())).toBe(
      DEFAULT_TRACK_PIECES,
    )
  })

  it('rotates selected footprints with the piece', () => {
    const pieces: Piece[] = [
      {
        type: 'straight',
        row: 0,
        col: 0,
        rotation: 0,
        footprint: [
          { dr: 0, dc: 0 },
          { dr: 1, dc: 0 },
        ],
      },
    ]

    expect(rotateSelectedPieces(pieces, new Set(['1,0']))).toEqual([
      {
        type: 'straight',
        row: 0,
        col: 0,
        rotation: 90,
        footprint: [
          { dr: 0, dc: -1 },
          { dr: 0, dc: 0 },
        ],
      },
    ])
  })

  it('blocks selected footprint rotations into unselected occupied cells', () => {
    const pieces: Piece[] = [
      {
        type: 'straight',
        row: 0,
        col: 0,
        rotation: 0,
        footprint: [
          { dr: 0, dc: 0 },
          { dr: 1, dc: 0 },
        ],
      },
      { type: 'straight', row: 0, col: -1, rotation: 0 },
    ]

    expect(rotateSelectedPieces(pieces, new Set(['1,0']))).toBe(pieces)
  })
})

describe('flipSelectedPieces', () => {
  it('mirrors selected positions horizontally and swaps handed piece types', () => {
    const pieces: Piece[] = [
      { type: 'right90', row: 0, col: 0, rotation: 0 },
      { type: 'sweepLeft', row: 0, col: 2, rotation: 90 },
      { type: 'straight', row: 3, col: 3, rotation: 0 },
    ]
    const selected = new Set(['0,0', '0,1', '0,2'])

    expect(flipSelectedPieces(pieces, selected, 'horizontal')).toEqual([
      { type: 'left90', row: 0, col: 2, rotation: 0 },
      { type: 'sweepRight', row: 0, col: 0, rotation: 270 },
      { type: 'straight', row: 3, col: 3, rotation: 0 },
    ])
  })

  it('mirrors selected positions vertically and updates turn rotations', () => {
    const pieces: Piece[] = [
      { type: 'right90', row: 0, col: 0, rotation: 0 },
      { type: 'scurve', row: 2, col: 0, rotation: 0 },
    ]
    const selected = new Set(['0,0', '1,0', '2,0'])

    expect(flipSelectedPieces(pieces, selected, 'vertical')).toEqual([
      { type: 'left90', row: 2, col: 0, rotation: 180 },
      { type: 'scurveLeft', row: 0, col: 0, rotation: 0 },
    ])
  })

  it('blocks flips into unselected pieces', () => {
    const pieces: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'straight', row: 0, col: 2, rotation: 0 },
    ]
    const selected = new Set(['0,0', '0,1', '0,2'])

    expect(flipSelectedPieces(pieces, selected, 'horizontal')).toEqual([
      { type: 'straight', row: 0, col: 2, rotation: 0 },
      { type: 'straight', row: 0, col: 0, rotation: 0 },
    ])

    expect(flipSelectedPieces(pieces, new Set(['0,0', '1,2']), 'horizontal')).toBe(
      pieces,
    )
  })

  it('mirrors selected cell keys with the same bounds as pieces', () => {
    expect(flipSelectionKeys(new Set(['0,0', '0,2']), 'horizontal')).toEqual(
      new Set(['0,2', '0,0']),
    )
    expect(flipSelectionKeys(new Set(['0,0', '2,0']), 'vertical')).toEqual(
      new Set(['2,0', '0,0']),
    )
  })

  it('mirrors footprint offsets with selected pieces', () => {
    const pieces: Piece[] = [
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
    ]

    expect(flipSelectedPieces(pieces, new Set(['0,0', '0,1']), 'horizontal'))
      .toEqual([
        {
          type: 'straight',
          row: 0,
          col: 1,
          rotation: 0,
          footprint: [
            { dr: 0, dc: -1 },
            { dr: 0, dc: 0 },
          ],
        },
      ])
  })
})
