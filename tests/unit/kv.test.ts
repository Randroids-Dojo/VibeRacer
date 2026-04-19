import { describe, it, expect } from 'vitest'
import { kvKeys, TTL } from '@/lib/kv'

describe('kvKeys', () => {
  it('produces the GDD Section 14 key shapes', () => {
    const slug = 'my-track'
    const hash = 'a'.repeat(64)
    const racerId = '00000000-0000-4000-8000-000000000000'
    expect(kvKeys.trackLatest(slug)).toBe('track:my-track:latest')
    expect(kvKeys.trackVersion(slug, hash)).toBe(
      `track:my-track:version:${hash}`,
    )
    expect(kvKeys.trackVersions(slug)).toBe('track:my-track:versions')
    expect(kvKeys.trackIndex()).toBe('track:index')
    expect(kvKeys.leaderboard(slug, hash)).toBe(`lb:my-track:${hash}`)
    expect(kvKeys.raceToken('abc')).toBe('race:token:abc')
    expect(kvKeys.racerFirstSeen(racerId)).toBe(`racer:${racerId}:firstSeen`)
    expect(kvKeys.racerLastSubmit(racerId)).toBe(`racer:${racerId}:lastSubmit`)
    expect(kvKeys.ratelimitIp('1.2.3.4')).toBe('ratelimit:submit:ip:1.2.3.4')
    expect(kvKeys.ratelimitRacer(racerId)).toBe(
      `ratelimit:submit:racer:${racerId}`,
    )
    expect(kvKeys.ratelimitDaily('1.2.3.4')).toBe(
      'ratelimit:submit:daily:1.2.3.4',
    )
  })
})

describe('TTL', () => {
  it('matches GDD values', () => {
    expect(TTL.raceTokenSec).toBe(900)
    expect(TTL.ratelimitBurstSec).toBe(60)
    expect(TTL.ratelimitDailySec).toBe(86400)
  })
})
