import { describe, it, expect } from 'vitest'
import {
  CAREER_FIRST_TOUR_ID,
  CAREER_SCHEMA_VERSION,
  CAREER_STARTING_CAR_ID,
  CAREER_STARTING_MONEY,
  cloneCareer,
  defaultCareer,
  getActiveCar,
  hasActiveTour,
  isCareerComplete,
  migrateCareer,
  withActiveCarState,
  type WorldTourCareer,
} from '@/game/worldTourCareer'

describe('defaultCareer', () => {
  it('returns a stable seed save with the documented constants', () => {
    const c = defaultCareer()
    expect(c.version).toBe(CAREER_SCHEMA_VERSION)
    expect(c.money).toBe(CAREER_STARTING_MONEY)
    expect(c.ownedCarIds).toEqual([CAREER_STARTING_CAR_ID])
    expect(c.activeCarId).toBe(CAREER_STARTING_CAR_ID)
    expect(c.carsById[CAREER_STARTING_CAR_ID]).toEqual({
      damage: 0,
      upgrades: { engine: 0, tires: 0, brakes: 0, body: 0 },
    })
    expect(c.completedTourIds).toEqual([])
    expect(c.unlockedTourIds).toEqual([CAREER_FIRST_TOUR_ID])
    expect(c.activeTour).toBeNull()
  })

  it('returns a fresh object each call so callers can mutate freely', () => {
    const a = defaultCareer()
    const b = defaultCareer()
    expect(a).not.toBe(b)
    expect(a.ownedCarIds).not.toBe(b.ownedCarIds)
    a.ownedCarIds.push('mutant')
    expect(b.ownedCarIds).toEqual([CAREER_STARTING_CAR_ID])
  })
})

describe('cloneCareer', () => {
  it('deep clones every array and the activeTour object', () => {
    const source: WorldTourCareer = {
      version: 1,
      money: 500,
      ownedCarIds: ['starter', 'red'],
      activeCarId: 'red',
      carsById: {
        starter: { damage: 0, upgrades: { engine: 0, tires: 0, brakes: 0, body: 0 } },
        red: { damage: 0.4, upgrades: { engine: 1, tires: 0, brakes: 2, body: 0 } },
      },
      completedTourIds: ['velvet-coast'],
      unlockedTourIds: ['velvet-coast', 'iron-borough'],
      activeTour: {
        tourId: 'iron-borough',
        raceIndex: 2,
        results: [
          { trackId: 't1', placement: 1, dnf: false, cashEarned: 100 },
          { trackId: 't2', placement: 4, dnf: false, cashEarned: 25 },
        ],
      },
    }
    const cloned = cloneCareer(source)
    expect(cloned).toEqual(source)
    expect(cloned).not.toBe(source)
    expect(cloned.ownedCarIds).not.toBe(source.ownedCarIds)
    expect(cloned.completedTourIds).not.toBe(source.completedTourIds)
    expect(cloned.unlockedTourIds).not.toBe(source.unlockedTourIds)
    expect(cloned.activeTour).not.toBe(source.activeTour)
    expect(cloned.activeTour!.results).not.toBe(source.activeTour!.results)
    expect(cloned.activeTour!.results[0]).not.toBe(source.activeTour!.results[0])
    cloned.activeTour!.results.push({
      trackId: 'mut',
      placement: 12,
      dnf: true,
      cashEarned: 0,
    })
    expect(source.activeTour!.results).toHaveLength(2)
  })

  it('preserves a null activeTour as null', () => {
    const source = defaultCareer()
    const cloned = cloneCareer(source)
    expect(cloned.activeTour).toBeNull()
  })
})

