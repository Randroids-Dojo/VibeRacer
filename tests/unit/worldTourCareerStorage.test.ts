import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  WORLD_TOUR_CAREER_EVENT,
  WORLD_TOUR_CAREER_STORAGE_KEY,
  readCareer,
  writeCareer,
} from '@/lib/worldTourCareerStorage'
import {
  CAREER_FIRST_TOUR_ID,
  CAREER_SCHEMA_VERSION,
  CAREER_STARTING_CAR_ID,
  CAREER_STARTING_MONEY,
  defaultCareer,
  type WorldTourCareer,
} from '@/game/worldTourCareer'

interface FakeWindow {
  localStorage: {
    getItem: (k: string) => string | null
    setItem: (k: string, v: string) => void
    removeItem: (k: string) => void
  }
  dispatchEvent: (e: Event) => boolean
  CustomEvent: typeof CustomEvent
}

describe('world tour career storage', () => {
  const originalWindow = (globalThis as { window?: unknown }).window
  let store: Record<string, string>
  let dispatched: Array<{ type: string; detail: unknown }>
  let setItem: (k: string, v: string) => void

  beforeEach(() => {
    store = {}
    dispatched = []
    setItem = (k, v) => {
      store[k] = v
    }
    const fakeWindow: FakeWindow = {
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => setItem(k, v),
        removeItem: (k) => {
          delete store[k]
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

  describe('readCareer', () => {
    it('returns defaultCareer on empty storage', () => {
      expect(readCareer()).toEqual(defaultCareer())
    })

    it('returns defaultCareer on malformed JSON', () => {
      store[WORLD_TOUR_CAREER_STORAGE_KEY] = '{not json'
      expect(readCareer()).toEqual(defaultCareer())
    })

    it('returns defaultCareer on a non-object payload', () => {
      store[WORLD_TOUR_CAREER_STORAGE_KEY] = JSON.stringify(42)
      expect(readCareer()).toEqual(defaultCareer())
    })

    it('round-trips a successful write', () => {
      const next: WorldTourCareer = {
        ...defaultCareer(),
        money: 3000,
        completedTourIds: ['velvet-coast'],
      }
      const result = writeCareer(next)
      expect(result.ok).toBe(true)
      const reread = readCareer()
      expect(reread.money).toBe(3000)
      expect(reread.completedTourIds).toEqual(['velvet-coast'])
      expect(reread.unlockedTourIds).toContain(CAREER_FIRST_TOUR_ID)
    })

    it('migrates a dirty stored payload through migrateCareer', () => {
      store[WORLD_TOUR_CAREER_STORAGE_KEY] = JSON.stringify({
        money: 99.7,
        ownedCarIds: ['starter', 'starter'],
        activeCarId: 'starter',
        unlockedTourIds: [],
      })
      const out = readCareer()
      expect(out.money).toBe(99)
      expect(out.ownedCarIds).toEqual(['starter'])
      expect(out.unlockedTourIds).toContain(CAREER_FIRST_TOUR_ID)
    })

    it('is SSR safe and returns defaultCareer when window is absent', () => {
      delete (globalThis as { window?: unknown }).window
      expect(readCareer()).toEqual(defaultCareer())
    })

    it('returns a fresh object so callers cannot alias each other', () => {
      writeCareer({ ...defaultCareer(), money: 200 })
      const a = readCareer()
      const b = readCareer()
      expect(a).not.toBe(b)
      a.completedTourIds.push('foo')
      expect(b.completedTourIds).toEqual([])
    })
  })

  describe('writeCareer', () => {
    it('persists the migrated value and dispatches the change event', () => {
      const result = writeCareer({
        ...defaultCareer(),
        money: 750,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.career.money).toBe(750)
      const stored = JSON.parse(store[WORLD_TOUR_CAREER_STORAGE_KEY]!) as {
        money: number
      }
      expect(stored.money).toBe(750)
      expect(dispatched).toHaveLength(1)
      expect(dispatched[0]!.type).toBe(WORLD_TOUR_CAREER_EVENT)
      const detail = dispatched[0]!.detail as WorldTourCareer
      expect(detail.money).toBe(750)
    })

    it('returns a fresh clone so the caller cannot alias the stored value', () => {
      const result = writeCareer({
        ...defaultCareer(),
        money: 800,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      result.career.completedTourIds.push('mut')
      expect(readCareer().completedTourIds).toEqual([])
    })

    it('reports ssr when window is absent', () => {
      delete (globalThis as { window?: unknown }).window
      const result = writeCareer(defaultCareer())
      expect(result).toEqual({ ok: false, reason: 'ssr' })
    })

    it('reports quota on a setItem exception and does not throw', () => {
      setItem = () => {
        throw new Error('QuotaExceededError')
      }
      const result = writeCareer({
        ...defaultCareer(),
        money: 9999,
      })
      expect(result).toEqual({ ok: false, reason: 'quota' })
      expect(dispatched).toHaveLength(0)
    })

    it('still dispatches when migration cleans up the input', () => {
      const dirty: WorldTourCareer = {
        version: CAREER_SCHEMA_VERSION,
        money: 50.5,
        ownedCarIds: [CAREER_STARTING_CAR_ID],
        activeCarId: CAREER_STARTING_CAR_ID,
        carsById: {
          [CAREER_STARTING_CAR_ID]: {
            damage: 0,
            upgrades: { engine: 0, tires: 0, brakes: 0, body: 0 },
          },
        },
        completedTourIds: [],
        unlockedTourIds: [CAREER_FIRST_TOUR_ID],
        activeTour: null,
      }
      const result = writeCareer(dirty)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.career.money).toBe(50)
      expect(dispatched).toHaveLength(1)
    })

    it('drops activeTour from a stored v1 payload while preserving money, completed, unlocks, and owned cars', () => {
      store[WORLD_TOUR_CAREER_STORAGE_KEY] = JSON.stringify({
        version: 1,
        money: 4321,
        ownedCarIds: [CAREER_STARTING_CAR_ID, 'red'],
        activeCarId: 'red',
        carsById: {
          [CAREER_STARTING_CAR_ID]: { damage: 0, upgrades: { engine: 0, tires: 0, brakes: 0, body: 0 } },
          red: { damage: 0.3, upgrades: { engine: 1, tires: 0, brakes: 0, body: 0 } },
        },
        completedTourIds: ['velvet-coast'],
        unlockedTourIds: ['velvet-coast', 'iron-borough'],
        activeTour: {
          tourId: 'iron-borough',
          raceIndex: 2,
          results: [
            { trackId: 'ib-1', placement: 3, dnf: false, cashEarned: 200 },
            { trackId: 'ib-2', placement: 2, dnf: false, cashEarned: 350 },
          ],
        },
      })
      const out = readCareer()
      expect(out.version).toBe(CAREER_SCHEMA_VERSION)
      expect(out.activeTour).toBeNull()
      expect(out.money).toBe(4321)
      expect(out.completedTourIds).toEqual(['velvet-coast'])
      expect(out.unlockedTourIds).toEqual(['velvet-coast', 'iron-borough'])
      expect(out.ownedCarIds).toEqual([CAREER_STARTING_CAR_ID, 'red'])
      expect(out.carsById.red!.damage).toBeCloseTo(0.3)
    })

    it('keeps activeTour on a v2 payload that has entries', () => {
      writeCareer({
        ...defaultCareer(),
        activeTour: {
          tourId: 'velvet-coast',
          raceIndex: 1,
          results: [
            {
              trackId: 'velvet-coast-1',
              placement: 2,
              dnf: false,
              cashEarned: 350,
              entries: [
                { driverId: 'a', carId: 'a', placement: 1, dnf: false, points: 10, isPlayer: false },
                { driverId: null, carId: CAREER_STARTING_CAR_ID, placement: 2, dnf: false, points: 7, isPlayer: true },
              ],
            },
          ],
        },
      })
      const out = readCareer()
      expect(out.activeTour).not.toBeNull()
      expect(out.activeTour!.tourId).toBe('velvet-coast')
      expect(out.activeTour!.raceIndex).toBe(1)
      expect(out.activeTour!.results).toHaveLength(1)
      expect(out.activeTour!.results[0]!.entries).toHaveLength(2)
    })

    it('a fresh write produces the documented starting money', () => {
      writeCareer(defaultCareer())
      const reread = readCareer()
      expect(reread.money).toBe(CAREER_STARTING_MONEY)
    })
  })
})
