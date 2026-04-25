import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { FakeKv } from './_fakeKv'

const fake = new FakeKv()
const slug = 'track'
const hash = 'a'.repeat(64)
const lbKey = `lb:${slug}:${hash}`

const racerA = '00000000-0000-4000-8000-000000000000'
const racerB = '11111111-1111-4111-8111-111111111111'
const racerMe = '22222222-2222-4222-8222-222222222222'

beforeAll(() => {
  process.env.KV_REST_API_URL = 'http://fake'
  process.env.KV_REST_API_TOKEN = 'fake'
})

beforeEach(async () => {
  await fake.del(lbKey)
})

vi.mock('@/lib/kv', async () => {
  const actual = await vi.importActual<typeof import('@/lib/kv')>('@/lib/kv')
  return { ...actual, getKv: () => fake }
})

function url(params: Record<string, string>): string {
  const p = new URLSearchParams(params)
  return `http://test/api/leaderboard?${p.toString()}`
}

function req(params: Record<string, string>, racerId?: string) {
  const headers: Record<string, string> = {}
  if (racerId) headers.cookie = `viberacer.racerId=${racerId}`
  return new NextRequest(url(params), { headers })
}

async function seedLap(
  initials: string,
  racerId: string,
  lapTimeMs: number,
  ts: number,
  nonce: string,
) {
  await fake.zadd(lbKey, {
    score: lapTimeMs,
    member: `${initials}:${racerId}:${ts}:${nonce}`,
  })
}

describe('GET /api/leaderboard', () => {
  it('returns 400 when slug or v is invalid', async () => {
    const { GET } = await import('@/app/api/leaderboard/route')
    const res = await GET(req({ slug: 'BAD!!', v: hash }))
    expect(res.status).toBe(400)
  })

  it('returns sorted entries with rank and lapTimeMs', async () => {
    await seedLap('AAA', racerA, 3000, 1_700_000_000_000, 'n1')
    await seedLap('BBB', racerB, 2000, 1_700_000_000_100, 'n2')
    await seedLap('CCC', racerA, 4000, 1_700_000_000_200, 'n3')

    const { GET } = await import('@/app/api/leaderboard/route')
    const res = await GET(req({ slug, v: hash }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      entries: Array<{
        rank: number
        initials: string
        lapTimeMs: number
        ts: number
        isMe: boolean
      }>
      meBestRank: number | null
    }

    expect(body.entries.map((e) => e.lapTimeMs)).toEqual([2000, 3000, 4000])
    expect(body.entries.map((e) => e.rank)).toEqual([1, 2, 3])
    expect(body.entries.map((e) => e.initials)).toEqual(['BBB', 'AAA', 'CCC'])
    expect(body.entries.every((e) => e.isMe === false)).toBe(true)
    expect(body.meBestRank).toBeNull()
  })

  it('marks my entries via the racerId cookie and reports my best rank', async () => {
    await seedLap('AAA', racerA, 1500, 1_700_000_000_000, 'n1')
    await seedLap('MEE', racerMe, 3500, 1_700_000_000_100, 'n2')
    await seedLap('MEE', racerMe, 2500, 1_700_000_000_200, 'n3')

    const { GET } = await import('@/app/api/leaderboard/route')
    const res = await GET(req({ slug, v: hash }, racerMe))
    const body = (await res.json()) as {
      entries: Array<{ rank: number; isMe: boolean; lapTimeMs: number }>
      meBestRank: number | null
    }

    const mine = body.entries.filter((e) => e.isMe)
    expect(mine.length).toBe(2)
    expect(body.meBestRank).toBe(2)
  })

  it('caps limit to MAX_LIMIT and honors the limit param', async () => {
    for (let i = 0; i < 30; i++) {
      await seedLap('XXX', racerA, 1000 + i, 1_700_000_000_000 + i, `n${i}`)
    }
    const { GET } = await import('@/app/api/leaderboard/route')
    const res = await GET(req({ slug, v: hash, limit: '5' }))
    const body = (await res.json()) as { entries: unknown[] }
    expect(body.entries.length).toBe(5)
  })

  it('returns empty entries when the board is empty', async () => {
    const { GET } = await import('@/app/api/leaderboard/route')
    const res = await GET(req({ slug, v: hash }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entries: unknown[]; meBestRank: null }
    expect(body.entries).toEqual([])
    expect(body.meBestRank).toBeNull()
  })

  it('attaches tuning + inputMode from lap meta and tolerates absence', async () => {
    const { DEFAULT_CAR_PARAMS } = await import('@/game/physics')
    const tuned = { ...DEFAULT_CAR_PARAMS, accel: 24, maxSpeed: 30 }
    await seedLap('AAA', racerA, 1500, 1_700_000_000_000, 'nWith')
    await fake.set(
      `lap:meta:nWith`,
      JSON.stringify({ tuning: tuned, inputMode: 'touch' }),
    )
    await seedLap('BBB', racerB, 2500, 1_700_000_000_100, 'nNone')

    const { GET } = await import('@/app/api/leaderboard/route')
    const res = await GET(req({ slug, v: hash }))
    const body = (await res.json()) as {
      entries: Array<{
        initials: string
        tuning: Record<string, number> | null
        inputMode: string | null
      }>
    }
    const a = body.entries.find((e) => e.initials === 'AAA')
    const b = body.entries.find((e) => e.initials === 'BBB')
    expect(a?.tuning).toEqual(tuned)
    expect(a?.inputMode).toBe('touch')
    expect(b?.tuning).toBeNull()
    expect(b?.inputMode).toBeNull()
  })

  it('legacy lap meta with the pre-split steerRate field is dropped to null', async () => {
    const { DEFAULT_CAR_PARAMS } = await import('@/game/physics')
    const legacy = {
      ...DEFAULT_CAR_PARAMS,
    } as Record<string, unknown>
    delete legacy.steerRateLow
    delete legacy.steerRateHigh
    legacy.steerRate = 2.2
    await seedLap('LEG', racerA, 1500, 1_700_000_000_000, 'nLeg')
    await fake.set(
      `lap:meta:nLeg`,
      JSON.stringify({ tuning: legacy, inputMode: 'keyboard' }),
    )

    const { GET } = await import('@/app/api/leaderboard/route')
    const res = await GET(req({ slug, v: hash }))
    const body = (await res.json()) as {
      entries: Array<{ tuning: unknown; inputMode: string | null }>
    }
    expect(body.entries[0].tuning).toBeNull()
    expect(body.entries[0].inputMode).toBe('keyboard')
  })

  it('out-of-range stored tuning is dropped to null rather than served', async () => {
    await seedLap('AAA', racerA, 1500, 1_700_000_000_000, 'nBad')
    await fake.set(
      `lap:meta:nBad`,
      JSON.stringify({ tuning: { maxSpeed: 9999 }, inputMode: 'keyboard' }),
    )

    const { GET } = await import('@/app/api/leaderboard/route')
    const res = await GET(req({ slug, v: hash }))
    const body = (await res.json()) as {
      entries: Array<{ tuning: unknown; inputMode: string | null }>
    }
    expect(body.entries[0].tuning).toBeNull()
    expect(body.entries[0].inputMode).toBe('keyboard')
  })
})
