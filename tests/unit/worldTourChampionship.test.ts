import { describe, it, expect } from 'vitest'
import {
  FIELD_SIZE_MVP,
  findTour,
  nextTourOf,
  tourDrivers,
  validateChampionship,
  type Championship,
  type Tour,
} from '@/lib/worldTourChampionship'
import {
  STANDARD_CHAMPIONSHIP,
  VELVET_COAST_TOUR_ID,
  getStandardChampionship,
} from '@/data/worldTourChampionship'

function makeTour(overrides: Partial<Tour> = {}): Tour {
  return {
    id: 't',
    name: 'T',
    region: 'R',
    theme: { primary: '#fff', secondary: '#000', accent: '#888' },
    weather: 'clear',
    requiredStanding: 2,
    fieldSize: 4,
    trackIds: ['a', 'b', 'c', 'd'],
    aiDriverIds: ['d1', 'd2', 'd3'],
    ...overrides,
  }
}

function makeChampionship(overrides: Partial<Championship> = {}): Championship {
  return {
    id: 'c',
    name: 'C',
    drivers: [
      { id: 'd1', name: 'one', color: '#001' },
      { id: 'd2', name: 'two', color: '#002' },
      { id: 'd3', name: 'three', color: '#003' },
    ],
    tours: [makeTour()],
    ...overrides,
  }
}

describe('findTour', () => {
  it('returns the matching tour', () => {
    const t = findTour(STANDARD_CHAMPIONSHIP, VELVET_COAST_TOUR_ID)
    expect(t).not.toBeNull()
    expect(t!.id).toBe(VELVET_COAST_TOUR_ID)
  })

  it('returns null for an unknown id', () => {
    expect(findTour(STANDARD_CHAMPIONSHIP, 'missing-id')).toBeNull()
  })
})

describe('nextTourOf', () => {
  it('returns null for the final tour', () => {
    expect(nextTourOf(STANDARD_CHAMPIONSHIP, VELVET_COAST_TOUR_ID)).toBeNull()
  })

  it('returns the next tour when one exists', () => {
    const c = makeChampionship({
      tours: [
        makeTour({ id: 'a' }),
        makeTour({ id: 'b' }),
        makeTour({ id: 'c' }),
      ],
    })
    expect(nextTourOf(c, 'a')!.id).toBe('b')
    expect(nextTourOf(c, 'b')!.id).toBe('c')
    expect(nextTourOf(c, 'c')).toBeNull()
  })

  it('returns null for an unknown id', () => {
    expect(nextTourOf(STANDARD_CHAMPIONSHIP, 'missing')).toBeNull()
  })
})

describe('validateChampionship', () => {
  it('accepts the bundled standard championship', () => {
    expect(validateChampionship(STANDARD_CHAMPIONSHIP)).toEqual({ ok: true })
  })

  it('rejects a tour with the wrong track count', () => {
    const c = makeChampionship({
      tours: [makeTour({ trackIds: ['a', 'b'] })],
    })
    const res = validateChampionship(c)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors.some((e) => e.includes('expected 4'))).toBe(true)
  })

  it('rejects a tour with a roster size that does not match fieldSize', () => {
    const c = makeChampionship({
      tours: [makeTour({ aiDriverIds: ['d1', 'd2'] })],
    })
    const res = validateChampionship(c)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors.some((e) => e.includes('ai drivers for a field'))).toBe(true)
  })

  it('rejects a tour that references an unknown driver id', () => {
    const c = makeChampionship({
      tours: [makeTour({ aiDriverIds: ['d1', 'd2', 'GHOST'] })],
    })
    const res = validateChampionship(c)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors.some((e) => e.includes('unknown ai driver'))).toBe(true)
  })

  it('rejects a requiredStanding outside the field', () => {
    const c = makeChampionship({
      tours: [makeTour({ requiredStanding: 99 })],
    })
    const res = validateChampionship(c)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors.some((e) => e.includes('out of range'))).toBe(true)
  })

  it('rejects duplicate tour ids', () => {
    const c = makeChampionship({
      tours: [makeTour({ id: 'x' }), makeTour({ id: 'x' })],
    })
    const res = validateChampionship(c)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors.some((e) => e.includes('duplicate tour id'))).toBe(true)
  })
})

describe('tourDrivers', () => {
  it('resolves the full driver list for a valid tour', () => {
    const tour = findTour(STANDARD_CHAMPIONSHIP, VELVET_COAST_TOUR_ID)!
    const drivers = tourDrivers(STANDARD_CHAMPIONSHIP, tour)
    expect(drivers).not.toBeNull()
    expect(drivers!.length).toBe(FIELD_SIZE_MVP - 1)
    for (const d of drivers!) {
      expect(d.id).toMatch(/^driver-velvet-/)
    }
  })

  it('returns null when any id is unknown', () => {
    const champ = makeChampionship({
      drivers: [{ id: 'd1', name: 'a', color: '#111' }],
      tours: [makeTour({ aiDriverIds: ['d1', 'missing', 'missing2'] })],
    })
    const result = tourDrivers(champ, champ.tours[0]!)
    expect(result).toBeNull()
  })
})

describe('getStandardChampionship', () => {
  it('returns the frozen bundled championship', () => {
    expect(getStandardChampionship()).toBe(STANDARD_CHAMPIONSHIP)
    expect(Object.isFrozen(STANDARD_CHAMPIONSHIP)).toBe(true)
  })

  it('has exactly one tour in the MVP', () => {
    expect(STANDARD_CHAMPIONSHIP.tours).toHaveLength(1)
    expect(STANDARD_CHAMPIONSHIP.tours[0]!.id).toBe(VELVET_COAST_TOUR_ID)
  })
})
