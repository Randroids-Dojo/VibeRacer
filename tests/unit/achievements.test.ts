import { describe, it, expect } from 'vitest'
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_IDS,
  DRIFT_KING_THRESHOLD,
  FIVE_PB_STREAK,
  MARATHONER_DRIVE_MS,
  SUB_15_MS,
  SUB_20_MS,
  SUB_30_MS,
  TRACK_VETERAN_LAP_COUNT,
  TRIPLE_PB_STREAK,
  VARIETY_PACK_SLUG_COUNT,
  achievementProgress,
  evaluateAchievements,
  getAchievementDef,
  isAchievementId,
  unlockAchievements,
  type AchievementMap,
  type AchievementSnapshot,
} from '@/game/achievements'

const baseSnapshot: AchievementSnapshot = {
  lapTimeMs: null,
  isPb: false,
  driftLapScore: null,
  pbStreak: 0,
  trackLapCount: 0,
  trackDriveMs: 0,
  optimalComplete: false,
  distinctSlugCount: 0,
  wrongWayTriggered: false,
  medalTier: null,
}

describe('ACHIEVEMENT_IDS / ACHIEVEMENTS', () => {
  it('every id has a unique definition', () => {
    const seen = new Set<string>()
    for (const def of ACHIEVEMENTS) seen.add(def.id)
    expect(seen.size).toBe(ACHIEVEMENTS.length)
    expect(seen.size).toBe(ACHIEVEMENT_IDS.length)
  })

  it('every definition has non-empty name and description', () => {
    for (const def of ACHIEVEMENTS) {
      expect(def.name.length).toBeGreaterThan(0)
      expect(def.description.length).toBeGreaterThan(0)
    }
  })

  it('uses no em-dashes anywhere in player-facing copy', () => {
    for (const def of ACHIEVEMENTS) {
      expect(def.name).not.toContain('\u2014')
      expect(def.description).not.toContain('\u2014')
    }
  })

  it('every category is one of the documented values', () => {
    const valid = new Set([
      'speed',
      'progression',
      'style',
      'mastery',
      'discovery',
    ])
    for (const def of ACHIEVEMENTS) {
      expect(valid.has(def.category)).toBe(true)
    }
  })
})

describe('isAchievementId', () => {
  it('accepts every documented id', () => {
    for (const id of ACHIEVEMENT_IDS) {
      expect(isAchievementId(id)).toBe(true)
    }
  })

  it('rejects unknown strings', () => {
    expect(isAchievementId('bogus')).toBe(false)
    expect(isAchievementId('')).toBe(false)
  })

  it('rejects non-string values', () => {
    expect(isAchievementId(123)).toBe(false)
    expect(isAchievementId(null)).toBe(false)
    expect(isAchievementId(undefined)).toBe(false)
    expect(isAchievementId({})).toBe(false)
  })
})

describe('getAchievementDef', () => {
  it('returns the def for a known id', () => {
    const def = getAchievementDef('first-lap')
    expect(def?.name).toBe('First Lap')
  })

  it('returns null for an unknown id', () => {
    expect(getAchievementDef('mystery')).toBeNull()
  })
})

describe('evaluateAchievements - First Lap', () => {
  it('fires on any positive lap time', () => {
    const earned = evaluateAchievements({ ...baseSnapshot, lapTimeMs: 45_000 })
    expect(earned).toContain('first-lap')
  })

  it('does not fire when lapTimeMs is null', () => {
    const earned = evaluateAchievements(baseSnapshot)
    expect(earned).not.toContain('first-lap')
  })

  it('does not fire on a non-finite lap time', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      lapTimeMs: Number.POSITIVE_INFINITY,
    })
    expect(earned).not.toContain('first-lap')
  })

  it('does not fire on a non-positive lap time', () => {
    expect(
      evaluateAchievements({ ...baseSnapshot, lapTimeMs: 0 }),
    ).not.toContain('first-lap')
    expect(
      evaluateAchievements({ ...baseSnapshot, lapTimeMs: -10 }),
    ).not.toContain('first-lap')
  })
})

describe('evaluateAchievements - First PB', () => {
  it('fires when isPb is true', () => {
    const earned = evaluateAchievements({ ...baseSnapshot, isPb: true })
    expect(earned).toContain('first-pb')
  })

  it('does not fire when isPb is false', () => {
    const earned = evaluateAchievements(baseSnapshot)
    expect(earned).not.toContain('first-pb')
  })
})

