import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { FakeKv } from './_fakeKv'

const fake = new FakeKv()
const slug = 'track'
const versionHash = 'a'.repeat(64)

beforeAll(() => {
  process.env.KV_REST_API_URL = 'http://fake'
  process.env.KV_REST_API_TOKEN = 'fake'
})

beforeEach(async () => {
  await fake.del(
    `track:${slug}:${versionHash}:topReplay`,
    `lap:replay:nonceA`,
    `lap:replay:nonceB`,
    `lb:${slug}:${versionHash}`,
  )
})

vi.mock('@/lib/kv', async () => {
  const actual = await vi.importActual<typeof import('@/lib/kv')>('@/lib/kv')
  return { ...actual, getKv: () => fake }
})

function buildReq() {
  return new NextRequest(
    `http://test/api/replay/top?slug=${slug}&v=${versionHash}`,
    { method: 'GET' },
  )
}

describe('GET /api/replay/top', () => {
  it('returns 404 when no pointer is set', async () => {
    const { GET } = await import('@/app/api/replay/top/route')
    const res = await GET(buildReq())
    expect(res.status).toBe(404)
  })

  it('returns 404 when the pointer dangles', async () => {
    await fake.set(`track:${slug}:${versionHash}:topReplay`, 'nonceMissing')
    const { GET } = await import('@/app/api/replay/top/route')
    const res = await GET(buildReq())
    expect(res.status).toBe(404)
  })

  it('returns the pointed-at replay', async () => {
    const replay = { lapTimeMs: 2500, samples: [[0, 0, 0], [1, 1, 0.1]] }
    await fake.set(`lap:replay:nonceA`, JSON.stringify(replay))
    await fake.set(`track:${slug}:${versionHash}:topReplay`, 'nonceA')
    const { GET } = await import('@/app/api/replay/top/route')
    const res = await GET(buildReq())
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      lapTimeMs: number
      samples: number[][]
      initials: string | null
    }
    expect(body.lapTimeMs).toBe(2500)
    expect(body.samples.length).toBe(2)
    expect(body.samples[1]).toEqual([1, 1, 0.1])
    // Empty leaderboard means no initials to surface; the response should
    // still include the field (null) so the client can branch on its
    // presence without needing a separate "is the response old or new"
    // probe.
    expect(body.initials).toBeNull()
  })

  it('returns the leaderboard top entry initials alongside the replay', async () => {
    const replay = { lapTimeMs: 2500, samples: [[0, 0, 0], [1, 1, 0.1]] }
    await fake.set(`lap:replay:nonceA`, JSON.stringify(replay))
    await fake.set(`track:${slug}:${versionHash}:topReplay`, 'nonceA')
    // Seed the leaderboard with one entry. Member shape mirrors the production
    // format used by the submit route: `initials:racerId:ts:nonce`.
    await fake.zadd(`lb:${slug}:${versionHash}`, {
      score: 2500,
      member: 'XYZ:racer-uuid:1700000000000:nonceA',
    })
    const { GET } = await import('@/app/api/replay/top/route')
    const res = await GET(buildReq())
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      lapTimeMs: number
      initials: string | null
    }
    expect(body.lapTimeMs).toBe(2500)
    expect(body.initials).toBe('XYZ')
  })

  it('returns initials = null when the leaderboard top member is malformed', async () => {
    const replay = { lapTimeMs: 2500, samples: [[0, 0, 0]] }
    await fake.set(`lap:replay:nonceA`, JSON.stringify(replay))
    await fake.set(`track:${slug}:${versionHash}:topReplay`, 'nonceA')
    // Hand-edited member that the parser will reject (only 3 colon-segments
    // instead of 4). The route must still succeed.
    await fake.zadd(`lb:${slug}:${versionHash}`, {
      score: 2500,
      member: 'bogus:member:value',
    })
    const { GET } = await import('@/app/api/replay/top/route')
    const res = await GET(buildReq())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { initials: string | null }
    expect(body.initials).toBeNull()
  })

  it('rejects bad query params', async () => {
    const { GET } = await import('@/app/api/replay/top/route')
    const res = await GET(
      new NextRequest(`http://test/api/replay/top?slug=&v=`, { method: 'GET' }),
    )
    expect(res.status).toBe(400)
  })
})
