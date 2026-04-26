import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { FakeKv } from './_fakeKv'
import { signRaceToken } from '@/lib/signToken'
import type { RaceTokenPayload } from '@/lib/schemas'

const fake = new FakeKv()
const racerId = '00000000-0000-4000-8000-000000000000'

beforeAll(() => {
  process.env.RACE_SIGNING_SECRET = 'test-secret-for-vitest-only'
  process.env.KV_REST_API_URL = 'http://fake'
  process.env.KV_REST_API_TOKEN = 'fake'
})

beforeEach(async () => {
  // Clear fake state between tests to avoid rate-limit + leaderboard carryover.
  await fake.del(
    `ratelimit:submit:ip:1.2.3.4`,
    `ratelimit:submit:racer:${racerId}`,
    `ratelimit:submit:daily:1.2.3.4`,
    `lb:track:${'a'.repeat(64)}`,
    `track:track:${'a'.repeat(64)}:topReplay`,
  )
})

vi.mock('@/lib/kv', async () => {
  const actual = await vi.importActual<typeof import('@/lib/kv')>('@/lib/kv')
  return { ...actual, getKv: () => fake }
})

function issueToken(overrides: Partial<RaceTokenPayload> = {}): {
  token: string
  payload: RaceTokenPayload
} {
  const payload: RaceTokenPayload = {
    slug: 'track',
    versionHash: 'a'.repeat(64),
    nonce: overrides.nonce ?? 'deadbeef'.repeat(4),
    issuedAt: overrides.issuedAt ?? Date.now(),
    racerId: overrides.racerId ?? racerId,
  }
  Object.assign(payload, overrides)
  return { token: signRaceToken(payload), payload }
}

async function seedNonce(nonce: string) {
  await fake.set(
    `race:token:${nonce}`,
    JSON.stringify({
      slug: 'track',
      versionHash: 'a'.repeat(64),
      racerId,
      issuedAt: Date.now(),
    }),
    { ex: 900 },
  )
}

function buildReq(body: unknown) {
  return new NextRequest(
    `http://test/api/race/submit?slug=track&v=${'a'.repeat(64)}`,
    {
      method: 'POST',
      headers: {
        cookie: `viberacer.racerId=${racerId}`,
        'content-type': 'application/json',
        'x-forwarded-for': '1.2.3.4',
      },
      body: JSON.stringify(body),
    },
  )
}

