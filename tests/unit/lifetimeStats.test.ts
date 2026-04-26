import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  buildLifetimeStats,
  emptyLifetimeStats,
  parseStoredTrackStats,
  parseTrackStatsKey,
  readLifetimeStats,
  TRACK_STATS_PREFIX,
} from '@/lib/lifetimeStats'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const HASH_C = 'c'.repeat(64)

function statsBlob(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    lapCount: 1,
    totalDriveMs: 10000,
    sessionCount: 1,
    firstPlayedAt: 1000,
    lastPlayedAt: 2000,
    ...overrides,
  })
}

describe('emptyLifetimeStats', () => {
  it('returns a fresh zero-snapshot every call', () => {
    const a = emptyLifetimeStats()
    const b = emptyLifetimeStats()
    expect(a).toEqual({
      totalLaps: 0,
      totalDriveMs: 0,
      totalSessions: 0,
      trackCount: 0,
      versionCount: 0,
      firstPlayedAt: null,
      lastPlayedAt: null,
    })
    expect(a).not.toBe(b)
  })
})

describe('parseTrackStatsKey', () => {
  it('returns null for keys without the track-stats prefix', () => {
    expect(parseTrackStatsKey('viberacer.controls')).toBeNull()
    expect(parseTrackStatsKey('viberacer.best.oval.' + HASH_A)).toBeNull()
    expect(parseTrackStatsKey('')).toBeNull()
  })

  it('returns the slug + versionHash for a well-formed key', () => {
    expect(parseTrackStatsKey(`${TRACK_STATS_PREFIX}oval.${HASH_A}`)).toEqual({
      slug: 'oval',
      versionHash: HASH_A,
    })
  })

  it('rejects an invalid version hash', () => {
    expect(parseTrackStatsKey(`${TRACK_STATS_PREFIX}oval.deadbeef`)).toBeNull()
    expect(
      parseTrackStatsKey(`${TRACK_STATS_PREFIX}oval.${'g'.repeat(64)}`),
    ).toBeNull()
  })

  it('rejects an invalid slug', () => {
    expect(
      parseTrackStatsKey(`${TRACK_STATS_PREFIX}-leading.${HASH_A}`),
    ).toBeNull()
    expect(parseTrackStatsKey(`${TRACK_STATS_PREFIX}UPPER.${HASH_A}`)).toBeNull()
  })

  it('rejects shapes with no dot or with the dot at an edge', () => {
    expect(parseTrackStatsKey(`${TRACK_STATS_PREFIX}${HASH_A}`)).toBeNull()
    expect(parseTrackStatsKey(`${TRACK_STATS_PREFIX}.${HASH_A}`)).toBeNull()
    expect(parseTrackStatsKey(`${TRACK_STATS_PREFIX}oval.`)).toBeNull()
  })
})

describe('parseStoredTrackStats', () => {
  it('returns null on null input', () => {
    expect(parseStoredTrackStats(null)).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    expect(parseStoredTrackStats('{not json')).toBeNull()
    expect(parseStoredTrackStats('not even close')).toBeNull()
  })

  it('returns null when the schema fails', () => {
    expect(parseStoredTrackStats('{}')).toBeNull()
    expect(parseStoredTrackStats(statsBlob({ lapCount: -1 }))).toBeNull()
    expect(parseStoredTrackStats(statsBlob({ lapCount: 1.5 }))).toBeNull()
    expect(parseStoredTrackStats(statsBlob({ totalDriveMs: -1 }))).toBeNull()
    expect(
      parseStoredTrackStats(statsBlob({ firstPlayedAt: -1 })),
    ).toBeNull()
    expect(
      parseStoredTrackStats(statsBlob({ lastPlayedAt: 'nope' })),
    ).toBeNull()
  })

  it('round-trips a valid blob with explicit nulls', () => {
    const blob = statsBlob({ firstPlayedAt: null, lastPlayedAt: null })
    expect(parseStoredTrackStats(blob)).toEqual({
      lapCount: 1,
      totalDriveMs: 10000,
      sessionCount: 1,
      firstPlayedAt: null,
      lastPlayedAt: null,
    })
  })
})

