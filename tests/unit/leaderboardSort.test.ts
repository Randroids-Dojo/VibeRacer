import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SORT_DIRECTION,
  sortLeaderboardEntries,
  type LeaderboardEntry,
} from '@/lib/leaderboard'

function entry(
  rank: number,
  initials: string,
  lapTimeMs: number,
  ts: number,
): LeaderboardEntry {
  return {
    rank,
    initials,
    lapTimeMs,
    ts,
    isMe: false,
    tuning: null,
    inputMode: null,
  }
}

describe('sortLeaderboardEntries', () => {
  // Server delivers the board pre-sorted by lap time ascending. Build a small
  // fixture that reflects that natural order so the tests read clearly.
  const board: LeaderboardEntry[] = [
    entry(1, 'BBB', 1500, 1_700_000_000_300),
    entry(2, 'AAA', 1800, 1_700_000_000_100),
    entry(3, 'CCC', 1800, 1_700_000_000_500), // tied lap time with rank 2
    entry(4, 'AAA', 2400, 1_700_000_000_200), // duplicate initials with rank 2
  ]

  it('sorting by rank ascending returns the original order', () => {
    const out = sortLeaderboardEntries(board, 'rank', 'asc')
    expect(out.map((e) => e.rank)).toEqual([1, 2, 3, 4])
  })

  it('sorting by rank descending flips the order', () => {
    const out = sortLeaderboardEntries(board, 'rank', 'desc')
    expect(out.map((e) => e.rank)).toEqual([4, 3, 2, 1])
  })

  it('does not mutate the input array', () => {
    const before = board.map((e) => e.rank)
    sortLeaderboardEntries(board, 'time', 'desc')
    sortLeaderboardEntries(board, 'racer', 'desc')
    const after = board.map((e) => e.rank)
    expect(after).toEqual(before)
  })

  it('sorts by racer initials alphabetically, case-insensitive', () => {
    const out = sortLeaderboardEntries(board, 'racer', 'asc')
    expect(out.map((e) => e.initials)).toEqual(['AAA', 'AAA', 'BBB', 'CCC'])
  })

  it('preserves rank order on ties when sorting by racer', () => {
    // The two AAA entries have ranks 2 and 4. Tie-break is by ascending rank
    // regardless of direction.
    const out = sortLeaderboardEntries(board, 'racer', 'asc')
    const aaaRanks = out.filter((e) => e.initials === 'AAA').map((e) => e.rank)
    expect(aaaRanks).toEqual([2, 4])
  })

  it('sorts by lap time ascending (best first)', () => {
    const out = sortLeaderboardEntries(board, 'time', 'asc')
    expect(out.map((e) => e.lapTimeMs)).toEqual([1500, 1800, 1800, 2400])
  })

  it('sorts by lap time descending (slowest first)', () => {
    const out = sortLeaderboardEntries(board, 'time', 'desc')
    expect(out.map((e) => e.lapTimeMs)).toEqual([2400, 1800, 1800, 1500])
  })

  it('breaks ties on lap time by rank, even when descending', () => {
    // The two 1800ms rows are rank 2 and 3. Tie-break stays on ascending rank.
    const out = sortLeaderboardEntries(board, 'time', 'desc')
    const tied = out.filter((e) => e.lapTimeMs === 1800).map((e) => e.rank)
    expect(tied).toEqual([2, 3])
  })

  it('sorts by date timestamp', () => {
    const asc = sortLeaderboardEntries(board, 'date', 'asc')
    expect(asc.map((e) => e.ts)).toEqual([
      1_700_000_000_100,
      1_700_000_000_200,
      1_700_000_000_300,
      1_700_000_000_500,
    ])
    const desc = sortLeaderboardEntries(board, 'date', 'desc')
    expect(desc.map((e) => e.ts)).toEqual([
      1_700_000_000_500,
      1_700_000_000_300,
      1_700_000_000_200,
      1_700_000_000_100,
    ])
  })

  it('handles an empty board without throwing', () => {
    expect(sortLeaderboardEntries([], 'rank', 'asc')).toEqual([])
  })

  it('exposes a sane default direction per key', () => {
    expect(DEFAULT_SORT_DIRECTION.rank).toBe('asc')
    expect(DEFAULT_SORT_DIRECTION.racer).toBe('asc')
    expect(DEFAULT_SORT_DIRECTION.time).toBe('asc')
    // Date defaults to descending (newest first) which matches what players
    // expect when they tap "DATE": show the most recent runs at the top.
    expect(DEFAULT_SORT_DIRECTION.date).toBe('desc')
  })
})
