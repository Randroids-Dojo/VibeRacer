import { describe, it, expect } from 'vitest'
import {
  applyFavoriteAdd,
  applyFavoriteRemove,
  isFavoriteTrack,
  parseFavoriteTracks,
  sortFavoriteTracks,
  type FavoriteTrackEntry,
} from '@/lib/favoriteTracks'

describe('sortFavoriteTracks', () => {
  it('returns most-recently-starred first', () => {
    const entries: FavoriteTrackEntry[] = [
      { slug: 'oval', addedAt: 100 },
      { slug: 'sandbox', addedAt: 300 },
      { slug: 'figure-eight', addedAt: 200 },
    ]
    expect(sortFavoriteTracks(entries).map((e) => e.slug)).toEqual([
      'sandbox',
      'figure-eight',
      'oval',
    ])
  })

  it('breaks ties on slug name ascending', () => {
    const entries: FavoriteTrackEntry[] = [
      { slug: 'zulu', addedAt: 100 },
      { slug: 'alpha', addedAt: 100 },
      { slug: 'bravo', addedAt: 100 },
    ]
    expect(sortFavoriteTracks(entries).map((e) => e.slug)).toEqual([
      'alpha',
      'bravo',
      'zulu',
    ])
  })

  it('returns a fresh array and does not mutate the input', () => {
    const entries: FavoriteTrackEntry[] = [
      { slug: 'oval', addedAt: 100 },
      { slug: 'sandbox', addedAt: 300 },
    ]
    const before = entries.slice()
    const out = sortFavoriteTracks(entries)
    expect(entries).toEqual(before)
    expect(out).not.toBe(entries)
  })

  it('handles an empty list', () => {
    expect(sortFavoriteTracks([])).toEqual([])
  })
})

describe('applyFavoriteAdd', () => {
  it('appends a new entry', () => {
    const out = applyFavoriteAdd([], 'oval', 100)
    expect(out).toEqual([{ slug: 'oval', addedAt: 100 }])
  })

  it('preserves the existing entry when the slug is already present', () => {
    const prev: FavoriteTrackEntry[] = [{ slug: 'oval', addedAt: 100 }]
    const out = applyFavoriteAdd(prev, 'oval', 999)
    expect(out).toEqual([{ slug: 'oval', addedAt: 100 }])
  })

  it('does not mutate the input on the no-op path', () => {
    const prev: FavoriteTrackEntry[] = [{ slug: 'oval', addedAt: 100 }]
    const out = applyFavoriteAdd(prev, 'oval', 999)
    expect(out).not.toBe(prev)
    expect(prev).toEqual([{ slug: 'oval', addedAt: 100 }])
  })

  it('rejects a non-string slug', () => {
    const prev: FavoriteTrackEntry[] = [{ slug: 'oval', addedAt: 100 }]
    expect(applyFavoriteAdd(prev, 42, 200)).toEqual(prev)
    expect(applyFavoriteAdd(prev, null, 200)).toEqual(prev)
    expect(applyFavoriteAdd(prev, undefined, 200)).toEqual(prev)
  })

  it('rejects a malformed slug', () => {
    const prev: FavoriteTrackEntry[] = []
    expect(applyFavoriteAdd(prev, 'NotKebab', 200)).toEqual([])
    expect(applyFavoriteAdd(prev, '-leading-dash', 200)).toEqual([])
    expect(applyFavoriteAdd(prev, '', 200)).toEqual([])
  })

  it('rejects a non-finite or non-positive timestamp', () => {
    const prev: FavoriteTrackEntry[] = []
    expect(applyFavoriteAdd(prev, 'oval', 0)).toEqual([])
    expect(applyFavoriteAdd(prev, 'oval', -10)).toEqual([])
    expect(applyFavoriteAdd(prev, 'oval', Number.NaN)).toEqual([])
    expect(applyFavoriteAdd(prev, 'oval', Number.POSITIVE_INFINITY)).toEqual([])
  })

  it('rejects a non-number timestamp', () => {
    const prev: FavoriteTrackEntry[] = []
    expect(applyFavoriteAdd(prev, 'oval', '200' as unknown)).toEqual([])
    expect(applyFavoriteAdd(prev, 'oval', null)).toEqual([])
  })
})

