import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ASPECTS,
  TUNING_LAB_KEY,
  TUNING_LAB_SCHEMA_TAG,
  TUNING_LAB_SYNTHETIC_SLUG,
  applySavedAsLastLoaded,
  buildExportPayload,
  computeOverallRating,
  createDefaultDamping,
  deleteTuning,
  filterSaved,
  getTuning,
  makeSavedTuning,
  parseImportedJson,
  persistLabLastLoaded,
  readSavedTunings,
  recommendNextParams,
  sortSaved,
  upsertTuning,
  writeSavedTunings,
  type AspectRatings,
  type Damping,
  type ParamDeltas,
  type SavedTuning,
} from '@/lib/tuningLab'
import { DEFAULT_CAR_PARAMS } from '@/game/physics'
import {
  TUNING_BOUNDS,
  TUNING_LAST_LOADED_KEY,
  cloneDefaultParams,
  perTrackKey,
} from '@/lib/tuningSettings'

const ALL_THREES: AspectRatings = {
  topSpeed: 3,
  acceleration: 3,
  braking: 3,
  lowSpeedTurning: 3,
  highSpeedTurning: 3,
  coastFeel: 3,
  offTrackPenalty: 3,
}

function emptyDeltas(): ParamDeltas {
  return {}
}

describe('recommendNextParams', () => {
  it('leaves params unchanged when every rating is 3', () => {
    const out = recommendNextParams(
      cloneDefaultParams(),
      ALL_THREES,
      emptyDeltas(),
      createDefaultDamping(),
    )
    expect(out.next).toEqual(cloneDefaultParams())
    expect(out.perParamDelta).toEqual({})
  })

  it('leaves params unchanged when every rating is null or skipped', () => {
    const ratings: AspectRatings = {
      topSpeed: null,
      acceleration: null,
    }
    const out = recommendNextParams(
      cloneDefaultParams(),
      ratings,
      emptyDeltas(),
      createDefaultDamping(),
    )
    expect(out.next).toEqual(cloneDefaultParams())
  })

  it('a 5 on top speed lowers maxSpeed; a 1 raises it', () => {
    const high = recommendNextParams(
      cloneDefaultParams(),
      { topSpeed: 5 },
      emptyDeltas(),
      createDefaultDamping(),
    )
    expect(high.next.maxSpeed).toBeLessThan(DEFAULT_CAR_PARAMS.maxSpeed)
    expect(high.perParamDelta.maxSpeed).toBeLessThan(0)

    const low = recommendNextParams(
      cloneDefaultParams(),
      { topSpeed: 1 },
      emptyDeltas(),
      createDefaultDamping(),
    )
    expect(low.next.maxSpeed).toBeGreaterThan(DEFAULT_CAR_PARAMS.maxSpeed)
    expect(low.perParamDelta.maxSpeed).toBeGreaterThan(0)
  })

  it('a 5 on offTrackPenalty lowers offTrackDrag and raises offTrackMaxSpeed', () => {
    // offTrackDrag has sign +1, offTrackMaxSpeed has sign -1, so a "too punishing"
    // rating of 5 should reduce drag and raise the speed cap (less punishment).
    const out = recommendNextParams(
      cloneDefaultParams(),
      { offTrackPenalty: 5 },
      emptyDeltas(),
      createDefaultDamping(),
    )
    expect(out.next.offTrackDrag).toBeLessThan(DEFAULT_CAR_PARAMS.offTrackDrag)
    expect(out.next.offTrackMaxSpeed).toBeGreaterThan(
      DEFAULT_CAR_PARAMS.offTrackMaxSpeed,
    )
  })

  it('weighted aspects share the per-param delta proportionally', () => {
    // lowSpeedTurning has weight 1 on steerRateLow and 0.5 on minSpeedForSteering.
    // A single 1 rating: unit = (3-1)/2 = 1; range_steerLow=4.5; baseStep=0.12.
    // Raw steerRateLow contribution = 1 * 1 * 1 * 4.5 * 0.12 = 0.54.
    // Sum/weight = 0.54 / 1 = 0.54.
    const out = recommendNextParams(
      cloneDefaultParams(),
      { lowSpeedTurning: 1 },
      emptyDeltas(),
      createDefaultDamping(),
    )
    expect(out.perParamDelta.steerRateLow).toBeCloseTo(0.54, 5)
    // Raw minSpeedForSteering contribution = 1 * (-1) * 0.5 * 5 * 0.12 = -0.3.
    // Sum/weight = -0.3 / 0.5 = -0.6.
    expect(out.perParamDelta.minSpeedForSteering).toBeCloseTo(-0.6, 5)
  })

  it('clamps to bounds when the suggested step would overshoot', () => {
    const start = { ...cloneDefaultParams(), maxSpeed: TUNING_BOUNDS.maxSpeed.max - 0.1 }
    const out = recommendNextParams(
      start,
      { topSpeed: 1 },
      emptyDeltas(),
      createDefaultDamping(),
    )
    expect(out.next.maxSpeed).toBeLessThanOrEqual(TUNING_BOUNDS.maxSpeed.max)
  })

  it('halves damping when the next delta flips sign against the previous one', () => {
    const damping = createDefaultDamping()
    const round1 = recommendNextParams(
      cloneDefaultParams(),
      { topSpeed: 5 },
      emptyDeltas(),
      damping,
    )
    expect(round1.perParamDelta.maxSpeed).toBeLessThan(0)
    expect(round1.newDamping.maxSpeed).toBe(1)

    const round2 = recommendNextParams(
      round1.next,
      { topSpeed: 1 },
      round1.perParamDelta,
      round1.newDamping,
    )
    expect(round2.perParamDelta.maxSpeed).toBeGreaterThan(0)
    expect(round2.newDamping.maxSpeed).toBe(0.5)

    const round3 = recommendNextParams(
      round2.next,
      { topSpeed: 5 },
      round2.perParamDelta,
      round2.newDamping,
    )
    expect(round3.newDamping.maxSpeed).toBe(0.25)
  })

  it('does not change damping when sign stays the same', () => {
    const damping = createDefaultDamping()
    const round1 = recommendNextParams(
      cloneDefaultParams(),
      { topSpeed: 5 },
      emptyDeltas(),
      damping,
    )
    const round2 = recommendNextParams(
      round1.next,
      { topSpeed: 5 },
      round1.perParamDelta,
      round1.newDamping,
    )
    expect(round2.newDamping.maxSpeed).toBe(1)
  })

  it('damping floors at 1/16 after repeated oscillation', () => {
    let damping: Damping = createDefaultDamping()
    let prev: ParamDeltas = {}
    let params = cloneDefaultParams()
    for (let i = 0; i < 12; i++) {
      const score = (i % 2 === 0 ? 5 : 1) as 1 | 5
      const r = recommendNextParams(params, { topSpeed: score }, prev, damping)
      params = r.next
      prev = r.perParamDelta
      damping = r.newDamping
    }
    expect(damping.maxSpeed).toBeGreaterThanOrEqual(1 / 16 - 1e-9)
    expect(damping.maxSpeed).toBeLessThanOrEqual(0.5)
  })

  it('every aspect maps to at least one CarParams key', () => {
    for (const a of ASPECTS) {
      expect(a.contributions.length).toBeGreaterThan(0)
    }
  })
})

