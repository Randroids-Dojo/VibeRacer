import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  buildMedalCounts,
  emptyMedalCounts,
  medalCabinetKey,
  MEDAL_CABINET_PREFIX,
  parseMedalCabinetKey,
  parseStoredMedal,
  readMedalCabinet,
  readMedalForTrack,
  writeMedalForTrack,
} from '@/lib/medalCabinet'
import type { MedalTier } from '@/game/medals'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const HASH_C = 'c'.repeat(64)

function medalBlob(tier: MedalTier): string {
  return JSON.stringify({ tier })
}

describe('emptyMedalCounts', () => {
  it('returns a fresh zero-snapshot every call', () => {
    const a = emptyMedalCounts()
    const b = emptyMedalCounts()
    expect(a).toEqual({
      platinum: 0,
      gold: 0,
      silver: 0,
      bronze: 0,
      total: 0,
    })
    expect(a).not.toBe(b)
  })
})

describe('medalCabinetKey', () => {
  it('formats slug.versionHash under the medal prefix', () => {
    expect(medalCabinetKey('oval', HASH_A)).toBe(
      `${MEDAL_CABINET_PREFIX}oval.${HASH_A}`,
    )
  })
})

describe('parseMedalCabinetKey', () => {
  it('returns null for keys without the medal-cabinet prefix', () => {
    expect(parseMedalCabinetKey('viberacer.controls')).toBeNull()
    expect(parseMedalCabinetKey(`viberacer.best.oval.${HASH_A}`)).toBeNull()
    expect(parseMedalCabinetKey('')).toBeNull()
  })

  it('returns the slug + versionHash for a well-formed key', () => {
    const parsed = parseMedalCabinetKey(`${MEDAL_CABINET_PREFIX}oval.${HASH_A}`)
    expect(parsed).toEqual({ slug: 'oval', versionHash: HASH_A })
  })

  it('rejects an invalid slug shape', () => {
    expect(
      parseMedalCabinetKey(`${MEDAL_CABINET_PREFIX}-bad.${HASH_A}`),
    ).toBeNull()
  })

  it('rejects an invalid version hash', () => {
    expect(
      parseMedalCabinetKey(`${MEDAL_CABINET_PREFIX}oval.notahex`),
    ).toBeNull()
  })

  it('rejects keys with no separator dot in the rest', () => {
    expect(parseMedalCabinetKey(`${MEDAL_CABINET_PREFIX}ovalONLY`)).toBeNull()
  })

  it('rejects keys with a trailing dot but no hash', () => {
    expect(parseMedalCabinetKey(`${MEDAL_CABINET_PREFIX}oval.`)).toBeNull()
  })
})

describe('parseStoredMedal', () => {
  it('returns null for null', () => {
    expect(parseStoredMedal(null)).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseStoredMedal('not json')).toBeNull()
  })

  it('returns null for a payload missing the tier field', () => {
    expect(parseStoredMedal('{}')).toBeNull()
  })

  it('returns null for an unknown tier value', () => {
    expect(parseStoredMedal(JSON.stringify({ tier: 'mythril' }))).toBeNull()
  })

  it('round-trips every valid tier', () => {
    for (const tier of ['platinum', 'gold', 'silver', 'bronze'] as const) {
      expect(parseStoredMedal(medalBlob(tier))).toEqual({ tier })
    }
  })
})

