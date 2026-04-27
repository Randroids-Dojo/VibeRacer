import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import {
  MAX_PB_HISTORY_ENTRIES,
  appendPbHistory,
  appendStoredPbHistory,
  formatPbAge,
  pbImprovementMs,
  readPbHistory,
  sortPbHistoryNewestFirst,
  summarizePbHistory,
  type PbHistoryEntry,
} from '@/lib/pbHistory'

const SLUG = 'oval'
const VHASH = 'a'.repeat(64)

function entry(
  achievedAt: number,
  lapTimeMs: number,
  priorBestMs: number | null = null,
): PbHistoryEntry {
  return { achievedAt, lapTimeMs, priorBestMs }
}

describe('pbHistory: MAX_PB_HISTORY_ENTRIES', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(MAX_PB_HISTORY_ENTRIES)).toBe(true)
    expect(MAX_PB_HISTORY_ENTRIES).toBeGreaterThan(0)
  })

  it('is at least 10 so a focused session always fits', () => {
    expect(MAX_PB_HISTORY_ENTRIES).toBeGreaterThanOrEqual(10)
  })
})

describe('pbHistory: appendPbHistory', () => {
  it('appends a single entry to an empty list', () => {
    const next = appendPbHistory([], entry(1000, 30000))
    expect(next).toHaveLength(1)
    expect(next[0]).toEqual({
      achievedAt: 1000,
      lapTimeMs: 30000,
      priorBestMs: null,
    })
  })

  it('does not mutate the input array', () => {
    const prev: PbHistoryEntry[] = [entry(100, 30000)]
    const before = [...prev]
    const next = appendPbHistory(prev, entry(200, 29000, 30000))
    expect(prev).toEqual(before)
    expect(next).not.toBe(prev)
  })

  it('preserves chronological order when entries arrive in order', () => {
    let acc: PbHistoryEntry[] = []
    acc = appendPbHistory(acc, entry(100, 30000))
    acc = appendPbHistory(acc, entry(200, 29000, 30000))
    acc = appendPbHistory(acc, entry(300, 28000, 29000))
    expect(acc.map((e) => e.lapTimeMs)).toEqual([30000, 29000, 28000])
  })

  it('drops the oldest entry when the cap is exceeded', () => {
    let acc: PbHistoryEntry[] = []
    for (let i = 0; i < MAX_PB_HISTORY_ENTRIES; i++) {
      acc = appendPbHistory(acc, entry(1000 + i, 30000 - i))
    }
    expect(acc).toHaveLength(MAX_PB_HISTORY_ENTRIES)
    const overflow = appendPbHistory(
      acc,
      entry(2000, 20000, 30000 - (MAX_PB_HISTORY_ENTRIES - 1)),
    )
    expect(overflow).toHaveLength(MAX_PB_HISTORY_ENTRIES)
    // Oldest dropped (the achievedAt = 1000 entry) and newest landed on top.
    expect(overflow[0].achievedAt).toBe(1001)
    expect(overflow[overflow.length - 1].achievedAt).toBe(2000)
  })

  it('rejects a non-finite lap time', () => {
    const next = appendPbHistory([], entry(100, Number.NaN))
    expect(next).toEqual([])
  })

  it('rejects a non-positive lap time', () => {
    const a = appendPbHistory([], entry(100, 0))
    const b = appendPbHistory([], entry(100, -5))
    expect(a).toEqual([])
    expect(b).toEqual([])
  })

  it('rejects a non-finite achievedAt', () => {
    const next = appendPbHistory([], entry(Number.POSITIVE_INFINITY, 30000))
    expect(next).toEqual([])
  })

  it('rejects a non-positive achievedAt', () => {
    const next = appendPbHistory([], entry(0, 30000))
    expect(next).toEqual([])
  })

  it('rejects a non-positive priorBestMs', () => {
    const next = appendPbHistory([], entry(100, 29000, 0))
    expect(next).toEqual([])
  })

  it('returns a clone of the prior list on a rejected entry', () => {
    const prev = [entry(100, 30000)]
    const next = appendPbHistory(prev, entry(200, Number.NaN))
    expect(next).toEqual(prev)
    expect(next).not.toBe(prev)
  })

  it('accepts priorBestMs = null on a fresh layout', () => {
    const next = appendPbHistory([], entry(100, 30000, null))
    expect(next).toHaveLength(1)
    expect(next[0].priorBestMs).toBeNull()
  })
})

