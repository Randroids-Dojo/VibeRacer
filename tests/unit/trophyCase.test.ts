import { describe, it, expect } from 'vitest'
import {
  ACHIEVEMENTS,
  type AchievementMap,
} from '@/game/achievements'
import {
  TROPHY_CASE_CATEGORY_ORDER,
  TROPHY_CASE_RECENT_LIMIT,
  buildTrophyCaseSummary,
  countCategoryTotal,
  emptyTrophyCaseSummary,
  formatTrophyTimestamp,
  isTrophyCategory,
  type TrophyCategory,
} from '@/lib/trophyCase'

const SLUG = 'oval'
const VHASH = 'a'.repeat(64)

function meta(unlockedAt: number, slug: string = SLUG, hash: string = VHASH) {
  return { unlockedAt, slug, versionHash: hash }
}

describe('trophyCase: TROPHY_CASE_CATEGORY_ORDER', () => {
  it('lists every category exactly once with no duplicates', () => {
    const seen = new Set<string>()
    for (const c of TROPHY_CASE_CATEGORY_ORDER) {
      expect(seen.has(c)).toBe(false)
      seen.add(c)
    }
    expect(seen.size).toBe(TROPHY_CASE_CATEGORY_ORDER.length)
  })

  it('covers every category that appears in the ACHIEVEMENTS catalog', () => {
    const catalogCategories = new Set(ACHIEVEMENTS.map((a) => a.category))
    for (const category of catalogCategories) {
      expect(TROPHY_CASE_CATEGORY_ORDER).toContain(category)
    }
  })

  it('contains no em dashes or en dashes in any category name', () => {
    for (const c of TROPHY_CASE_CATEGORY_ORDER) {
      expect(c).not.toMatch(/[\u2013\u2014]/)
    }
  })
})

describe('trophyCase: TROPHY_CASE_RECENT_LIMIT', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(TROPHY_CASE_RECENT_LIMIT)).toBe(true)
    expect(TROPHY_CASE_RECENT_LIMIT).toBeGreaterThan(0)
  })

  it('is at most the catalog size so the slice is meaningful', () => {
    expect(TROPHY_CASE_RECENT_LIMIT).toBeLessThanOrEqual(ACHIEVEMENTS.length)
  })
})

describe('trophyCase: countCategoryTotal', () => {
  it('returns zero for a category with no achievements', () => {
    // Cast a bogus value through the type guard to exercise the loop's no-match
    // branch without breaking the type system at the call site.
    expect(countCategoryTotal('not-a-category' as unknown as TrophyCategory)).toBe(0)
  })

  it('matches the live catalog count for every known category', () => {
    for (const category of TROPHY_CASE_CATEGORY_ORDER) {
      const expected = ACHIEVEMENTS.filter((a) => a.category === category).length
      expect(countCategoryTotal(category)).toBe(expected)
    }
  })

  it('summed across categories equals the total catalog size', () => {
    const sum = TROPHY_CASE_CATEGORY_ORDER.reduce(
      (total, c) => total + countCategoryTotal(c),
      0,
    )
    expect(sum).toBe(ACHIEVEMENTS.length)
  })
})

describe('trophyCase: emptyTrophyCaseSummary', () => {
  it('reports zero unlocks against the full catalog total', () => {
    const summary = emptyTrophyCaseSummary()
    expect(summary.unlockedCount).toBe(0)
    expect(summary.totalCount).toBe(ACHIEVEMENTS.length)
    expect(summary.recent).toEqual([])
  })

  it('includes every category in canonical order with the correct totals', () => {
    const summary = emptyTrophyCaseSummary()
    expect(summary.byCategory.map((entry) => entry.category)).toEqual(
      TROPHY_CASE_CATEGORY_ORDER as readonly string[],
    )
    for (const entry of summary.byCategory) {
      expect(entry.unlocked).toBe(0)
      expect(entry.total).toBe(countCategoryTotal(entry.category))
    }
  })

  it('returns a fresh object on every call', () => {
    const a = emptyTrophyCaseSummary()
    const b = emptyTrophyCaseSummary()
    expect(a).not.toBe(b)
    expect(a.recent).not.toBe(b.recent)
    expect(a.byCategory).not.toBe(b.byCategory)
    a.byCategory[0].unlocked = 99
    expect(b.byCategory[0].unlocked).toBe(0)
  })
})

