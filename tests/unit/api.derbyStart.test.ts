import { describe, it, expect, beforeAll, vi } from 'vitest'
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
  }
})

function buildReq(url: string, cookie?: string) {
  return new NextRequest(url, {
    method: 'POST',
    headers: cookie ? { cookie } : {},
  })
}

const COOKIE = 'viberacer.racerId=00000000-0000-4000-8000-000000000000'

describe('POST /api/derby/start', () => {
  it('rejects missing racerId cookie', async () => {
    const { POST } = await import('@/app/api/derby/start/route')
    const res = await POST(
      buildReq('http://test/api/derby/start?arena=dust-bowl&vehicle=car'),
    )
    expect(res.status).toBe(401)
  })

  it('rejects invalid arena slug', async () => {
    const { POST } = await import('@/app/api/derby/start/route')
    const res = await POST(
      buildReq(
        'http://test/api/derby/start?arena=atlantis&vehicle=car',
        COOKIE,
      ),
    )
    expect(res.status).toBe(400)
  })

  it('rejects invalid vehicle type', async () => {
    const { POST } = await import('@/app/api/derby/start/route')
    const res = await POST(
      buildReq(
        'http://test/api/derby/start?arena=dust-bowl&vehicle=motorbike',
        COOKIE,
      ),
    )
    expect(res.status).toBe(400)
  })

  it('issues a signed token and stores derby:token:<nonce> in KV', async () => {
    const { POST } = await import('@/app/api/derby/start/route')
    const res = await POST(
      buildReq(
        'http://test/api/derby/start?arena=dust-bowl&vehicle=racecar',
        COOKIE,
      ),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      token: string
      nonce: string
      arena: string
      vehicle: string
      configHash: string
    }
    expect(body.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(body.nonce).toMatch(/^[a-f0-9]{32}$/)
    expect(body.arena).toBe('dust-bowl')
    expect(body.vehicle).toBe('racecar')
    expect(body.configHash).toMatch(/^[a-f0-9]{64}$/)

    const stored = await fake.get<{
      arena: string
      vehicle: string
      racerId: string
      configHash: string
    }>(`derby:token:${body.nonce}`)
    expect(stored?.arena).toBe('dust-bowl')
    expect(stored?.vehicle).toBe('racecar')
    expect(stored?.racerId).toBe('00000000-0000-4000-8000-000000000000')
    expect(stored?.configHash).toBe(body.configHash)
  })
})
