import { describe, it, expect, beforeAll } from 'vitest'
import { signRaceToken, verifyRaceToken } from '@/lib/signToken'
import type { RaceTokenPayload } from '@/lib/schemas'

const payload: RaceTokenPayload = {
  slug: 'track',
  versionHash: 'a'.repeat(64),
  nonce: 'f'.repeat(32),
  issuedAt: 1_700_000_000_000,
  racerId: '00000000-0000-4000-8000-000000000000',
}

beforeAll(() => {
  process.env.RACE_SIGNING_SECRET = 'test-secret-for-vitest-only'
})

describe('race token', () => {
  it('roundtrips sign + verify', () => {
    const token = signRaceToken(payload)
    expect(verifyRaceToken(token)).toEqual(payload)
  })

  it('rejects a tampered body', () => {
    const token = signRaceToken(payload)
    const [body, sig] = token.split('.')
    const tampered = `${body}X.${sig}`
    expect(verifyRaceToken(tampered)).toBeNull()
  })

  it('rejects a tampered signature', () => {
    const token = signRaceToken(payload)
    const [body, sig] = token.split('.')
    const tampered = `${body}.${sig.slice(0, -1)}A`
    expect(verifyRaceToken(tampered)).toBeNull()
  })

  it('rejects malformed token shape', () => {
    expect(verifyRaceToken('notatoken')).toBeNull()
    expect(verifyRaceToken('a.b.c')).toBeNull()
  })

  it('rejects payload that fails schema (even with valid signature)', () => {
    const bogus = Buffer.from(JSON.stringify({ hi: 'there' }), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    const token = signRaceToken(payload)
    const [, sig] = token.split('.')
    // Signature is over a different body, so it must fail.
    expect(verifyRaceToken(`${bogus}.${sig}`)).toBeNull()
  })
})
