import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { FakeKv } from './_fakeKv'

const fake = new FakeKv()
const slug = 'track'
const versionHash = 'a'.repeat(64)
const nonce = 'b'.repeat(32)

beforeAll(() => {
  process.env.KV_REST_API_URL = 'http://fake'
  process.env.KV_REST_API_TOKEN = 'fake'
})

beforeEach(async () => {
  await fake.del(`lap:replay:${nonce}`)
})

vi.mock('@/lib/kv', async () => {
  const actual = await vi.importActual<typeof import('@/lib/kv')>('@/lib/kv')
  return { ...actual, getKv: () => fake }
})

function buildReq(opts: {
  slug?: string
  v?: string
  nonce?: string
} = {}) {
  const params = new URLSearchParams({
    slug: opts.slug ?? slug,
    v: opts.v ?? versionHash,
    nonce: opts.nonce ?? nonce,
  })
  return new NextRequest(
    `http://test/api/replay/byNonce?${params.toString()}`,
    { method: 'GET' },
  )
}

describe('GET /api/replay/byNonce', () => {
  it('returns 404 when the nonce is not stored', async () => {
    const { GET } = await import('@/app/api/replay/byNonce/route')
    const res = await GET(buildReq())
    expect(res.status).toBe(404)
  })

  it('returns the replay for a valid nonce', async () => {
    const replay = { lapTimeMs: 2500, samples: [[0, 0, 0], [1, 1, 0.1]] }
    await fake.set(`lap:replay:${nonce}`, JSON.stringify(replay))
    const { GET } = await import('@/app/api/replay/byNonce/route')
    const res = await GET(buildReq())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { lapTimeMs: number; samples: number[][] }
    expect(body.lapTimeMs).toBe(2500)
    expect(body.samples.length).toBe(2)
  })

  it('returns 400 on a malformed nonce', async () => {
    const { GET } = await import('@/app/api/replay/byNonce/route')
    const res = await GET(buildReq({ nonce: 'short' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 on a missing slug', async () => {
    const { GET } = await import('@/app/api/replay/byNonce/route')
    const res = await GET(buildReq({ slug: '' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 on a missing version hash', async () => {
    const { GET } = await import('@/app/api/replay/byNonce/route')
    const res = await GET(buildReq({ v: '' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the stored payload fails replay schema validation', async () => {
    await fake.set(`lap:replay:${nonce}`, JSON.stringify({ bogus: true }))
    const { GET } = await import('@/app/api/replay/byNonce/route')
    const res = await GET(buildReq())
    expect(res.status).toBe(404)
  })
})
