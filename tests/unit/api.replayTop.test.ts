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
    const body = (await res.json()) as { lapTimeMs: number; samples: number[][] }
    expect(body.lapTimeMs).toBe(2500)
    expect(body.samples.length).toBe(2)
    expect(body.samples[1]).toEqual([1, 1, 0.1])
  })

  it('rejects bad query params', async () => {
    const { GET } = await import('@/app/api/replay/top/route')
    const res = await GET(
      new NextRequest(`http://test/api/replay/top?slug=&v=`, { method: 'GET' }),
    )
    expect(res.status).toBe(400)
  })
})
