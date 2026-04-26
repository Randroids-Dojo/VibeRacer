import { describe, expect, it } from 'vitest'
import {
  buildChallengeSharePayload,
  buildChallengeText,
  buildChallengeUrl,
  isValidChallengeNonce,
  parseChallengeFromSearchParams,
} from '@/lib/challenge'

const NONCE = 'a'.repeat(32)
const HASH = 'b'.repeat(64)

describe('isValidChallengeNonce', () => {
  it('accepts a 32-character hex nonce', () => {
    expect(isValidChallengeNonce(NONCE)).toBe(true)
    expect(isValidChallengeNonce('0123456789abcdef0123456789abcdef')).toBe(true)
  })

  it('rejects non-strings', () => {
    expect(isValidChallengeNonce(undefined)).toBe(false)
    expect(isValidChallengeNonce(null)).toBe(false)
    expect(isValidChallengeNonce(42)).toBe(false)
    expect(isValidChallengeNonce({})).toBe(false)
  })

  it('rejects wrong length', () => {
    expect(isValidChallengeNonce('a'.repeat(31))).toBe(false)
    expect(isValidChallengeNonce('a'.repeat(33))).toBe(false)
    expect(isValidChallengeNonce('')).toBe(false)
  })

  it('rejects non-hex characters', () => {
    expect(isValidChallengeNonce('z'.repeat(32))).toBe(false)
    expect(isValidChallengeNonce('A'.repeat(32))).toBe(false)
    expect(isValidChallengeNonce(`-${'a'.repeat(31)}`)).toBe(false)
  })
})

describe('buildChallengeUrl', () => {
  it('builds a slug + hash + nonce URL', () => {
    const url = buildChallengeUrl({
      origin: 'https://viberacer.test',
      slug: 'oval',
      versionHash: HASH,
      nonce: NONCE,
      from: 'BCE',
      timeMs: 42123,
    })
    expect(url).toBe(
      `https://viberacer.test/oval?v=${HASH}&challenge=${NONCE}&from=BCE&time=42123`,
    )
  })

  it('strips a trailing slash on the origin', () => {
    const url = buildChallengeUrl({
      origin: 'https://viberacer.test/',
      slug: 'oval',
      versionHash: HASH,
      nonce: NONCE,
      from: null,
      timeMs: 1000,
    })
    expect(url.startsWith('https://viberacer.test/oval?')).toBe(true)
  })

  it('encodes the slug safely', () => {
    const url = buildChallengeUrl({
      origin: 'https://x',
      slug: 'a b',
      versionHash: HASH,
      nonce: NONCE,
      from: null,
      timeMs: 1000,
    })
    expect(url).toContain('/a%20b?')
  })

  it('omits from when invalid', () => {
    const url = buildChallengeUrl({
      origin: 'https://x',
      slug: 's',
      versionHash: HASH,
      nonce: NONCE,
      from: 'lowercase',
      timeMs: 1000,
    })
    expect(url).not.toContain('from=')
  })

  it('uppercases and trims initials', () => {
    const url = buildChallengeUrl({
      origin: 'https://x',
      slug: 's',
      versionHash: HASH,
      nonce: NONCE,
      from: '  abc  ',
      timeMs: 1000,
    })
    expect(url).toContain('from=ABC')
  })

  it('omits time when not finite or non-positive', () => {
    const u1 = buildChallengeUrl({
      origin: 'https://x',
      slug: 's',
      versionHash: HASH,
      nonce: NONCE,
      from: null,
      timeMs: 0,
    })
    expect(u1).not.toContain('time=')
    const u2 = buildChallengeUrl({
      origin: 'https://x',
      slug: 's',
      versionHash: HASH,
      nonce: NONCE,
      from: null,
      timeMs: Number.POSITIVE_INFINITY,
    })
    expect(u2).not.toContain('time=')
  })

  it('rounds the time to integer ms', () => {
    const url = buildChallengeUrl({
      origin: 'https://x',
      slug: 's',
      versionHash: HASH,
      nonce: NONCE,
      from: null,
      timeMs: 12345.7,
    })
    expect(url).toContain('time=12346')
  })

  it('rejects implausibly long times (over an hour)', () => {
    const url = buildChallengeUrl({
      origin: 'https://x',
      slug: 's',
      versionHash: HASH,
      nonce: NONCE,
      from: null,
      timeMs: 60 * 60 * 1000 + 1,
    })
    expect(url).not.toContain('time=')
  })
})

