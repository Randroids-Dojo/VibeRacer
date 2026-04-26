import { describe, it, expect } from 'vitest'
import {
  isLapRankInfo,
  formatRankSuffix,
  buildToastWithRank,
} from '@/lib/lapToast'

describe('isLapRankInfo', () => {
  it('accepts a clean rank/boardSize pair', () => {
    expect(isLapRankInfo({ rank: 3, boardSize: 47 })).toBe(true)
  })

  it('accepts the boundary case where rank equals boardSize', () => {
    expect(isLapRankInfo({ rank: 12, boardSize: 12 })).toBe(true)
  })

  it('accepts the rank-1 case on a single-entry board', () => {
    expect(isLapRankInfo({ rank: 1, boardSize: 1 })).toBe(true)
  })

  it('rejects null', () => {
    expect(isLapRankInfo(null)).toBe(false)
  })

  it('rejects undefined', () => {
    expect(isLapRankInfo(undefined)).toBe(false)
  })

  it('rejects a non-object value', () => {
    expect(isLapRankInfo('rank=3')).toBe(false)
    expect(isLapRankInfo(3)).toBe(false)
  })

  it('rejects missing rank', () => {
    expect(isLapRankInfo({ boardSize: 5 })).toBe(false)
  })

  it('rejects missing boardSize', () => {
    expect(isLapRankInfo({ rank: 1 })).toBe(false)
  })

  it('rejects non-finite numbers', () => {
    expect(isLapRankInfo({ rank: NaN, boardSize: 5 })).toBe(false)
    expect(isLapRankInfo({ rank: Infinity, boardSize: 5 })).toBe(false)
    expect(isLapRankInfo({ rank: 1, boardSize: NaN })).toBe(false)
    expect(isLapRankInfo({ rank: 1, boardSize: Infinity })).toBe(false)
  })

  it('rejects fractional values', () => {
    expect(isLapRankInfo({ rank: 1.5, boardSize: 5 })).toBe(false)
    expect(isLapRankInfo({ rank: 1, boardSize: 4.2 })).toBe(false)
  })

  it('rejects zero or negative rank', () => {
    expect(isLapRankInfo({ rank: 0, boardSize: 5 })).toBe(false)
    expect(isLapRankInfo({ rank: -3, boardSize: 5 })).toBe(false)
  })

  it('rejects zero or negative boardSize', () => {
    expect(isLapRankInfo({ rank: 1, boardSize: 0 })).toBe(false)
    expect(isLapRankInfo({ rank: 1, boardSize: -2 })).toBe(false)
  })

  it('rejects rank greater than boardSize', () => {
    expect(isLapRankInfo({ rank: 5, boardSize: 4 })).toBe(false)
  })
})

describe('formatRankSuffix', () => {
  it('formats a small board', () => {
    expect(formatRankSuffix({ rank: 3, boardSize: 12 })).toBe('#3 / 12')
  })

  it('formats a rank-1 hit', () => {
    expect(formatRankSuffix({ rank: 1, boardSize: 1 })).toBe('#1 / 1')
  })

  it('formats large numbers without commas (KISS)', () => {
    expect(formatRankSuffix({ rank: 41, boardSize: 1234 })).toBe('#41 / 1234')
  })
})

describe('buildToastWithRank', () => {
  it('appends the rank suffix to a lap-saved toast', () => {
    const out = buildToastWithRank('lap 3 saved', 'lap', {
      rank: 7,
      boardSize: 25,
    })
    expect(out).toBe('lap 3 saved · #7 / 25')
  })

  it('appends the rank suffix to a NEW PB toast', () => {
    const out = buildToastWithRank('NEW PB!', 'pb', { rank: 2, boardSize: 25 })
    expect(out).toBe('NEW PB! · #2 / 25')
  })

  it('omits the rank suffix on a NEW RECORD toast (always #1 by definition)', () => {
    const out = buildToastWithRank('NEW RECORD!', 'record', {
      rank: 1,
      boardSize: 25,
    })
    expect(out).toBe('NEW RECORD!')
  })

  it('returns the base toast unchanged when rank info is missing', () => {
    expect(buildToastWithRank('lap 1 saved', 'lap', null)).toBe('lap 1 saved')
    expect(buildToastWithRank('lap 1 saved', 'lap', undefined)).toBe(
      'lap 1 saved',
    )
  })

  it('returns the base toast unchanged when rank info is malformed', () => {
    expect(
      buildToastWithRank('lap 1 saved', 'lap', {
        rank: 0,
        boardSize: 5,
      } as unknown as null),
    ).toBe('lap 1 saved')
    expect(
      buildToastWithRank('lap 1 saved', 'lap', {
        rank: 1,
        boardSize: NaN,
      } as unknown as null),
    ).toBe('lap 1 saved')
  })

  it('returns an empty base toast unchanged so an empty lane stays empty', () => {
    expect(
      buildToastWithRank('', 'lap', { rank: 1, boardSize: 5 }),
    ).toBe('')
  })

  it('returns the base toast unchanged when kind is null', () => {
    const out = buildToastWithRank('lap 1 saved', null, {
      rank: 3,
      boardSize: 5,
    })
    expect(out).toBe('lap 1 saved · #3 / 5')
  })
})
