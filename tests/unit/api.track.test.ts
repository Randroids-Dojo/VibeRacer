import { describe, it, expect, beforeAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { FakeKv } from './_fakeKv'
import type { Piece } from '@/lib/schemas'
import { hashTrack } from '@/lib/hashTrack'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'

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

  it('persists checkpointCount and uses it in the version hash', async () => {
    const { PUT, GET } = await import('@/app/api/track/[slug]/route')
    const slug = 'cp-slug'
    const putReq = new NextRequest(`http://test/api/track/${slug}`, {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ pieces: DEFAULT_TRACK_PIECES, checkpointCount: 4 }),
    })
    const putRes = await PUT(putReq, { params: Promise.resolve({ slug }) })
    expect(putRes.status).toBe(200)
    const putBody = (await putRes.json()) as { versionHash: string }
    expect(putBody.versionHash).toBe(hashTrack(DEFAULT_TRACK_PIECES, 4))
    expect(putBody.versionHash).not.toBe(hashTrack(DEFAULT_TRACK_PIECES))

    const getReq = new NextRequest(`http://test/api/track/${slug}`)
    const getRes = await GET(getReq, { params: Promise.resolve({ slug }) })
    const getBody = (await getRes.json()) as {
      track: { pieces: Piece[]; checkpointCount?: number }
    }
    expect(getBody.track.checkpointCount).toBe(4)
  })

  it('persists custom checkpoints and uses them in the version hash', async () => {
    const { PUT, GET } = await import('@/app/api/track/[slug]/route')
    const slug = 'custom-cp-slug'
    const checkpoints = [
      { row: 0, col: 1 },
      { row: 1, col: 1 },
      { row: 1, col: 0 },
    ]
    const putReq = new NextRequest(`http://test/api/track/${slug}`, {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ pieces: squarePieces, checkpoints }),
    })
    const putRes = await PUT(putReq, { params: Promise.resolve({ slug }) })
    expect(putRes.status).toBe(200)
    const putBody = (await putRes.json()) as { versionHash: string }
    expect(putBody.versionHash).toBe(
      hashTrack(squarePieces, undefined, 'automatic', checkpoints),
    )
    expect(putBody.versionHash).not.toBe(hashTrack(squarePieces))

    const getReq = new NextRequest(`http://test/api/track/${slug}`)
    const getRes = await GET(getReq, { params: Promise.resolve({ slug }) })
    const getBody = (await getRes.json()) as {
      track: { checkpoints?: typeof checkpoints }
    }
    expect(getBody.track.checkpoints).toEqual(checkpoints)
  })

  it('persists manual transmission and includes it in the version hash', async () => {
    const { PUT, GET } = await import('@/app/api/track/[slug]/route')
    const slug = 'manual-slug'
    const putReq = new NextRequest(`http://test/api/track/${slug}`, {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({
        pieces: squarePieces,
        transmission: 'manual',
      }),
    })
    const putRes = await PUT(putReq, { params: Promise.resolve({ slug }) })
    expect(putRes.status).toBe(200)
    const putBody = (await putRes.json()) as { versionHash: string }
    expect(putBody.versionHash).toBe(
      hashTrack(squarePieces, undefined, 'manual'),
    )
    expect(putBody.versionHash).not.toBe(hashTrack(squarePieces))

    const getReq = new NextRequest(`http://test/api/track/${slug}`)
    const getRes = await GET(getReq, { params: Promise.resolve({ slug }) })
    const getBody = (await getRes.json()) as {
      track: { transmission?: string }
    }
    expect(getBody.track.transmission).toBe('manual')
  })

  it('rejects a checkpointCount above the piece count', async () => {
    const { PUT } = await import('@/app/api/track/[slug]/route')
    const req = new NextRequest('http://test/api/track/bad-cp', {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ pieces: squarePieces, checkpointCount: 99 }),
    })
    const res = await PUT(req, { params: Promise.resolve({ slug: 'bad-cp' }) })
    expect(res.status).toBe(400)
  })

  it('returns 503 without leaking the underlying error when storage throws', async () => {
    const { PUT } = await import('@/app/api/track/[slug]/route')
    const setSpy = vi
      .spyOn(fake, 'set')
      .mockRejectedValueOnce(new Error('kv exploded'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const req = new NextRequest('http://test/api/track/my-track', {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ pieces: squarePieces }),
    })
    const res = await PUT(req, { params: Promise.resolve({ slug: 'my-track' }) })
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string; reason: string }
    expect(body.error).toBe('storage unavailable')
    expect(body.reason).not.toContain('kv exploded')
    expect(errSpy).toHaveBeenCalled()
    setSpy.mockRestore()
    errSpy.mockRestore()
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

  it('returns a specific historical version when ?v=<hash> is supplied', async () => {
    const { PUT, GET } = await import('@/app/api/track/[slug]/route')
    const slug = 'versioned-slug'
    const putFirst = new NextRequest(`http://test/api/track/${slug}`, {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ pieces: squarePieces }),
    })
    await PUT(putFirst, { params: Promise.resolve({ slug }) })
    const putSecond = new NextRequest(`http://test/api/track/${slug}`, {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ pieces: DEFAULT_TRACK_PIECES }),
    })
    await PUT(putSecond, { params: Promise.resolve({ slug }) })

    const firstHash = hashTrack(squarePieces)
    const latestHash = hashTrack(DEFAULT_TRACK_PIECES)

    const specificReq = new NextRequest(
      `http://test/api/track/${slug}?v=${firstHash}`,
    )
    const specificRes = await GET(specificReq, {
      params: Promise.resolve({ slug }),
    })
    const specific = (await specificRes.json()) as {
      versionHash: string
      track: { pieces: Piece[] }
      versions: Array<{ hash: string; createdAt: string }>
    }
    expect(specific.versionHash).toBe(firstHash)
    expect(specific.track.pieces.length).toBe(4)
    expect(specific.versions.map((v) => v.hash)).toEqual([
      latestHash,
      firstHash,
    ])

    const latestReq = new NextRequest(`http://test/api/track/${slug}`)
    const latestRes = await GET(latestReq, {
      params: Promise.resolve({ slug }),
    })
    const latest = (await latestRes.json()) as { versionHash: string }
    expect(latest.versionHash).toBe(latestHash)
  })

  it('rejects a malformed ?v= param', async () => {
    const { GET } = await import('@/app/api/track/[slug]/route')
    const req = new NextRequest('http://test/api/track/any-slug?v=not-a-hash')
    const res = await GET(req, {
      params: Promise.resolve({ slug: 'any-slug' }),
    })
    expect(res.status).toBe(400)
  })

  it('round-trips an author mood without changing the version hash', async () => {
    const { PUT, GET } = await import('@/app/api/track/[slug]/route')
    const slug = 'mood-slug'
    const putReq = new NextRequest(`http://test/api/track/${slug}`, {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({
        pieces: squarePieces,
        mood: { timeOfDay: 'sunset', weather: 'foggy' },
      }),
    })
    const putRes = await PUT(putReq, { params: Promise.resolve({ slug }) })
    expect(putRes.status).toBe(200)
    const putBody = (await putRes.json()) as { versionHash: string }
    expect(putBody.versionHash).toBe(hashTrack(squarePieces))

    const getReq = new NextRequest(`http://test/api/track/${slug}`)
    const getRes = await GET(getReq, { params: Promise.resolve({ slug }) })
    const getBody = (await getRes.json()) as {
      track: {
        pieces: Piece[]
        mood?: { timeOfDay?: string; weather?: string }
      }
    }
    expect(getBody.track.mood).toEqual({
      timeOfDay: 'sunset',
      weather: 'foggy',
    })
  })

  it('does not persist an empty mood object', async () => {
    const { PUT } = await import('@/app/api/track/[slug]/route')
    const slug = 'empty-mood-slug'
    const putReq = new NextRequest(`http://test/api/track/${slug}`, {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ pieces: squarePieces, mood: {} }),
    })
    const putRes = await PUT(putReq, { params: Promise.resolve({ slug }) })
    expect(putRes.status).toBe(200)
    const stored = await fake.get<{ mood?: unknown }>(
      `track:${slug}:version:${hashTrack(squarePieces)}`,
    )
    expect(stored).not.toBeNull()
    expect(stored!.mood).toBeUndefined()
  })

  it('round-trips an author biome without changing the version hash', async () => {
    const { PUT, GET } = await import('@/app/api/track/[slug]/route')
    const slug = 'biome-slug'
    const putReq = new NextRequest(`http://test/api/track/${slug}`, {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({
        pieces: squarePieces,
        biome: 'beach',
      }),
    })
    const putRes = await PUT(putReq, { params: Promise.resolve({ slug }) })
    expect(putRes.status).toBe(200)
    const putBody = (await putRes.json()) as { versionHash: string }
    expect(putBody.versionHash).toBe(hashTrack(squarePieces))

    const getReq = new NextRequest(`http://test/api/track/${slug}`)
    const getRes = await GET(getReq, { params: Promise.resolve({ slug }) })
    const getBody = (await getRes.json()) as {
      track: {
        pieces: Piece[]
        biome?: string
      }
    }
    expect(getBody.track.biome).toBe('beach')
  })

  it('round-trips decorations without changing the version hash', async () => {
    const { PUT, GET } = await import('@/app/api/track/[slug]/route')
    const slug = 'decorations-slug'
    const decorations = [
      { kind: 'cactus', row: 3, col: 0 },
      { kind: 'rock', row: -1, col: 2 },
    ]
    const putReq = new NextRequest(`http://test/api/track/${slug}`, {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({
        pieces: squarePieces,
        decorations,
      }),
    })
    const putRes = await PUT(putReq, { params: Promise.resolve({ slug }) })
    expect(putRes.status).toBe(200)
    const putBody = (await putRes.json()) as { versionHash: string }
    expect(putBody.versionHash).toBe(hashTrack(squarePieces))

    const getReq = new NextRequest(`http://test/api/track/${slug}`)
    const getRes = await GET(getReq, { params: Promise.resolve({ slug }) })
    const getBody = (await getRes.json()) as {
      track: {
        decorations?: typeof decorations
      }
    }
    expect(getBody.track.decorations).toEqual(decorations)
  })

  it('rejects decorations on top of track pieces', async () => {
    const { PUT } = await import('@/app/api/track/[slug]/route')
    const req = new NextRequest('http://test/api/track/bad-decoration', {
      method: 'PUT',
      headers: { cookie: cookieHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({
        pieces: squarePieces,
        decorations: [{ kind: 'tree', row: 0, col: 0 }],
      }),
    })
    const res = await PUT(req, {
      params: Promise.resolve({ slug: 'bad-decoration' }),
    })
    expect(res.status).toBe(400)
  })
})