describe('buildChallengeText', () => {
  it('mentions the sender, target, and slug', () => {
    const text = buildChallengeText({
      origin: 'https://x',
      slug: 'oval',
      versionHash: HASH,
      nonce: NONCE,
      from: 'BCE',
      timeMs: 42123,
    })
    expect(text).toContain('BCE')
    expect(text).toContain('00:42.123')
    expect(text).toContain('/oval')
  })

  it('omits the time clause when no valid target is provided', () => {
    const text = buildChallengeText({
      origin: 'https://x',
      slug: 'oval',
      versionHash: HASH,
      nonce: NONCE,
      from: 'BCE',
      timeMs: 0,
    })
    expect(text).not.toContain('beat')
    expect(text).toContain('challenges you')
  })

  it('omits the initials prefix when no valid initials are provided', () => {
    const text = buildChallengeText({
      origin: 'https://x',
      slug: 'oval',
      versionHash: HASH,
      nonce: NONCE,
      from: null,
      timeMs: 1000,
    })
    expect(text.startsWith('challenges you')).toBe(true)
  })

  it('contains no em-dashes', () => {
    const text = buildChallengeText({
      origin: 'https://x',
      slug: 'oval',
      versionHash: HASH,
      nonce: NONCE,
      from: 'BCE',
      timeMs: 42123,
    })
    expect(text.includes('—')).toBe(false)
    expect(text.includes('–')).toBe(false)
  })
})

describe('buildChallengeSharePayload', () => {
  it('exposes title / text / url', () => {
    const payload = buildChallengeSharePayload({
      origin: 'https://x',
      slug: 'oval',
      versionHash: HASH,
      nonce: NONCE,
      from: 'BCE',
      timeMs: 42123,
    })
    expect(payload.title).toContain('oval')
    expect(payload.text).toContain('BCE')
    expect(payload.url).toContain(`challenge=${NONCE}`)
  })
})

describe('parseChallengeFromSearchParams', () => {
  function paramsOf(record: Record<string, string>): URLSearchParams {
    return new URLSearchParams(record)
  }

  it('returns null when challenge is missing', () => {
    expect(
      parseChallengeFromSearchParams(paramsOf({ from: 'BCE', time: '1000' })),
    ).toBeNull()
  })

  it('returns null when challenge nonce is malformed', () => {
    expect(
      parseChallengeFromSearchParams(
        paramsOf({ challenge: 'short', from: 'BCE', time: '1000' }),
      ),
    ).toBeNull()
    expect(
      parseChallengeFromSearchParams(
        paramsOf({ challenge: 'Z'.repeat(32), from: 'BCE', time: '1000' }),
      ),
    ).toBeNull()
  })

  it('returns null when time is missing', () => {
    expect(
      parseChallengeFromSearchParams(
        paramsOf({ challenge: NONCE, from: 'BCE' }),
      ),
    ).toBeNull()
  })

  it('returns null when time is non-numeric', () => {
    expect(
      parseChallengeFromSearchParams(
        paramsOf({ challenge: NONCE, from: 'BCE', time: 'fast' }),
      ),
    ).toBeNull()
  })

  it('returns null when time is non-positive', () => {
    expect(
      parseChallengeFromSearchParams(
        paramsOf({ challenge: NONCE, from: 'BCE', time: '0' }),
      ),
    ).toBeNull()
    expect(
      parseChallengeFromSearchParams(
        paramsOf({ challenge: NONCE, from: 'BCE', time: '-100' }),
      ),
    ).toBeNull()
  })

  it('returns null when time is over an hour', () => {
    expect(
      parseChallengeFromSearchParams(
        paramsOf({
          challenge: NONCE,
          from: 'BCE',
          time: String(60 * 60 * 1000 + 1),
        }),
      ),
    ).toBeNull()
  })

  it('parses valid inputs', () => {
    const result = parseChallengeFromSearchParams(
      paramsOf({ challenge: NONCE, from: 'BCE', time: '42123' }),
    )
    expect(result).toEqual({ nonce: NONCE, from: 'BCE', timeMs: 42123 })
  })

  it('falls back to "???" when initials are missing or invalid', () => {
    const r1 = parseChallengeFromSearchParams(
      paramsOf({ challenge: NONCE, time: '1000' }),
    )
    expect(r1?.from).toBe('???')
    const r2 = parseChallengeFromSearchParams(
      paramsOf({ challenge: NONCE, from: 'lowercase', time: '1000' }),
    )
    expect(r2?.from).toBe('???')
    const r3 = parseChallengeFromSearchParams(
      paramsOf({ challenge: NONCE, from: 'AB', time: '1000' }),
    )
    expect(r3?.from).toBe('???')
  })

  it('rounds fractional time inputs', () => {
    const result = parseChallengeFromSearchParams(
      paramsOf({ challenge: NONCE, from: 'BCE', time: '1234.7' }),
    )
    expect(result?.timeMs).toBe(1235)
  })
})
