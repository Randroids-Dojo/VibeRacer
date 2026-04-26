import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  readLocalBestDrift,
  readLocalBestSectors,
  readLocalBestSplits,
  writeLocalBestDrift,
  writeLocalBestSectors,
  writeLocalBestSplits,
} from '@/lib/localBest'
import type { CheckpointHit } from '@/lib/schemas'
import type { SectorDuration } from '@/game/optimalLap'

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