describe('pbHistory: summarizePbHistory', () => {
  it('returns zero summary on empty input', () => {
    const s = summarizePbHistory([])
    expect(s).toEqual({
      count: 0,
      firstMs: null,
      latestMs: null,
      totalImprovementMs: 0,
    })
  })

  it('returns single-entry summary with zero improvement', () => {
    const s = summarizePbHistory([entry(100, 30000)])
    expect(s).toEqual({
      count: 1,
      firstMs: 30000,
      latestMs: 30000,
      totalImprovementMs: 0,
    })
  })

  it('walks chronologically to pick first / latest', () => {
    const s = summarizePbHistory([
      entry(300, 28000, 29000),
      entry(100, 30000, null),
      entry(200, 29000, 30000),
    ])
    expect(s.count).toBe(3)
    expect(s.firstMs).toBe(30000)
    expect(s.latestMs).toBe(28000)
    expect(s.totalImprovementMs).toBe(2000)
  })

  it('drops malformed entries from the count and summary', () => {
    const list: PbHistoryEntry[] = [
      entry(100, 30000),
      { achievedAt: 200, lapTimeMs: -1, priorBestMs: null },
      entry(300, 29000, 30000),
      { achievedAt: Number.NaN, lapTimeMs: 28500, priorBestMs: 29000 },
    ]
    const s = summarizePbHistory(list)
    expect(s.count).toBe(2)
    expect(s.firstMs).toBe(30000)
    expect(s.latestMs).toBe(29000)
    expect(s.totalImprovementMs).toBe(1000)
  })

  it('clamps a degenerate (latest > first) hand-edited blob to zero improvement', () => {
    // Hand-edited blob where the "latest" PB is somehow slower than the
    // earlier one. Clamp protects the UI from a negative.
    const s = summarizePbHistory([
      entry(100, 28000),
      entry(200, 29000),
    ])
    expect(s.totalImprovementMs).toBe(0)
  })
})

describe('pbHistory: sortPbHistoryNewestFirst', () => {
  it('returns a fresh array', () => {
    const prev = [entry(100, 30000)]
    const next = sortPbHistoryNewestFirst(prev)
    expect(next).not.toBe(prev)
  })

  it('puts the newest entry first', () => {
    const next = sortPbHistoryNewestFirst([
      entry(100, 30000),
      entry(300, 28000),
      entry(200, 29000),
    ])
    expect(next.map((e) => e.achievedAt)).toEqual([300, 200, 100])
  })

  it('returns an empty array on empty input', () => {
    expect(sortPbHistoryNewestFirst([])).toEqual([])
  })
})

describe('pbHistory: pbImprovementMs', () => {
  it('returns null when priorBestMs is null', () => {
    expect(pbImprovementMs(entry(100, 30000, null))).toBeNull()
  })

  it('returns the positive delta when the lap beats the prior', () => {
    expect(pbImprovementMs(entry(100, 28500, 30000))).toBe(1500)
  })

  it('returns null when the lap is not actually faster than the prior', () => {
    // Defensive: a hand-edited blob where the recorded PB is somehow slower
    // than the prior. Treat as "no improvement to celebrate" rather than a
    // negative number.
    expect(pbImprovementMs(entry(100, 30000, 29000))).toBeNull()
    expect(pbImprovementMs(entry(100, 30000, 30000))).toBeNull()
  })

  it('returns null on non-finite priorBestMs', () => {
    expect(pbImprovementMs(entry(100, 30000, Number.NaN))).toBeNull()
  })

  it('returns null on non-positive priorBestMs', () => {
    expect(pbImprovementMs(entry(100, 30000, 0))).toBeNull()
  })

  it('returns null on non-finite lapTimeMs', () => {
    expect(pbImprovementMs(entry(100, Number.NaN, 30000))).toBeNull()
  })
})

