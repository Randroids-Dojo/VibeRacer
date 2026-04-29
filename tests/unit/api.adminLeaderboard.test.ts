import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { FakeKv } from './_fakeKv'

const fake = new FakeKv()
const slug = 'track'
const hash = 'a'.repeat(64)
const token = 'leaderboard-admin-test-token'
const racerId = '00000000-0000-4000-8000-000000000000'
const member = `AAA:${racerId}:1777446000000:${'b'.repeat(32)}`
const lbKey = `lb:${slug}:${hash}`

beforeAll(() => {
  process.env.KV_REST_API_URL = 'http://fake'
  process.env.KV_REST_API_TOKEN = 'fake'
})

beforeEach(async () => {
  process.env.LEADERBOARD_ADMIN_TOKEN = token
  await fake.del(
    lbKey,
    `lap:meta:${'b'.repeat(32)}`,
    `lap:replay:${'b'.repeat(32)}`,
    `track:${slug}:${hash}:topReplay`,
    'leaderboard:admin:audit',
  )
})

vi.mock('@/lib/kv', async () => {
  const actual = await vi.importActual<typeof import('@/lib/kv')>('@/lib/kv')
  return { ...actual, getKv: () => fake }
})

function req(body: unknown, auth = token) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (auth) headers.authorization = `Bearer ${auth}`
  return new NextRequest('http://test/api/admin/leaderboard', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin/leaderboard', () => {
  it('stays unavailable until an admin token is configured', async () => {
    delete process.env.LEADERBOARD_ADMIN_TOKEN
    const { POST } = await import('@/app/api/admin/leaderboard/route')
    const res = await POST(req({}))
    expect(res.status).toBe(503)
  })

  it('rejects requests without the bearer token', async () => {
    const { POST } = await import('@/app/api/admin/leaderboard/route')
    const res = await POST(req({}, 'wrong-token'))
    expect(res.status).toBe(401)
  })

  it('previews the exact leaderboard member and related keys without deleting', async () => {
    await fake.zadd(lbKey, { score: 50123, member })
    const { POST } = await import('@/app/api/admin/leaderboard/route')
    const res = await POST(
      req({
        action: 'preview',
        slug,
        versionHash: hash,
        member,
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      action: string
      member: { initials: string; nonce: string }
      requiredConfirm: string
    }
    expect(body.action).toBe('preview')
    expect(body.member.initials).toBe('AAA')
    expect(body.member.nonce).toBe('b'.repeat(32))
    expect(body.requiredConfirm).toBe('revoke leaderboard member')
    expect(await fake.zscore(lbKey, member)).toBe(50123)
  })

  it('requires explicit confirm text and reason before revoking', async () => {
    await fake.zadd(lbKey, { score: 50123, member })
    const { POST } = await import('@/app/api/admin/leaderboard/route')
    const res = await POST(
      req({
        action: 'revoke',
        slug,
        versionHash: hash,
        member,
      }),
    )
    expect(res.status).toBe(400)
    expect(await fake.zscore(lbKey, member)).toBe(50123)
  })

  it('revokes a member, cleans lap metadata, and writes an audit entry', async () => {
    await fake.zadd(lbKey, { score: 50123, member })
    await fake.set(`lap:meta:${'b'.repeat(32)}`, { tuning: null })
    await fake.set(`lap:replay:${'b'.repeat(32)}`, { lapTimeMs: 50123 })
    await fake.set(`track:${slug}:${hash}:topReplay`, 'b'.repeat(32))

    const { POST } = await import('@/app/api/admin/leaderboard/route')
    const res = await POST(
      req({
        action: 'revoke',
        slug,
        versionHash: hash,
        member,
        reason: 'moderation test',
        confirm: 'revoke leaderboard member',
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      removed: number
      deletedKeys: number
      clearedTopReplay: boolean
    }
    expect(body.removed).toBe(1)
    expect(body.deletedKeys).toBe(3)
    expect(body.clearedTopReplay).toBe(true)
    expect(await fake.zscore(lbKey, member)).toBeNull()
    expect(await fake.get(`lap:meta:${'b'.repeat(32)}`)).toBeNull()
    expect(await fake.get(`lap:replay:${'b'.repeat(32)}`)).toBeNull()
    expect(await fake.get(`track:${slug}:${hash}:topReplay`)).toBeNull()
    const audit = await fake.lrange('leaderboard:admin:audit', 0, -1)
    expect(audit).toHaveLength(1)
    expect(audit[0]).toContain('moderation test')
  })
})