describe('buildLifetimeStats', () => {
  it('returns the empty snapshot when no track-stats keys are present', () => {
    expect(buildLifetimeStats([])).toEqual(emptyLifetimeStats())
    expect(
      buildLifetimeStats([
        ['viberacer.controls', '{}'],
        ['unrelated', '1'],
        [`viberacer.best.oval.${HASH_A}`, '12345'],
      ]),
    ).toEqual(emptyLifetimeStats())
  })

  it('aggregates lap / drive / session totals across multiple tracks', () => {
    const stats = buildLifetimeStats([
      [
        `${TRACK_STATS_PREFIX}oval.${HASH_A}`,
        statsBlob({
          lapCount: 5,
          totalDriveMs: 75000,
          sessionCount: 2,
          firstPlayedAt: 1000,
          lastPlayedAt: 5000,
        }),
      ],
      [
        `${TRACK_STATS_PREFIX}sandbox.${HASH_B}`,
        statsBlob({
          lapCount: 3,
          totalDriveMs: 45000,
          sessionCount: 1,
          firstPlayedAt: 4000,
          lastPlayedAt: 8000,
        }),
      ],
    ])
    expect(stats.totalLaps).toBe(8)
    expect(stats.totalDriveMs).toBe(120000)
    expect(stats.totalSessions).toBe(3)
    expect(stats.trackCount).toBe(2)
    expect(stats.versionCount).toBe(2)
    expect(stats.firstPlayedAt).toBe(1000)
    expect(stats.lastPlayedAt).toBe(8000)
  })

  it('dedupes the slug count when multiple versions share a slug', () => {
    const stats = buildLifetimeStats([
      [`${TRACK_STATS_PREFIX}oval.${HASH_A}`, statsBlob({ lapCount: 2 })],
      [`${TRACK_STATS_PREFIX}oval.${HASH_B}`, statsBlob({ lapCount: 3 })],
      [`${TRACK_STATS_PREFIX}sandbox.${HASH_C}`, statsBlob({ lapCount: 1 })],
    ])
    expect(stats.trackCount).toBe(2)
    expect(stats.versionCount).toBe(3)
    expect(stats.totalLaps).toBe(6)
  })

  it('skips malformed keys and malformed blobs silently', () => {
    const stats = buildLifetimeStats([
      [`${TRACK_STATS_PREFIX}oval.${HASH_A}`, statsBlob({ lapCount: 4 })],
      [`${TRACK_STATS_PREFIX}oval.deadbeef`, statsBlob({ lapCount: 100 })],
      [`${TRACK_STATS_PREFIX}oval.${HASH_B}`, '{not json'],
      [`${TRACK_STATS_PREFIX}oval.${HASH_C}`, statsBlob({ lapCount: -1 })],
    ])
    expect(stats.totalLaps).toBe(4)
    expect(stats.versionCount).toBe(1)
    expect(stats.trackCount).toBe(1)
  })

  it('keeps firstPlayedAt at the earliest timestamp seen', () => {
    const stats = buildLifetimeStats([
      [
        `${TRACK_STATS_PREFIX}oval.${HASH_A}`,
        statsBlob({ firstPlayedAt: 500, lastPlayedAt: 2000 }),
      ],
      [
        `${TRACK_STATS_PREFIX}sandbox.${HASH_B}`,
        statsBlob({ firstPlayedAt: 100, lastPlayedAt: 300 }),
      ],
    ])
    expect(stats.firstPlayedAt).toBe(100)
    expect(stats.lastPlayedAt).toBe(2000)
  })

  it('treats null firstPlayedAt / lastPlayedAt entries as not-applicable', () => {
    const stats = buildLifetimeStats([
      [
        `${TRACK_STATS_PREFIX}oval.${HASH_A}`,
        statsBlob({
          firstPlayedAt: null,
          lastPlayedAt: null,
          lapCount: 0,
          totalDriveMs: 0,
          sessionCount: 1,
        }),
      ],
      [
        `${TRACK_STATS_PREFIX}sandbox.${HASH_B}`,
        statsBlob({ firstPlayedAt: 1500, lastPlayedAt: 4500 }),
      ],
    ])
    expect(stats.firstPlayedAt).toBe(1500)
    expect(stats.lastPlayedAt).toBe(4500)
  })

  it('returns null timestamps when every entry has null timestamps', () => {
    const stats = buildLifetimeStats([
      [
        `${TRACK_STATS_PREFIX}oval.${HASH_A}`,
        statsBlob({ firstPlayedAt: null, lastPlayedAt: null }),
      ],
    ])
    expect(stats.firstPlayedAt).toBeNull()
    expect(stats.lastPlayedAt).toBeNull()
  })

  it('treats Map iteration as a valid input shape', () => {
    const map = new Map<string, string>([
      [`${TRACK_STATS_PREFIX}oval.${HASH_A}`, statsBlob({ lapCount: 7 })],
    ])
    const stats = buildLifetimeStats(map)
    expect(stats.totalLaps).toBe(7)
    expect(stats.trackCount).toBe(1)
  })

  it('does not double-count the same key on duplicate iteration', () => {
    // A real Storage.key() never returns duplicates, but the buildLifetimeStats
    // contract should still be defensive against a fixture that does so.
    const blob = statsBlob({ lapCount: 1, totalDriveMs: 500, sessionCount: 1 })
    const stats = buildLifetimeStats([
      [`${TRACK_STATS_PREFIX}oval.${HASH_A}`, blob],
      [`${TRACK_STATS_PREFIX}oval.${HASH_A}`, blob],
    ])
    // Lap count and drive ms are summed honestly (this is the documented
    // behavior); slug / version dedupe still holds because the Set keys do.
    expect(stats.trackCount).toBe(1)
    expect(stats.versionCount).toBe(1)
    expect(stats.totalLaps).toBe(2)
    expect(stats.totalDriveMs).toBe(1000)
  })
})

