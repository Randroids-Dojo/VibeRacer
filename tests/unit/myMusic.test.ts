import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  KNOWN_MUSIC_STORAGE_KEY,
  MY_MUSIC_EVENT,
  MY_MUSIC_STORAGE_KEY,
  MUSIC_OVERRIDES_STORAGE_KEY,
  deleteMyMusic,
  parseMyMusic,
  readKnownMusic,
  readMyMusic,
  readMusicOverride,
  recordKnownMusic,
  resolvePersonalMusic,
  upsertMyMusic,
  writeMusicOverride,
  type MyMusicEntry,
} from '@/lib/myMusic'
import { DEFAULT_TRACK_MUSIC, generateMusicFromSeed } from '@/lib/trackMusic'

const entry: MyMusicEntry = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Neon',
  originSlug: 'neon-track',
  music: generateMusicFromSeed('neon'),
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

describe('parseMyMusic', () => {
  it('returns empty for malformed payloads', () => {
    expect(parseMyMusic(null)).toEqual([])
    expect(parseMyMusic({ nope: true })).toEqual([])
  })

  it('sorts newest first and dedupes by id', () => {
    expect(
      parseMyMusic([
        entry,
        { ...entry, name: 'Older', updatedAt: 900 },
        { ...entry, id: '00000000-0000-4000-8000-000000000002', updatedAt: 1200 },
      ]).map((item) => item.updatedAt),
    ).toEqual([1200, 1000])
  })
})

describe('my tune storage', () => {
  it('upserts entries and dispatches a change event', () => {
    expect(upsertMyMusic(entry)).toEqual([entry])
    expect(readMyMusic()).toEqual([entry])
    expect(dispatched[0]).toEqual({ type: MY_MUSIC_EVENT, detail: [entry] })
    expect(store[MY_MUSIC_STORAGE_KEY]).toContain('Neon')
  })

  it('deleting a music clears matching overrides', () => {
    upsertMyMusic(entry)
    writeMusicOverride('neon-track', { source: 'mine', id: entry.id })
    expect(readMusicOverride('neon-track')).toEqual({
      source: 'mine',
      id: entry.id,
    })
    deleteMyMusic(entry.id)
    expect(readMyMusic()).toEqual([])
    expect(readMusicOverride('neon-track')).toEqual({ source: 'default' })
  })

  it('records and resolves known visited music', () => {
    recordKnownMusic('other-track', DEFAULT_TRACK_MUSIC)
    expect(readKnownMusic('other-track')).toEqual(DEFAULT_TRACK_MUSIC)
    writeMusicOverride('neon-track', { source: 'visited', slug: 'other-track' })
    expect(resolvePersonalMusic('neon-track', entry.music)).toEqual(
      DEFAULT_TRACK_MUSIC,
    )
    expect(store[KNOWN_MUSIC_STORAGE_KEY]).toContain('other-track')
  })

  it('falls back to the default tune when an override is missing', () => {
    store[MUSIC_OVERRIDES_STORAGE_KEY] = JSON.stringify({
      'neon-track': {
        source: 'mine',
        id: '00000000-0000-4000-8000-000000000099',
      },
    })
    expect(resolvePersonalMusic('neon-track', DEFAULT_TRACK_MUSIC)).toEqual(
      DEFAULT_TRACK_MUSIC,
    )
  })
})
