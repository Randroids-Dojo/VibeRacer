import { describe, it, expect } from 'vitest'
import {
  cycleCell,
  getBounds,
  getStartExitDir,
  moveStartTo,
  reverseStartDirection,
  withCellCycled,
} from '@/game/editor'
import { buildTrackPath } from '@/game/trackPath'
import type { Piece } from '@/lib/schemas'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'

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

  it('does not drop pieces when the track is not a closed loop', () => {
    // A dangling straight at (0, 0) and an orphan piece at (5, 5). The walker
    // from pieces[0] can't reach the orphan, and the loop isn't closed.
    const dangling: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'straight', row: 5, col: 5, rotation: 0 },
    ]
    const result = moveStartTo(dangling, 5, 5)
    expect(result).toBe(dangling)
    expect(result.length).toBe(dangling.length)
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
