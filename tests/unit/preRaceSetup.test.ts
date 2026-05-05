import { describe, it, expect } from 'vitest'
import {
  buildPreRaceOptions,
  formatLapMs,
  matchSavedName,
  sameParams,
} from '@/lib/preRaceSetup'
import { cloneDefaultParams } from '@/lib/tuningSettings'
import type { CarParams } from '@/game/physics'
import type { SavedTuning } from '@/lib/tuningLab'

function tuned(overrides: Partial<CarParams> = {}): CarParams {
  return { ...cloneDefaultParams(), ...overrides }
}

function saved(name: string, params: CarParams): SavedTuning {
  return {
    id: `id-${name}`,
    name,
    params,
    ratings: {},
    controlType: 'keyboard',
    trackTags: [],
    lapTimeMs: null,
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('buildPreRaceOptions', () => {
  it('always ends with a default-car option, even with no other inputs', () => {
    const out = buildPreRaceOptions({
      perTrack: null,
      lastLoaded: null,
      creatorTuning: null,
      topEntry: null,
      savedList: [],
    })
    expect(out.map((o) => o.id)).toEqual(['default'])
    expect(out[0].label).toContain('Default')
  })

  it('lists every distinct option in the documented user-priority order', () => {
    // Each variant tweaks maxSpeed to a value distinct from both each
    // other and from DEFAULT_CAR_PARAMS.maxSpeed (26) so the dedupe
    // pass keeps every option.
    const perTrack = tuned({ maxSpeed: 30 })
    const lastLoaded = tuned({ maxSpeed: 28 })
    const creator = tuned({ maxSpeed: 27 })
    const topParams = tuned({ maxSpeed: 24 })
    const savedParams = tuned({ maxSpeed: 22 })
    const out = buildPreRaceOptions({
      perTrack,
      lastLoaded,
      creatorTuning: creator,
      topEntry: { initials: 'ABC', lapTimeMs: 30_500, params: topParams },
      savedList: [saved('Track Day', savedParams)],
    })
    expect(out.map((o) => o.id)).toEqual([
      'perTrack',
      'lastLoaded',
      'creator',
      'topLeader',
      'saved:id-Track Day',
      'default',
    ])
  })

  it('dedupes by parameter equality so a saved-as-perTrack pick collapses', () => {
    const params = tuned({ maxSpeed: 30 })
    const out = buildPreRaceOptions({
      perTrack: params,
      lastLoaded: { ...params },
      creatorTuning: null,
      topEntry: null,
      savedList: [],
    })
    expect(out.map((o) => o.id)).toEqual(['perTrack', 'default'])
  })

  it('keeps the Default row even when an earlier source carries stock params', () => {
    // perTrack is exactly the default car. Without the always-show rule
    // the Default fallback would dedupe away, hiding the explicit
    // "stock car" affordance. This test pins the documented behavior.
    const out = buildPreRaceOptions({
      perTrack: cloneDefaultParams(),
      lastLoaded: null,
      creatorTuning: null,
      topEntry: null,
      savedList: [],
    })
    expect(out.map((o) => o.id)).toEqual(['perTrack', 'default'])
  })

  it('uses a matching saved-tuning name in the perTrack label when params match', () => {
    const params = tuned({ maxSpeed: 30 })
    const out = buildPreRaceOptions({
      perTrack: params,
      lastLoaded: null,
      creatorTuning: null,
      topEntry: null,
      savedList: [saved('Track Day v3', params)],
    })
    const perTrack = out.find((o) => o.id === 'perTrack')
    expect(perTrack?.label).toBe('Track Day v3')
    expect(perTrack?.sublabel).toBe('Last setup you raced here')
  })

  it('formats the top-leaderboard sublabel with initials and lap time', () => {
    const out = buildPreRaceOptions({
      perTrack: null,
      lastLoaded: null,
      creatorTuning: null,
      topEntry: { initials: 'XYZ', lapTimeMs: 83_456, params: tuned({ maxSpeed: 24 }) },
      savedList: [],
    })
    const top = out.find((o) => o.id === 'topLeader')
    expect(top?.label).toBe('Top leaderboard setup (XYZ)')
    expect(top?.sublabel).toBe('Lap 1:23.456 by XYZ')
  })
})

describe('sameParams', () => {
  it('treats parameter-equal CarParams as equal', () => {
    expect(sameParams(tuned(), tuned())).toBe(true)
  })

  it('treats any differing field as unequal', () => {
    expect(sameParams(tuned(), tuned({ maxSpeed: 99 }))).toBe(false)
  })

  it('treats objects with missing canonical keys as unequal', () => {
    // A hand-edited or schema-migrated CarParams missing fields would
    // otherwise produce NaN comparisons that read as "equal". Forcing a
    // canonical-key + finite-value walk catches it.
    const malformed = { ...tuned() } as unknown as Record<string, number>
    delete malformed.maxSpeed
    expect(sameParams(malformed as unknown as ReturnType<typeof tuned>, tuned())).toBe(
      false,
    )
  })

  it('treats NaN-bearing inputs as unequal', () => {
    expect(sameParams(tuned({ maxSpeed: Number.NaN }), tuned())).toBe(false)
  })
})

describe('matchSavedName', () => {
  it('returns the first saved tuning name that matches', () => {
    const params = tuned({ accel: 22 })
    const list = [saved('Loose', tuned({ accel: 30 })), saved('Match', params)]
    expect(matchSavedName(params, list)).toBe('Match')
  })

  it('returns null when no saved tuning matches', () => {
    expect(matchSavedName(tuned(), [saved('A', tuned({ accel: 30 }))])).toBe(
      null,
    )
  })
})

describe('formatLapMs', () => {
  it('formats sub-minute laps with leading zero seconds', () => {
    expect(formatLapMs(12_345)).toBe('0:12.345')
  })

  it('formats multi-minute laps', () => {
    expect(formatLapMs(83_456)).toBe('1:23.456')
  })

  it('falls back to dashes for garbage input', () => {
    expect(formatLapMs(Number.NaN)).toBe('--:--.---')
    expect(formatLapMs(-1)).toBe('--:--.---')
  })
})
