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

describe('POST /api/race/start', () => {
  it('rejects missing racerId cookie', async () => {
    const { POST } = await import('@/app/api/race/start/route')
    const res = await POST(
      buildReq(`http://test/api/race/start?slug=track&v=${'a'.repeat(64)}`),
    )
    expect(res.status).toBe(401)
  })

  it('rejects invalid slug or version hash', async () => {
    const { POST } = await import('@/app/api/race/start/route')
    const res = await POST(
      buildReq(
        `http://test/api/race/start?slug=NOT_VALID&v=${'a'.repeat(64)}`,
        'viberacer.racerId=00000000-0000-4000-8000-000000000000',
      ),
    )
    expect(res.status).toBe(400)
  })

  it('issues a signed token and writes race:token:<nonce> to KV', async () => {
    const { POST } = await import('@/app/api/race/start/route')
    const res = await POST(
      buildReq(
        `http://test/api/race/start?slug=track&v=${'a'.repeat(64)}`,
        'viberacer.racerId=00000000-0000-4000-8000-000000000000',
      ),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { token: string; nonce: string }
    expect(body.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(body.nonce).toMatch(/^[a-f0-9]{32}$/)

    const stored = await fake.get<{ slug: string; racerId: string }>(
      `race:token:${body.nonce}`,
    )
    expect(stored?.slug).toBe('track')
    expect(stored?.racerId).toBe('00000000-0000-4000-8000-000000000000')
  })
})