describe('computeOverallRating', () => {
  it('returns 0 when there are no rated aspects', () => {
    expect(computeOverallRating({})).toBe(0)
    expect(computeOverallRating({ topSpeed: null })).toBe(0)
  })

  it('returns 1 when every rated aspect is exactly 3', () => {
    expect(
      computeOverallRating({ topSpeed: 3, acceleration: 3, braking: 3 }),
    ).toBe(1)
  })

  it('returns 0 when every rated aspect is at an extreme', () => {
    expect(
      computeOverallRating({ topSpeed: 1, acceleration: 5, braking: 1 }),
    ).toBe(0)
  })
})

describe('localStorage saved-tunings store', () => {
  const originalWindow = (globalThis as { window?: unknown }).window
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = v
        },
        removeItem: (k: string) => {
          delete store[k]
        },
        clear: () => {
          store = {}
        },
      },
    }
  })

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window
    } else {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  })

  function fixture(id: string, name: string, lapTimeMs: number | null = null): SavedTuning {
    return makeSavedTuning({
      id,
      name,
      round: {
        params: cloneDefaultParams(),
        ratings: { topSpeed: 3, acceleration: 3 },
        notes: '',
        lapTimeMs,
      },
      controlType: 'touch_dual',
      trackTags: ['twisty'],
      now: '2026-04-25T00:00:00.000Z',
    })
  }

  it('reads an empty list when nothing is stored', () => {
    expect(readSavedTunings()).toEqual([])
  })

  it('round-trips a saved tuning', () => {
    const t = fixture('a', 'Mobile twisty')
    upsertTuning(t)
    expect(readSavedTunings()).toEqual([t])
  })

  it('upsert replaces an existing id rather than duplicating', () => {
    const t = fixture('a', 'Mobile twisty')
    upsertTuning(t)
    const t2 = { ...t, name: 'Renamed' }
    upsertTuning(t2)
    const all = readSavedTunings()
    expect(all.length).toBe(1)
    expect(all[0].name).toBe('Renamed')
  })

  it('deleteTuning removes by id and leaves the rest alone', () => {
    upsertTuning(fixture('a', 'A'))
    upsertTuning(fixture('b', 'B'))
    deleteTuning('a')
    const remaining = readSavedTunings()
    expect(remaining.length).toBe(1)
    expect(remaining[0].id).toBe('b')
  })

  it('getTuning returns null for unknown ids', () => {
    expect(getTuning('nope')).toBeNull()
    upsertTuning(fixture('a', 'A'))
    expect(getTuning('a')?.name).toBe('A')
  })

  it('drops corrupt rows on read but keeps valid ones', () => {
    const good = fixture('a', 'Good')
    store[TUNING_LAB_KEY] = JSON.stringify([good, { id: 'broken', oops: true }])
    expect(readSavedTunings()).toEqual([good])
  })

  it('treats non-array storage as empty', () => {
    store[TUNING_LAB_KEY] = JSON.stringify({ not: 'an array' })
    expect(readSavedTunings()).toEqual([])
  })

  it('writeSavedTunings overwrites the list', () => {
    const a = fixture('a', 'A')
    const b = fixture('b', 'B')
    writeSavedTunings([a, b])
    expect(readSavedTunings().map((t) => t.id)).toEqual(['a', 'b'])
    writeSavedTunings([])
    expect(readSavedTunings()).toEqual([])
  })

  it('applySavedAsLastLoaded writes the lastLoaded and synthetic per-track keys', () => {
    const t: SavedTuning = {
      ...fixture('a', 'A'),
      params: { ...cloneDefaultParams(), maxSpeed: 30 },
    }
    applySavedAsLastLoaded(t)
    const stored = JSON.parse(store[TUNING_LAST_LOADED_KEY])
    expect(stored.maxSpeed).toBe(30)
    const perTrack = JSON.parse(store[perTrackKey(TUNING_LAB_SYNTHETIC_SLUG)])
    expect(perTrack.maxSpeed).toBe(30)
  })

  it('persistLabLastLoaded snapshots raw params into lastLoaded', () => {
    const params = { ...cloneDefaultParams(), accel: 25 }
    persistLabLastLoaded(params)
    expect(JSON.parse(store[TUNING_LAST_LOADED_KEY]).accel).toBe(25)
    expect(
      JSON.parse(store[perTrackKey(TUNING_LAB_SYNTHETIC_SLUG)]).accel,
    ).toBe(25)
  })

  it('persistLabLastLoaded overwrites with the latest params on each call', () => {
    persistLabLastLoaded({ ...cloneDefaultParams(), accel: 25 })
    persistLabLastLoaded({ ...cloneDefaultParams(), accel: 30 })
    expect(JSON.parse(store[TUNING_LAST_LOADED_KEY]).accel).toBe(30)
  })
})