describe('evaluateAchievements - Speed milestones', () => {
  it('Sub-30 fires when lap is under 30s', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      lapTimeMs: SUB_30_MS - 1,
    })
    expect(earned).toContain('sub-30')
  })

  it('Sub-30 does not fire at exactly 30s (boundary excludes the threshold)', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      lapTimeMs: SUB_30_MS,
    })
    expect(earned).not.toContain('sub-30')
  })

  it('Sub-20 fires when lap is under 20s', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      lapTimeMs: SUB_20_MS - 1,
    })
    expect(earned).toContain('sub-20')
  })

  it('Sub-15 fires when lap is under 15s', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      lapTimeMs: SUB_15_MS - 1,
    })
    expect(earned).toContain('sub-15')
  })

  it('a single very-fast lap unlocks every speed tier in one pass', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      lapTimeMs: 12_000,
    })
    expect(earned).toContain('sub-30')
    expect(earned).toContain('sub-20')
    expect(earned).toContain('sub-15')
  })

  it('does not fire any speed tier without a lap', () => {
    const earned = evaluateAchievements(baseSnapshot)
    expect(earned).not.toContain('sub-30')
    expect(earned).not.toContain('sub-20')
    expect(earned).not.toContain('sub-15')
  })
})

describe('evaluateAchievements - Drift King', () => {
  it('fires at exactly the threshold', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      driftLapScore: DRIFT_KING_THRESHOLD,
    })
    expect(earned).toContain('drift-king')
  })

  it('does not fire just below the threshold', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      driftLapScore: DRIFT_KING_THRESHOLD - 1,
    })
    expect(earned).not.toContain('drift-king')
  })

  it('does not fire on null', () => {
    expect(
      evaluateAchievements({ ...baseSnapshot, driftLapScore: null }),
    ).not.toContain('drift-king')
  })

  it('does not fire on a non-finite drift score', () => {
    expect(
      evaluateAchievements({ ...baseSnapshot, driftLapScore: Number.NaN }),
    ).not.toContain('drift-king')
  })
})

describe('evaluateAchievements - PB streaks', () => {
  it('Hat Trick fires at the triple threshold', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      pbStreak: TRIPLE_PB_STREAK,
    })
    expect(earned).toContain('triple-pb-streak')
  })

  it('Hat Trick does not fire just below the threshold', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      pbStreak: TRIPLE_PB_STREAK - 1,
    })
    expect(earned).not.toContain('triple-pb-streak')
  })

  it('On Fire fires at the five threshold and implicitly clears the triple too', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      pbStreak: FIVE_PB_STREAK,
    })
    expect(earned).toContain('five-pb-streak')
    expect(earned).toContain('triple-pb-streak')
  })
})

describe('evaluateAchievements - Track Veteran / Marathoner', () => {
  it('Track Veteran fires at exactly the threshold', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      trackLapCount: TRACK_VETERAN_LAP_COUNT,
    })
    expect(earned).toContain('track-veteran')
  })

  it('Track Veteran does not fire below the threshold', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      trackLapCount: TRACK_VETERAN_LAP_COUNT - 1,
    })
    expect(earned).not.toContain('track-veteran')
  })

  it('Marathoner fires at the cumulative drive threshold', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      trackDriveMs: MARATHONER_DRIVE_MS,
    })
    expect(earned).toContain('marathoner')
  })

  it('Marathoner does not fire below the threshold', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      trackDriveMs: MARATHONER_DRIVE_MS - 1,
    })
    expect(earned).not.toContain('marathoner')
  })
})

describe('evaluateAchievements - Perfectionist / Variety / Wrong-Way / Platinum', () => {
  it('Perfectionist fires when optimalComplete', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      optimalComplete: true,
    })
    expect(earned).toContain('perfectionist')
  })

  it('Variety Pack fires at the slug threshold', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      distinctSlugCount: VARIETY_PACK_SLUG_COUNT,
    })
    expect(earned).toContain('variety-pack')
  })

  it('Variety Pack does not fire below the slug threshold', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      distinctSlugCount: VARIETY_PACK_SLUG_COUNT - 1,
    })
    expect(earned).not.toContain('variety-pack')
  })

  it('Wrong-Way fires when the latch is set', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      wrongWayTriggered: true,
    })
    expect(earned).toContain('wrong-way')
  })

  it('Platinum fires only on the platinum tier', () => {
    expect(
      evaluateAchievements({ ...baseSnapshot, medalTier: 'platinum' }),
    ).toContain('platinum-medal')
    expect(
      evaluateAchievements({ ...baseSnapshot, medalTier: 'gold' }),
    ).not.toContain('platinum-medal')
    expect(
      evaluateAchievements({ ...baseSnapshot, medalTier: null }),
    ).not.toContain('platinum-medal')
  })
})

