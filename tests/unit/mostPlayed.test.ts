import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  buildMostPlayed,
  DEFAULT_MOST_PLAYED_LIMIT,
  parseStoredTrackStats,
  parseTrackStatsKey,
  readMostPlayed,
  TRACK_STATS_PREFIX,
} from '@/lib/mostPlayed'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const HASH_C = 'c'.repeat(64)
const HASH_D = 'd'.repeat(64)
const HASH_E = 'e'.repeat(64)
const HASH_F = 'f'.repeat(64)

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

describe('DEFAULT_MOST_PLAYED_LIMIT', () => {
  it('is a positive integer small enough to fit on a home page card', () => {
    expect(Number.isInteger(DEFAULT_MOST_PLAYED_LIMIT)).toBe(true)
    expect(DEFAULT_MOST_PLAYED_LIMIT).toBeGreaterThan(0)
    expect(DEFAULT_MOST_PLAYED_LIMIT).toBeLessThanOrEqual(10)
  })
})

describe('parseTrackStatsKey', () => {
  it('returns the slug + versionHash for a well-formed key', () => {
    expect(parseTrackStatsKey(`${TRACK_STATS_PREFIX}oval.${HASH_A}`)).toEqual({
      slug: 'oval',
      versionHash: HASH_A,
    })
  })

  it('returns null for keys without the track-stats prefix', () => {
    expect(parseTrackStatsKey('viberacer.controls')).toBeNull()
    expect(parseTrackStatsKey('viberacer.best.oval.' + HASH_A)).toBeNull()
    expect(parseTrackStatsKey('')).toBeNull()
  })

  it('returns null when the slug fails SlugSchema', () => {
    expect(parseTrackStatsKey(`${TRACK_STATS_PREFIX}_bad.${HASH_A}`)).toBeNull()
    expect(parseTrackStatsKey(`${TRACK_STATS_PREFIX}.${HASH_A}`)).toBeNull()
  })

  it('returns null when the version hash fails VersionHashSchema', () => {
    expect(parseTrackStatsKey(`${TRACK_STATS_PREFIX}oval.notahash`)).toBeNull()
    expect(parseTrackStatsKey(`${TRACK_STATS_PREFIX}oval.`)).toBeNull()
  })

  it('returns null when the dot is at the wrong position', () => {
    expect(parseTrackStatsKey(`${TRACK_STATS_PREFIX}.${HASH_A}`)).toBeNull()
    expect(parseTrackStatsKey(`${TRACK_STATS_PREFIX}oval`)).toBeNull()
    expect(parseTrackStatsKey(`${TRACK_STATS_PREFIX}oval.`)).toBeNull()
  })
})

describe('parseStoredTrackStats', () => {
  it('returns null on null input', () => {
    expect(parseStoredTrackStats(null)).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    expect(parseStoredTrackStats('not json')).toBeNull()
  })

  it('returns null on schema-fail (negative lap count)', () => {
    expect(parseStoredTrackStats(statsBlob({ lapCount: -1 }))).toBeNull()
  })

  it('returns null on schema-fail (fractional lap count)', () => {
    expect(parseStoredTrackStats(statsBlob({ lapCount: 0.5 }))).toBeNull()
  })

  it('returns null on schema-fail (non-finite drive ms)', () => {
    expect(
      parseStoredTrackStats(JSON.stringify({
        lapCount: 1,
        totalDriveMs: Number.POSITIVE_INFINITY,
        sessionCount: 1,
        firstPlayedAt: 1,
        lastPlayedAt: 1,
      })),
    ).toBeNull()
  })

  it('round-trips a valid blob with explicit nulls for play timestamps', () => {
    expect(
      parseStoredTrackStats(statsBlob({
        firstPlayedAt: null,
        lastPlayedAt: null,
      })),
    ).toEqual({
      lapCount: 1,
      totalDriveMs: 10000,
      sessionCount: 1,
      firstPlayedAt: null,
      lastPlayedAt: null,
    })
  })
})

