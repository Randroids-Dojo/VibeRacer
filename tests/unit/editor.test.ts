import { describe, it, expect } from 'vitest'
import {
  getBounds,
  getStartExitDir,
  moveStartTo,
  nextRotation,
  reverseStartDirection,
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
