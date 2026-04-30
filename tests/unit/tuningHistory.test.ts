import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { DEFAULT_CAR_PARAMS, type CarParams } from '@/game/physics'
import {
  MAX_TUNING_HISTORY_ENTRIES,
  TUNING_CHANGE_SOURCES,
  TUNING_HISTORY_KEY,
  TUNING_SOURCE_LABELS,
  TuningHistoryEntrySchema,
  appendStoredTuningHistory,
  appendTuningHistory,
  applyTuningHistoryEntry,
  clearTuningHistory,
  diffParams,
  paramsEqual,
  readTuningHistory,
  sortTuningHistoryNewestFirst,
  summarizeChangedKeys,
  type TuningChangeSource,
  type TuningHistoryEntry,
} from '@/lib/tuningHistory'

interface FakeStorage {
  store: Record<string, string>
}

function installFakeWindow(): FakeStorage {
  const state: FakeStorage = { store: {} }
  ;(globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (k in state.store ? state.store[k] : null),
      setItem: (k: string, v: string) => {
        state.store[k] = v
      },
      removeItem: (k: string) => {
        delete state.store[k]
      },
      clear: () => {
        state.store = {}
      },
    },
  }
  return state
}

function uninstallFakeWindow() {
  delete (globalThis as { window?: unknown }).window
}

function makeParams(overrides: Partial<CarParams> = {}): CarParams {
  return { ...DEFAULT_CAR_PARAMS, ...overrides }
}

function makeEntry(
  overrides: Partial<TuningHistoryEntry> = {},
): TuningHistoryEntry {
  return {
    id: 't-test-001',
    params: makeParams(),
    source: 'slider',
    label: null,
    changedKeys: {},
    slug: 'oval',
    changedAt: 1000,
    ...overrides,
  }
}

describe('tuningHistory: constants', () => {
  it('caps history at a sensible positive integer', () => {
    expect(Number.isInteger(MAX_TUNING_HISTORY_ENTRIES)).toBe(true)
    expect(MAX_TUNING_HISTORY_ENTRIES).toBeGreaterThan(0)
    expect(MAX_TUNING_HISTORY_ENTRIES).toBeGreaterThanOrEqual(10)
  })

  it('exposes a label for every change source', () => {
    for (const source of TUNING_CHANGE_SOURCES) {
      expect(typeof TUNING_SOURCE_LABELS[source]).toBe('string')
      expect(TUNING_SOURCE_LABELS[source].length).toBeGreaterThan(0)
    }
  })
})

describe('tuningHistory: paramsEqual', () => {
  it('returns true for identical params', () => {
    expect(paramsEqual(makeParams(), makeParams())).toBe(true)
  })

  it('returns true for the same logical values via different objects', () => {
    expect(paramsEqual(makeParams(), { ...makeParams() })).toBe(true)
  })

  it('returns false for any single-key delta', () => {
    expect(
      paramsEqual(makeParams(), makeParams({ maxSpeed: 27 })),
    ).toBe(false)
  })

  it('tolerates float drift below epsilon', () => {
    const a = makeParams({ maxSpeed: 26 })
    const b = makeParams({ maxSpeed: 26 + 1e-12 })
    expect(paramsEqual(a, b)).toBe(true)
  })
})

describe('tuningHistory: diffParams', () => {
  it('returns an empty map when before is null', () => {
    expect(diffParams(null, makeParams())).toEqual({})
  })

  it('returns only the keys whose value changed', () => {
    const before = makeParams()
    const after = makeParams({ maxSpeed: 30, accel: 22 })
    const diff = diffParams(before, after)
    expect(Object.keys(diff).sort()).toEqual(['accel', 'maxSpeed'])
    expect(diff.maxSpeed).toEqual({ from: 26, to: 30 })
    expect(diff.accel).toEqual({ from: 18, to: 22 })
  })

  it('returns an empty map when nothing changed', () => {
    expect(diffParams(makeParams(), makeParams())).toEqual({})
  })
})