describe('pbHistory: formatPbAge', () => {
  const NOW = 1_700_000_000_000

  it('returns "today" for the same day', () => {
    expect(formatPbAge(NOW - 60_000, NOW)).toBe('today')
    expect(formatPbAge(NOW - 23 * 60 * 60 * 1000, NOW)).toBe('today')
  })

  it('returns "yesterday" exactly one day ago', () => {
    expect(formatPbAge(NOW - 24 * 60 * 60 * 1000, NOW)).toBe('yesterday')
  })

  it('returns days for 2-6 days ago', () => {
    for (let d = 2; d <= 6; d++) {
      expect(formatPbAge(NOW - d * 24 * 60 * 60 * 1000, NOW)).toBe(`${d}d ago`)
    }
  })

  it('returns weeks for 7-29 days ago', () => {
    expect(formatPbAge(NOW - 7 * 24 * 60 * 60 * 1000, NOW)).toBe('1w ago')
    expect(formatPbAge(NOW - 29 * 24 * 60 * 60 * 1000, NOW)).toBe('4w ago')
  })

  it('returns months for 30-364 days ago', () => {
    expect(formatPbAge(NOW - 30 * 24 * 60 * 60 * 1000, NOW)).toBe('1mo ago')
    expect(formatPbAge(NOW - 364 * 24 * 60 * 60 * 1000, NOW)).toBe('12mo ago')
  })

  it('returns years past 365 days', () => {
    expect(formatPbAge(NOW - 365 * 24 * 60 * 60 * 1000, NOW)).toBe('1y ago')
    expect(formatPbAge(NOW - 800 * 24 * 60 * 60 * 1000, NOW)).toBe('2y ago')
  })

  it('clamps a future timestamp to "today"', () => {
    expect(formatPbAge(NOW + 60_000, NOW)).toBe('today')
  })

  it('returns "" on non-finite or non-positive achievedAt', () => {
    expect(formatPbAge(Number.NaN, NOW)).toBe('')
    expect(formatPbAge(0, NOW)).toBe('')
    expect(formatPbAge(-1, NOW)).toBe('')
  })

  it('returns "" on non-finite or non-positive nowMs', () => {
    expect(formatPbAge(NOW - 60_000, Number.NaN)).toBe('')
    expect(formatPbAge(NOW - 60_000, 0)).toBe('')
  })

  it('contains no em dashes or en dashes in any output', () => {
    const samples = [
      formatPbAge(NOW - 60_000, NOW),
      formatPbAge(NOW - 24 * 60 * 60 * 1000, NOW),
      formatPbAge(NOW - 5 * 24 * 60 * 60 * 1000, NOW),
      formatPbAge(NOW - 14 * 24 * 60 * 60 * 1000, NOW),
      formatPbAge(NOW - 60 * 24 * 60 * 60 * 1000, NOW),
      formatPbAge(NOW - 700 * 24 * 60 * 60 * 1000, NOW),
    ]
    for (const out of samples) {
      expect(out).not.toMatch(/[\u2013\u2014]/)
    }
  })
})

// localStorage smoke tests. Vitest runs in node so we mount a small fake
// window with a Map-backed localStorage. Mirrors the pattern in
// tests/unit/localBest.test.ts so the contract is uniform across the codebase.
interface FakeWindow {
  localStorage: {
    getItem: (k: string) => string | null
    setItem: (k: string, v: string) => void
    removeItem: (k: string) => void
    clear: () => void
  }
}

describe('pbHistory: storage round-trip', () => {
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

  it('returns an empty array when no key is stored', () => {
    expect(readPbHistory(SLUG, VHASH)).toEqual([])
  })

  it('returns an empty array on malformed JSON', () => {
    store[`viberacer.pbHistory.${SLUG}.${VHASH}`] = 'not json'
    expect(readPbHistory(SLUG, VHASH)).toEqual([])
  })

  it('returns an empty array on schema-rejected payload', () => {
    store[`viberacer.pbHistory.${SLUG}.${VHASH}`] = JSON.stringify([
      { lapTimeMs: 'not a number' },
    ])
    expect(readPbHistory(SLUG, VHASH)).toEqual([])
  })

  it('round-trips a freshly appended entry', () => {
    const next = appendStoredPbHistory(SLUG, VHASH, entry(100, 30000))
    expect(next).toHaveLength(1)
    const reread = readPbHistory(SLUG, VHASH)
    expect(reread).toEqual(next)
  })

  it('appends multiple entries in order', () => {
    appendStoredPbHistory(SLUG, VHASH, entry(100, 30000))
    appendStoredPbHistory(SLUG, VHASH, entry(200, 29000, 30000))
    const list = readPbHistory(SLUG, VHASH)
    expect(list.map((e) => e.lapTimeMs)).toEqual([30000, 29000])
  })

  it('isolates entries per (slug, versionHash)', () => {
    appendStoredPbHistory(SLUG, VHASH, entry(100, 30000))
    appendStoredPbHistory('other', VHASH, entry(200, 29000))
    expect(readPbHistory(SLUG, VHASH)).toHaveLength(1)
    expect(readPbHistory('other', VHASH)).toHaveLength(1)
    expect(readPbHistory(SLUG, 'b'.repeat(64))).toEqual([])
  })

  it('rejected entries do not write to storage', () => {
    appendStoredPbHistory(SLUG, VHASH, entry(100, 30000))
    const before = store[`viberacer.pbHistory.${SLUG}.${VHASH}`]
    appendStoredPbHistory(SLUG, VHASH, entry(200, Number.NaN))
    const after = store[`viberacer.pbHistory.${SLUG}.${VHASH}`]
    expect(after).toBe(before)
  })

  it('does not throw when localStorage.setItem rejects', () => {
    ;(globalThis as { window?: { localStorage: { setItem: unknown } } }).window!
      .localStorage.setItem = () => {
      throw new Error('quota exceeded')
    }
    expect(() =>
      appendStoredPbHistory(SLUG, VHASH, entry(100, 30000)),
    ).not.toThrow()
  })
})
