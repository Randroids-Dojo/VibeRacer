import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { FakeKv } from './_fakeKv'
import { DERBY_VEHICLES } from '@/lib/derbyVehicles'
import { DERBY_ARENAS } from '@/lib/derbyArenas'

const fake = new FakeKv()

// Pick a roundTimeMs that comfortably clears both the vehicle's anti-cheat
// floor and the arena's duration ceiling. Derived from the catalog so a
// retune of theoreticalMinWinMs (or roundDurationMs) does not re-break
// the valid-win assertions here.
const VALID_ROUND_MS = Math.round(
  (DERBY_VEHICLES.car.theoreticalMinWinMs +
    DERBY_ARENAS['dust-bowl'].roundDurationMs) /
    2,
)

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

const RACER = '00000000-0000-4000-8000-000000000000'
const COOKIE = `viberacer.racerId=${RACER}`

beforeEach(async () => {
  // Wipe KV so tests do not bleed into each other.
  await fake.del(
    'derby:token:nonce',
    'lb:derby:dust-bowl',
    'ratelimit:submit:ip:0.0.0.0',
    `ratelimit:submit:racer:${RACER}`,
    'ratelimit:submit:daily:0.0.0.0',
  )
})

async function mintTokenViaStart(): Promise<{
  token: string
  nonce: string
  configHash: string
}> {
  const { POST } = await import('@/app/api/derby/start/route')
  const res = await POST(
    new NextRequest(
      'http://test/api/derby/start?arena=dust-bowl&vehicle=car',
      { method: 'POST', headers: { cookie: COOKIE } },
    ),
  )
  expect(res.status).toBe(200)
  return (await res.json()) as { token: string; nonce: string; configHash: string }
}

function buildSubmitReq(body: unknown, cookie: string = COOKIE) {
  return new NextRequest('http://test/api/derby/submit', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/derby/submit', () => {
  it('silent-drops a malformed body', async () => {
    const { POST } = await import('@/app/api/derby/submit/route')
    const res = await POST(buildSubmitReq({ not: 'a submission' }))
    expect(res.status).toBe(202)
  })

  it('silent-drops without a racer cookie', async () => {
    const { POST } = await import('@/app/api/derby/submit/route')
    const res = await POST(
      buildSubmitReq(
        {
          token: 'whatever',
          outcome: 'win',
          roundTimeMs: 90_000,
          finalHealths: [10, 0, 0, 0],
          kills: 3,
          scorePoints: 1900,
          initials: 'RNG',
          vehicle: 'car',
        },
        '',
      ),
    )
    expect(res.status).toBe(202)
  })

  it('silent-drops a forged token', async () => {
    const { POST } = await import('@/app/api/derby/submit/route')
    const res = await POST(
      buildSubmitReq({
        token: 'aaaa.bbbb',
        outcome: 'win',
        roundTimeMs: 90_000,
        finalHealths: [10, 0, 0, 0],
        kills: 3,
        scorePoints: 1900,
        initials: 'RNG',
        vehicle: 'car',
      }),
    )
    expect(res.status).toBe(202)
  })

  it('silent-drops a win that beats the theoretical-min floor', async () => {
    const { POST } = await import('@/app/api/derby/submit/route')
    const t = await mintTokenViaStart()
    const res = await POST(
      buildSubmitReq({
        token: t.token,
        outcome: 'win',
        roundTimeMs: 100,
        finalHealths: [10, 0, 0, 0],
        kills: 3,
        scorePoints: 1900,
        initials: 'RNG',
        vehicle: 'car',
      }),
    )
    expect(res.status).toBe(202)
  })

  it('returns submitted=false on a non-win outcome', async () => {
    const { POST } = await import('@/app/api/derby/submit/route')
    const t = await mintTokenViaStart()
    const res = await POST(
      buildSubmitReq({
        token: t.token,
        outcome: 'loss',
        roundTimeMs: VALID_ROUND_MS,
        finalHealths: [0, 100, 100, 100],
        kills: 0,
        scorePoints: 0,
        initials: 'RNG',
        vehicle: 'car',
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; submitted: boolean }
    expect(body.ok).toBe(true)
    expect(body.submitted).toBe(false)
    // Non-win must not write the leaderboard.
    expect(await fake.zcard('lb:derby:dust-bowl')).toBe(0)
  })

  it('writes a leaderboard entry on a valid win', async () => {
    const { POST } = await import('@/app/api/derby/submit/route')
    const t = await mintTokenViaStart()
    const res = await POST(
      buildSubmitReq({
        token: t.token,
        outcome: 'win',
        roundTimeMs: VALID_ROUND_MS,
        finalHealths: [10, 0, 0, 0],
        kills: 3,
        scorePoints: 1900,
        initials: 'RNG',
        vehicle: 'car',
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; submitted: boolean }
    expect(body.submitted).toBe(true)
    const card = await fake.zcard('lb:derby:dust-bowl')
    expect(card).toBe(1)
  })

  it('rejects a replay of the same token', async () => {
    const { POST } = await import('@/app/api/derby/submit/route')
    const t = await mintTokenViaStart()
    const payload = {
      token: t.token,
      outcome: 'win' as const,
      roundTimeMs: VALID_ROUND_MS,
      finalHealths: [10, 0, 0, 0],
      kills: 3,
      scorePoints: 1900,
      initials: 'RNG',
      vehicle: 'car' as const,
    }
    const first = await POST(buildSubmitReq(payload))
    expect(first.status).toBe(200)
    const second = await POST(buildSubmitReq(payload))
    expect(second.status).toBe(202)
  })
})