describe('unlockAchievements', () => {
  it('adds new ids with the supplied metadata', () => {
    const meta = { unlockedAt: 100, slug: 'oval', versionHash: 'abc' }
    const out = unlockAchievements({}, ['first-lap'], meta)
    expect(out.unlocked).toEqual(['first-lap'])
    expect(out.next['first-lap']).toEqual(meta)
  })

  it('skips already-unlocked ids and does not overwrite their metadata', () => {
    const existing: AchievementMap = {
      'first-lap': { unlockedAt: 50, slug: 'old', versionHash: 'xyz' },
    }
    const meta = { unlockedAt: 100, slug: 'oval', versionHash: 'abc' }
    const out = unlockAchievements(existing, ['first-lap'], meta)
    expect(out.unlocked).toEqual([])
    expect(out.next['first-lap']?.unlockedAt).toBe(50)
    expect(out.next['first-lap']?.slug).toBe('old')
  })

  it('returns a fresh object so React state updates fire on reference inequality', () => {
    const existing: AchievementMap = {}
    const out = unlockAchievements(
      existing,
      ['first-pb'],
      { unlockedAt: 1, slug: 's', versionHash: 'h' },
    )
    expect(out.next).not.toBe(existing)
  })

  it('handles a mix of new and already-unlocked ids', () => {
    const existing: AchievementMap = {
      'first-lap': { unlockedAt: 1, slug: 's', versionHash: 'h' },
    }
    const out = unlockAchievements(
      existing,
      ['first-lap', 'first-pb', 'sub-30'],
      { unlockedAt: 2, slug: 'oval', versionHash: 'abc' },
    )
    expect(out.unlocked).toEqual(['first-pb', 'sub-30'])
    expect(out.next['first-lap']?.unlockedAt).toBe(1)
    expect(out.next['first-pb']?.unlockedAt).toBe(2)
    expect(out.next['sub-30']?.unlockedAt).toBe(2)
  })

  it('empty newlyEarned list is a no-op', () => {
    const out = unlockAchievements({}, [], {
      unlockedAt: 1,
      slug: 's',
      versionHash: 'h',
    })
    expect(out.unlocked).toEqual([])
    expect(Object.keys(out.next)).toEqual([])
  })
})

describe('achievementProgress', () => {
  it('reports zero on empty', () => {
    const p = achievementProgress({})
    expect(p.unlockedCount).toBe(0)
    expect(p.totalCount).toBe(ACHIEVEMENTS.length)
    expect(p.fraction).toBe(0)
  })

  it('counts unlocked entries', () => {
    const map: AchievementMap = {
      'first-lap': { unlockedAt: 1, slug: 's', versionHash: 'h' },
      'first-pb': { unlockedAt: 1, slug: 's', versionHash: 'h' },
    }
    const p = achievementProgress(map)
    expect(p.unlockedCount).toBe(2)
    expect(p.fraction).toBeCloseTo(2 / ACHIEVEMENTS.length, 5)
  })

  it('ignores ids that are not in the canonical list', () => {
    // A stale stored id (after a rename) should not inflate the count. The
    // helper iterates ACHIEVEMENTS rather than the input map's keys.
    const map = {
      'first-lap': { unlockedAt: 1, slug: 's', versionHash: 'h' },
      'unknown-future-id': { unlockedAt: 1, slug: 's', versionHash: 'h' },
    } as unknown as AchievementMap
    const p = achievementProgress(map)
    expect(p.unlockedCount).toBe(1)
  })

  it('caps at the total count', () => {
    const map: AchievementMap = {}
    for (const def of ACHIEVEMENTS) {
      map[def.id] = { unlockedAt: 1, slug: 's', versionHash: 'h' }
    }
    const p = achievementProgress(map)
    expect(p.unlockedCount).toBe(p.totalCount)
    expect(p.fraction).toBe(1)
  })
})

describe('combined lap-completion scenarios', () => {
  it('first lap on a fresh slug unlocks first-lap, first-pb, and any speed tier the lap qualifies for', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      lapTimeMs: 25_000,
      isPb: true,
      pbStreak: 1,
    })
    expect(earned).toContain('first-lap')
    expect(earned).toContain('first-pb')
    expect(earned).toContain('sub-30')
    expect(earned).not.toContain('sub-20')
  })

  it('a non-PB lap only fires the first-lap and any speed tiers it crosses', () => {
    const earned = evaluateAchievements({
      ...baseSnapshot,
      lapTimeMs: 18_000,
      isPb: false,
      pbStreak: 0,
    })
    expect(earned).toContain('first-lap')
    expect(earned).not.toContain('first-pb')
    expect(earned).toContain('sub-30')
    expect(earned).toContain('sub-20')
    expect(earned).not.toContain('triple-pb-streak')
  })
})
