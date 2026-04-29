import { describe, it, expect } from 'vitest'
import {
  PieceSchema,
  TrackSchema,
  TrackMoodSchema,
  TrackVersionSchema,
  InitialsSchema,
  SlugSchema,
  VersionHashSchema,
  RaceTokenPayloadSchema,
  SubmissionSchema,
  MAX_PIECES_PER_TRACK,
} from '@/lib/schemas'

describe('PieceSchema', () => {
  it('accepts a valid piece', () => {
    expect(
      PieceSchema.parse({ type: 'straight', row: 0, col: 0, rotation: 0 }),
    ).toEqual({ type: 'straight', row: 0, col: 0, rotation: 0 })
  })

  it('rejects invalid rotation', () => {
    expect(
      PieceSchema.safeParse({ type: 'straight', row: 0, col: 0, rotation: 45 })
        .success,
    ).toBe(false)
  })

  it('rejects unknown piece type', () => {
    expect(
      PieceSchema.safeParse({ type: 'loop', row: 0, col: 0, rotation: 0 })
        .success,
    ).toBe(false)
  })

  it('accepts the scurve piece type', () => {
    expect(
      PieceSchema.parse({ type: 'scurve', row: 0, col: 0, rotation: 0 }),
    ).toEqual({ type: 'scurve', row: 0, col: 0, rotation: 0 })
  })

  it('accepts the scurveLeft piece type', () => {
    expect(
      PieceSchema.parse({ type: 'scurveLeft', row: 0, col: 0, rotation: 0 }),
    ).toEqual({ type: 'scurveLeft', row: 0, col: 0, rotation: 0 })
  })

  it('accepts the sweep turn piece types', () => {
    expect(
      PieceSchema.parse({ type: 'sweepRight', row: 0, col: 0, rotation: 0 }),
    ).toEqual({ type: 'sweepRight', row: 0, col: 0, rotation: 0 })
    expect(
      PieceSchema.parse({ type: 'sweepLeft', row: 0, col: 0, rotation: 0 }),
    ).toEqual({ type: 'sweepLeft', row: 0, col: 0, rotation: 0 })
  })
})

