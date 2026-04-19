import { describe, it, expect, beforeAll } from 'vitest'
import { validateLap, isProfane } from '@/lib/anticheat'
import { signRaceToken } from '@/lib/signToken'
import type { RaceTokenPayload } from '@/lib/schemas'

const racerId = '00000000-0000-4000-8000-000000000000'
const otherRacer = '11111111-1111-4111-8111-111111111111'

function makePayload(overrides: Partial<RaceTokenPayload> = {}): RaceTokenPayload {
  return {
    slug: 'track',
    versionHash: 'a'.repeat(64),
    nonce: 'f'.repeat(32),
    issuedAt: Date.now(),
    racerId,
    ...overrides,
  }
}

beforeAll(() => {
  process.env.RACE_SIGNING_SECRET = 'test-secret-for-vitest-only'
})

describe('validateLap', () => {
  it('accepts a clean lap', () => {
    const payload = makePayload()
    const token = signRaceToken(payload)
    const res = validateLap(
      {
        token,
        slug: 'track',
        versionHash: 'a'.repeat(64),
        checkpoints: [
          { cpId: 0, tMs: 1000 },
          { cpId: 1, tMs: 2000 },
        ],
        lapTimeMs: 2000,
        initials: 'abc',
      },
      racerId,
      payload.issuedAt + 500,
    )
    expect(res.ok).toBe(true)
  })

  it('rejects bad signature', () => {
    const res = validateLap(
      {
        token: 'garbage.signature',
        slug: 'track',
        versionHash: 'a'.repeat(64),
        checkpoints: [{ cpId: 0, tMs: 500 }],
        lapTimeMs: 500,
        initials: 'RNG',
      },
      racerId,
      Date.now(),
    )
    expect(res).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rejects expired tokens', () => {
    const payload = makePayload()
    const token = signRaceToken(payload)
    const res = validateLap(
      {
        token,
        slug: 'track',
        versionHash: 'a'.repeat(64),
        checkpoints: [{ cpId: 0, tMs: 500 }],
        lapTimeMs: 500,
        initials: 'RNG',
      },
      racerId,
      payload.issuedAt + 16 * 60 * 1000,
    )
    expect(res.reason).toBe('token_expired')
  })

  it('rejects cross-racer token theft', () => {
    const payload = makePayload()
    const token = signRaceToken(payload)
    const res = validateLap(
      {
        token,
        slug: 'track',
        versionHash: 'a'.repeat(64),
        checkpoints: [{ cpId: 0, tMs: 500 }],
        lapTimeMs: 500,
        initials: 'RNG',
      },
      otherRacer,
      payload.issuedAt + 1,
    )
    expect(res.reason).toBe('racer_mismatch')
  })

  it('rejects slug mismatch', () => {
    const payload = makePayload()
    const token = signRaceToken(payload)
    const res = validateLap(
      {
        token,
        slug: 'other',
        versionHash: 'a'.repeat(64),
        checkpoints: [{ cpId: 0, tMs: 500 }],
        lapTimeMs: 500,
        initials: 'RNG',
      },
      racerId,
      payload.issuedAt + 1,
    )
    expect(res.reason).toBe('target_mismatch')
  })

  it('rejects out-of-order checkpoints', () => {
    const payload = makePayload()
    const token = signRaceToken(payload)
    const res = validateLap(
      {
        token,
        slug: 'track',
        versionHash: 'a'.repeat(64),
        checkpoints: [
          { cpId: 1, tMs: 1000 },
          { cpId: 0, tMs: 2000 },
        ],
        lapTimeMs: 2000,
        initials: 'RNG',
      },
      racerId,
      payload.issuedAt + 1,
    )
    expect(res.reason).toBe('checkpoint_order')
  })

  it('rejects segment times below the floor', () => {
    const payload = makePayload()
    const token = signRaceToken(payload)
    const res = validateLap(
      {
        token,
        slug: 'track',
        versionHash: 'a'.repeat(64),
        checkpoints: [
          { cpId: 0, tMs: 10 },
          { cpId: 1, tMs: 20 },
        ],
        lapTimeMs: 20,
        initials: 'RNG',
      },
      racerId,
      payload.issuedAt + 1,
    )
    expect(res.reason).toBe('segment_too_fast')
  })

  it('rejects lap time mismatch', () => {
    const payload = makePayload()
    const token = signRaceToken(payload)
    const res = validateLap(
      {
        token,
        slug: 'track',
        versionHash: 'a'.repeat(64),
        checkpoints: [
          { cpId: 0, tMs: 1000 },
          { cpId: 1, tMs: 2000 },
        ],
        lapTimeMs: 10_000,
        initials: 'RNG',
      },
      racerId,
      payload.issuedAt + 1,
    )
    expect(res.reason).toBe('lap_time_mismatch')
  })

  it('rejects profane initials', () => {
    const payload = makePayload()
    const token = signRaceToken(payload)
    const res = validateLap(
      {
        token,
        slug: 'track',
        versionHash: 'a'.repeat(64),
        checkpoints: [{ cpId: 0, tMs: 1000 }],
        lapTimeMs: 1000,
        initials: 'ass',
      },
      racerId,
      payload.issuedAt + 1,
    )
    expect(res.reason).toBe('profane_initials')
  })
})

describe('isProfane', () => {
  it('catches the blocklist case-insensitively', () => {
    expect(isProfane('ass')).toBe(true)
    expect(isProfane('ASS')).toBe(true)
    expect(isProfane('ABC')).toBe(false)
  })
})