describe('POST /api/race/submit', () => {
  it('accepts a clean lap and returns a rotated token', async () => {
    const { token, payload } = issueToken({ nonce: 'aa'.repeat(16) })
    await seedNonce(payload.nonce)
    const { POST } = await import('@/app/api/race/submit/route')
    const res = await POST(
      buildReq({
        token,
        checkpoints: [
          { cpId: 0, tMs: 1000 },
          { cpId: 1, tMs: 2000 },
        ],
        lapTimeMs: 2000,
        initials: 'abc',
      }),
    )
    expect(res.status).toBe(200)
    const out = (await res.json()) as {
      ok: boolean
      nextToken: string
      nextNonce: string
      submittedNonce: string
    }
    expect(out.ok).toBe(true)
    expect(out.nextNonce).toMatch(/^[a-f0-9]{32}$/)
    expect(out.nextToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    // The just-submitted nonce should match the one we issued so the client
    // can build a friend-challenge URL pinned to this lap's recorded ghost.
    expect(out.submittedNonce).toBe(payload.nonce)

    const score = await fake.zscore(
      `lb:track:${'a'.repeat(64)}`,
      (await fake.zrange(`lb:track:${'a'.repeat(64)}`, 0, -1))[0],
    )
    expect(score).toBe(2000)

    // Original nonce should be consumed.
    const oldNonce = await fake.get(`race:token:${payload.nonce}`)
    expect(oldNonce).toBeNull()
  })

  it('silently drops on nonce reuse (replay)', async () => {
    const { token, payload } = issueToken({ nonce: 'bb'.repeat(16) })
    await seedNonce(payload.nonce)
    const { POST } = await import('@/app/api/race/submit/route')
    const ok = await POST(
      buildReq({
        token,
        checkpoints: [
          { cpId: 0, tMs: 1000 },
          { cpId: 1, tMs: 2000 },
        ],
        lapTimeMs: 2000,
        initials: 'abc',
      }),
    )
    expect(ok.status).toBe(200)

    // Replay
    const replay = await POST(
      buildReq({
        token,
        checkpoints: [
          { cpId: 0, tMs: 1000 },
          { cpId: 1, tMs: 2000 },
        ],
        lapTimeMs: 2000,
        initials: 'abc',
      }),
    )
    expect(replay.status).toBe(202)
    const body = (await replay.json()) as { ok: boolean }
    expect(body.ok).toBe(false)
  })

  it('silently drops on segment_too_fast', async () => {
    const { token, payload } = issueToken({ nonce: 'cc'.repeat(16) })
    await seedNonce(payload.nonce)
    const { POST } = await import('@/app/api/race/submit/route')
    const res = await POST(
      buildReq({
        token,
        checkpoints: [
          { cpId: 0, tMs: 10 },
          { cpId: 1, tMs: 20 },
        ],
        lapTimeMs: 20,
        initials: 'abc',
      }),
    )
    expect(res.status).toBe(202)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(false)
  })

  it('persists tuning and inputMode in lap meta when provided', async () => {
    const { DEFAULT_CAR_PARAMS } = await import('@/game/physics')
    const { token, payload } = issueToken({ nonce: 'dd'.repeat(16) })
    await seedNonce(payload.nonce)
    const tuned = { ...DEFAULT_CAR_PARAMS, accel: 24 }
    const { POST } = await import('@/app/api/race/submit/route')
    const res = await POST(
      buildReq({
        token,
        checkpoints: [
          { cpId: 0, tMs: 1000 },
          { cpId: 1, tMs: 2000 },
        ],
        lapTimeMs: 2000,
        initials: 'abc',
        tuning: tuned,
        inputMode: 'touch',
      }),
    )
    expect(res.status).toBe(200)
    const meta = (await fake.get(`lap:meta:${payload.nonce}`)) as {
      tuning: Record<string, number>
      inputMode: string
    }
    expect(meta.tuning).toEqual(tuned)
    expect(meta.inputMode).toBe('touch')
  })

  it('rejects out-of-range tuning by silently dropping', async () => {
    const { token, payload } = issueToken({ nonce: 'ee'.repeat(16) })
    await seedNonce(payload.nonce)
    const { POST } = await import('@/app/api/race/submit/route')
    const res = await POST(
      buildReq({
        token,
        checkpoints: [
          { cpId: 0, tMs: 1000 },
          { cpId: 1, tMs: 2000 },
        ],
        lapTimeMs: 2000,
        initials: 'abc',
        tuning: { maxSpeed: 9999 },
        inputMode: 'keyboard',
      }),
    )
    expect(res.status).toBe(202)
  })

  it('stores the replay and points topReplay at the rank-1 lap', async () => {
    const { token, payload } = issueToken({ nonce: 'ff'.repeat(16) })
    await seedNonce(payload.nonce)
    const samples: Array<[number, number, number]> = [
      [0, 0, 0],
      [1.5, 0.5, 0.1],
      [3.0, 1.0, 0.2],
    ]
    const { POST } = await import('@/app/api/race/submit/route')
    const res = await POST(
      buildReq({
        token,
        checkpoints: [
          { cpId: 0, tMs: 1000 },
          { cpId: 1, tMs: 2000 },
        ],
        lapTimeMs: 2000,
        initials: 'abc',
        replay: { lapTimeMs: 2000, samples },
      }),
    )
    expect(res.status).toBe(200)
    const stored = (await fake.get(`lap:replay:${payload.nonce}`)) as {
      lapTimeMs: number
      samples: Array<[number, number, number]>
    }
    expect(stored.lapTimeMs).toBe(2000)
    expect(stored.samples).toEqual(samples)
    const pointer = await fake.get<string>(
      `track:track:${'a'.repeat(64)}:topReplay`,
    )
    expect(pointer).toBe(payload.nonce)
  })

  it('promotes the first replay even when not rank-1, then keeps it until beaten', async () => {
    // Seed a faster legacy entry that has no replay (predates the feature).
    await fake.zadd(`lb:track:${'a'.repeat(64)}`, {
      score: 1000,
      member: `xyz:${racerId}:0:legacynonce`,
    })

    const slower = issueToken({ nonce: 'a1'.repeat(16) })
    await seedNonce(slower.payload.nonce)
    const { POST } = await import('@/app/api/race/submit/route')
    const slowerRes = await POST(
      buildReq({
        token: slower.token,
        checkpoints: [
          { cpId: 0, tMs: 1500 },
          { cpId: 1, tMs: 3000 },
        ],
        lapTimeMs: 3000,
        initials: 'abc',
        replay: { lapTimeMs: 3000, samples: [[0, 0, 0]] },
      }),
    )
    expect(slowerRes.status).toBe(200)
    // The legacy #1 has no replay, so the promotion fallback elevates the
    // first submission with one even though it is rank 2.
    let pointer = await fake.get<string>(
      `track:track:${'a'.repeat(64)}:topReplay`,
    )
    expect(pointer).toBe(slower.payload.nonce)

    // A still-slower follow-up should NOT replace the pointer.
    const slowest = issueToken({ nonce: 'a2'.repeat(16) })
    await seedNonce(slowest.payload.nonce)
    await POST(
      buildReq({
        token: slowest.token,
        checkpoints: [
          { cpId: 0, tMs: 2000 },
          { cpId: 1, tMs: 4000 },
        ],
        lapTimeMs: 4000,
        initials: 'abc',
        replay: { lapTimeMs: 4000, samples: [[0, 0, 0]] },
      }),
    )
    pointer = await fake.get<string>(
      `track:track:${'a'.repeat(64)}:topReplay`,
    )
    expect(pointer).toBe(slower.payload.nonce)
  })

  it('silently drops with no racerId cookie', async () => {
    const { POST } = await import('@/app/api/race/submit/route')
    const req = new NextRequest(
      `http://test/api/race/submit?slug=track&v=${'a'.repeat(64)}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '1.2.3.4',
        },
        body: JSON.stringify({}),
      },
    )
    const res = await POST(req)
    expect(res.status).toBe(202)
  })
})