describe('TrackSchema', () => {
  it('caps pieces at MAX_PIECES_PER_TRACK', () => {
    const pieces = Array.from({ length: MAX_PIECES_PER_TRACK + 1 }, (_, i) => ({
      type: 'straight' as const,
      row: 0,
      col: i,
      rotation: 0 as const,
    }))
    expect(TrackSchema.safeParse({ pieces }).success).toBe(false)
  })

  it('requires at least one piece', () => {
    expect(TrackSchema.safeParse({ pieces: [] }).success).toBe(false)
  })

  it('accepts a valid checkpointCount', () => {
    const pieces = Array.from({ length: 8 }, (_, i) => ({
      type: 'straight' as const,
      row: 0,
      col: i,
      rotation: 0 as const,
    }))
    expect(TrackSchema.safeParse({ pieces, checkpointCount: 4 }).success).toBe(true)
    expect(TrackSchema.safeParse({ pieces, checkpointCount: 8 }).success).toBe(true)
    expect(TrackSchema.safeParse({ pieces }).success).toBe(true)
  })

  it('rejects checkpointCount below MIN_CHECKPOINT_COUNT', () => {
    const pieces = Array.from({ length: 8 }, (_, i) => ({
      type: 'straight' as const,
      row: 0,
      col: i,
      rotation: 0 as const,
    }))
    expect(TrackSchema.safeParse({ pieces, checkpointCount: 2 }).success).toBe(false)
  })

  it('rejects checkpointCount above piece count', () => {
    const pieces = Array.from({ length: 4 }, (_, i) => ({
      type: 'straight' as const,
      row: 0,
      col: i,
      rotation: 0 as const,
    }))
    expect(TrackSchema.safeParse({ pieces, checkpointCount: 5 }).success).toBe(false)
  })

  it('accepts custom checkpoint cells on non-start pieces', () => {
    const pieces = Array.from({ length: 5 }, (_, i) => ({
      type: 'straight' as const,
      row: 0,
      col: i,
      rotation: 0 as const,
    }))
    expect(
      TrackSchema.safeParse({
        pieces,
        checkpoints: [
          { row: 0, col: 1 },
          { row: 0, col: 2 },
          { row: 0, col: 3 },
        ],
      }).success,
    ).toBe(true)
  })

  it('rejects too few custom checkpoints', () => {
    const pieces = Array.from({ length: 5 }, (_, i) => ({
      type: 'straight' as const,
      row: 0,
      col: i,
      rotation: 0 as const,
    }))
    expect(
      TrackSchema.safeParse({
        pieces,
        checkpoints: [
          { row: 0, col: 1 },
          { row: 0, col: 2 },
        ],
      }).success,
    ).toBe(false)
  })

  it('rejects custom checkpoints on empty, duplicate, or start cells', () => {
    const pieces = Array.from({ length: 5 }, (_, i) => ({
      type: 'straight' as const,
      row: 0,
      col: i,
      rotation: 0 as const,
    }))
    expect(
      TrackSchema.safeParse({
        pieces,
        checkpoints: [
          { row: 0, col: 0 },
          { row: 0, col: 2 },
          { row: 0, col: 3 },
        ],
      }).success,
    ).toBe(false)
    expect(
      TrackSchema.safeParse({
        pieces,
        checkpoints: [
          { row: 0, col: 1 },
          { row: 0, col: 1 },
          { row: 0, col: 3 },
        ],
      }).success,
    ).toBe(false)
    expect(
      TrackSchema.safeParse({
        pieces,
        checkpoints: [
          { row: 0, col: 1 },
          { row: 0, col: 2 },
          { row: 9, col: 9 },
        ],
      }).success,
    ).toBe(false)
  })

  it('rejects combining custom checkpoints with checkpointCount', () => {
    const pieces = Array.from({ length: 5 }, (_, i) => ({
      type: 'straight' as const,
      row: 0,
      col: i,
      rotation: 0 as const,
    }))
    expect(
      TrackSchema.safeParse({
        pieces,
        checkpointCount: 3,
        checkpoints: [
          { row: 0, col: 1 },
          { row: 0, col: 2 },
          { row: 0, col: 3 },
        ],
      }).success,
    ).toBe(false)
  })

  it('accepts an empty mood object (author opted not to bake one in)', () => {
    const pieces = [{ type: 'straight' as const, row: 0, col: 0, rotation: 0 as const }]
    expect(TrackSchema.safeParse({ pieces, mood: {} }).success).toBe(true)
  })

  it('accepts a mood with only timeOfDay set', () => {
    const pieces = [{ type: 'straight' as const, row: 0, col: 0, rotation: 0 as const }]
    expect(
      TrackSchema.safeParse({ pieces, mood: { timeOfDay: 'sunset' } }).success,
    ).toBe(true)
  })

  it('accepts a mood with only weather set', () => {
    const pieces = [{ type: 'straight' as const, row: 0, col: 0, rotation: 0 as const }]
    expect(
      TrackSchema.safeParse({ pieces, mood: { weather: 'foggy' } }).success,
    ).toBe(true)
  })

  it('accepts a mood with both fields', () => {
    const pieces = [{ type: 'straight' as const, row: 0, col: 0, rotation: 0 as const }]
    expect(
      TrackSchema.safeParse({
        pieces,
        mood: { timeOfDay: 'night', weather: 'cloudy' },
      }).success,
    ).toBe(true)
  })

  it('rejects an unknown mood field', () => {
    const pieces = [{ type: 'straight' as const, row: 0, col: 0, rotation: 0 as const }]
    expect(
      TrackSchema.safeParse({
        pieces,
        mood: { timeOfDay: 'noon', extra: 'foo' },
      }).success,
    ).toBe(false)
  })

  it('rejects a mood with an invalid timeOfDay', () => {
    const pieces = [{ type: 'straight' as const, row: 0, col: 0, rotation: 0 as const }]
    expect(
      TrackSchema.safeParse({ pieces, mood: { timeOfDay: 'midnight' } }).success,
    ).toBe(false)
  })

  it('rejects a mood with an invalid weather', () => {
    const pieces = [{ type: 'straight' as const, row: 0, col: 0, rotation: 0 as const }]
    expect(
      TrackSchema.safeParse({ pieces, mood: { weather: 'rain' } }).success,
    ).toBe(false)
  })
})

