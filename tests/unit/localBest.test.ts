import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  readLocalBestSplits,
  writeLocalBestSplits,
} from '@/lib/localBest'
import type { CheckpointHit } from '@/lib/schemas'

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