describe('trophyCase: buildTrophyCaseSummary', () => {
  it('returns a zero summary for an empty map', () => {
    const summary = buildTrophyCaseSummary({})
    expect(summary.unlockedCount).toBe(0)
    expect(summary.recent).toEqual([])
    for (const entry of summary.byCategory) {
      expect(entry.unlocked).toBe(0)
    }
  })

  it('counts a single unlocked id and surfaces it in recent', () => {
    const map: AchievementMap = {
      'first-lap': meta(1000),
    }
    const summary = buildTrophyCaseSummary(map)
    expect(summary.unlockedCount).toBe(1)
    expect(summary.recent).toHaveLength(1)
    expect(summary.recent[0].def.id).toBe('first-lap')
    expect(summary.recent[0].slug).toBe(SLUG)
    expect(summary.recent[0].unlockedAt).toBe(1000)
    const discovery = summary.byCategory.find((c) => c.category === 'discovery')!
    expect(discovery.unlocked).toBe(1)
  })

  it('caps the recent list at TROPHY_CASE_RECENT_LIMIT', () => {
    const map: AchievementMap = {}
    for (let i = 0; i < ACHIEVEMENTS.length; i++) {
      map[ACHIEVEMENTS[i].id] = meta(1000 + i)
    }
    const summary = buildTrophyCaseSummary(map)
    expect(summary.unlockedCount).toBe(ACHIEVEMENTS.length)
    expect(summary.recent).toHaveLength(TROPHY_CASE_RECENT_LIMIT)
  })

  it('sorts recent unlocks newest-first', () => {
    const map: AchievementMap = {
      'first-lap': meta(1000),
      'sub-30': meta(3000),
      'first-pb': meta(2000),
    }
    const summary = buildTrophyCaseSummary(map)
    expect(summary.recent.map((r) => r.def.id)).toEqual([
      'sub-30',
      'first-pb',
      'first-lap',
    ])
  })

  it('breaks recent-list ties on the catalog order so output is deterministic', () => {
    // first-lap (idx 0) and first-pb (idx 1) both unlocked at the same ms.
    const map: AchievementMap = {
      'first-lap': meta(1000),
      'first-pb': meta(1000),
    }
    const summary = buildTrophyCaseSummary(map)
    expect(summary.recent.map((r) => r.def.id)).toEqual(['first-lap', 'first-pb'])
  })

  it('counts unlocks per category', () => {
    const map: AchievementMap = {
      'sub-30': meta(1),
      'sub-20': meta(2),
      'first-lap': meta(3),
      'platinum-medal': meta(4),
    }
    const summary = buildTrophyCaseSummary(map)
    const speed = summary.byCategory.find((c) => c.category === 'speed')!
    const discovery = summary.byCategory.find((c) => c.category === 'discovery')!
    const mastery = summary.byCategory.find((c) => c.category === 'mastery')!
    const style = summary.byCategory.find((c) => c.category === 'style')!
    expect(speed.unlocked).toBe(2)
    expect(discovery.unlocked).toBe(1)
    expect(mastery.unlocked).toBe(1)
    expect(style.unlocked).toBe(0)
  })

  it('drops a stored entry with a non-finite unlockedAt', () => {
    const map = {
      'first-lap': { unlockedAt: Number.NaN, slug: SLUG, versionHash: VHASH },
      'first-pb': meta(2000),
    } as unknown as AchievementMap
    const summary = buildTrophyCaseSummary(map)
    expect(summary.unlockedCount).toBe(1)
    expect(summary.recent.map((r) => r.def.id)).toEqual(['first-pb'])
  })

  it('drops a stored entry with a non-positive unlockedAt', () => {
    const map = {
      'first-lap': { unlockedAt: 0, slug: SLUG, versionHash: VHASH },
      'first-pb': { unlockedAt: -100, slug: SLUG, versionHash: VHASH },
      'sub-30': meta(2000),
    } as unknown as AchievementMap
    const summary = buildTrophyCaseSummary(map)
    expect(summary.unlockedCount).toBe(1)
    expect(summary.recent.map((r) => r.def.id)).toEqual(['sub-30'])
  })

  it('surfaces the recorded slug for each recent unlock', () => {
    const map: AchievementMap = {
      'first-lap': meta(1000, 'sandbox'),
      'sub-30': meta(2000, 'oval'),
    }
    const summary = buildTrophyCaseSummary(map)
    const slugs = summary.recent.map((r) => r.slug)
    expect(slugs).toEqual(['oval', 'sandbox'])
  })

  it('falls back to an empty slug when the stored value is not a string', () => {
    const map = {
      'first-lap': { unlockedAt: 1000, slug: 42, versionHash: VHASH },
    } as unknown as AchievementMap
    const summary = buildTrophyCaseSummary(map)
    expect(summary.recent[0].slug).toBe('')
  })

  it('always includes every category, even those with zero unlocks', () => {
    const map: AchievementMap = {
      'first-lap': meta(1000),
    }
    const summary = buildTrophyCaseSummary(map)
    const categories = summary.byCategory.map((c) => c.category)
    expect(categories).toEqual(TROPHY_CASE_CATEGORY_ORDER as readonly string[])
  })

  it('returns a fresh object so callers can mutate without aliasing', () => {
    const map: AchievementMap = {
      'first-lap': meta(1000),
    }
    const a = buildTrophyCaseSummary(map)
    const b = buildTrophyCaseSummary(map)
    expect(a).not.toBe(b)
    expect(a.byCategory).not.toBe(b.byCategory)
    expect(a.recent).not.toBe(b.recent)
  })
})