describe('buildMedalCounts', () => {
  it('returns zero counts for an empty input', () => {
    expect(buildMedalCounts([])).toEqual(emptyMedalCounts())
  })

  it('counts one medal per (slug, versionHash) row', () => {
    const counts = buildMedalCounts([
      [`${MEDAL_CABINET_PREFIX}oval.${HASH_A}`, medalBlob('platinum')],
      [`${MEDAL_CABINET_PREFIX}sandbox.${HASH_B}`, medalBlob('gold')],
      [`${MEDAL_CABINET_PREFIX}circuit.${HASH_C}`, medalBlob('silver')],
    ])
    expect(counts).toEqual({
      platinum: 1,
      gold: 1,
      silver: 1,
      bronze: 0,
      total: 3,
    })
  })

  it('aggregates duplicate-tier entries across distinct tracks', () => {
    const counts = buildMedalCounts([
      [`${MEDAL_CABINET_PREFIX}a.${HASH_A}`, medalBlob('bronze')],
      [`${MEDAL_CABINET_PREFIX}b.${HASH_A}`, medalBlob('bronze')],
      [`${MEDAL_CABINET_PREFIX}c.${HASH_A}`, medalBlob('bronze')],
    ])
    expect(counts.bronze).toBe(3)
    expect(counts.total).toBe(3)
  })

  it('skips entries with the wrong prefix', () => {
    const counts = buildMedalCounts([
      ['viberacer.controls', medalBlob('platinum')],
      [`viberacer.best.oval.${HASH_A}`, '12345'],
      [`${MEDAL_CABINET_PREFIX}oval.${HASH_A}`, medalBlob('gold')],
    ])
    expect(counts.gold).toBe(1)
    expect(counts.total).toBe(1)
  })

  it('skips entries with malformed slugs or hashes', () => {
    const counts = buildMedalCounts([
      [`${MEDAL_CABINET_PREFIX}-bad.${HASH_A}`, medalBlob('platinum')],
      [`${MEDAL_CABINET_PREFIX}oval.notahex`, medalBlob('gold')],
      [`${MEDAL_CABINET_PREFIX}oval.${HASH_A}`, medalBlob('silver')],
    ])
    expect(counts.silver).toBe(1)
    expect(counts.total).toBe(1)
  })

  it('skips entries with malformed payloads', () => {
    const counts = buildMedalCounts([
      [`${MEDAL_CABINET_PREFIX}oval.${HASH_A}`, 'not json'],
      [`${MEDAL_CABINET_PREFIX}sandbox.${HASH_A}`, JSON.stringify({})],
      [
        `${MEDAL_CABINET_PREFIX}circuit.${HASH_A}`,
        JSON.stringify({ tier: 'mythril' }),
      ],
      [`${MEDAL_CABINET_PREFIX}good.${HASH_A}`, medalBlob('platinum')],
    ])
    expect(counts.platinum).toBe(1)
    expect(counts.total).toBe(1)
  })

  it('counts multi-tier mix correctly', () => {
    const counts = buildMedalCounts([
      [`${MEDAL_CABINET_PREFIX}p1.${HASH_A}`, medalBlob('platinum')],
      [`${MEDAL_CABINET_PREFIX}p2.${HASH_A}`, medalBlob('platinum')],
      [`${MEDAL_CABINET_PREFIX}g1.${HASH_A}`, medalBlob('gold')],
      [`${MEDAL_CABINET_PREFIX}g2.${HASH_A}`, medalBlob('gold')],
      [`${MEDAL_CABINET_PREFIX}g3.${HASH_A}`, medalBlob('gold')],
      [`${MEDAL_CABINET_PREFIX}s1.${HASH_A}`, medalBlob('silver')],
      [`${MEDAL_CABINET_PREFIX}b1.${HASH_A}`, medalBlob('bronze')],
      [`${MEDAL_CABINET_PREFIX}b2.${HASH_A}`, medalBlob('bronze')],
      [`${MEDAL_CABINET_PREFIX}b3.${HASH_A}`, medalBlob('bronze')],
      [`${MEDAL_CABINET_PREFIX}b4.${HASH_A}`, medalBlob('bronze')],
    ])
    expect(counts).toEqual({
      platinum: 2,
      gold: 3,
      silver: 1,
      bronze: 4,
      total: 10,
    })
  })
})

// localStorage-backed tests install a fake window with a minimal Storage
// shim, mirroring the pattern used by tests/unit/lifetimeStats.test.ts so
// the suite stays compatible with the shared `node` vitest environment.

interface FakeStorageState {
  store: Record<string, string>
}

function installFakeWindow(state: FakeStorageState): void {
  ;(globalThis as { window?: unknown }).window = {
    localStorage: {
      get length() {
        return Object.keys(state.store).length
      },
      key(i: number) {
        return Object.keys(state.store)[i] ?? null
      },
      getItem(k: string) {
        return k in state.store ? state.store[k] : null
      },
      setItem(k: string, v: string) {
        state.store[k] = v
      },
      removeItem(k: string) {
        delete state.store[k]
      },
      clear() {
        state.store = {}
      },
    },
  }
}

