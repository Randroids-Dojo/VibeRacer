import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  KNOWN_TUNES_STORAGE_KEY,
  MY_TUNES_EVENT,
  MY_TUNES_STORAGE_KEY,
  TUNE_OVERRIDES_STORAGE_KEY,
  deleteMyTune,
  parseMyTunes,
  readKnownTune,
  readMyTunes,
  readTuneOverride,
  recordKnownTune,
  resolvePersonalTune,
  upsertMyTune,
  writeTuneOverride,
  type MyTuneEntry,
} from '@/lib/myTunes'
import { DEFAULT_TRACK_TUNE, generateTuneFromSeed } from '@/lib/tunes'

const entry: MyTuneEntry = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Neon',
  originSlug: 'neon-track',
  tune: generateTuneFromSeed('neon'),
  createdAt: 1000,
  updatedAt: 1000,
}

beforeEach(() => {
  store = {}
  dispatched = []
  ;(globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      clear: () => {
        store = {}
      },
    },
    dispatchEvent: (event: Event) => {
      const custom = event as CustomEvent
      dispatched.push({ type: custom.type, detail: custom.detail })
      return true
    },
  }
  vi.restoreAllMocks()
})

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window
  } else {
    ;(globalThis as { window?: unknown }).window = originalWindow
  }
})

const originalWindow = (globalThis as { window?: unknown }).window
let store: Record<string, string>
let dispatched: Array<{ type: string; detail: unknown }>

describe('parseMyTunes', () => {
  it('returns empty for malformed payloads', () => {
    expect(parseMyTunes(null)).toEqual([])
    expect(parseMyTunes({ nope: true })).toEqual([])
  })

  it('sorts newest first and dedupes by id', () => {
    expect(
      parseMyTunes([
        entry,
        { ...entry, name: 'Older', updatedAt: 900 },
        { ...entry, id: '00000000-0000-4000-8000-000000000002', updatedAt: 1200 },
      ]).map((item) => item.updatedAt),
    ).toEqual([1200, 1000])
  })
})

describe('my tune storage', () => {
  it('upserts entries and dispatches a change event', () => {
    expect(upsertMyTune(entry)).toEqual([entry])
    expect(readMyTunes()).toEqual([entry])
    expect(dispatched[0]).toEqual({ type: MY_TUNES_EVENT, detail: [entry] })
    expect(store[MY_TUNES_STORAGE_KEY]).toContain('Neon')
  })

  it('deleting a tune clears matching overrides', () => {
    upsertMyTune(entry)
    writeTuneOverride('neon-track', { source: 'mine', id: entry.id })
    expect(readTuneOverride('neon-track')).toEqual({
      source: 'mine',
      id: entry.id,
    })
    deleteMyTune(entry.id)
    expect(readMyTunes()).toEqual([])
    expect(readTuneOverride('neon-track')).toEqual({ source: 'default' })
  })

  it('records and resolves known visited tunes', () => {
    recordKnownTune('other-track', DEFAULT_TRACK_TUNE)
    expect(readKnownTune('other-track')).toEqual(DEFAULT_TRACK_TUNE)
    writeTuneOverride('neon-track', { source: 'visited', slug: 'other-track' })
    expect(resolvePersonalTune('neon-track', entry.tune)).toEqual(
      DEFAULT_TRACK_TUNE,
    )
    expect(store[KNOWN_TUNES_STORAGE_KEY]).toContain('other-track')
  })

  it('falls back to the default tune when an override is missing', () => {
    store[TUNE_OVERRIDES_STORAGE_KEY] = JSON.stringify({
      'neon-track': {
        source: 'mine',
        id: '00000000-0000-4000-8000-000000000099',
      },
    })
    expect(resolvePersonalTune('neon-track', DEFAULT_TRACK_TUNE)).toEqual(
      DEFAULT_TRACK_TUNE,
    )
  })
})