describe('migrateCareer', () => {
  it('returns a defaultCareer on an unrecognized payload', () => {
    expect(migrateCareer(null)).toEqual(defaultCareer())
    expect(migrateCareer(undefined)).toEqual(defaultCareer())
    expect(migrateCareer(42)).toEqual(defaultCareer())
    expect(migrateCareer('hello')).toEqual(defaultCareer())
    expect(migrateCareer([])).toEqual(defaultCareer())
  })

  it('round-trips a fully populated valid v1 save', () => {
    const valid: WorldTourCareer = {
      version: 1,
      money: 2500,
      ownedCarIds: ['starter', 'speeder'],
      activeCarId: 'speeder',
      carsById: {
        starter: { damage: 0, upgrades: { engine: 0, tires: 0, brakes: 0, body: 0 } },
        speeder: { damage: 0.15, upgrades: { engine: 2, tires: 1, brakes: 1, body: 0 } },
      },
      completedTourIds: ['velvet-coast'],
      unlockedTourIds: ['velvet-coast', 'iron-borough'],
      activeTour: {
        tourId: 'iron-borough',
        raceIndex: 1,
        results: [
          { trackId: 'ib-1', placement: 3, dnf: false, cashEarned: 200 },
        ],
      },
    }
    expect(migrateCareer(valid)).toEqual(valid)
  })

  it('coerces money and placement to integers and drops bad results', () => {
    const dirty = {
      version: 1,
      money: 1234.9,
      ownedCarIds: ['starter'],
      activeCarId: 'starter',
      completedTourIds: [],
      unlockedTourIds: ['velvet-coast'],
      activeTour: {
        tourId: 'velvet-coast',
        raceIndex: 1.7,
        results: [
          { trackId: 'a', placement: 2.4, dnf: false, cashEarned: 100 },
          { trackId: '', placement: 1, dnf: false, cashEarned: 50 },
          { placement: 1, dnf: false, cashEarned: 50 },
          { trackId: 'c', placement: 0, dnf: false, cashEarned: 50 },
        ],
      },
    }
    const out = migrateCareer(dirty)
    expect(out.money).toBe(1234)
    expect(out.activeTour!.raceIndex).toBe(1)
    expect(out.activeTour!.results).toEqual([
      { trackId: 'a', placement: 2, dnf: false, cashEarned: 100 },
    ])
  })

  it('forces the active car into the owned list if missing', () => {
    const out = migrateCareer({
      version: 1,
      money: 0,
      ownedCarIds: ['red'],
      activeCarId: 'blue',
      completedTourIds: [],
      unlockedTourIds: ['velvet-coast'],
      activeTour: null,
    })
    expect(out.ownedCarIds).toContain('blue')
    expect(out.activeCarId).toBe('blue')
  })

  it('always restores velvet-coast to the unlocked tour list', () => {
    const out = migrateCareer({
      version: 1,
      money: 0,
      ownedCarIds: ['starter'],
      activeCarId: 'starter',
      completedTourIds: [],
      unlockedTourIds: [],
      activeTour: null,
    })
    expect(out.unlockedTourIds).toContain(CAREER_FIRST_TOUR_ID)
  })

  it('rejects malformed activeTour as null without losing other fields', () => {
    const out = migrateCareer({
      version: 1,
      money: 100,
      ownedCarIds: ['starter'],
      activeCarId: 'starter',
      completedTourIds: [],
      unlockedTourIds: ['velvet-coast'],
      activeTour: { tourId: '', raceIndex: 0, results: [] },
    })
    expect(out.activeTour).toBeNull()
    expect(out.money).toBe(100)
  })

  it('folds legacy top-level damage into the active car slot', () => {
    const a = migrateCareer({ version: 1, activeCarDamage: 2 })
    expect(a.carsById[a.activeCarId]!.damage).toBe(1)
    const b = migrateCareer({ version: 1, activeCarDamage: -0.5 })
    expect(b.carsById[b.activeCarId]!.damage).toBe(0)
    const c = migrateCareer({ version: 1 })
    expect(c.carsById[c.activeCarId]!.damage).toBe(0)
    const d = migrateCareer({ version: 1, activeCarDamage: 'broken' })
    expect(d.carsById[d.activeCarId]!.damage).toBe(0)
  })

  it('folds legacy top-level upgrades into the active car slot', () => {
    const out = migrateCareer({
      version: 1,
      activeCarUpgrades: { engine: 9, tires: -1, brakes: 'broken' },
    })
    const active = out.carsById[out.activeCarId]!
    expect(active.upgrades.engine).toBe(3)
    expect(active.upgrades.tires).toBe(0)
    expect(active.upgrades.brakes).toBe(0)
    expect(active.upgrades.body).toBe(0)
  })

  it('prefers carsById over the legacy fields when both are present', () => {
    const out = migrateCareer({
      version: 1,
      ownedCarIds: ['starter'],
      activeCarId: 'starter',
      activeCarDamage: 0.9,
      activeCarUpgrades: { engine: 3, tires: 0, brakes: 0, body: 0 },
      carsById: {
        starter: {
          damage: 0.1,
          upgrades: { engine: 0, tires: 1, brakes: 0, body: 0 },
        },
      },
    })
    const active = out.carsById[out.activeCarId]!
    expect(active.damage).toBe(0.1)
    expect(active.upgrades.engine).toBe(0)
    expect(active.upgrades.tires).toBe(1)
  })

  it('floors fractional upgrade tiers folded from the legacy field', () => {
    const out = migrateCareer({
      version: 1,
      activeCarUpgrades: { engine: 2.7, tires: 1.4, brakes: 0, body: 0 },
    })
    const active = out.carsById[out.activeCarId]!
    expect(active.upgrades.engine).toBe(2)
    expect(active.upgrades.tires).toBe(1)
  })

  it('seeds stock entries in carsById for every owned car', () => {
    const out = migrateCareer({
      version: 1,
      ownedCarIds: ['starter', 'red', 'blue'],
      activeCarId: 'red',
    })
    expect(Object.keys(out.carsById).sort()).toEqual(['blue', 'red', 'starter'])
    expect(out.carsById.blue).toEqual({
      damage: 0,
      upgrades: { engine: 0, tires: 0, brakes: 0, body: 0 },
    })
  })

  it('dedupes owned, completed, and unlocked id lists', () => {
    const out = migrateCareer({
      version: 1,
      money: 0,
      ownedCarIds: ['a', 'a', 'b'],
      activeCarId: 'a',
      completedTourIds: ['t1', 't1'],
      unlockedTourIds: ['velvet-coast', 'velvet-coast', 't2'],
      activeTour: null,
    })
    expect(out.ownedCarIds).toEqual(['a', 'b'])
    expect(out.completedTourIds).toEqual(['t1'])
    expect(out.unlockedTourIds).toEqual(['velvet-coast', 't2'])
  })
})

