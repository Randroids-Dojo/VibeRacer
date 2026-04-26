import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  ACHIEVEMENTS_EVENT,
  readAchievements,
  readVisitedSlugs,
  recordSlugVisit,
  writeAchievements,
} from '@/lib/achievements'

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

describe('achievements storage', () => {
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

  describe('readAchievements', () => {
    it('returns an empty object on empty storage', () => {
      expect(readAchievements()).toEqual({})
    })

    it('returns an empty object on malformed JSON', () => {
      store['viberacer.achievements'] = '{not json'
      expect(readAchievements()).toEqual({})
    })

    it('returns an empty object on a payload that fails the schema', () => {
      store['viberacer.achievements'] = JSON.stringify({
        'first-lap': { unlockedAt: 'no', slug: '', versionHash: '' },
      })
      expect(readAchievements()).toEqual({})
    })

    it('filters out unknown ids', () => {
      store['viberacer.achievements'] = JSON.stringify({
        'first-lap': { unlockedAt: 1, slug: 's', versionHash: 'h' },
        'unknown-id': { unlockedAt: 1, slug: 's', versionHash: 'h' },
      })
      const out = readAchievements()
      expect(out['first-lap']).toBeDefined()
      expect((out as Record<string, unknown>)['unknown-id']).toBeUndefined()
    })

    it('round-trips a valid payload', () => {
      writeAchievements({
        'first-lap': { unlockedAt: 100, slug: 'oval', versionHash: 'abc' },
      })
      expect(readAchievements()).toEqual({
        'first-lap': { unlockedAt: 100, slug: 'oval', versionHash: 'abc' },
      })
    })
  })

  describe('writeAchievements', () => {
    it('persists the map and dispatches the event', () => {
      writeAchievements({
        'first-pb': { unlockedAt: 50, slug: 'oval', versionHash: 'abc' },
      })
      expect(store['viberacer.achievements']).toBe(
        JSON.stringify({
          'first-pb': { unlockedAt: 50, slug: 'oval', versionHash: 'abc' },
        }),
      )
      expect(dispatched).toHaveLength(1)
      expect(dispatched[0].type).toBe(ACHIEVEMENTS_EVENT)
    })
  })

  describe('readVisitedSlugs / recordSlugVisit', () => {
    it('returns an empty list before any visit', () => {
      expect(readVisitedSlugs()).toEqual([])
    })

    it('records a fresh slug and returns the new count', () => {
      const count = recordSlugVisit('oval')
      expect(count).toBe(1)
      expect(readVisitedSlugs()).toEqual(['oval'])
    })

    it('is idempotent on a re-visit', () => {
      recordSlugVisit('oval')
      const count = recordSlugVisit('oval')
      expect(count).toBe(1)
      expect(readVisitedSlugs()).toEqual(['oval'])
    })

    it('counts distinct slugs across multiple visits', () => {
      recordSlugVisit('oval')
      recordSlugVisit('sandbox')
      recordSlugVisit('oval')
      const count = recordSlugVisit('hairpin')
      expect(count).toBe(3)
      const stored = readVisitedSlugs().sort()
      expect(stored).toEqual(['hairpin', 'oval', 'sandbox'])
    })

    it('dedupes hand-edited duplicates on read', () => {
      store['viberacer.slugsVisited'] = JSON.stringify(['oval', 'oval', 'sandbox'])
      const out = readVisitedSlugs().sort()
      expect(out).toEqual(['oval', 'sandbox'])
    })

    it('returns an empty list on malformed JSON', () => {
      store['viberacer.slugsVisited'] = 'not-json'
      expect(readVisitedSlugs()).toEqual([])
    })
  })
})
