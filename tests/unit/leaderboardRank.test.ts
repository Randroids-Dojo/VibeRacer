import { describe, it, expect } from 'vitest'
import {
  RANK_TIERS,
  RANK_TIER_LABELS,
  RANK_TIER_COLORS,
  RANK_TIER_DESCRIPTIONS,
  RANK_TOP_PERCENT_FRACTION,
  classifyRank,
  formatRankAriaLabel,
  formatRankBadge,
  isLeaderboardRankInfo,
  isRankUpgrade,
  sanitizeRankInfo,
  type LeaderboardRankInfo,
} from '@/game/leaderboardRank'

describe('RANK_TIERS', () => {
  it('lists every tier exactly once in best-to-worst order', () => {
    expect(RANK_TIERS).toEqual([
      'p1',
      'podium',
      'topTen',
      'topPercent',
      'topHalf',
      'ranked',
    ])
    const seen = new Set(RANK_TIERS)
    expect(seen.size).toBe(RANK_TIERS.length)
  })

  it('declares a non-empty label, description, and color for every tier', () => {
    for (const tier of RANK_TIERS) {
      expect(RANK_TIER_LABELS[tier]).toBeTruthy()
      expect(RANK_TIER_DESCRIPTIONS[tier]).toBeTruthy()
      expect(RANK_TIER_COLORS[tier]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('keeps every label and description em-dash free', () => {
    for (const tier of RANK_TIERS) {
      expect(RANK_TIER_LABELS[tier]).not.toMatch(/[—–]/)
      expect(RANK_TIER_DESCRIPTIONS[tier]).not.toMatch(/[—–]/)
    }
  })
})

describe('RANK_TOP_PERCENT_FRACTION', () => {
  it('sits strictly inside (0, 1)', () => {
    expect(RANK_TOP_PERCENT_FRACTION).toBeGreaterThan(0)
    expect(RANK_TOP_PERCENT_FRACTION).toBeLessThan(1)
  })
})

describe('isLeaderboardRankInfo', () => {
  it('accepts a clean rank/boardSize pair', () => {
    expect(isLeaderboardRankInfo({ rank: 5, boardSize: 47 })).toBe(true)
  })

  it('accepts the boundary case where rank equals boardSize', () => {
    expect(isLeaderboardRankInfo({ rank: 12, boardSize: 12 })).toBe(true)
  })

  it('rejects null / undefined / non-object inputs', () => {
    expect(isLeaderboardRankInfo(null)).toBe(false)
    expect(isLeaderboardRankInfo(undefined)).toBe(false)
    expect(isLeaderboardRankInfo('rank=3')).toBe(false)
    expect(isLeaderboardRankInfo(3)).toBe(false)
  })

  it('rejects missing fields', () => {
    expect(isLeaderboardRankInfo({ rank: 1 })).toBe(false)
    expect(isLeaderboardRankInfo({ boardSize: 1 })).toBe(false)
  })

  it('rejects non-finite or fractional numbers', () => {
    expect(isLeaderboardRankInfo({ rank: NaN, boardSize: 5 })).toBe(false)
    expect(isLeaderboardRankInfo({ rank: Infinity, boardSize: 5 })).toBe(false)
    expect(isLeaderboardRankInfo({ rank: 1.5, boardSize: 5 })).toBe(false)
    expect(isLeaderboardRankInfo({ rank: 1, boardSize: 1.5 })).toBe(false)
  })

  it('rejects zero or negative values', () => {
    expect(isLeaderboardRankInfo({ rank: 0, boardSize: 5 })).toBe(false)
    expect(isLeaderboardRankInfo({ rank: -1, boardSize: 5 })).toBe(false)
    expect(isLeaderboardRankInfo({ rank: 1, boardSize: 0 })).toBe(false)
  })

  it('rejects rank > boardSize', () => {
    expect(isLeaderboardRankInfo({ rank: 5, boardSize: 4 })).toBe(false)
  })
})

describe('sanitizeRankInfo', () => {
  it('passes through a clean payload', () => {
    expect(sanitizeRankInfo({ rank: 3, boardSize: 47 })).toEqual({
      rank: 3,
      boardSize: 47,
    })
  })

  it('floors fractional rank and boardSize', () => {
    expect(sanitizeRankInfo({ rank: 3.9, boardSize: 47.4 })).toEqual({
      rank: 3,
      boardSize: 47,
    })
  })

  it('returns null on missing or non-finite fields', () => {
    expect(sanitizeRankInfo(null)).toBeNull()
    expect(sanitizeRankInfo(undefined)).toBeNull()
    expect(sanitizeRankInfo({})).toBeNull()
    expect(sanitizeRankInfo({ rank: NaN, boardSize: 5 })).toBeNull()
    expect(sanitizeRankInfo({ rank: 5, boardSize: Infinity })).toBeNull()
  })

  it('returns null on zero / negative / rank > boardSize', () => {
    expect(sanitizeRankInfo({ rank: 0, boardSize: 5 })).toBeNull()
    expect(sanitizeRankInfo({ rank: -2, boardSize: 5 })).toBeNull()
    expect(sanitizeRankInfo({ rank: 5, boardSize: 0 })).toBeNull()
    expect(sanitizeRankInfo({ rank: 6, boardSize: 5 })).toBeNull()
  })
})

describe('classifyRank', () => {
  it('returns p1 for rank 1 on any board size', () => {
    expect(classifyRank({ rank: 1, boardSize: 1 })).toBe('p1')
    expect(classifyRank({ rank: 1, boardSize: 1000 })).toBe('p1')
  })

  it('returns podium for rank 2 and rank 3', () => {
    expect(classifyRank({ rank: 2, boardSize: 100 })).toBe('podium')
    expect(classifyRank({ rank: 3, boardSize: 100 })).toBe('podium')
  })

  it('returns topTen for ranks 4-10', () => {
    expect(classifyRank({ rank: 4, boardSize: 100 })).toBe('topTen')
    expect(classifyRank({ rank: 10, boardSize: 100 })).toBe('topTen')
  })

  it('returns topPercent inside the inclusive 10% boundary on a big board', () => {
    expect(classifyRank({ rank: 11, boardSize: 200 })).toBe('topPercent')
    expect(classifyRank({ rank: 20, boardSize: 200 })).toBe('topPercent')
  })

  it('returns topHalf when above the percent line but inside the half', () => {
    expect(classifyRank({ rank: 21, boardSize: 200 })).toBe('topHalf')
    expect(classifyRank({ rank: 100, boardSize: 200 })).toBe('topHalf')
  })

  it('returns ranked for the bottom half on a big board', () => {
    expect(classifyRank({ rank: 101, boardSize: 200 })).toBe('ranked')
    expect(classifyRank({ rank: 199, boardSize: 200 })).toBe('ranked')
  })

  it('handles a tiny board where rank 1 is p1 and rank 2 is podium', () => {
    expect(classifyRank({ rank: 1, boardSize: 2 })).toBe('p1')
    expect(classifyRank({ rank: 2, boardSize: 2 })).toBe('podium')
  })

  it('uses inclusive rounding so a board of 11 has top % at rank 1 only', () => {
    // ceil(11 * 0.1) = ceil(1.1) = 2; rank 1 hits p1 short-circuit, rank 2 is
    // podium. The top-percent slot sits empty between podium and topHalf for
    // small boards, which is intentional: small boards do not need a TOP %
    // tier at all.
    const board = 11
    expect(classifyRank({ rank: 1, boardSize: board })).toBe('p1')
    expect(classifyRank({ rank: 4, boardSize: board })).toBe('topTen')
  })
})

describe('formatRankBadge', () => {
  it('returns P1 for rank 1', () => {
    expect(formatRankBadge({ rank: 1, boardSize: 50 })).toBe('P1')
  })

  it('returns P2 / P3 for podium', () => {
    expect(formatRankBadge({ rank: 2, boardSize: 50 })).toBe('P2')
    expect(formatRankBadge({ rank: 3, boardSize: 50 })).toBe('P3')
  })

  it('returns TOP 10 #N inside the topTen tier', () => {
    expect(formatRankBadge({ rank: 7, boardSize: 100 })).toBe('TOP 10 #7')
  })

  it('returns TOP % #N inside the topPercent tier', () => {
    expect(formatRankBadge({ rank: 18, boardSize: 200 })).toBe('TOP % #18')
  })

  it('returns TOP HALF #N inside the topHalf tier', () => {
    expect(formatRankBadge({ rank: 60, boardSize: 200 })).toBe('TOP HALF #60')
  })

  it('returns P{rank} / {board} fallback for the ranked tier', () => {
    expect(formatRankBadge({ rank: 150, boardSize: 200 })).toBe('P150 / 200')
  })

  it('produces no em-dashes or en-dashes', () => {
    const samples: LeaderboardRankInfo[] = [
      { rank: 1, boardSize: 1 },
      { rank: 2, boardSize: 50 },
      { rank: 8, boardSize: 100 },
      { rank: 18, boardSize: 200 },
      { rank: 60, boardSize: 200 },
      { rank: 150, boardSize: 200 },
    ]
    for (const s of samples) {
      expect(formatRankBadge(s)).not.toMatch(/[—–]/)
    }
  })
})

describe('formatRankAriaLabel', () => {
  it('combines tier description with explicit rank-of-board phrasing', () => {
    expect(formatRankAriaLabel({ rank: 1, boardSize: 47 })).toContain('Rank 1 of 47')
    expect(formatRankAriaLabel({ rank: 1, boardSize: 47 })).toContain(
      RANK_TIER_DESCRIPTIONS.p1,
    )
  })

  it('produces no em-dashes', () => {
    expect(formatRankAriaLabel({ rank: 5, boardSize: 50 })).not.toMatch(/[—–]/)
  })
})

describe('isRankUpgrade', () => {
  it('returns true when there is no prior rank', () => {
    expect(isRankUpgrade(null, { rank: 5, boardSize: 50 })).toBe(true)
    expect(isRankUpgrade(undefined, { rank: 5, boardSize: 50 })).toBe(true)
  })

  it('returns true when prior is structurally invalid', () => {
    expect(
      isRankUpgrade(
        { rank: -1, boardSize: 50 } as unknown as LeaderboardRankInfo,
        { rank: 5, boardSize: 50 },
      ),
    ).toBe(true)
  })

  it('returns true when fresh rank is strictly better', () => {
    expect(
      isRankUpgrade({ rank: 5, boardSize: 50 }, { rank: 3, boardSize: 50 }),
    ).toBe(true)
  })

  it('returns false on a tied rank', () => {
    expect(
      isRankUpgrade({ rank: 5, boardSize: 50 }, { rank: 5, boardSize: 50 }),
    ).toBe(false)
  })

  it('returns false when fresh rank is worse', () => {
    expect(
      isRankUpgrade({ rank: 3, boardSize: 50 }, { rank: 5, boardSize: 50 }),
    ).toBe(false)
  })
})
