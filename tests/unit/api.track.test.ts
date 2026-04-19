import { describe, it, expect, beforeAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { FakeKv } from './_fakeKv'
import type { Piece } from '@/lib/schemas'
import { hashTrack } from '@/lib/hashTrack'

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

const squarePieces: Piece[] = [
  { type: 'right90', row: 0, col: 0, rotation: 0 },
  { type: 'right90', row: 0, col: 1, rotation: 90 },
  { type: 'right90', row: 1, col: 1, rotation: 180 },
  { type: 'right90', row: 1, col: 0, rotation: 270 },
]

function cookieHeader() {
  return `viberacer.racerId=${racerId}`
}

describe('PUT /api/track/[slug]', () => {
  it('rejects invalid loops', async () => {
    const { PUT } = await import('@/app/api/track/[slug]/route')
    const req = new NextRequest('http://test/api/track/my-track', {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({
        pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      }),
    })
    const res = await PUT(req, { params: Promise.resolve({ slug: 'my-track' }) })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('invalid loop')
  })

  it('saves a valid loop and returns the canonical hash', async () => {
    const { PUT } = await import('@/app/api/track/[slug]/route')
    const req = new NextRequest('http://test/api/track/my-track', {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ pieces: squarePieces }),
    })
    const res = await PUT(req, { params: Promise.resolve({ slug: 'my-track' }) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { versionHash: string }
    expect(body.versionHash).toBe(hashTrack(squarePieces))
    expect(await fake.get<string>('track:my-track:latest')).toBe(
      body.versionHash,
    )
  })

  it('requires racerId cookie', async () => {
    const { PUT } = await import('@/app/api/track/[slug]/route')
    const req = new NextRequest('http://test/api/track/my-track', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pieces: squarePieces }),
    })
    const res = await PUT(req, { params: Promise.resolve({ slug: 'my-track' }) })
    expect(res.status).toBe(401)
  })

  it('returns 503 when storage throws', async () => {
    const { PUT } = await import('@/app/api/track/[slug]/route')
    const setSpy = vi
      .spyOn(fake, 'set')
      .mockRejectedValueOnce(new Error('kv exploded'))
    const req = new NextRequest('http://test/api/track/my-track', {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ pieces: squarePieces }),
    })
    const res = await PUT(req, { params: Promise.resolve({ slug: 'my-track' }) })
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string; reason: string }
    expect(body.error).toBe('storage unavailable')
    expect(body.reason).toContain('kv exploded')
    setSpy.mockRestore()
  })
})

describe('GET /api/track/[slug]', () => {
  it('returns null track when slug unknown', async () => {
    const { GET } = await import('@/app/api/track/[slug]/route')
    const req = new NextRequest('http://test/api/track/unknown-slug')
    const res = await GET(req, {
      params: Promise.resolve({ slug: 'unknown-slug' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { track: unknown }
    expect(body.track).toBeNull()
  })

  it('returns the latest saved version for a known slug', async () => {
    const { PUT, GET } = await import('@/app/api/track/[slug]/route')
    const putReq = new NextRequest('http://test/api/track/loaded-slug', {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ pieces: squarePieces }),
    })
    await PUT(putReq, { params: Promise.resolve({ slug: 'loaded-slug' }) })

    const req = new NextRequest('http://test/api/track/loaded-slug')
    const res = await GET(req, {
      params: Promise.resolve({ slug: 'loaded-slug' }),
    })
    const body = (await res.json()) as {
      versionHash: string
      track: { pieces: Piece[] }
    }
    expect(body.versionHash).toBe(hashTrack(squarePieces))
    expect(body.track.pieces.length).toBe(4)
  })
})
