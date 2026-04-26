import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  MY_TRACKS_EVENT,
  MY_TRACKS_STORAGE_KEY,
  applyMyTrackSave,
  parseMyTracks,
  readMyTracks,
  recordMyTrack,
  sortMyTracks,
  type MyTrackEntry,
} from '@/lib/myTracks'

interface FakeWindow {
  localStorage: {
    getItem: (k: string) => string | null
    setItem: (k: string, v: string) => void
    removeItem: (k: string) => void
    clear: () => void
  }
  dispatchEvent: (e: Event) => boolean
  CustomEvent: typeof CustomEvent
}

describe('myTracks helpers', () => {
  describe('sortMyTracks', () => {
    it('sorts newest-first by updatedAt', () => {
      const input: MyTrackEntry[] = [
        { slug: 'a', updatedAt: 100 },
        { slug: 'b', updatedAt: 300 },
        { slug: 'c', updatedAt: 200 },
      ]
      expect(sortMyTracks(input)).toEqual([
        { slug: 'b', updatedAt: 300 },
        { slug: 'c', updatedAt: 200 },
        { slug: 'a', updatedAt: 100 },
      ])
    })

    it('breaks ties by slug name ascending', () => {
      const input: MyTrackEntry[] = [
        { slug: 'banana', updatedAt: 100 },
        { slug: 'apple', updatedAt: 100 },
        { slug: 'cherry', updatedAt: 100 },
      ]
      expect(sortMyTracks(input)).toEqual([
        { slug: 'apple', updatedAt: 100 },
        { slug: 'banana', updatedAt: 100 },
        { slug: 'cherry', updatedAt: 100 },
      ])
    })

    it('does not mutate the input', () => {
      const input: MyTrackEntry[] = [
        { slug: 'a', updatedAt: 100 },
        { slug: 'b', updatedAt: 200 },
      ]
      const snapshot = JSON.parse(JSON.stringify(input))
      sortMyTracks(input)
      expect(input).toEqual(snapshot)
    })

    it('returns an empty array for empty input', () => {
      expect(sortMyTracks([])).toEqual([])
    })
  })

  describe('applyMyTrackSave', () => {
    it('appends a new slug to an empty list', () => {
      const out = applyMyTrackSave([], 'oval', 100)
      expect(out).toEqual([{ slug: 'oval', updatedAt: 100 }])
    })

    it('appends a new slug to a populated list', () => {
      const prev: MyTrackEntry[] = [{ slug: 'oval', updatedAt: 100 }]
      const out = applyMyTrackSave(prev, 'sandbox', 200)
      expect(out).toEqual([
        { slug: 'oval', updatedAt: 100 },
        { slug: 'sandbox', updatedAt: 200 },
      ])
    })

    it('bumps updatedAt for an existing slug', () => {
      const prev: MyTrackEntry[] = [{ slug: 'oval', updatedAt: 100 }]
      const out = applyMyTrackSave(prev, 'oval', 200)
      expect(out).toEqual([{ slug: 'oval', updatedAt: 200 }])
    })

    it('keeps the existing updatedAt when the new value is older', () => {
      const prev: MyTrackEntry[] = [{ slug: 'oval', updatedAt: 200 }]
      const out = applyMyTrackSave(prev, 'oval', 100)
      expect(out).toEqual([{ slug: 'oval', updatedAt: 200 }])
    })

    it('does not mutate the input', () => {
      const prev: MyTrackEntry[] = [{ slug: 'oval', updatedAt: 100 }]
      const snapshot = JSON.parse(JSON.stringify(prev))
      applyMyTrackSave(prev, 'sandbox', 200)
      expect(prev).toEqual(snapshot)
    })

    it('rejects a non-string slug', () => {
      const prev: MyTrackEntry[] = [{ slug: 'oval', updatedAt: 100 }]
      const out = applyMyTrackSave(prev, 42, 200)
      expect(out).toEqual(prev)
    })

    it('rejects a slug that fails SlugSchema', () => {
      const prev: MyTrackEntry[] = [{ slug: 'oval', updatedAt: 100 }]
      const out = applyMyTrackSave(prev, 'BAD SLUG!', 200)
      expect(out).toEqual(prev)
    })

    it('rejects a non-finite timestamp', () => {
      const prev: MyTrackEntry[] = [{ slug: 'oval', updatedAt: 100 }]
      expect(applyMyTrackSave(prev, 'sandbox', NaN)).toEqual(prev)
      expect(applyMyTrackSave(prev, 'sandbox', Infinity)).toEqual(prev)
      expect(applyMyTrackSave(prev, 'sandbox', -Infinity)).toEqual(prev)
    })

    it('rejects a non-positive timestamp', () => {
      const prev: MyTrackEntry[] = [{ slug: 'oval', updatedAt: 100 }]
      expect(applyMyTrackSave(prev, 'sandbox', 0)).toEqual(prev)
      expect(applyMyTrackSave(prev, 'sandbox', -1)).toEqual(prev)
    })

    it('rejects a non-number timestamp', () => {
      const prev: MyTrackEntry[] = [{ slug: 'oval', updatedAt: 100 }]
      expect(applyMyTrackSave(prev, 'sandbox', '200')).toEqual(prev)
      expect(applyMyTrackSave(prev, 'sandbox', null)).toEqual(prev)
      expect(applyMyTrackSave(prev, 'sandbox', undefined)).toEqual(prev)
    })
  })

  describe('parseMyTracks', () => {
    it('returns an empty array for null input', () => {
      expect(parseMyTracks(null)).toEqual([])
    })

    it('returns an empty array for malformed JSON', () => {
      expect(parseMyTracks('{not json')).toEqual([])
    })

    it('returns an empty array for non-array JSON', () => {
      expect(parseMyTracks(JSON.stringify({ slug: 'oval' }))).toEqual([])
    })

    it('returns an empty array when an entry fails the schema', () => {
      expect(
        parseMyTracks(
          JSON.stringify([{ slug: 'BAD SLUG', updatedAt: 100 }]),
        ),
      ).toEqual([])
    })

    it('round-trips a valid list and sorts newest-first', () => {
      const raw = JSON.stringify([
        { slug: 'apple', updatedAt: 100 },
        { slug: 'banana', updatedAt: 300 },
        { slug: 'cherry', updatedAt: 200 },
      ])
      expect(parseMyTracks(raw)).toEqual([
        { slug: 'banana', updatedAt: 300 },
        { slug: 'cherry', updatedAt: 200 },
        { slug: 'apple', updatedAt: 100 },
      ])
    })

    it('dedupes hand-edited duplicates by keeping the newest updatedAt', () => {
      const raw = JSON.stringify([
        { slug: 'oval', updatedAt: 100 },
        { slug: 'oval', updatedAt: 300 },
        { slug: 'oval', updatedAt: 200 },
      ])
      expect(parseMyTracks(raw)).toEqual([{ slug: 'oval', updatedAt: 300 }])
    })
  })

  describe('readMyTracks / recordMyTrack', () => {
    const originalWindow = (globalThis as { window?: unknown }).window
    let store: Record<string, string>
    let dispatched: Array<{ type: string; detail: unknown }>

    beforeEach(() => {
      store = {}
      dispatched = []
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
        dispatchEvent: (e: Event) => {
          const ce = e as CustomEvent
          dispatched.push({ type: ce.type, detail: ce.detail })
          return true
        },
        CustomEvent:
          globalThis.CustomEvent ??
          (class CustomEventPolyfill<T> {
            type: string
            detail: T
            constructor(type: string, init: { detail: T }) {
              this.type = type
              this.detail = init.detail
            }
          } as unknown as typeof CustomEvent),
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

    it('readMyTracks returns an empty array on empty storage', () => {
      expect(readMyTracks()).toEqual([])
    })

    it('recordMyTrack persists the slug + dispatches the event', () => {
      const out = recordMyTrack('oval', 1234)
      expect(out).toEqual([{ slug: 'oval', updatedAt: 1234 }])
      expect(JSON.parse(store[MY_TRACKS_STORAGE_KEY])).toEqual([
        { slug: 'oval', updatedAt: 1234 },
      ])
      expect(dispatched).toEqual([
        { type: MY_TRACKS_EVENT, detail: [{ slug: 'oval', updatedAt: 1234 }] },
      ])
    })

    it('recordMyTrack bumps an existing slug to the new timestamp', () => {
      recordMyTrack('oval', 100)
      recordMyTrack('oval', 200)
      expect(readMyTracks()).toEqual([{ slug: 'oval', updatedAt: 200 }])
    })

    it('recordMyTrack appends a new slug alongside an existing one', () => {
      recordMyTrack('oval', 100)
      recordMyTrack('sandbox', 200)
      expect(readMyTracks()).toEqual([
        { slug: 'sandbox', updatedAt: 200 },
        { slug: 'oval', updatedAt: 100 },
      ])
    })

    it('recordMyTrack with a malformed slug is a no-op on storage', () => {
      recordMyTrack('oval', 100)
      const before = store[MY_TRACKS_STORAGE_KEY]
      recordMyTrack('BAD SLUG!', 200)
      expect(store[MY_TRACKS_STORAGE_KEY]).toEqual(before)
    })

    it('readMyTracks returns the parsed list sorted newest-first', () => {
      recordMyTrack('apple', 100)
      recordMyTrack('banana', 300)
      recordMyTrack('cherry', 200)
      expect(readMyTracks()).toEqual([
        { slug: 'banana', updatedAt: 300 },
        { slug: 'cherry', updatedAt: 200 },
        { slug: 'apple', updatedAt: 100 },
      ])
    })

    it('readMyTracks recovers from a corrupt blob', () => {
      store[MY_TRACKS_STORAGE_KEY] = '{not json'
      expect(readMyTracks()).toEqual([])
    })
  })
})