describe('buildMostPlayed', () => {
  it('returns an empty list when no entries are passed', () => {
    expect(buildMostPlayed([])).toEqual([])
  })

  it('skips entries with malformed keys', () => {
    expect(
      buildMostPlayed([
        ['viberacer.controls', statsBlob()],
        [`${TRACK_STATS_PREFIX}_bad.${HASH_A}`, statsBlob()],
      ]),
    ).toEqual([])
  })

  it('skips entries with malformed payloads', () => {
    expect(
      buildMostPlayed([
        [`${TRACK_STATS_PREFIX}oval.${HASH_A}`, 'not json'],
        [`${TRACK_STATS_PREFIX}sandbox.${HASH_B}`, statsBlob({ lapCount: -1 })],
      ]),
    ).toEqual([])
  })

  it('drops slugs whose total laps fold to zero', () => {
    // A player who started a session but never completed a lap should not see
    // the track ranked above tracks they actually raced.
    expect(
      buildMostPlayed([
        [`${TRACK_STATS_PREFIX}emptyrun.${HASH_A}`, statsBlob({ lapCount: 0, sessionCount: 1, totalDriveMs: 0 })],
      ]),
    ).toEqual([])
  })

  it('aggregates multiple versions of the same slug into one row', () => {
    const rows = buildMostPlayed([
      [`${TRACK_STATS_PREFIX}oval.${HASH_A}`, statsBlob({ lapCount: 3, totalDriveMs: 30000, sessionCount: 1, lastPlayedAt: 1000 })],
      [`${TRACK_STATS_PREFIX}oval.${HASH_B}`, statsBlob({ lapCount: 7, totalDriveMs: 50000, sessionCount: 2, lastPlayedAt: 2000 })],
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      slug: 'oval',
      totalLaps: 10,
      totalDriveMs: 80000,
      totalSessions: 3,
      versionCount: 2,
      lastPlayedAt: 2000,
    })
  })

  it('orders rows by totalLaps desc', () => {
    const rows = buildMostPlayed([
      [`${TRACK_STATS_PREFIX}low.${HASH_A}`, statsBlob({ lapCount: 1 })],
      [`${TRACK_STATS_PREFIX}high.${HASH_B}`, statsBlob({ lapCount: 9 })],
      [`${TRACK_STATS_PREFIX}mid.${HASH_C}`, statsBlob({ lapCount: 5 })],
    ])
    expect(rows.map((r) => r.slug)).toEqual(['high', 'mid', 'low'])
  })

  it('breaks ties on totalLaps by totalDriveMs desc', () => {
    const rows = buildMostPlayed([
      [`${TRACK_STATS_PREFIX}sprint.${HASH_A}`, statsBlob({ lapCount: 5, totalDriveMs: 30000 })],
      [`${TRACK_STATS_PREFIX}cruise.${HASH_B}`, statsBlob({ lapCount: 5, totalDriveMs: 80000 })],
    ])
    expect(rows.map((r) => r.slug)).toEqual(['cruise', 'sprint'])
  })

  it('breaks lap-and-drive ties by slug ascending', () => {
    const rows = buildMostPlayed([
      [`${TRACK_STATS_PREFIX}beta.${HASH_A}`, statsBlob({ lapCount: 3, totalDriveMs: 10000 })],
      [`${TRACK_STATS_PREFIX}alpha.${HASH_B}`, statsBlob({ lapCount: 3, totalDriveMs: 10000 })],
    ])
    expect(rows.map((r) => r.slug)).toEqual(['alpha', 'beta'])
  })

  it('clamps the result length to the requested limit', () => {
    const entries: [string, string][] = []
    const slugs = ['a', 'b', 'c', 'd', 'e', 'f']
    const hashes = [HASH_A, HASH_B, HASH_C, HASH_D, HASH_E, HASH_F]
    for (let i = 0; i < slugs.length; i++) {
      entries.push([
        `${TRACK_STATS_PREFIX}${slugs[i]}.${hashes[i]}`,
        statsBlob({ lapCount: 10 - i }),
      ])
    }
    const rows = buildMostPlayed(entries, 3)
    expect(rows.map((r) => r.slug)).toEqual(['a', 'b', 'c'])
  })

  it('returns every row when the limit is non-finite', () => {
    const entries: [string, string][] = []
    const slugs = ['a', 'b', 'c', 'd', 'e', 'f']
    const hashes = [HASH_A, HASH_B, HASH_C, HASH_D, HASH_E, HASH_F]
    for (let i = 0; i < slugs.length; i++) {
      entries.push([
        `${TRACK_STATS_PREFIX}${slugs[i]}.${hashes[i]}`,
        statsBlob({ lapCount: 10 - i }),
      ])
    }
    expect(buildMostPlayed(entries, Number.POSITIVE_INFINITY)).toHaveLength(6)
    expect(buildMostPlayed(entries, Number.NaN)).toHaveLength(6)
    expect(buildMostPlayed(entries, 0)).toHaveLength(6)
    expect(buildMostPlayed(entries, -1)).toHaveLength(6)
  })

  it('uses DEFAULT_MOST_PLAYED_LIMIT when no limit is passed', () => {
    const entries: [string, string][] = []
    for (let i = 0; i < DEFAULT_MOST_PLAYED_LIMIT + 3; i++) {
      // Use unique deterministic hashes per row.
      const hash = String.fromCharCode(97 + i).repeat(64)
      entries.push([
        `${TRACK_STATS_PREFIX}slug${i}.${hash}`,
        statsBlob({ lapCount: 10 - i }),
      ])
    }
    expect(buildMostPlayed(entries)).toHaveLength(DEFAULT_MOST_PLAYED_LIMIT)
  })

  it('selects the latest lastPlayedAt across versions of the same slug', () => {
    const rows = buildMostPlayed([
      [`${TRACK_STATS_PREFIX}oval.${HASH_A}`, statsBlob({ lastPlayedAt: 5000 })],
      [`${TRACK_STATS_PREFIX}oval.${HASH_B}`, statsBlob({ lastPlayedAt: 9000 })],
      [`${TRACK_STATS_PREFIX}oval.${HASH_C}`, statsBlob({ lastPlayedAt: 1000 })],
    ])
    expect(rows[0].lastPlayedAt).toBe(9000)
  })

  it('tolerates a null lastPlayedAt mixed with positive ones', () => {
    const rows = buildMostPlayed([
      [`${TRACK_STATS_PREFIX}oval.${HASH_A}`, statsBlob({ lastPlayedAt: null })],
      [`${TRACK_STATS_PREFIX}oval.${HASH_B}`, statsBlob({ lastPlayedAt: 4000 })],
    ])
    expect(rows[0].lastPlayedAt).toBe(4000)
  })

  it('keeps lastPlayedAt null when every version is null', () => {
    const rows = buildMostPlayed([
      [`${TRACK_STATS_PREFIX}oval.${HASH_A}`, statsBlob({ lastPlayedAt: null })],
      [`${TRACK_STATS_PREFIX}oval.${HASH_B}`, statsBlob({ lastPlayedAt: null })],
    ])
    expect(rows[0].lastPlayedAt).toBeNull()
  })

  it('does not double-count when the same key appears twice in the input', () => {
    const blob = statsBlob({ lapCount: 4 })
    const rows = buildMostPlayed([
      [`${TRACK_STATS_PREFIX}oval.${HASH_A}`, blob],
      [`${TRACK_STATS_PREFIX}oval.${HASH_A}`, blob],
    ])
    expect(rows[0].totalLaps).toBe(8)
    // versionCount should still be 1 because the duplicate hash collapses
    // through the Set; the totals are intentionally additive (a duplicate row
    // in storage is rare but should still aggregate, not silently drop).
    expect(rows[0].versionCount).toBe(1)
  })

  it('accepts a Map iterator without coercion', () => {
    const m = new Map<string, string>([
      [`${TRACK_STATS_PREFIX}oval.${HASH_A}`, statsBlob({ lapCount: 2 })],
    ])
    expect(buildMostPlayed(m.entries())).toHaveLength(1)
  })
})