describe('getActiveCar', () => {
  it('returns the active car slot from carsById', () => {
    const career = defaultCareer()
    career.carsById[CAREER_STARTING_CAR_ID]!.damage = 0.6
    const active = getActiveCar(career)
    expect(active.damage).toBe(0.6)
  })

  it('returns a stock placeholder when the active car is missing from carsById', () => {
    const career = defaultCareer()
    career.activeCarId = 'ghost-id'
    const active = getActiveCar(career)
    expect(active.damage).toBe(0)
    expect(active.upgrades).toEqual({
      engine: 0,
      tires: 0,
      brakes: 0,
      body: 0,
    })
  })
})

describe('withActiveCarState', () => {
  it('patches damage without touching upgrades', () => {
    const career = defaultCareer()
    career.carsById[CAREER_STARTING_CAR_ID]!.upgrades = {
      engine: 2,
      tires: 0,
      brakes: 0,
      body: 0,
    }
    const next = withActiveCarState(career, {
      damage: 0.3,
    })
    expect(next.carsById[CAREER_STARTING_CAR_ID]!.damage).toBe(0.3)
    expect(next.carsById[CAREER_STARTING_CAR_ID]!.upgrades.engine).toBe(2)
  })

  it('returns a fresh career and does not mutate the input', () => {
    const career = defaultCareer()
    const next = withActiveCarState(career, {
      damage: 0.5,
    })
    expect(next).not.toBe(career)
    expect(career.carsById[CAREER_STARTING_CAR_ID]!.damage).toBe(0)
  })
})

describe('hasActiveTour', () => {
  it('reflects the cursor presence', () => {
    expect(hasActiveTour(defaultCareer())).toBe(false)
    const c = defaultCareer()
    c.activeTour = { tourId: 'velvet-coast', raceIndex: 0, results: [] }
    expect(hasActiveTour(c)).toBe(true)
  })
})

describe('isCareerComplete', () => {
  it('is false for a fresh career', () => {
    expect(isCareerComplete(defaultCareer(), ['velvet-coast'])).toBe(false)
  })

  it('is true only when every tour id is in completedTourIds', () => {
    const c = defaultCareer()
    c.completedTourIds = ['velvet-coast', 'iron-borough']
    expect(isCareerComplete(c, ['velvet-coast', 'iron-borough'])).toBe(true)
    expect(isCareerComplete(c, ['velvet-coast', 'iron-borough', 'ember-steppe'])).toBe(false)
  })

  it('is false when the championship list is empty', () => {
    expect(isCareerComplete(defaultCareer(), [])).toBe(false)
  })
})
