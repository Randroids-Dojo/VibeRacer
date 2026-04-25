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
  // Clear fake state between tests to avoid rate-limit carryover.
  await fake.del(
    `ratelimit:submit:ip:1.2.3.4`,
    `ratelimit:submit:racer:${racerId}`,
    `ratelimit:submit:daily:1.2.3.4`,
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
    }
    expect(out.ok).toBe(true)
    expect(out.nextNonce).toMatch(/^[a-f0-9]{32}$/)
    expect(out.nextToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)

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
