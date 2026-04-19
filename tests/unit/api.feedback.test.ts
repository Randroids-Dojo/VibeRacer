import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const originalFetch = global.fetch

beforeEach(() => {
  global.fetch = originalFetch
  process.env.GITHUB_PAT = 'fake-pat-for-tests'
})

describe('POST /api/feedback', () => {
  it('returns 500 when GITHUB_PAT is missing', async () => {
    delete process.env.GITHUB_PAT
    const { POST } = await import('@/app/api/feedback/route')
    const req = new NextRequest('http://test/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 't', body: 'b' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })

  it('rejects missing title or body', async () => {
    const { POST } = await import('@/app/api/feedback/route')
    const req = new NextRequest('http://test/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 't' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('posts to the Randroids-Dojo/VibeRacer repo on valid input', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/issues')) {
        return new Response(JSON.stringify({ number: 42 }), { status: 201 })
      }
      return new Response(JSON.stringify({}), { status: 200 })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const { POST } = await import('@/app/api/feedback/route')
    const req = new NextRequest('http://test/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Bug',
        body: 'Stuff happened',
        context: { urlPath: '/my-slug', userAgent: 'test-ua' },
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const calls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(calls.some((u) => u.includes('Randroids-Dojo/VibeRacer'))).toBe(true)
    const out = (await res.json()) as { number: number }
    expect(out.number).toBe(42)
  })
})
