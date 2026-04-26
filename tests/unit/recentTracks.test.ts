import { describe, it, expect } from 'vitest'
import { FakeKv } from './_fakeKv'
import {
  fetchTopTimeForSlug,
  parseTopTimeFromZrange,
  readRecentTracks,
} from '@/lib/recentTracks'
import { kvKeys } from '@/lib/kv'

function seedTrackIndex(
  kv: FakeKv,
  entries: Array<{ slug: string; score: number }>,
): Promise<unknown[]> {
  return Promise.all(
    entries.map((e) =>
      kv.zadd(kvKeys.trackIndex(), { score: e.score, member: e.slug }),
    ),
  )
}

describe('readRecentTracks', () => {
  it('returns slugs ordered newest first with their scores', async () => {
    const kv = new FakeKv()
    await seedTrackIndex(kv, [
      { slug: 'oldest', score: 1 },
      { slug: 'middle', score: 2 },
      { slug: 'newest', score: 3 },
    ])
    const out = await readRecentTracks(kv, 10)
    expect(out.map((r) => r.slug)).toEqual(['newest', 'middle', 'oldest'])
    expect(out[0].updatedAt).toBe(3)
  })

  it('clamps the limit into [1, RECENT_TRACKS_MAX_LIMIT]', async () => {
    const kv = new FakeKv()
    await seedTrackIndex(kv, [
      { slug: 'a', score: 1 },
      { slug: 'b', score: 2 },
      { slug: 'c', score: 3 },
    ])
    const one = await readRecentTracks(kv, 0)
    expect(one.length).toBe(1)
    expect(one[0].slug).toBe('c')
  })

  it('excludes the current slug when asked', async () => {
    const kv = new FakeKv()
    await seedTrackIndex(kv, [
      { slug: 'mine', score: 3 },
      { slug: 'yours', score: 2 },
      { slug: 'theirs', score: 1 },
    ])
    const out = await readRecentTracks(kv, 10, 'mine')
    expect(out.map((r) => r.slug)).toEqual(['yours', 'theirs'])
  })

  it('returns an empty list when nothing is indexed', async () => {
    const kv = new FakeKv()
    const out = await readRecentTracks(kv, 10)
    expect(out).toEqual([])
  })

  it('ignores members that do not validate as slugs', async () => {
    const kv = new FakeKv()
    await seedTrackIndex(kv, [
      { slug: 'VALID', score: 9 }, // uppercase fails SlugSchema
      { slug: 'ok-slug', score: 8 },
    ])
    const out = await readRecentTracks(kv, 10)
    expect(out.map((r) => r.slug)).toEqual(['ok-slug'])
  })
})

describe('parseTopTimeFromZrange', () => {
  it('parses a well-formed top entry', () => {
    const parsed = parseTopTimeFromZrange([
      'ABC:00000000-0000-0000-0000-000000000000:1700000000:nonce123',
      '12345',
    ])
    expect(parsed).toEqual({ initials: 'ABC', lapTimeMs: 12345 })
  })

  it('rounds non-integer scores', () => {
    const parsed = parseTopTimeFromZrange([
      'XYZ:racer:1:n',
      '12345.7',
    ])
    expect(parsed).toEqual({ initials: 'XYZ', lapTimeMs: 12346 })
  })

  it('rejects empty input', () => {
    expect(parseTopTimeFromZrange([])).toBeNull()
    expect(parseTopTimeFromZrange(['onlyMember'])).toBeNull()
  })

  it('rejects malformed initials (length, case)', () => {
    expect(parseTopTimeFromZrange(['ab:r:1:n', '100'])).toBeNull()
    expect(parseTopTimeFromZrange(['abcd:r:1:n', '100'])).toBeNull()
    expect(parseTopTimeFromZrange(['ab2:r:1:n', '100'])).toBeNull()
  })

  it('rejects member with too few segments', () => {
    expect(parseTopTimeFromZrange(['ABC:r:1', '100'])).toBeNull()
    expect(parseTopTimeFromZrange(['ABC', '100'])).toBeNull()
  })

  it('rejects non-finite or non-positive scores', () => {
    expect(parseTopTimeFromZrange(['ABC:r:1:n', 'NaN'])).toBeNull()
    expect(parseTopTimeFromZrange(['ABC:r:1:n', '0'])).toBeNull()
    expect(parseTopTimeFromZrange(['ABC:r:1:n', '-50'])).toBeNull()
    expect(parseTopTimeFromZrange(['ABC:r:1:n', 'Infinity'])).toBeNull()
  })

  it('rejects implausibly large lap times (over an hour)', () => {
    const overHourMs = 60 * 60 * 1000 + 1
    expect(
      parseTopTimeFromZrange(['ABC:r:1:n', String(overHourMs)]),
    ).toBeNull()
  })

  it('rejects non-array input', () => {
    expect(parseTopTimeFromZrange(null as unknown as unknown[])).toBeNull()
    expect(
      parseTopTimeFromZrange('not-array' as unknown as unknown[]),
    ).toBeNull()
  })
})

describe('fetchTopTimeForSlug', () => {
  it('returns null when the slug has no latest version', async () => {
    const kv = new FakeKv()
    const out = await fetchTopTimeForSlug(kv, 'unknown-slug')
    expect(out).toBeNull()
  })

  it('returns the rank-1 entry when the leaderboard has one', async () => {
    const kv = new FakeKv()
    const slug = 'oval'
    const hash = 'a'.repeat(64)
    await kv.set(kvKeys.trackLatest(slug), hash)
    await kv.zadd(kvKeys.leaderboard(slug, hash), {
      score: 25_000,
      member: 'ABC:racer-uuid:1700000000:nonce-1',
    })
    await kv.zadd(kvKeys.leaderboard(slug, hash), {
      score: 30_000,
      member: 'XYZ:racer-uuid-2:1700000001:nonce-2',
    })
    const out = await fetchTopTimeForSlug(kv, slug)
    expect(out).toEqual({ initials: 'ABC', lapTimeMs: 25_000 })
  })

  it('returns null when the leaderboard is empty', async () => {
    const kv = new FakeKv()
    const slug = 'empty'
    const hash = 'b'.repeat(64)
    await kv.set(kvKeys.trackLatest(slug), hash)
    const out = await fetchTopTimeForSlug(kv, slug)
    expect(out).toBeNull()
  })

  it('returns null when the latest hash is empty / non-string', async () => {
    const kv = new FakeKv()
    await kv.set(kvKeys.trackLatest('blank'), '')
    expect(await fetchTopTimeForSlug(kv, 'blank')).toBeNull()
  })

  it('swallows kv errors and returns null', async () => {
    const broken = {
      get: async () => {
        throw new Error('boom')
      },
      zrange: async () => [],
    }
    const out = await fetchTopTimeForSlug(broken, 'oval')
    expect(out).toBeNull()
  })
})