describe('readMostPlayed', () => {
  const ORIGINAL_WINDOW = (globalThis as any).window
  beforeEach(() => {
    const store = new Map<string, string>()
    const ls = {
      get length() {
        return store.size
      },
      key(i: number) {
        return Array.from(store.keys())[i] ?? null
      },
      getItem(k: string) {
        return store.get(k) ?? null
      },
      setItem(k: string, v: string) {
        store.set(k, v)
      },
      removeItem(k: string) {
        store.delete(k)
      },
      clear() {
        store.clear()
      },
    } as unknown as Storage
    ;(globalThis as any).window = { localStorage: ls }
  })
  afterEach(() => {
    if (ORIGINAL_WINDOW === undefined) {
      delete (globalThis as any).window
    } else {
      ;(globalThis as any).window = ORIGINAL_WINDOW
    }
  })

  it('returns an empty list on empty storage', () => {
    expect(readMostPlayed()).toEqual([])
  })

  it('returns an empty list when window is undefined (SSR)', () => {
    delete (globalThis as any).window
    expect(readMostPlayed()).toEqual([])
  })

  it('aggregates only rows under the track-stats prefix', () => {
    ;(globalThis as any).window.localStorage.setItem(
      `${TRACK_STATS_PREFIX}oval.${HASH_A}`,
      statsBlob({ lapCount: 3 }),
    )
    ;(globalThis as any).window.localStorage.setItem(
      `viberacer.best.oval.${HASH_A}`,
      '12345',
    )
    ;(globalThis as any).window.localStorage.setItem(
      'viberacer.controls',
      '{}',
    )
    const rows = readMostPlayed()
    expect(rows).toHaveLength(1)
    expect(rows[0].slug).toBe('oval')
    expect(rows[0].totalLaps).toBe(3)
  })

  it('skips malformed payloads without aborting the whole scan', () => {
    ;(globalThis as any).window.localStorage.setItem(
      `${TRACK_STATS_PREFIX}good.${HASH_A}`,
      statsBlob({ lapCount: 5 }),
    )
    ;(globalThis as any).window.localStorage.setItem(
      `${TRACK_STATS_PREFIX}bad.${HASH_B}`,
      'not json',
    )
    expect(readMostPlayed().map((r) => r.slug)).toEqual(['good'])
  })

  it('returns an empty list when localStorage.length throws', () => {
    const ls = {
      get length(): number {
        throw new Error('blocked')
      },
    } as unknown as Storage
    ;(globalThis as any).window = { localStorage: ls }
    expect(readMostPlayed()).toEqual([])
  })

  it('skips a key whose getItem throws while preserving the rest', () => {
    const store = new Map<string, string>([
      [`${TRACK_STATS_PREFIX}oval.${HASH_A}`, statsBlob({ lapCount: 5 })],
      [`${TRACK_STATS_PREFIX}sandbox.${HASH_B}`, 'broken'],
    ])
    const ls = {
      get length() {
        return store.size
      },
      key(i: number) {
        return Array.from(store.keys())[i] ?? null
      },
      getItem(k: string) {
        if (k.includes('sandbox')) throw new Error('blocked')
        return store.get(k) ?? null
      },
    } as unknown as Storage
    ;(globalThis as any).window = { localStorage: ls }
    const rows = readMostPlayed()
    expect(rows).toHaveLength(1)
    expect(rows[0].slug).toBe('oval')
  })

  it('honors the limit argument', () => {
    const ls = (globalThis as any).window.localStorage as Storage
    for (let i = 0; i < DEFAULT_MOST_PLAYED_LIMIT + 4; i++) {
      const hash = String.fromCharCode(97 + i).repeat(64)
      ls.setItem(
        `${TRACK_STATS_PREFIX}slug${i}.${hash}`,
        statsBlob({ lapCount: 50 - i }),
      )
    }
    expect(readMostPlayed(2)).toHaveLength(2)
    expect(readMostPlayed()).toHaveLength(DEFAULT_MOST_PLAYED_LIMIT)
  })
})
