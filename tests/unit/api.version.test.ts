import { describe, it, expect, afterEach } from 'vitest'

const ORIGINAL = process.env.NEXT_PUBLIC_APP_VERSION

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.NEXT_PUBLIC_APP_VERSION
  } else {
    process.env.NEXT_PUBLIC_APP_VERSION = ORIGINAL
  }
})

describe('GET /api/version', () => {
  it('returns the current NEXT_PUBLIC_APP_VERSION', async () => {
    process.env.NEXT_PUBLIC_APP_VERSION = 'abc1234'
    const { GET } = await import('@/app/api/version/route')
    const res = GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { version: string }
    expect(body.version).toBe('abc1234')
  })

  it('falls back to "dev" when no version is set', async () => {
    delete process.env.NEXT_PUBLIC_APP_VERSION
    const { GET } = await import('@/app/api/version/route')
    const body = (await GET().json()) as { version: string }
    expect(body.version).toBe('dev')
  })

  it('is marked as a dynamic, non-cached route', async () => {
    const mod = await import('@/app/api/version/route')
    expect(mod.dynamic).toBe('force-dynamic')
  })
})