describe('tuningHistory: summarizeChangedKeys', () => {
  it('returns "no change" for an empty map', () => {
    const entry = makeEntry({ changedKeys: {} })
    expect(summarizeChangedKeys(entry)).toBe('no change')
  })

  it('renders a one-key delta', () => {
    const entry = makeEntry({
      changedKeys: { maxSpeed: { from: 26, to: 28 } },
    })
    expect(summarizeChangedKeys(entry)).toContain('max speed')
    expect(summarizeChangedKeys(entry)).toContain('+')
  })

  it('summarizes more than maxShown keys with an "and N others" tail', () => {
    const entry = makeEntry({
      changedKeys: {
        maxSpeed: { from: 26, to: 28 },
        accel: { from: 18, to: 20 },
        brake: { from: 36, to: 40 },
        rollingFriction: { from: 4, to: 5 },
      },
    })
    const summary = summarizeChangedKeys(entry, 2)
    expect(summary).toMatch(/and 2 others/)
  })

  it('contains no em-dash or en-dash characters', () => {
    const entry = makeEntry({
      changedKeys: {
        maxSpeed: { from: 26, to: 28 },
        accel: { from: 18, to: 16 },
      },
    })
    const summary = summarizeChangedKeys(entry, 5)
    expect(summary).not.toMatch(/[\u2013\u2014]/)
  })
})

describe('tuningHistory: appendTuningHistory', () => {
  it('prepends a fresh entry to an empty list', () => {
    const next = appendTuningHistory([], makeEntry({ id: 't-1' }))
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('t-1')
  })

  it('does not mutate the input array', () => {
    const prev = [makeEntry({ id: 't-1' })]
    const before = [...prev]
    appendTuningHistory(prev, makeEntry({ id: 't-2', changedAt: 2000 }))
    expect(prev).toEqual(before)
  })

  it('skips a no-op append with identical params as the head', () => {
    const head = makeEntry({ id: 't-1', params: makeParams({ maxSpeed: 30 }) })
    const next = appendTuningHistory(
      [head],
      makeEntry({ id: 't-2', params: makeParams({ maxSpeed: 30 }) }),
    )
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('t-1')
  })

  it('returns the same reference on a head-match no-op so React can skip', () => {
    const prev = [
      makeEntry({ id: 't-1', params: makeParams({ maxSpeed: 30 }) }),
    ]
    const next = appendTuningHistory(
      prev,
      makeEntry({ id: 't-2', params: makeParams({ maxSpeed: 30 }) }),
    )
    expect(next).toBe(prev)
  })

  it('returns the same reference when the entry is rejected by the schema', () => {
    const prev = [makeEntry({ id: 't-1' })]
    const invalid = {
      ...makeEntry(),
      params: { ...makeParams(), maxSpeed: 999 },
    } as TuningHistoryEntry
    const next = appendTuningHistory(prev, invalid)
    expect(next).toBe(prev)
  })

  it('returns a fresh array when an entry is actually appended', () => {
    const prev = [makeEntry({ id: 't-1' })]
    const next = appendTuningHistory(
      prev,
      makeEntry({
        id: 't-2',
        params: makeParams({ maxSpeed: 30 }),
        changedAt: 2000,
      }),
    )
    expect(next).not.toBe(prev)
    expect(next).toHaveLength(2)
  })

  it('drops the oldest entry when the cap is exceeded', () => {
    let acc: TuningHistoryEntry[] = []
    for (let i = 0; i < MAX_TUNING_HISTORY_ENTRIES; i++) {
      acc = appendTuningHistory(
        acc,
        makeEntry({
          id: `t-${i}`,
          changedAt: 1000 + i,
          params: makeParams({ maxSpeed: 12 + i * 0.5 }),
        }),
      )
    }
    expect(acc).toHaveLength(MAX_TUNING_HISTORY_ENTRIES)
    const overflow = appendTuningHistory(
      acc,
      makeEntry({
        id: 't-overflow',
        changedAt: 9999,
        params: makeParams({ maxSpeed: 49 }),
      }),
    )
    expect(overflow).toHaveLength(MAX_TUNING_HISTORY_ENTRIES)
    expect(overflow[0].id).toBe('t-overflow')
    // Oldest (id t-0) should have been dropped.
    expect(overflow.find((e) => e.id === 't-0')).toBeUndefined()
  })

  it('rejects an invalid entry rather than throwing', () => {
    const invalid = {
      ...makeEntry(),
      params: { ...makeParams(), maxSpeed: 999 },
    } as TuningHistoryEntry
    const next = appendTuningHistory([], invalid)
    expect(next).toEqual([])
  })

  it('accepts every TuningChangeSource literal', () => {
    for (const source of TUNING_CHANGE_SOURCES) {
      const result = TuningHistoryEntrySchema.safeParse(
        makeEntry({ source: source as TuningChangeSource }),
      )
      expect(result.success).toBe(true)
    }
  })
})