describe('applyFavoriteRemove', () => {
  it('removes a present entry', () => {
    const prev: FavoriteTrackEntry[] = [
      { slug: 'oval', addedAt: 100 },
      { slug: 'sandbox', addedAt: 200 },
    ]
    const out = applyFavoriteRemove(prev, 'oval')
    expect(out).toEqual([{ slug: 'sandbox', addedAt: 200 }])
  })

  it('returns a clone when the slug is not present', () => {
    const prev: FavoriteTrackEntry[] = [{ slug: 'oval', addedAt: 100 }]
    const out = applyFavoriteRemove(prev, 'sandbox')
    expect(out).toEqual(prev)
    expect(out).not.toBe(prev)
  })

  it('rejects a non-string slug', () => {
    const prev: FavoriteTrackEntry[] = [{ slug: 'oval', addedAt: 100 }]
    expect(applyFavoriteRemove(prev, 42)).toEqual(prev)
    expect(applyFavoriteRemove(prev, null)).toEqual(prev)
  })

  it('rejects a malformed slug', () => {
    const prev: FavoriteTrackEntry[] = [{ slug: 'oval', addedAt: 100 }]
    expect(applyFavoriteRemove(prev, 'NotKebab')).toEqual(prev)
  })
})

describe('isFavoriteTrack', () => {
  const entries: FavoriteTrackEntry[] = [
    { slug: 'oval', addedAt: 100 },
    { slug: 'sandbox', addedAt: 200 },
  ]

  it('returns true for a present slug', () => {
    expect(isFavoriteTrack(entries, 'oval')).toBe(true)
    expect(isFavoriteTrack(entries, 'sandbox')).toBe(true)
  })

  it('returns false for a missing slug', () => {
    expect(isFavoriteTrack(entries, 'figure-eight')).toBe(false)
  })

  it('returns false on an empty list', () => {
    expect(isFavoriteTrack([], 'oval')).toBe(false)
  })

  it('returns false for a non-string slug', () => {
    expect(isFavoriteTrack(entries, 42)).toBe(false)
    expect(isFavoriteTrack(entries, null)).toBe(false)
    expect(isFavoriteTrack(entries, undefined)).toBe(false)
  })

  it('returns false for a malformed slug value', () => {
    expect(isFavoriteTrack(entries, 'NotKebab')).toBe(false)
    expect(isFavoriteTrack(entries, '')).toBe(false)
  })
})

describe('parseFavoriteTracks', () => {
  it('returns an empty list for null', () => {
    expect(parseFavoriteTracks(null)).toEqual([])
  })

  it('returns an empty list for malformed JSON', () => {
    expect(parseFavoriteTracks('not json')).toEqual([])
  })

  it('returns an empty list for non-array JSON', () => {
    expect(parseFavoriteTracks('{"slug":"oval","addedAt":100}')).toEqual([])
  })

  it('returns an empty list for a list with malformed entries', () => {
    expect(
      parseFavoriteTracks('[{"slug":42,"addedAt":100}]'),
    ).toEqual([])
  })

  it('parses a clean payload sorted most-recent-first', () => {
    const raw = JSON.stringify([
      { slug: 'oval', addedAt: 100 },
      { slug: 'sandbox', addedAt: 300 },
    ])
    expect(parseFavoriteTracks(raw)).toEqual([
      { slug: 'sandbox', addedAt: 300 },
      { slug: 'oval', addedAt: 100 },
    ])
  })

  it('dedupes duplicate slugs by keeping the earliest addedAt', () => {
    const raw = JSON.stringify([
      { slug: 'oval', addedAt: 200 },
      { slug: 'oval', addedAt: 100 },
    ])
    expect(parseFavoriteTracks(raw)).toEqual([
      { slug: 'oval', addedAt: 100 },
    ])
  })

  it('rejects entries with a non-positive timestamp', () => {
    const raw = JSON.stringify([
      { slug: 'oval', addedAt: 0 },
      { slug: 'sandbox', addedAt: -1 },
    ])
    expect(parseFavoriteTracks(raw)).toEqual([])
  })

  it('rejects entries with a malformed slug', () => {
    const raw = JSON.stringify([{ slug: 'NotKebab', addedAt: 100 }])
    expect(parseFavoriteTracks(raw)).toEqual([])
  })
})
