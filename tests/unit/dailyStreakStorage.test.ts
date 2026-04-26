import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  DAILY_STREAK_EVENT,
  DAILY_STREAK_STORAGE_KEY,
  readDailyStreakDays,
  recordDailyStreakDay,
} from '@/lib/dailyStreakStorage'

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

describe('daily streak storage', () => {
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

  describe('readDailyStreakDays', () => {
    it('returns an empty array on empty storage', () => {
      expect(readDailyStreakDays()).toEqual([])
    })

    it('returns an empty array on malformed JSON', () => {
      store[DAILY_STREAK_STORAGE_KEY] = '{not json'
      expect(readDailyStreakDays()).toEqual([])
    })

    it('returns an empty array on a payload that fails the schema', () => {
      store[DAILY_STREAK_STORAGE_KEY] = JSON.stringify({ wrongShape: true })
      expect(readDailyStreakDays()).toEqual([])
    })

    it('drops malformed entries on read', () => {
      store[DAILY_STREAK_STORAGE_KEY] = JSON.stringify({
        days: ['2026-04-26', 'garbage', '2026-13-01', '2026-04-25'],
      })
      expect(readDailyStreakDays()).toEqual(['2026-04-25', '2026-04-26'])
    })

    it('round-trips a write through read', () => {
      recordDailyStreakDay('2026-04-26')
      expect(readDailyStreakDays()).toEqual(['2026-04-26'])
    })
  })

  describe('recordDailyStreakDay', () => {
    it('persists a fresh date and dispatches the event', () => {
      const next = recordDailyStreakDay('2026-04-26')
      expect(next).toEqual(['2026-04-26'])
      expect(store[DAILY_STREAK_STORAGE_KEY]).toBe(
        JSON.stringify({ days: ['2026-04-26'] }),
      )
      expect(dispatched).toHaveLength(1)
      expect(dispatched[0].type).toBe(DAILY_STREAK_EVENT)
      expect(dispatched[0].detail).toEqual(['2026-04-26'])
    })

    it('is a no-op on a duplicate write (same UTC day)', () => {
      recordDailyStreakDay('2026-04-26')
      dispatched.length = 0
      const next = recordDailyStreakDay('2026-04-26')
      expect(next).toEqual(['2026-04-26'])
      expect(dispatched).toHaveLength(0)
    })

    it('keeps the stored history sorted ascending', () => {
      recordDailyStreakDay('2026-04-26')
      recordDailyStreakDay('2026-04-25')
      recordDailyStreakDay('2026-04-27')
      const stored = JSON.parse(store[DAILY_STREAK_STORAGE_KEY]) as {
        days: string[]
      }
      expect(stored.days).toEqual(['2026-04-25', '2026-04-26', '2026-04-27'])
    })

    it('is a no-op on a malformed date key', () => {
      const next = recordDailyStreakDay('garbage')
      expect(next).toEqual([])
      expect(store[DAILY_STREAK_STORAGE_KEY]).toBeUndefined()
      expect(dispatched).toHaveLength(0)
    })

    it('is a no-op on an empty date key', () => {
      const next = recordDailyStreakDay('')
      expect(next).toEqual([])
      expect(dispatched).toHaveLength(0)
    })

    it('returns the new sanitized list to the caller', () => {
      const a = recordDailyStreakDay('2026-04-26')
      expect(a).toEqual(['2026-04-26'])
      const b = recordDailyStreakDay('2026-04-25')
      expect(b).toEqual(['2026-04-25', '2026-04-26'])
    })

    it('dispatches one event per fresh write only', () => {
      recordDailyStreakDay('2026-04-26')
      recordDailyStreakDay('2026-04-26')
      recordDailyStreakDay('2026-04-25')
      // Two unique writes => two events.
      expect(dispatched).toHaveLength(2)
    })
  })
})