describe('tuningHistory: sortTuningHistoryNewestFirst', () => {
  it('sorts by changedAt descending', () => {
    const a = makeEntry({ id: 'a', changedAt: 1000 })
    const b = makeEntry({ id: 'b', changedAt: 2000 })
    const c = makeEntry({ id: 'c', changedAt: 3000 })
    const sorted = sortTuningHistoryNewestFirst([a, c, b])
    expect(sorted.map((e) => e.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('tuningHistory: readTuningHistory + appendStoredTuningHistory', () => {
  beforeEach(() => {
    installFakeWindow()
  })

  afterEach(() => {
    uninstallFakeWindow()
  })

  it('returns an empty array for missing storage key', () => {
    expect(readTuningHistory()).toEqual([])
  })

  it('returns an empty array on malformed JSON', () => {
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => '{ not json',
        setItem: () => {},
        removeItem: () => {},
      },
    }
    expect(readTuningHistory()).toEqual([])
  })

  it('drops malformed rows individually and keeps the rest', () => {
    const valid = makeEntry({ id: 't-valid' })
    const garbage = { what: 'is this' }
    const blob = JSON.stringify([valid, garbage])
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => (k === TUNING_HISTORY_KEY ? blob : null),
        setItem: () => {},
        removeItem: () => {},
      },
    }
    const result = readTuningHistory()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('t-valid')
  })

  it('caps a hand-edited oversized blob at MAX_TUNING_HISTORY_ENTRIES', () => {
    const oversized: TuningHistoryEntry[] = []
    for (let i = 0; i < MAX_TUNING_HISTORY_ENTRIES * 3; i++) {
      oversized.push(
        makeEntry({
          id: `t-${i}`,
          changedAt: 1000 + i,
          params: makeParams({ maxSpeed: 12 + (i % 70) * 0.5 }),
        }),
      )
    }
    const blob = JSON.stringify(oversized)
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => (k === TUNING_HISTORY_KEY ? blob : null),
        setItem: () => {},
        removeItem: () => {},
      },
    }
    const result = readTuningHistory()
    expect(result).toHaveLength(MAX_TUNING_HISTORY_ENTRIES)
    // Newest survived: the last id pushed should sit at the head.
    expect(result[0].id).toBe(`t-${MAX_TUNING_HISTORY_ENTRIES * 3 - 1}`)
  })

  it('keeps the changedKeys diff aligned with the clamped stored params', () => {
    // Caller passes an out-of-bound maxSpeed (clamp will pull it to 50).
    const list = appendStoredTuningHistory(
      {
        params: makeParams({ maxSpeed: 999 }),
        source: 'imported',
        label: 'oob',
        slug: 'oval',
      },
      makeParams(),
    )
    expect(list).toHaveLength(1)
    expect(list[0].params.maxSpeed).toBe(50)
    // Diff fallback should report the clamped target, not the raw 999.
    expect(list[0].changedKeys.maxSpeed).toEqual({ from: 26, to: 50 })
  })

  it('round-trips an append via storage', () => {
    const list = appendStoredTuningHistory(
      {
        params: makeParams({ maxSpeed: 30 }),
        source: 'savedApplied',
        label: 'My Setup',
        slug: 'oval',
      },
      makeParams(),
    )
    expect(list).toHaveLength(1)
    const reread = readTuningHistory()
    expect(reread).toHaveLength(1)
    expect(reread[0].source).toBe('savedApplied')
    expect(reread[0].label).toBe('My Setup')
    expect(reread[0].changedKeys.maxSpeed).toEqual({ from: 26, to: 30 })
  })

  it('clears storage on demand', () => {
    appendStoredTuningHistory(
      {
        params: makeParams({ maxSpeed: 30 }),
        source: 'reset',
        slug: 'oval',
        label: null,
      },
      makeParams(),
    )
    expect(readTuningHistory()).toHaveLength(1)
    clearTuningHistory()
    expect(readTuningHistory()).toEqual([])
  })

  it('tolerates a throwing localStorage.setItem', () => {
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota exceeded')
        },
        removeItem: () => {},
      },
    }
    expect(() =>
      appendStoredTuningHistory(
        {
          params: makeParams({ maxSpeed: 30 }),
          source: 'slider',
          slug: 'oval',
          label: null,
        },
        makeParams(),
      ),
    ).not.toThrow()
  })
})

describe('tuningHistory: applyTuningHistoryEntry', () => {
  it('forwards clamped params to the injected applyParams', () => {
    const apply = vi.fn()
    const entry = makeEntry({
      params: makeParams({ maxSpeed: 30, accel: 22 }),
    })
    applyTuningHistoryEntry(entry, apply)
    expect(apply).toHaveBeenCalledTimes(1)
    const arg = apply.mock.calls[0][0] as CarParams
    expect(arg.maxSpeed).toBe(30)
    expect(arg.accel).toBe(22)
  })
})
