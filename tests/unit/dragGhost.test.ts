import { describe, expect, it } from 'vitest'
import type { LeaderboardEntry } from '@/lib/leaderboard'
import { selectDragGhost } from '@/lib/dragGhost'

function entry(
  rank: number,
  lapTimeMs: number,
  nonce: string | null,
  isMe = false,
): LeaderboardEntry {
  return {
    rank,
    initials: 'XYZ',
    lapTimeMs,
    ts: 0,
    isMe,
    tuning: null,
    inputMode: null,
    nonce,
  }
}

describe('selectDragGhost', () => {
  it('returns none for an empty board', () => {
    expect(selectDragGhost([], null)).toEqual({ nonce: null, source: 'none' })
    expect(selectDragGhost([], 8000)).toEqual({ nonce: null, source: 'none' })
  })

  it('returns none if every entry is stale (nonce null)', () => {
    expect(
      selectDragGhost(
        [entry(1, 5000, null), entry(2, 5500, null)],
        null,
      ),
    ).toEqual({ nonce: null, source: 'none' })
  })

  it('returns the top entry when the player has no PB', () => {
    const board = [
      entry(1, 5000, 'a'),
      entry(2, 5500, 'b'),
      entry(3, 6000, 'c'),
    ]
    const result = selectDragGhost(board, null)
    expect(result.source).toBe('top')
    expect(result.nonce).toBe('a')
  })

  it('returns the row immediately above the player when not at rank 1', () => {
    const board = [
      entry(1, 5000, 'a'),
      entry(2, 5500, 'b'),
      entry(3, 6000, 'c'),
      entry(4, 6500, 'd', true),
    ]
    const result = selectDragGhost(board, 6500)
    expect(result.source).toBe('nextFaster')
    expect(result.nonce).toBe('c')
  })

  it('skips ties and picks strictly faster', () => {
    const board = [
      entry(1, 5000, 'a'),
      entry(2, 6000, 'b'),
      entry(3, 6500, 'c', true),
    ]
    const result = selectDragGhost(board, 6500)
    expect(result.source).toBe('nextFaster')
    expect(result.nonce).toBe('b')
  })

  it("returns the player's own PB when they are at rank 1", () => {
    const board = [
      entry(1, 5000, 'a', true),
      entry(2, 5500, 'b'),
      entry(3, 6000, 'c'),
    ]
    const result = selectDragGhost(board, 5000)
    expect(result.source).toBe('ownPb')
    expect(result.nonce).toBe('a')
  })

  it('skips a stale (nonce null) row when picking the next-faster ghost', () => {
    const board = [
      entry(1, 4500, null),
      entry(2, 5000, 'b'),
      entry(3, 6000, 'c', true),
    ]
    const result = selectDragGhost(board, 6000)
    expect(result.source).toBe('nextFaster')
    expect(result.nonce).toBe('b')
  })

  it('falls back to the top entry if every row is at or slower than the player PB', () => {
    const board = [entry(1, 7000, 'a'), entry(2, 7500, 'b')]
    const result = selectDragGhost(board, 7000)
    // Player ties at rank 1 with someone else's time. Treat as top, not ownPb.
    expect(result.source).toBe('top')
    expect(result.nonce).toBe('a')
  })

  it('handles unsorted input by sorting before selection', () => {
    const board = [
      entry(3, 6000, 'c'),
      entry(1, 5000, 'a'),
      entry(2, 5500, 'b'),
    ]
    const result = selectDragGhost(board, null)
    expect(result.nonce).toBe('a')
  })
})
