import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  freshTrackStats,
  readLocalBestDrift,
  readLastSubmit,
  readLocalBestPbStreak,
  readLocalBestSectors,
  readLocalBestSplits,
  readTrackStats,
  writeLastSubmit,
  writeLocalBestDrift,
  writeLocalBestPbStreak,
  writeLocalBestSectors,
  writeLocalBestSplits,
  writeTrackStats,
} from '@/lib/localBest'
import type { CheckpointHit } from '@/lib/schemas'
import type { SectorDuration } from '@/game/optimalLap'
import type { TrackStats } from '@/game/trackStats'

interface FakeWindow {
  localStorage: {
    getItem: (k: string) => string | null
    setItem: (k: string, v: string) => void
    removeItem: (k: string) => void
    clear: () => void
  }
}

describe('local PB splits storage', () => {
  const originalWindow = (globalThis as { window?: unknown }).window
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    const fakeWindow: FakeWindow = {
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => {
          store[k] = v
        },
        removeItem: (k) => {
          delete store[k]
        },
        clear: () => {
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

  it('returns null when no splits are stored', () => {
    expect(readLocalBestSplits('oval', 'a'.repeat(64))).toBeNull()
  })

  it('round-trips a stored splits array', () => {
    const hits: CheckpointHit[] = [
      { cpId: 0, tMs: 1234 },
      { cpId: 1, tMs: 4567 },
      { cpId: 2, tMs: 9000 },
    ]
    writeLocalBestSplits('oval', 'a'.repeat(64), hits)
    expect(readLocalBestSplits('oval', 'a'.repeat(64))).toEqual(hits)
  })

  it('namespaces by slug + version hash', () => {
    const a: CheckpointHit[] = [{ cpId: 0, tMs: 1 }]
    const b: CheckpointHit[] = [{ cpId: 0, tMs: 2 }]
    writeLocalBestSplits('oval', 'a'.repeat(64), a)
    writeLocalBestSplits('oval', 'b'.repeat(64), b)
    expect(readLocalBestSplits('oval', 'a'.repeat(64))).toEqual(a)
    expect(readLocalBestSplits('oval', 'b'.repeat(64))).toEqual(b)
    expect(readLocalBestSplits('sandbox', 'a'.repeat(64))).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    store['viberacer.splits.oval.' + 'a'.repeat(64)] = 'not json'
    expect(readLocalBestSplits('oval', 'a'.repeat(64))).toBeNull()
  })

  it('returns null when the stored value fails the schema', () => {
    store['viberacer.splits.oval.' + 'a'.repeat(64)] = JSON.stringify([
      { cpId: -1, tMs: 0 },
    ])
    expect(readLocalBestSplits('oval', 'a'.repeat(64))).toBeNull()
  })

  it('does not throw when localStorage.setItem rejects', () => {
    ;(globalThis as { window?: { localStorage: { setItem: unknown } } }).window!
      .localStorage.setItem = () => {
      throw new Error('quota exceeded')
    }
    expect(() =>
      writeLocalBestSplits('oval', 'a'.repeat(64), [{ cpId: 0, tMs: 1 }]),
    ).not.toThrow()
  })
})

describe('local best drift score storage', () => {
  const originalWindow = (globalThis as { window?: unknown }).window
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    const fakeWindow: FakeWindow = {
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => {
          store[k] = v
        },
        removeItem: (k) => {
          delete store[k]
        },
        clear: () => {
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

  it('returns null when no drift score is stored', () => {
    expect(readLocalBestDrift('oval', 'a'.repeat(64))).toBeNull()
  })

  it('round-trips a stored score (rounded to integer)', () => {
    writeLocalBestDrift('oval', 'a'.repeat(64), 1234.6)
    expect(readLocalBestDrift('oval', 'a'.repeat(64))).toBe(1235)
  })

  it('namespaces by slug + version hash', () => {
    writeLocalBestDrift('oval', 'a'.repeat(64), 100)
    writeLocalBestDrift('oval', 'b'.repeat(64), 250)
    expect(readLocalBestDrift('oval', 'a'.repeat(64))).toBe(100)
    expect(readLocalBestDrift('oval', 'b'.repeat(64))).toBe(250)
    expect(readLocalBestDrift('sandbox', 'a'.repeat(64))).toBeNull()
  })

  it('refuses to write a non-positive or non-finite score', () => {
    writeLocalBestDrift('oval', 'a'.repeat(64), 0)
    expect(readLocalBestDrift('oval', 'a'.repeat(64))).toBeNull()
    writeLocalBestDrift('oval', 'a'.repeat(64), -50)
    expect(readLocalBestDrift('oval', 'a'.repeat(64))).toBeNull()
    writeLocalBestDrift('oval', 'a'.repeat(64), Number.NaN)
    expect(readLocalBestDrift('oval', 'a'.repeat(64))).toBeNull()
  })

  it('returns null on a malformed stored value', () => {
    store['viberacer.driftBest.oval.' + 'a'.repeat(64)] = 'not a number'
    expect(readLocalBestDrift('oval', 'a'.repeat(64))).toBeNull()
  })

  it('does not throw when localStorage.setItem rejects', () => {
    ;(globalThis as { window?: { localStorage: { setItem: unknown } } }).window!
      .localStorage.setItem = () => {
      throw new Error('quota exceeded')
    }
    expect(() => writeLocalBestDrift('oval', 'a'.repeat(64), 100)).not.toThrow()
  })
})

describe('local best sectors storage', () => {
  const originalWindow = (globalThis as { window?: unknown }).window
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    const fakeWindow: FakeWindow = {
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => {
          store[k] = v
        },
        removeItem: (k) => {
          delete store[k]
        },
        clear: () => {
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

  it('returns null when no sectors are stored', () => {
    expect(readLocalBestSectors('oval', 'a'.repeat(64))).toBeNull()
  })

  it('round-trips a stored sectors array', () => {
    const sectors: SectorDuration[] = [
      { cpId: 0, durationMs: 1500 },
      { cpId: 1, durationMs: 2700 },
      { cpId: 2, durationMs: 4800 },
    ]
    writeLocalBestSectors('oval', 'a'.repeat(64), sectors)
    expect(readLocalBestSectors('oval', 'a'.repeat(64))).toEqual(sectors)
  })

  it('namespaces by slug + version hash', () => {
    const a: SectorDuration[] = [{ cpId: 0, durationMs: 1000 }]
    const b: SectorDuration[] = [{ cpId: 0, durationMs: 2000 }]
    writeLocalBestSectors('oval', 'a'.repeat(64), a)
    writeLocalBestSectors('oval', 'b'.repeat(64), b)
    expect(readLocalBestSectors('oval', 'a'.repeat(64))).toEqual(a)
    expect(readLocalBestSectors('oval', 'b'.repeat(64))).toEqual(b)
    expect(readLocalBestSectors('sandbox', 'a'.repeat(64))).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    store['viberacer.bestSectors.oval.' + 'a'.repeat(64)] = 'not json'
    expect(readLocalBestSectors('oval', 'a'.repeat(64))).toBeNull()
  })

  it('returns null when a stored entry has a non-positive duration', () => {
    store['viberacer.bestSectors.oval.' + 'a'.repeat(64)] = JSON.stringify([
      { cpId: 0, durationMs: 0 },
    ])
    expect(readLocalBestSectors('oval', 'a'.repeat(64))).toBeNull()
  })

  it('returns null when a stored entry has a negative cpId', () => {
    store['viberacer.bestSectors.oval.' + 'a'.repeat(64)] = JSON.stringify([
      { cpId: -1, durationMs: 1500 },
    ])
    expect(readLocalBestSectors('oval', 'a'.repeat(64))).toBeNull()
  })

  it('returns null when the payload is not an array', () => {
    store['viberacer.bestSectors.oval.' + 'a'.repeat(64)] = JSON.stringify({
      cpId: 0,
      durationMs: 1500,
    })
    expect(readLocalBestSectors('oval', 'a'.repeat(64))).toBeNull()
  })

  it('does not throw when localStorage.setItem rejects', () => {
    ;(globalThis as { window?: { localStorage: { setItem: unknown } } }).window!
      .localStorage.setItem = () => {
      throw new Error('quota exceeded')
    }
    expect(() =>
      writeLocalBestSectors('oval', 'a'.repeat(64), [
        { cpId: 0, durationMs: 1500 },
      ]),
    ).not.toThrow()
  })
})

describe('per-track stats storage', () => {
  const originalWindow = (globalThis as { window?: unknown }).window
  let store: Record<string, string>
  const HASH = 'a'.repeat(64)
  const HASH_B = 'b'.repeat(64)
  const VALID: TrackStats = {
    lapCount: 7,
    totalDriveMs: 126_500,
    sessionCount: 3,
    firstPlayedAt: 1_700_000_000_000,
    lastPlayedAt: 1_700_000_900_000,
  }

  beforeEach(() => {
    store = {}
    const fakeWindow: FakeWindow = {
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => {
          store[k] = v
        },
        removeItem: (k) => {
          delete store[k]
        },
        clear: () => {
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

  it('returns null when no stats are stored', () => {
    expect(readTrackStats('oval', HASH)).toBeNull()
  })

  it('round-trips a valid snapshot', () => {
    writeTrackStats('oval', HASH, VALID)
    expect(readTrackStats('oval', HASH)).toEqual(VALID)
  })

  it('namespaces by slug + version hash', () => {
    writeTrackStats('oval', HASH, VALID)
    writeTrackStats('oval', HASH_B, { ...VALID, lapCount: 99 })
    writeTrackStats('sandbox', HASH, { ...VALID, lapCount: 11 })
    expect(readTrackStats('oval', HASH)?.lapCount).toBe(7)
    expect(readTrackStats('oval', HASH_B)?.lapCount).toBe(99)
    expect(readTrackStats('sandbox', HASH)?.lapCount).toBe(11)
    expect(readTrackStats('mystery', HASH)).toBeNull()
  })

  it('round-trips a stats object with null timestamps (fresh slate)', () => {
    const fresh = freshTrackStats()
    writeTrackStats('oval', HASH, fresh)
    expect(readTrackStats('oval', HASH)).toEqual(fresh)
  })

  it('refuses to persist an obviously corrupt snapshot', () => {
    writeTrackStats('oval', HASH, {
      lapCount: -1,
      totalDriveMs: 0,
      sessionCount: 0,
      firstPlayedAt: null,
      lastPlayedAt: null,
    } as unknown as TrackStats)
    expect(readTrackStats('oval', HASH)).toBeNull()
  })

  it('returns null when the stored value fails the schema (manual edit)', () => {
    store['viberacer.stats.oval.' + HASH] = JSON.stringify({
      lapCount: 'lots',
      totalDriveMs: 0,
      sessionCount: 0,
      firstPlayedAt: null,
      lastPlayedAt: null,
    })
    expect(readTrackStats('oval', HASH)).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    store['viberacer.stats.oval.' + HASH] = '{not json'
    expect(readTrackStats('oval', HASH)).toBeNull()
  })

  it('does not throw when localStorage.setItem rejects', () => {
    ;(globalThis as { window?: { localStorage: { setItem: unknown } } }).window!
      .localStorage.setItem = () => {
      throw new Error('quota exceeded')
    }
    expect(() => writeTrackStats('oval', HASH, VALID)).not.toThrow()
  })

  it('exports freshTrackStats as the empty snapshot factory', () => {
    expect(freshTrackStats()).toEqual({
      lapCount: 0,
      totalDriveMs: 0,
      sessionCount: 0,
      firstPlayedAt: null,
      lastPlayedAt: null,
    })
  })
})

describe('local best PB streak storage', () => {
  const originalWindow = (globalThis as { window?: unknown }).window
  let store: Record<string, string>
  const HASH = 'a'.repeat(64)

  beforeEach(() => {
    store = {}
    const fakeWindow: FakeWindow = {
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => {
          store[k] = v
        },
        removeItem: (k) => {
          delete store[k]
        },
        clear: () => {
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

  it('returns null when no streak is stored', () => {
    expect(readLocalBestPbStreak('oval', HASH)).toBeNull()
  })

  it('round-trips a stored streak value', () => {
    writeLocalBestPbStreak('oval', HASH, 5)
    expect(readLocalBestPbStreak('oval', HASH)).toBe(5)
  })

  it('namespaces by slug + version hash', () => {
    writeLocalBestPbStreak('oval', HASH, 3)
    writeLocalBestPbStreak('oval', 'b'.repeat(64), 8)
    writeLocalBestPbStreak('hairpin', HASH, 2)
    expect(readLocalBestPbStreak('oval', HASH)).toBe(3)
    expect(readLocalBestPbStreak('oval', 'b'.repeat(64))).toBe(8)
    expect(readLocalBestPbStreak('hairpin', HASH)).toBe(2)
    expect(readLocalBestPbStreak('sandbox', HASH)).toBeNull()
  })

  it('floors a fractional value on write', () => {
    writeLocalBestPbStreak('oval', HASH, 4.9)
    expect(readLocalBestPbStreak('oval', HASH)).toBe(4)
  })

  it('refuses to persist a non-finite value', () => {
    writeLocalBestPbStreak('oval', HASH, Number.NaN)
    writeLocalBestPbStreak('oval', HASH, Number.POSITIVE_INFINITY)
    expect(readLocalBestPbStreak('oval', HASH)).toBeNull()
  })

  it('refuses to persist a non-positive value', () => {
    writeLocalBestPbStreak('oval', HASH, 0)
    writeLocalBestPbStreak('oval', HASH, -3)
    expect(readLocalBestPbStreak('oval', HASH)).toBeNull()
  })

  it('returns null for a hand-edited non-finite payload', () => {
    store['viberacer.pbStreakBest.oval.' + HASH] = 'not a number'
    expect(readLocalBestPbStreak('oval', HASH)).toBeNull()
  })

  it('returns null for a hand-edited zero or negative payload', () => {
    store['viberacer.pbStreakBest.oval.' + HASH] = '0'
    expect(readLocalBestPbStreak('oval', HASH)).toBeNull()
    store['viberacer.pbStreakBest.oval.' + HASH] = '-2'
    expect(readLocalBestPbStreak('oval', HASH)).toBeNull()
  })

  it('does not throw when localStorage.setItem rejects', () => {
    ;(globalThis as { window?: { localStorage: { setItem: unknown } } }).window!
      .localStorage.setItem = () => {
      throw new Error('quota exceeded')
    }
    expect(() => writeLocalBestPbStreak('oval', HASH, 4)).not.toThrow()
  })
})

describe('last submit pointer storage (friend challenge)', () => {
  const originalWindow = (globalThis as { window?: unknown }).window
  let store: Record<string, string>
  const HASH = 'a'.repeat(64)
  const NONCE = 'c'.repeat(32)

  beforeEach(() => {
    store = {}
    const fakeWindow: FakeWindow = {
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => {
          store[k] = v
        },
        removeItem: (k) => {
          delete store[k]
        },
        clear: () => {
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

  it('returns null when nothing is stored', () => {
    expect(readLastSubmit('oval', HASH)).toBeNull()
  })

  it('round-trips a written value', () => {
    writeLastSubmit('oval', HASH, { nonce: NONCE, lapTimeMs: 42123 })
    expect(readLastSubmit('oval', HASH)).toEqual({
      nonce: NONCE,
      lapTimeMs: 42123,
    })
  })

  it('namespaces by slug + version hash', () => {
    writeLastSubmit('oval', HASH, { nonce: NONCE, lapTimeMs: 1000 })
    writeLastSubmit('oval', 'b'.repeat(64), { nonce: 'd'.repeat(32), lapTimeMs: 2000 })
    writeLastSubmit('hairpin', HASH, { nonce: 'e'.repeat(32), lapTimeMs: 3000 })
    expect(readLastSubmit('oval', HASH)?.lapTimeMs).toBe(1000)
    expect(readLastSubmit('oval', 'b'.repeat(64))?.lapTimeMs).toBe(2000)
    expect(readLastSubmit('hairpin', HASH)?.lapTimeMs).toBe(3000)
    expect(readLastSubmit('sandbox', HASH)).toBeNull()
  })

  it('refuses to persist a malformed nonce', () => {
    writeLastSubmit('oval', HASH, { nonce: 'short', lapTimeMs: 1000 })
    expect(readLastSubmit('oval', HASH)).toBeNull()
    writeLastSubmit('oval', HASH, { nonce: 'Z'.repeat(32), lapTimeMs: 1000 })
    expect(readLastSubmit('oval', HASH)).toBeNull()
  })

  it('refuses to persist a non-positive lap time', () => {
    writeLastSubmit('oval', HASH, { nonce: NONCE, lapTimeMs: 0 })
    expect(readLastSubmit('oval', HASH)).toBeNull()
    writeLastSubmit('oval', HASH, { nonce: NONCE, lapTimeMs: -100 })
    expect(readLastSubmit('oval', HASH)).toBeNull()
  })

  it('returns null for a hand-edited malformed payload', () => {
    store['viberacer.lastSubmitNonce.oval.' + HASH] = 'not json'
    expect(readLastSubmit('oval', HASH)).toBeNull()
    store['viberacer.lastSubmitNonce.oval.' + HASH] = '{}'
    expect(readLastSubmit('oval', HASH)).toBeNull()
  })

  it('does not throw when localStorage.setItem rejects', () => {
    ;(globalThis as { window?: { localStorage: { setItem: unknown } } }).window!
      .localStorage.setItem = () => {
      throw new Error('quota exceeded')
    }
    expect(() =>
      writeLastSubmit('oval', HASH, { nonce: NONCE, lapTimeMs: 1000 }),
    ).not.toThrow()
  })
})