describe('readMedalForTrack / writeMedalForTrack', () => {
  const originalWindow = (globalThis as { window?: unknown }).window
  const state: FakeStorageState = { store: {} }

  beforeEach(() => {
    state.store = {}
    installFakeWindow(state)
  })

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window
    } else {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  })

  it('returns null when no medal is stored', () => {
    expect(readMedalForTrack('oval', HASH_A)).toBeNull()
  })

  it('returns null when the stored payload is malformed', () => {
    state.store[medalCabinetKey('oval', HASH_A)] = 'not json'
    expect(readMedalForTrack('oval', HASH_A)).toBeNull()
  })

  it('round-trips a fresh medal', () => {
    const wrote = writeMedalForTrack('oval', HASH_A, 'gold')
    expect(wrote).toBe(true)
    expect(readMedalForTrack('oval', HASH_A)).toBe('gold')
  })

  it('upgrades a stored bronze to silver', () => {
    writeMedalForTrack('oval', HASH_A, 'bronze')
    const wrote = writeMedalForTrack('oval', HASH_A, 'silver')
    expect(wrote).toBe(true)
    expect(readMedalForTrack('oval', HASH_A)).toBe('silver')
  })

  it('upgrades a stored silver to platinum (skipping gold)', () => {
    writeMedalForTrack('oval', HASH_A, 'silver')
    const wrote = writeMedalForTrack('oval', HASH_A, 'platinum')
    expect(wrote).toBe(true)
    expect(readMedalForTrack('oval', HASH_A)).toBe('platinum')
  })

  it('refuses to demote a stored gold with a fresh bronze', () => {
    writeMedalForTrack('oval', HASH_A, 'gold')
    const wrote = writeMedalForTrack('oval', HASH_A, 'bronze')
    expect(wrote).toBe(false)
    expect(readMedalForTrack('oval', HASH_A)).toBe('gold')
  })

  it('refuses to overwrite a stored platinum with another platinum (idempotent no-op)', () => {
    writeMedalForTrack('oval', HASH_A, 'platinum')
    const wrote = writeMedalForTrack('oval', HASH_A, 'platinum')
    expect(wrote).toBe(false)
    expect(readMedalForTrack('oval', HASH_A)).toBe('platinum')
  })

  it('refuses to write a null tier', () => {
    const wrote = writeMedalForTrack('oval', HASH_A, null)
    expect(wrote).toBe(false)
    expect(readMedalForTrack('oval', HASH_A)).toBeNull()
  })

  it('isolates rows by slug + versionHash', () => {
    writeMedalForTrack('oval', HASH_A, 'gold')
    writeMedalForTrack('oval', HASH_B, 'silver')
    writeMedalForTrack('sandbox', HASH_A, 'bronze')
    expect(readMedalForTrack('oval', HASH_A)).toBe('gold')
    expect(readMedalForTrack('oval', HASH_B)).toBe('silver')
    expect(readMedalForTrack('sandbox', HASH_A)).toBe('bronze')
    expect(readMedalForTrack('sandbox', HASH_B)).toBeNull()
  })

  it('returns null when window is undefined', () => {
    delete (globalThis as { window?: unknown }).window
    expect(readMedalForTrack('oval', HASH_A)).toBeNull()
    expect(writeMedalForTrack('oval', HASH_A, 'gold')).toBe(false)
  })
})

describe('readMedalCabinet', () => {
  const originalWindow = (globalThis as { window?: unknown }).window
  const state: FakeStorageState = { store: {} }

  beforeEach(() => {
    state.store = {}
    installFakeWindow(state)
  })

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window
    } else {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  })

  it('returns the empty snapshot when storage is empty', () => {
    expect(readMedalCabinet()).toEqual(emptyMedalCounts())
  })

  it('aggregates only medal-prefixed rows', () => {
    writeMedalForTrack('oval', HASH_A, 'platinum')
    writeMedalForTrack('sandbox', HASH_A, 'gold')
    state.store[`viberacer.best.unrelated.${HASH_A}`] = '12345'
    state.store['viberacer.controls'] = 'whatever'
    expect(readMedalCabinet()).toEqual({
      platinum: 1,
      gold: 1,
      silver: 0,
      bronze: 0,
      total: 2,
    })
  })

  it('reflects upgrades from writeMedalForTrack', () => {
    writeMedalForTrack('a', HASH_A, 'bronze')
    expect(readMedalCabinet().bronze).toBe(1)
    writeMedalForTrack('a', HASH_A, 'gold')
    const counts = readMedalCabinet()
    expect(counts.bronze).toBe(0)
    expect(counts.gold).toBe(1)
    expect(counts.total).toBe(1)
  })

  it('skips malformed payloads silently', () => {
    writeMedalForTrack('good', HASH_A, 'silver')
    state.store[`${MEDAL_CABINET_PREFIX}bad.${HASH_A}`] = 'not json'
    state.store[`${MEDAL_CABINET_PREFIX}also-bad.${HASH_A}`] = JSON.stringify({
      tier: 'mythril',
    })
    expect(readMedalCabinet()).toEqual({
      platinum: 0,
      gold: 0,
      silver: 1,
      bronze: 0,
      total: 1,
    })
  })

  it('returns the empty snapshot when window is undefined', () => {
    delete (globalThis as { window?: unknown }).window
    expect(readMedalCabinet()).toEqual(emptyMedalCounts())
  })

  it('survives a localStorage that throws on .length', () => {
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
    expect(readMedalCabinet()).toEqual(emptyMedalCounts())
  })
})