describe('readLifetimeStats', () => {
  const originalWindow = (globalThis as { window?: unknown }).window
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    const fakeWindow = {
      localStorage: {
        get length() {
          return Object.keys(store).length
        },
        key(i: number) {
          return Object.keys(store)[i] ?? null
        },
        getItem(k: string) {
          return k in store ? store[k] : null
        },
        setItem(k: string, v: string) {
          store[k] = v
        },
        removeItem(k: string) {
          delete store[k]
        },
        clear() {
          store = {}
        },
      },
    }
    ;(globalThis as { window?: unknown }).window = fakeWindow
  })

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window
    } else {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  })

  it('returns the empty snapshot when no track-stats keys are present', () => {
    store['viberacer.controls'] = '{}'
    expect(readLifetimeStats()).toEqual(emptyLifetimeStats())
  })

  it('reads the live localStorage and aggregates totals', () => {
    store[`${TRACK_STATS_PREFIX}oval.${HASH_A}`] = statsBlob({
      lapCount: 4,
      totalDriveMs: 60000,
      sessionCount: 2,
    })
    store[`${TRACK_STATS_PREFIX}sandbox.${HASH_B}`] = statsBlob({
      lapCount: 2,
      totalDriveMs: 30000,
      sessionCount: 1,
    })
    store['unrelated'] = 'noise'
    const stats = readLifetimeStats()
    expect(stats.totalLaps).toBe(6)
    expect(stats.totalDriveMs).toBe(90000)
    expect(stats.totalSessions).toBe(3)
    expect(stats.trackCount).toBe(2)
  })

  it('returns the empty snapshot when window is undefined', () => {
    delete (globalThis as { window?: unknown }).window
    expect(readLifetimeStats()).toEqual(emptyLifetimeStats())
  })

  it('survives a localStorage that throws on .length / .key / .getItem', () => {
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        get length() {
          throw new Error('blocked')
        },
        key() {
          return null
        },
        getItem() {
          return null
        },
      },
    }
    expect(readLifetimeStats()).toEqual(emptyLifetimeStats())
  })

  it('skips a single key that throws without aborting the whole scan', () => {
    let calls = 0
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        get length() {
          return 2
        },
        key(i: number) {
          calls++
          if (i === 0) throw new Error('blocked')
          return `${TRACK_STATS_PREFIX}oval.${HASH_A}`
        },
        getItem(k: string) {
          if (k === `${TRACK_STATS_PREFIX}oval.${HASH_A}`) {
            return statsBlob({ lapCount: 9 })
          }
          return null
        },
      },
    }
    const stats = readLifetimeStats()
    expect(calls).toBeGreaterThanOrEqual(2)
    expect(stats.totalLaps).toBe(9)
    expect(stats.trackCount).toBe(1)
  })
})
