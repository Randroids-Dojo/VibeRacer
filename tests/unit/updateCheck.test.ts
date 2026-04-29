import { describe, it, expect, vi } from 'vitest'
import {
  INITIAL_DELAY_MS,
  POLL_INTERVAL_MS,
  fetchVersion,
  isStaleVersion,
  shouldPoll,
} from '@/lib/updateCheck'

describe('shouldPoll', () => {
  it('returns false when version is undefined', () => {
    expect(shouldPoll(undefined)).toBe(false)
  })

  it('returns false when version is null', () => {
    expect(shouldPoll(null)).toBe(false)
  })

  it('returns false when version is empty', () => {
    expect(shouldPoll('')).toBe(false)
  })

  it('returns false when version is the literal "dev"', () => {
    expect(shouldPoll('dev')).toBe(false)
  })

  it('returns true for any non-dev sha', () => {
    expect(shouldPoll('abc1234')).toBe(true)
  })
})

describe('isStaleVersion', () => {
  it('returns false when versions match', () => {
    expect(isStaleVersion('abc1234', 'abc1234')).toBe(false)
  })

  it('returns true when versions differ', () => {
    expect(isStaleVersion('abc1234', 'def5678')).toBe(true)
  })

  it('returns false when current is missing', () => {
    expect(isStaleVersion(undefined, 'def5678')).toBe(false)
    expect(isStaleVersion(null, 'def5678')).toBe(false)
    expect(isStaleVersion('', 'def5678')).toBe(false)
  })

  it('returns false when remote is missing (treat as transient)', () => {
    expect(isStaleVersion('abc1234', null)).toBe(false)
  })
})

describe('fetchVersion', () => {
  it('returns the parsed version when the response is ok', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ version: 'abc1234' }), { status: 200 }),
    ) as unknown as typeof fetch

    const v = await fetchVersion(fetchImpl)
    expect(v).toBe('abc1234')
  })

  it('requests /api/version with no-store cache hint', async () => {
    const calls: Array<[string, RequestInit | undefined]> = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init])
      return new Response(JSON.stringify({ version: 'abc1234' }), {
        status: 200,
      })
    }) as unknown as typeof fetch

    await fetchVersion(fetchImpl)
    expect(calls[0][0]).toBe('/api/version')
    expect(calls[0][1]?.cache).toBe('no-store')
  })

  it('returns null when the server returns a non-ok status', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('boom', { status: 500 }),
    ) as unknown as typeof fetch

    expect(await fetchVersion(fetchImpl)).toBeNull()
  })

  it('returns null when the response body has no version string', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ version: 42 }), { status: 200 }),
    ) as unknown as typeof fetch

    expect(await fetchVersion(fetchImpl)).toBeNull()
  })

  it('swallows network errors and returns null', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch

    expect(await fetchVersion(fetchImpl)).toBeNull()
  })

  it('swallows JSON parse errors and returns null', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('not-json', { status: 200 }),
    ) as unknown as typeof fetch

    expect(await fetchVersion(fetchImpl)).toBeNull()
  })
})

describe('timing constants', () => {
  it('waits 30s before the first poll', () => {
    expect(INITIAL_DELAY_MS).toBe(30_000)
  })

  it('polls every 60s thereafter', () => {
    expect(POLL_INTERVAL_MS).toBe(60_000)
  })
})
