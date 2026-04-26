import { describe, it, expect } from 'vitest'
import {
  ACHIEVEMENTS,
  DRIFT_KING_THRESHOLD,
  FIVE_PB_STREAK,
  MARATHONER_DRIVE_MS,
  SUB_15_MS,
  SUB_20_MS,
  SUB_30_MS,
  TRACK_VETERAN_LAP_COUNT,
  TRIPLE_PB_STREAK,
  VARIETY_PACK_SLUG_COUNT,
  type AchievementMap,
} from '@/game/achievements'
import {
  buildAchievementProgress,
  emptyAchievementProgressSnapshot,
  formatDurationMinutes,
  formatLapTimeSeconds,
  pickNextGoals,
  type AchievementProgressSnapshot,
} from '@/game/achievementProgress'

function snap(
  overrides: Partial<AchievementProgressSnapshot> = {},
): AchievementProgressSnapshot {
  return { ...emptyAchievementProgressSnapshot(), ...overrides }
}

describe('emptyAchievementProgressSnapshot', () => {
  it('returns a fresh object on every call', () => {
    const a = emptyAchievementProgressSnapshot()
    const b = emptyAchievementProgressSnapshot()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it('starts every numeric counter at zero or null', () => {
    const s = emptyAchievementProgressSnapshot()
    expect(s.lifetimeFastestLapMs).toBeNull()
    expect(s.lifetimeBestDriftScore).toBeNull()
    expect(s.lifetimeBestPbStreak).toBeNull()
    expect(s.trackLapCount).toBe(0)
    expect(s.trackDriveMs).toBe(0)
    expect(s.optimalComplete).toBe(false)
    expect(s.distinctSlugCount).toBe(0)
    expect(s.platinumEarnedAnywhere).toBe(false)
    expect(s.wrongWayTriggered).toBe(false)
  })
})

describe('formatLapTimeSeconds', () => {
  it('formats whole seconds with three decimals', () => {
    expect(formatLapTimeSeconds(20_000)).toBe('20.000s')
  })
  it('formats fractional seconds', () => {
    expect(formatLapTimeSeconds(21_412)).toBe('21.412s')
  })
  it('returns the placeholder on non-positive input', () => {
    expect(formatLapTimeSeconds(0)).toBe('--.---s')
    expect(formatLapTimeSeconds(-5)).toBe('--.---s')
  })
  it('returns the placeholder on non-finite input', () => {
    expect(formatLapTimeSeconds(NaN)).toBe('--.---s')
    expect(formatLapTimeSeconds(Infinity)).toBe('--.---s')
  })
})

describe('formatDurationMinutes', () => {
  it('formats sub-minute', () => {
    expect(formatDurationMinutes(30_000)).toBe('0:30')
  })
  it('formats whole minutes', () => {
    expect(formatDurationMinutes(60_000)).toBe('1:00')
  })
  it('zero pads seconds', () => {
    expect(formatDurationMinutes(125_000)).toBe('2:05')
  })
  it('formats the marathoner threshold', () => {
    expect(formatDurationMinutes(MARATHONER_DRIVE_MS)).toBe('30:00')
  })
  it('returns 0:00 on non-finite or negative input', () => {
    expect(formatDurationMinutes(NaN)).toBe('0:00')
    expect(formatDurationMinutes(-1)).toBe('0:00')
  })
})

describe('buildAchievementProgress', () => {
  it('returns an entry for every achievement in the catalog', () => {
    const map = buildAchievementProgress(snap(), {})
    for (const def of ACHIEVEMENTS) {
      expect(map[def.id]).toBeDefined()
    }
  })

  it('marks every entry as locked when the unlock map is empty', () => {
    const map = buildAchievementProgress(snap(), {})
    for (const def of ACHIEVEMENTS) {
      expect(map[def.id]?.unlocked).toBe(false)
    }
  })

  it('marks an entry as unlocked when present in the unlock map', () => {
    const unlocks: AchievementMap = {
      'sub-30': { unlockedAt: 1, slug: 'oval', versionHash: 'a'.repeat(64) },
    }
    const map = buildAchievementProgress(snap(), unlocks)
    expect(map['sub-30']?.unlocked).toBe(true)
    expect(map['sub-20']?.unlocked).toBe(false)
  })

  describe('lap-time achievements', () => {
    it('reports zero progress when no lap is on file', () => {
      const map = buildAchievementProgress(snap(), {})
      const sub20 = map['sub-20']!
      expect(sub20.value).toBe(0)
      expect(sub20.fraction).toBe(0)
      expect(sub20.label).toContain('no lap yet')
    })

    it('caps fraction at 1 once the player beats the threshold', () => {
      const map = buildAchievementProgress(
        snap({ lifetimeFastestLapMs: 18_000 }),
        {},
      )
      const sub20 = map['sub-20']!
      expect(sub20.value).toBe(18_000)
      expect(sub20.target).toBe(SUB_20_MS)
      expect(sub20.fraction).toBe(1)
    })

    it('computes target/value fraction when the player has not crossed yet', () => {
      const map = buildAchievementProgress(
        snap({ lifetimeFastestLapMs: 30_000 }),
        {},
      )
      const sub20 = map['sub-20']!
      expect(sub20.fraction).toBeCloseTo(SUB_20_MS / 30_000, 5)
    })

    it('renders a value/target seconds label', () => {
      const map = buildAchievementProgress(
        snap({ lifetimeFastestLapMs: 21_412 }),
        {},
      )
      expect(map['sub-20']?.label).toBe('21.412s / 20.000s')
    })

    it('rejects non-finite or non-positive lap times defensively', () => {
      const map = buildAchievementProgress(
        snap({ lifetimeFastestLapMs: -100 }),
        {},
      )
      expect(map['sub-20']?.value).toBe(0)
      expect(map['sub-20']?.fraction).toBe(0)
    })

    it('handles all three speed tiers with the same fastest lap', () => {
      const map = buildAchievementProgress(
        snap({ lifetimeFastestLapMs: 18_000 }),
        {},
      )
      expect(map['sub-30']?.fraction).toBe(1)
      expect(map['sub-20']?.fraction).toBe(1)
      expect(map['sub-15']?.fraction).toBeLessThan(1)
    })
  })

  describe('drift-king', () => {
    it('reports zero on empty drift', () => {
      const map = buildAchievementProgress(snap(), {})
      expect(map['drift-king']?.value).toBe(0)
      expect(map['drift-king']?.fraction).toBe(0)
    })

    it('reports proportional progress at half-target', () => {
      const map = buildAchievementProgress(
        snap({ lifetimeBestDriftScore: 500 }),
        {},
      )
      expect(map['drift-king']?.value).toBe(500)
      expect(map['drift-king']?.target).toBe(DRIFT_KING_THRESHOLD)
      expect(map['drift-king']?.fraction).toBeCloseTo(0.5, 5)
    })

    it('clamps at the threshold', () => {
      const map = buildAchievementProgress(
        snap({ lifetimeBestDriftScore: 9999 }),
        {},
      )
      expect(map['drift-king']?.fraction).toBe(1)
    })

    it('floors fractional drift scores', () => {
      const map = buildAchievementProgress(
        snap({ lifetimeBestDriftScore: 320.7 }),
        {},
      )
      expect(map['drift-king']?.value).toBe(320)
    })
  })

  describe('pb streak achievements', () => {
    it('reports zero on null streak', () => {
      const map = buildAchievementProgress(snap(), {})
      expect(map['triple-pb-streak']?.fraction).toBe(0)
      expect(map['five-pb-streak']?.fraction).toBe(0)
    })

    it('credits triple at 3 and partial at five', () => {
      const map = buildAchievementProgress(
        snap({ lifetimeBestPbStreak: 3 }),
        {},
      )
      expect(map['triple-pb-streak']?.fraction).toBe(1)
      expect(map['five-pb-streak']?.fraction).toBeCloseTo(3 / FIVE_PB_STREAK, 5)
    })

    it('credits both at 5', () => {
      const map = buildAchievementProgress(
        snap({ lifetimeBestPbStreak: 5 }),
        {},
      )
      expect(map['triple-pb-streak']?.fraction).toBe(1)
      expect(map['five-pb-streak']?.fraction).toBe(1)
    })

    it('uses the streak label format', () => {
      const map = buildAchievementProgress(
        snap({ lifetimeBestPbStreak: 4 }),
        {},
      )
      expect(map['triple-pb-streak']?.label).toBe(`best x4 / x${TRIPLE_PB_STREAK}`)
    })
  })

  describe('track-veteran', () => {
    it('reports cumulative laps on the current track', () => {
      const map = buildAchievementProgress(snap({ trackLapCount: 23 }), {})
      expect(map['track-veteran']?.value).toBe(23)
      expect(map['track-veteran']?.target).toBe(TRACK_VETERAN_LAP_COUNT)
      expect(map['track-veteran']?.fraction).toBeCloseTo(
        23 / TRACK_VETERAN_LAP_COUNT,
        5,
      )
    })

    it('clamps at the threshold', () => {
      const map = buildAchievementProgress(snap({ trackLapCount: 999 }), {})
      expect(map['track-veteran']?.fraction).toBe(1)
    })

    it('uses the laps label format', () => {
      const map = buildAchievementProgress(snap({ trackLapCount: 7 }), {})
      expect(map['track-veteran']?.label).toBe(`7 / ${TRACK_VETERAN_LAP_COUNT} laps`)
    })
  })

  describe('marathoner', () => {
    it('reports half-progress at 15 minutes', () => {
      const map = buildAchievementProgress(
        snap({ trackDriveMs: 15 * 60 * 1000 }),
        {},
      )
      expect(map['marathoner']?.fraction).toBeCloseTo(0.5, 5)
    })

    it('formats the duration label', () => {
      const map = buildAchievementProgress(
        snap({ trackDriveMs: 12 * 60 * 1000 + 30_000 }),
        {},
      )
      expect(map['marathoner']?.label).toBe('12:30 / 30:00')
    })

    it('clamps at the threshold', () => {
      const map = buildAchievementProgress(
        snap({ trackDriveMs: 999 * 60 * 1000 }),
        {},
      )
      expect(map['marathoner']?.fraction).toBe(1)
    })

    it('handles negative input by collapsing to zero', () => {
      const map = buildAchievementProgress(snap({ trackDriveMs: -1 }), {})
      expect(map['marathoner']?.value).toBe(0)
    })
  })

  describe('variety-pack', () => {
    it('reports distinct slug count', () => {
      const map = buildAchievementProgress(
        snap({ distinctSlugCount: 3 }),
        {},
      )
      expect(map['variety-pack']?.value).toBe(3)
      expect(map['variety-pack']?.target).toBe(VARIETY_PACK_SLUG_COUNT)
      expect(map['variety-pack']?.fraction).toBeCloseTo(
        3 / VARIETY_PACK_SLUG_COUNT,
        5,
      )
    })

    it('uses the tracks label', () => {
      const map = buildAchievementProgress(
        snap({ distinctSlugCount: 2 }),
        {},
      )
      expect(map['variety-pack']?.label).toBe(`2 / ${VARIETY_PACK_SLUG_COUNT} tracks`)
    })
  })

  describe('binary milestones', () => {
    it('marks first-lap as binary', () => {
      const map = buildAchievementProgress(snap(), {})
      expect(map['first-lap']?.binary).toBe(true)
      expect(map['first-pb']?.binary).toBe(true)
      expect(map['perfectionist']?.binary).toBe(true)
      expect(map['platinum-medal']?.binary).toBe(true)
      expect(map['wrong-way']?.binary).toBe(true)
    })

    it('reports perfectionist progress on the current track', () => {
      const incomplete = buildAchievementProgress(snap(), {})
      expect(incomplete['perfectionist']?.fraction).toBe(0)
      expect(incomplete['perfectionist']?.label).toContain('not yet')

      const complete = buildAchievementProgress(
        snap({ optimalComplete: true }),
        {},
      )
      expect(complete['perfectionist']?.fraction).toBe(1)
      expect(complete['perfectionist']?.label).toBe('complete')
    })

    it('reports platinum binary state', () => {
      const map = buildAchievementProgress(
        snap({ platinumEarnedAnywhere: true }),
        {},
      )
      expect(map['platinum-medal']?.fraction).toBe(1)
      expect(map['platinum-medal']?.label).toBe('earned')
    })

    it('reports wrong-way binary state', () => {
      const map = buildAchievementProgress(
        snap({ wrongWayTriggered: true }),
        {},
      )
      expect(map['wrong-way']?.fraction).toBe(1)
      expect(map['wrong-way']?.label).toBe('triggered')
    })

    it('reports first-lap binary state from the unlock map', () => {
      const unlocks: AchievementMap = {
        'first-lap': {
          unlockedAt: 1,
          slug: 'oval',
          versionHash: 'a'.repeat(64),
        },
      }
      const map = buildAchievementProgress(snap(), unlocks)
      expect(map['first-lap']?.fraction).toBe(1)
      expect(map['first-lap']?.label).toBe('done')
    })
  })

  it('does not mutate the input snapshot', () => {
    const before = snap({ lifetimeFastestLapMs: 21_000 })
    const copy = { ...before }
    buildAchievementProgress(before, {})
    expect(before).toEqual(copy)
  })

  it('survives a fully-corrupt snapshot', () => {
    const map = buildAchievementProgress(
      {
        lifetimeFastestLapMs: NaN,
        lifetimeBestDriftScore: -1,
        lifetimeBestPbStreak: NaN,
        trackLapCount: -5,
        trackDriveMs: -100,
        optimalComplete: false,
        distinctSlugCount: -1,
        platinumEarnedAnywhere: false,
        wrongWayTriggered: false,
      },
      {},
    )
    for (const def of ACHIEVEMENTS) {
      const entry = map[def.id]
      expect(entry).toBeDefined()
      expect(entry!.value).toBeGreaterThanOrEqual(0)
      expect(entry!.fraction).toBeGreaterThanOrEqual(0)
      expect(entry!.fraction).toBeLessThanOrEqual(1)
    }
  })
})

describe('pickNextGoals', () => {
  it('returns no goals when every achievement is binary or unlocked', () => {
    const map = buildAchievementProgress(
      snap({
        optimalComplete: true,
        platinumEarnedAnywhere: true,
        wrongWayTriggered: true,
      }),
      {
        'sub-30': { unlockedAt: 1, slug: 'a', versionHash: 'a'.repeat(64) },
        'sub-20': { unlockedAt: 1, slug: 'a', versionHash: 'a'.repeat(64) },
        'sub-15': { unlockedAt: 1, slug: 'a', versionHash: 'a'.repeat(64) },
        'drift-king': { unlockedAt: 1, slug: 'a', versionHash: 'a'.repeat(64) },
        'triple-pb-streak': {
          unlockedAt: 1,
          slug: 'a',
          versionHash: 'a'.repeat(64),
        },
        'five-pb-streak': {
          unlockedAt: 1,
          slug: 'a',
          versionHash: 'a'.repeat(64),
        },
        'track-veteran': {
          unlockedAt: 1,
          slug: 'a',
          versionHash: 'a'.repeat(64),
        },
        marathoner: { unlockedAt: 1, slug: 'a', versionHash: 'a'.repeat(64) },
        'variety-pack': {
          unlockedAt: 1,
          slug: 'a',
          versionHash: 'a'.repeat(64),
        },
      },
      // first-lap, first-pb, perfectionist, platinum-medal, wrong-way are all
      // binary so they are excluded regardless of unlock state.
    )
    expect(pickNextGoals(map, 3)).toEqual([])
  })

  it('returns the highest-fraction locked numeric goals first', () => {
    const map = buildAchievementProgress(
      snap({
        // sub-30 at fraction 1.0; sub-20 at 0.8; sub-15 at 0.6
        lifetimeFastestLapMs: 25_000,
        // drift-king at fraction 0.4
        lifetimeBestDriftScore: 400,
        // track-veteran at fraction 0.1
        trackLapCount: 5,
      }),
      {},
    )
    const goals = pickNextGoals(map, 3)
    // Sub-30 leads at fraction 1.0; sub-20 and sub-15 follow at 0.8 and 0.6
    // respectively, beating the lower-fraction drift-king and track-veteran.
    expect(goals[0]).toBe('sub-30')
    expect(goals[1]).toBe('sub-20')
    expect(goals[2]).toBe('sub-15')
  })

  it('respects the max parameter', () => {
    const map = buildAchievementProgress(
      snap({
        lifetimeFastestLapMs: 25_000,
        lifetimeBestDriftScore: 400,
        trackLapCount: 5,
        distinctSlugCount: 2,
        trackDriveMs: 600_000,
      }),
      {},
    )
    expect(pickNextGoals(map, 2).length).toBe(2)
    expect(pickNextGoals(map, 1).length).toBe(1)
  })

  it('skips already-unlocked achievements', () => {
    const map = buildAchievementProgress(
      snap({
        lifetimeFastestLapMs: 25_000,
        lifetimeBestDriftScore: 400,
      }),
      {
        'sub-30': { unlockedAt: 1, slug: 'a', versionHash: 'a'.repeat(64) },
      },
    )
    const goals = pickNextGoals(map, 3)
    expect(goals).not.toContain('sub-30')
    expect(goals).toContain('drift-king')
  })

  it('skips binary milestones', () => {
    const map = buildAchievementProgress(snap({ optimalComplete: false }), {})
    const goals = pickNextGoals(map, 5)
    expect(goals).not.toContain('perfectionist')
    expect(goals).not.toContain('first-lap')
    expect(goals).not.toContain('first-pb')
    expect(goals).not.toContain('platinum-medal')
    expect(goals).not.toContain('wrong-way')
  })

  it('breaks ties using the canonical catalog order', () => {
    // All three speed tiers tied at fraction 0 with no lap on file.
    const map = buildAchievementProgress(snap(), {})
    const goals = pickNextGoals(map, 3)
    // Sub-30 appears in the catalog before sub-20 and sub-15, so on a tie the
    // earliest catalog entry wins.
    const speedGoals = goals.filter((id) =>
      id === 'sub-30' || id === 'sub-20' || id === 'sub-15',
    )
    expect(speedGoals[0]).toBe('sub-30')
  })

  it('returns an empty array on a non-positive max', () => {
    const map = buildAchievementProgress(snap(), {})
    expect(pickNextGoals(map, 0)).toEqual([])
    expect(pickNextGoals(map, -1)).toEqual([])
    expect(pickNextGoals(map, NaN)).toEqual([])
  })

  it('floors fractional max values', () => {
    const map = buildAchievementProgress(snap(), {})
    expect(pickNextGoals(map, 2.9).length).toBe(2)
  })
})
