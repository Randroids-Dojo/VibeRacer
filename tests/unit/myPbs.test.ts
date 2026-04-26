import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  buildMyPbs,
  parseLocalBestKey,
  parseStoredLapTime,
  readMyPbs,
  LOCAL_BEST_PREFIX,
} from '@/lib/myPbs'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const HASH_C = 'c'.repeat(64)

describe('parseLocalBestKey', () => {
  it('returns null for keys without the local-best prefix', () => {
    expect(parseLocalBestKey('viberacer.controls')).toBeNull()
    expect(parseLocalBestKey('something.else')).toBeNull()
    expect(parseLocalBestKey('')).toBeNull()
  })

  it('returns the slug + versionHash for a well-formed key', () => {
    expect(parseLocalBestKey(`${LOCAL_BEST_PREFIX}oval.${HASH_A}`)).toEqual({
      slug: 'oval',
      versionHash: HASH_A,
    })
  })

  it('rejects an invalid version hash', () => {
    expect(parseLocalBestKey(`${LOCAL_BEST_PREFIX}oval.deadbeef`)).toBeNull()
    expect(parseLocalBestKey(`${LOCAL_BEST_PREFIX}oval.${'g'.repeat(64)}`)).toBeNull()
  })

  it('rejects an invalid slug', () => {
    expect(parseLocalBestKey(`${LOCAL_BEST_PREFIX}-leading.${HASH_A}`)).toBeNull()
    expect(parseLocalBestKey(`${LOCAL_BEST_PREFIX}UPPER.${HASH_A}`)).toBeNull()
  })

  it('rejects shapes with no dot or with the dot at an edge', () => {
    expect(parseLocalBestKey(`${LOCAL_BEST_PREFIX}${HASH_A}`)).toBeNull()
    expect(parseLocalBestKey(`${LOCAL_BEST_PREFIX}.${HASH_A}`)).toBeNull()
    expect(parseLocalBestKey(`${LOCAL_BEST_PREFIX}oval.`)).toBeNull()
  })
})

describe('parseStoredLapTime', () => {
  it('returns null on null, empty, or non-numeric input', () => {
    expect(parseStoredLapTime(null)).toBeNull()
    expect(parseStoredLapTime('')).toBeNull()
    expect(parseStoredLapTime('hello')).toBeNull()
  })

  it('rejects zero, negative, NaN, and Infinity', () => {
    expect(parseStoredLapTime('0')).toBeNull()
    expect(parseStoredLapTime('-1')).toBeNull()
    expect(parseStoredLapTime('NaN')).toBeNull()
    expect(parseStoredLapTime('Infinity')).toBeNull()
  })

  it('rejects implausibly large values (over an hour)', () => {
    expect(parseStoredLapTime(String(60 * 60 * 1000 + 1))).toBeNull()
  })

  it('rounds fractional values to integer ms', () => {
    expect(parseStoredLapTime('12345.6')).toBe(12346)
    expect(parseStoredLapTime('12345.4')).toBe(12345)
  })
})

describe('buildMyPbs', () => {
  it('returns an empty list when no local-best keys are present', () => {
    expect(buildMyPbs([])).toEqual([])
    expect(
      buildMyPbs([
        ['viberacer.controls', '{}'],
        ['unrelated', '1'],
      ]),
    ).toEqual([])
  })

  it('groups multiple versions of the same slug together', () => {
    const rows = buildMyPbs([
      [`${LOCAL_BEST_PREFIX}oval.${HASH_A}`, '15000'],
      [`${LOCAL_BEST_PREFIX}oval.${HASH_B}`, '12000'],
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].slug).toBe('oval')
    expect(rows[0].bestLapTimeMs).toBe(12000)
    expect(rows[0].versions).toHaveLength(2)
    // Versions are sorted by lap time ascending so the fastest sits first.
    expect(rows[0].versions[0]).toEqual({
      versionHash: HASH_B,
      lapTimeMs: 12000,
    })
    expect(rows[0].versions[1]).toEqual({
      versionHash: HASH_A,
      lapTimeMs: 15000,
    })
  })

  it('sorts rows by best lap time ascending then slug name', () => {
    const rows = buildMyPbs([
      [`${LOCAL_BEST_PREFIX}slow.${HASH_A}`, '30000'],
      [`${LOCAL_BEST_PREFIX}fast.${HASH_B}`, '8000'],
      [`${LOCAL_BEST_PREFIX}mid.${HASH_C}`, '15000'],
    ])
    expect(rows.map((r) => r.slug)).toEqual(['fast', 'mid', 'slow'])
  })

  it('breaks ties by slug name', () => {
    const rows = buildMyPbs([
      [`${LOCAL_BEST_PREFIX}beta.${HASH_A}`, '10000'],
      [`${LOCAL_BEST_PREFIX}alpha.${HASH_B}`, '10000'],
    ])
    expect(rows.map((r) => r.slug)).toEqual(['alpha', 'beta'])
  })

  it('skips malformed keys and malformed lap times silently', () => {
    const rows = buildMyPbs([
      [`${LOCAL_BEST_PREFIX}oval.${HASH_A}`, '10000'],
      [`${LOCAL_BEST_PREFIX}oval.deadbeef`, '5000'],
      [`${LOCAL_BEST_PREFIX}oval.${HASH_B}`, 'not a number'],
      [`${LOCAL_BEST_PREFIX}oval.${HASH_C}`, '0'],
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].versions).toHaveLength(1)
    expect(rows[0].versions[0]).toEqual({
      versionHash: HASH_A,
      lapTimeMs: 10000,
    })
  })

  it('treats Map iteration as a valid input shape (Map has [k,v] entries)', () => {
    const map = new Map<string, string>([
      [`${LOCAL_BEST_PREFIX}oval.${HASH_A}`, '12345'],
    ])
    const rows = buildMyPbs(map)
    expect(rows).toHaveLength(1)
    expect(rows[0].bestLapTimeMs).toBe(12345)
  })
})

describe('readMyPbs', () => {
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

  it('returns an empty list when there are no local-best keys', () => {
    store['viberacer.controls'] = '{}'
    expect(readMyPbs()).toEqual([])
  })

  it('reads the live localStorage and groups by slug', () => {
    store[`${LOCAL_BEST_PREFIX}oval.${HASH_A}`] = '12000'
    store[`${LOCAL_BEST_PREFIX}sandbox.${HASH_B}`] = '20000'
    store[`${LOCAL_BEST_PREFIX}oval.${HASH_B}`] = '11000'
    store['unrelated'] = 'noise'
    const rows = readMyPbs()
    expect(rows.map((r) => r.slug)).toEqual(['oval', 'sandbox'])
    const oval = rows.find((r) => r.slug === 'oval')!
    expect(oval.bestLapTimeMs).toBe(11000)
    expect(oval.versions).toHaveLength(2)
  })

  it('returns an empty list when window is undefined', () => {
    delete (globalThis as { window?: unknown }).window
    expect(readMyPbs()).toEqual([])
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
    expect(readMyPbs()).toEqual([])
  })
})