describe('sortSaved and filterSaved', () => {
  function fx(
    id: string,
    name: string,
    updatedAt: string,
    lapTimeMs: number | null = null,
    tags: ('twisty' | 'fast' | 'mixed' | 'technical')[] = [],
    controlType: 'keyboard' | 'touch_single' | 'touch_dual' = 'keyboard',
    ratings: AspectRatings = { topSpeed: 3 },
  ): SavedTuning {
    return {
      id,
      name,
      params: cloneDefaultParams(),
      ratings,
      controlType,
      trackTags: tags,
      lapTimeMs,
      notes: '',
      createdAt: updatedAt,
      updatedAt,
    }
  }

  const items = [
    fx('a', 'Alpha', '2026-04-22', 12000, ['twisty'], 'touch_dual'),
    fx('b', 'Beta', '2026-04-25', 14000, ['fast'], 'keyboard'),
    fx('c', 'Charlie', '2026-04-20', null, ['twisty', 'mixed'], 'touch_single'),
  ]

  it('sorts by updatedDesc by default', () => {
    expect(sortSaved(items, 'updatedDesc').map((t) => t.id)).toEqual([
      'b',
      'a',
      'c',
    ])
  })

  it('sorts by nameAsc', () => {
    expect(sortSaved(items, 'nameAsc').map((t) => t.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('sorts by lapAsc, putting nulls at the end', () => {
    expect(sortSaved(items, 'lapAsc').map((t) => t.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('filters by controlType', () => {
    expect(
      filterSaved(items, { controlType: 'touch_dual' }).map((t) => t.id),
    ).toEqual(['a'])
  })

  it('filters by trackTag', () => {
    expect(
      filterSaved(items, { trackTag: 'twisty' }).map((t) => t.id),
    ).toEqual(['a', 'c'])
  })

  it('search is case-insensitive substring on the name', () => {
    expect(filterSaved(items, { search: 'BET' }).map((t) => t.id)).toEqual(['b'])
  })

  it('does not mutate the input array', () => {
    const before = items.map((t) => t.id)
    sortSaved(items, 'nameAsc')
    expect(items.map((t) => t.id)).toEqual(before)
  })
})

describe('buildExportPayload and parseImportedJson', () => {
  it('export payload carries the schema tag and round log', () => {
    const payload = buildExportPayload({
      rounds: [
        {
          params: cloneDefaultParams(),
          ratings: { topSpeed: 3 },
          notes: 'felt good',
          lapTimeMs: 12340,
        },
      ],
      controlType: 'touch_dual',
      trackTags: ['twisty'],
      userAgent: 'test/1',
      timestamp: '2026-04-25T00:00:00.000Z',
    })
    expect(payload.schema).toBe(TUNING_LAB_SCHEMA_TAG)
    expect(payload.rounds[0].notes).toBe('felt good')
    expect(payload.controlType).toBe('touch_dual')
  })

  it('round-trips a session via parseImportedJson', () => {
    const payload = buildExportPayload({
      rounds: [
        {
          params: cloneDefaultParams(),
          ratings: { topSpeed: 4 },
          notes: '',
          lapTimeMs: null,
        },
      ],
      controlType: 'keyboard',
      trackTags: [],
      userAgent: 'test/1',
      timestamp: '2026-04-25T00:00:00.000Z',
    })
    const round = parseImportedJson(JSON.parse(JSON.stringify(payload)))
    expect(round.kind).toBe('session')
    if (round.kind === 'session') {
      expect(round.session.controlType).toBe('keyboard')
    }
  })

  it('round-trips a single tuning via parseImportedJson', () => {
    const t = makeSavedTuning({
      id: 'a',
      name: 'A',
      round: {
        params: cloneDefaultParams(),
        ratings: { topSpeed: 3 },
        notes: '',
        lapTimeMs: 8000,
      },
      controlType: 'touch_dual',
      trackTags: ['twisty'],
      now: '2026-04-25T00:00:00.000Z',
    })
    const result = parseImportedJson(JSON.parse(JSON.stringify(t)))
    expect(result.kind).toBe('tuning')
    if (result.kind === 'tuning') {
      expect(result.saved.id).toBe('a')
    }
  })

  it('rejects garbage with a reason', () => {
    expect(parseImportedJson({ junk: true }).kind).toBe('error')
    expect(parseImportedJson(null).kind).toBe('error')
    expect(parseImportedJson('a string').kind).toBe('error')
  })

  it('round-trips a session that includes off-track events and telemetry', () => {
    const payload = buildExportPayload({
      rounds: [
        {
          params: cloneDefaultParams(),
          ratings: { topSpeed: 4 },
          notes: '',
          lapTimeMs: 12000,
          offTrackEvents: [
            {
              lapMs: 1000,
              x: 1,
              z: 2,
              heading: 0.3,
              speed: 18,
              steer: 0.6,
              throttle: 1,
              handbrake: false,
              distanceFromCenter: 5,
              durationMs: 250,
              exitSpeed: 13.4,
              peakDistanceFromCenter: 6,
              exitLapMs: 1250,
            },
          ],
          telemetry: {
            sampleMs: 33,
            positions: [
              [0, 0],
              [1, 0],
              [2, 0],
            ],
            speeds: [0, 5, 10],
            lapTimeMs: 12000,
            offTrackEvents: [],
          },
        },
      ],
      controlType: 'keyboard',
      trackTags: [],
      userAgent: 'test/1',
      timestamp: '2026-04-25T00:00:00.000Z',
    })
    const round = parseImportedJson(JSON.parse(JSON.stringify(payload)))
    expect(round.kind).toBe('session')
    if (round.kind === 'session') {
      const r = round.session.rounds[0]
      expect(r.offTrackEvents?.length).toBe(1)
      expect(r.offTrackEvents?.[0].durationMs).toBe(250)
      expect(r.telemetry?.speeds).toEqual([0, 5, 10])
    }
  })

  it('still parses legacy sessions without off-track or telemetry fields', () => {
    const legacy = {
      schema: TUNING_LAB_SCHEMA_TAG,
      timestamp: '2026-04-25T00:00:00.000Z',
      userAgent: 'legacy/1',
      controlType: 'keyboard',
      trackTags: [],
      rounds: [
        {
          params: cloneDefaultParams(),
          ratings: { topSpeed: 3 },
          notes: '',
          lapTimeMs: 12000,
        },
      ],
      saved: null,
    }
    const round = parseImportedJson(legacy)
    expect(round.kind).toBe('session')
  })
})

describe('makeSavedTuning', () => {
  it('clamps params, trims long names, and limits notes / tags', () => {
    const t = makeSavedTuning({
      id: 'x',
      name: '   ' + 'a'.repeat(80) + '   ',
      round: {
        params: { ...cloneDefaultParams(), maxSpeed: 9999 },
        ratings: {},
        notes: 'n'.repeat(900),
        lapTimeMs: null,
      },
      controlType: 'keyboard',
      trackTags: ['twisty', 'fast', 'mixed', 'technical', 'twisty' as 'twisty'],
      now: '2026-04-25T00:00:00.000Z',
    })
    expect(t.name.length).toBeLessThanOrEqual(48)
    expect(t.params.maxSpeed).toBeLessThanOrEqual(TUNING_BOUNDS.maxSpeed.max)
    expect(t.notes.length).toBeLessThanOrEqual(500)
    expect(t.trackTags.length).toBeLessThanOrEqual(4)
  })

  it('falls back to a default name when the input is whitespace only', () => {
    const t = makeSavedTuning({
      id: 'x',
      name: '   ',
      round: {
        params: cloneDefaultParams(),
        ratings: {},
        notes: '',
        lapTimeMs: null,
      },
      controlType: 'keyboard',
      trackTags: [],
      now: '2026-04-25T00:00:00.000Z',
    })
    expect(t.name).toBe('Unnamed setup')
  })
})
