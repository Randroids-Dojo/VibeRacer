import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { FakeKv } from './_fakeKv'

const fake = new FakeKv()

beforeAll(() => {
  process.env.RACE_SIGNING_SECRET = 'test-secret-for-vitest-only'
  process.env.KV_REST_API_URL = 'http://fake'
  process.env.KV_REST_API_TOKEN = 'fake'
})

vi.mock('@/lib/kv', async () => {
  const actual = await vi.importActual<typeof import('@/lib/kv')>('@/lib/kv')
  return {
    ...actual,
    getKv: () => fake,
    hasKvConfigured: () => true,
  }
})

beforeEach(async () => {
  await fake.del('lb:derby:dust-bowl')
})

function buildReq(url: string) {
  return new NextRequest(url, { method: 'GET' })
}

describe('GET /api/derby/leaderboard', () => {
  it('rejects an invalid arena slug', async () => {
    const { GET } = await import('@/app/api/derby/leaderboard/route')
    const res = await GET(
      buildReq('http://test/api/derby/leaderboard?arena=atlantis'),
    )
    expect(res.status).toBe(400)
  })

  it('returns an empty list for an empty board', async () => {
    const { GET } = await import('@/app/api/derby/leaderboard/route')
    const res = await GET(
      buildReq('http://test/api/derby/leaderboard?arena=dust-bowl'),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entries: unknown[]; total: number }
    expect(body.entries).toEqual([])
    expect(body.total).toBe(0)
  })

  it('returns entries sorted by roundTimeMs ascending', async () => {
    const { writeDerbyEntry } = await import('@/lib/derbyLeaderboard')
    await writeDerbyEntry(fake, 'dust-bowl', {
      initials: 'AAA',
      roundTimeMs: 90_000,
      vehicle: 'car',
      scorePoints: 100,
      racerId: '00000000-0000-4000-8000-000000000001',
      postedAt: 1_700_000_000_000,
    })
    await writeDerbyEntry(fake, 'dust-bowl', {
      initials: 'BBB',
      roundTimeMs: 60_000,
      vehicle: 'racecar',
      scorePoints: 800,
      racerId: '00000000-0000-4000-8000-000000000002',
      postedAt: 1_700_000_000_001,
    })
    const { GET } = await import('@/app/api/derby/leaderboard/route')
    const res = await GET(
      buildReq('http://test/api/derby/leaderboard?arena=dust-bowl'),
    )
    const body = (await res.json()) as {
      entries: { initials: string; roundTimeMs: number }[]
      total: number
    }
    expect(body.entries).toHaveLength(2)
    expect(body.entries[0].initials).toBe('BBB')
    expect(body.entries[0].roundTimeMs).toBe(60_000)
    expect(body.entries[1].initials).toBe('AAA')
    expect(body.total).toBe(2)
  })

  it('respects the limit and offset parameters', async () => {
    const { writeDerbyEntry } = await import('@/lib/derbyLeaderboard')
    for (let i = 0; i < 5; i++) {
      await writeDerbyEntry(fake, 'dust-bowl', {
        initials: ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'][i],
        roundTimeMs: 60_000 + i * 1000,
        vehicle: 'car',
        scorePoints: 0,
        racerId: `00000000-0000-4000-8000-00000000000${i + 1}`,
        postedAt: 1_700_000_000_000 + i,
      })
    }
    const { GET } = await import('@/app/api/derby/leaderboard/route')
    const res = await GET(
      buildReq(
        'http://test/api/derby/leaderboard?arena=dust-bowl&limit=2&offset=1',
      ),
    )
    const body = (await res.json()) as { entries: { initials: string }[] }
    expect(body.entries).toHaveLength(2)
    expect(body.entries[0].initials).toBe('BBB')
    expect(body.entries[1].initials).toBe('CCC')
  })
})