describe('TrackMoodSchema', () => {
  it('parses an empty object', () => {
    expect(TrackMoodSchema.parse({})).toEqual({})
  })

  it('round-trips both fields', () => {
    expect(
      TrackMoodSchema.parse({ timeOfDay: 'morning', weather: 'foggy' }),
    ).toEqual({ timeOfDay: 'morning', weather: 'foggy' })
  })

  it('rejects unknown extra fields', () => {
    expect(TrackMoodSchema.safeParse({ surprise: 1 }).success).toBe(false)
  })
})

describe('TrackVersionSchema', () => {
  const validVersion = {
    pieces: [{ type: 'straight' as const, row: 0, col: 0, rotation: 0 as const }],
    createdByRacerId: '00000000-0000-4000-8000-000000000000',
    createdAt: '2026-01-01T00:00:00.000Z',
  }

  it('round-trips a version without a mood (legacy payload)', () => {
    expect(TrackVersionSchema.safeParse(validVersion).success).toBe(true)
  })

  it('round-trips a version with a mood', () => {
    expect(
      TrackVersionSchema.safeParse({
        ...validVersion,
        mood: { timeOfDay: 'sunset', weather: 'cloudy' },
      }).success,
    ).toBe(true)
  })

  it('rejects a version with an invalid mood', () => {
    expect(
      TrackVersionSchema.safeParse({
        ...validVersion,
        mood: { weather: 'tornado' },
      }).success,
    ).toBe(false)
  })
})

describe('InitialsSchema', () => {
  it('uppercases input', () => {
    expect(InitialsSchema.parse('abc')).toBe('ABC')
  })

  it('rejects too few letters', () => {
    expect(InitialsSchema.safeParse('AB').success).toBe(false)
  })

  it('rejects digits and symbols', () => {
    expect(InitialsSchema.safeParse('A1B').success).toBe(false)
    expect(InitialsSchema.safeParse('A!B').success).toBe(false)
  })
})

describe('SlugSchema', () => {
  it('accepts kebab-case', () => {
    expect(SlugSchema.parse('my-cool-track-1')).toBe('my-cool-track-1')
  })

  it('rejects uppercase, spaces, and leading dash', () => {
    expect(SlugSchema.safeParse('My-Track').success).toBe(false)
    expect(SlugSchema.safeParse('my track').success).toBe(false)
    expect(SlugSchema.safeParse('-abc').success).toBe(false)
  })
})

describe('VersionHashSchema', () => {
  it('accepts a 64-char lowercase hex', () => {
    expect(VersionHashSchema.parse('a'.repeat(64))).toBe('a'.repeat(64))
  })
  it('rejects wrong length or uppercase', () => {
    expect(VersionHashSchema.safeParse('a'.repeat(63)).success).toBe(false)
    expect(VersionHashSchema.safeParse('A'.repeat(64)).success).toBe(false)
  })
})

describe('RaceTokenPayloadSchema', () => {
  it('parses a well-formed payload', () => {
    const payload = {
      slug: 'track',
      versionHash: 'a'.repeat(64),
      nonce: 'f'.repeat(32),
      issuedAt: 1_700_000_000_000,
      racerId: '00000000-0000-4000-8000-000000000000',
    }
    expect(RaceTokenPayloadSchema.parse(payload)).toEqual(payload)
  })
})

describe('SubmissionSchema', () => {
  it('parses a well-formed submission', () => {
    const out = SubmissionSchema.parse({
      token: 'abc.def',
      checkpoints: [{ cpId: 0, tMs: 500 }],
      lapTimeMs: 500,
      initials: 'rng',
    })
    expect(out.initials).toBe('RNG')
  })
})
