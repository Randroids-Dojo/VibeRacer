import { describe, it, expect } from 'vitest'
import { FakeKv } from './_fakeKv'
import { readRecentTracks } from '@/lib/recentTracks'
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
