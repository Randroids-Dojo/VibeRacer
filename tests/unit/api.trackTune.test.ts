import { beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { FakeKv } from './_fakeKv'
import { DEFAULT_TRACK_TUNE } from '@/lib/tunes'

const fake = new FakeKv()
const racerId = '00000000-0000-4000-8000-000000000000'

beforeAll(() => {
  process.env.KV_REST_API_URL = 'http://fake'
  process.env.KV_REST_API_TOKEN = 'fake'
})

vi.mock('@/lib/kv', async () => {
  const actual = await vi.importActual<typeof import('@/lib/kv')>('@/lib/kv')
  return { ...actual, getKv: () => fake }
})

function cookieHeader() {
  return `viberacer.racerId=${racerId}`
}

describe('/api/track/[slug]/tune', () => {
  it('returns null when a slug has no tune', async () => {
    const { GET } = await import('@/app/api/track/[slug]/tune/route')
    const res = await GET(new NextRequest('http://test/api/track/no-tune/tune'), {
      params: Promise.resolve({ slug: 'no-tune' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { tune: unknown; versions: unknown[] }
    expect(body.tune).toBeNull()
    expect(body.versions).toEqual([])
  })

  it('saves and loads the latest tune', async () => {
    const { GET, PUT } = await import('@/app/api/track/[slug]/tune/route')
    const slug = 'tune-slug'
    const putReq = new NextRequest(`http://test/api/track/${slug}/tune`, {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify(DEFAULT_TRACK_TUNE),
    })
    const putRes = await PUT(putReq, { params: Promise.resolve({ slug }) })
    expect(putRes.status).toBe(200)
    const putBody = (await putRes.json()) as { versionHash: string }
    expect(putBody.versionHash).toMatch(/^[a-f0-9]{64}$/)
    expect(await fake.get<string>(`tune:${slug}:latest`)).toBe(
      putBody.versionHash,
    )

    const getRes = await GET(
      new NextRequest(`http://test/api/track/${slug}/tune`),
      { params: Promise.resolve({ slug }) },
    )
    const getBody = (await getRes.json()) as {
      versionHash: string
      tune: typeof DEFAULT_TRACK_TUNE
      versions: { hash: string; createdAt: string }[]
    }
    expect(getBody.versionHash).toBe(putBody.versionHash)
    expect(getBody.tune).toEqual(DEFAULT_TRACK_TUNE)
    expect(getBody.versions[0].hash).toBe(putBody.versionHash)
  })

  it('rejects invalid scales', async () => {
    const { PUT } = await import('@/app/api/track/[slug]/tune/route')
    const req = new NextRequest('http://test/api/track/bad-tune/tune', {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ ...DEFAULT_TRACK_TUNE, scale: 'phrygian' }),
    })
    const res = await PUT(req, { params: Promise.resolve({ slug: 'bad-tune' }) })
    expect(res.status).toBe(400)
  })

  it('requires racerId cookie for saves', async () => {
    const { PUT } = await import('@/app/api/track/[slug]/tune/route')
    const req = new NextRequest('http://test/api/track/no-racer/tune', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(DEFAULT_TRACK_TUNE),
    })
    const res = await PUT(req, { params: Promise.resolve({ slug: 'no-racer' }) })
    expect(res.status).toBe(401)
  })
})