describe('trophyCase: formatTrophyTimestamp', () => {
  const NOW = 1_700_000_000_000

  it('returns "today" for a fresh unlock', () => {
    expect(formatTrophyTimestamp(NOW, NOW)).toBe('today')
    expect(formatTrophyTimestamp(NOW - 60_000, NOW)).toBe('today')
  })

  it('returns "yesterday" for a 1-day-old unlock', () => {
    const day = 24 * 60 * 60 * 1000
    expect(formatTrophyTimestamp(NOW - day, NOW)).toBe('yesterday')
  })

  it('returns "Nd ago" for sub-week unlocks', () => {
    const day = 24 * 60 * 60 * 1000
    expect(formatTrophyTimestamp(NOW - 3 * day, NOW)).toBe('3d ago')
    expect(formatTrophyTimestamp(NOW - 6 * day, NOW)).toBe('6d ago')
  })

  it('returns "Nw ago" for sub-month unlocks', () => {
    const day = 24 * 60 * 60 * 1000
    expect(formatTrophyTimestamp(NOW - 7 * day, NOW)).toBe('1w ago')
    expect(formatTrophyTimestamp(NOW - 14 * day, NOW)).toBe('2w ago')
    expect(formatTrophyTimestamp(NOW - 28 * day, NOW)).toBe('4w ago')
  })

  it('returns "Nmo ago" for sub-year unlocks', () => {
    const day = 24 * 60 * 60 * 1000
    expect(formatTrophyTimestamp(NOW - 30 * day, NOW)).toBe('1mo ago')
    expect(formatTrophyTimestamp(NOW - 90 * day, NOW)).toBe('3mo ago')
  })

  it('returns "Ny ago" for year-plus unlocks', () => {
    const day = 24 * 60 * 60 * 1000
    expect(formatTrophyTimestamp(NOW - 365 * day, NOW)).toBe('1y ago')
    expect(formatTrophyTimestamp(NOW - 2 * 365 * day, NOW)).toBe('2y ago')
  })

  it('clamps a future timestamp to today rather than rendering a negative', () => {
    expect(formatTrophyTimestamp(NOW + 60_000, NOW)).toBe('today')
  })

  it('returns an empty string for non-finite or non-positive inputs', () => {
    expect(formatTrophyTimestamp(Number.NaN, NOW)).toBe('')
    expect(formatTrophyTimestamp(Number.POSITIVE_INFINITY, NOW)).toBe('')
    expect(formatTrophyTimestamp(0, NOW)).toBe('')
    expect(formatTrophyTimestamp(-1, NOW)).toBe('')
    expect(formatTrophyTimestamp(NOW, Number.NaN)).toBe('')
    expect(formatTrophyTimestamp(NOW, 0)).toBe('')
  })

  it('contains no em dashes or en dashes in any branch', () => {
    const day = 24 * 60 * 60 * 1000
    const samples = [
      formatTrophyTimestamp(NOW, NOW),
      formatTrophyTimestamp(NOW - day, NOW),
      formatTrophyTimestamp(NOW - 3 * day, NOW),
      formatTrophyTimestamp(NOW - 7 * day, NOW),
      formatTrophyTimestamp(NOW - 30 * day, NOW),
      formatTrophyTimestamp(NOW - 365 * day, NOW),
    ]
    for (const sample of samples) {
      expect(sample).not.toMatch(/[\u2013\u2014]/)
    }
  })
})

describe('trophyCase: isTrophyCategory', () => {
  it('accepts every canonical category', () => {
    for (const category of TROPHY_CASE_CATEGORY_ORDER) {
      expect(isTrophyCategory(category)).toBe(true)
    }
  })

  it('rejects null, undefined, and non-string inputs', () => {
    expect(isTrophyCategory(null)).toBe(false)
    expect(isTrophyCategory(undefined)).toBe(false)
    expect(isTrophyCategory(0)).toBe(false)
    expect(isTrophyCategory({})).toBe(false)
    expect(isTrophyCategory([])).toBe(false)
  })

  it('rejects an unknown string', () => {
    expect(isTrophyCategory('not-real')).toBe(false)
    expect(isTrophyCategory('')).toBe(false)
    expect(isTrophyCategory('SPEED')).toBe(false)
  })
})
