import { describe, it, expect } from 'vitest'
import {
  formatRivalBannerLabel,
  formatRivalLapTime,
  isRivalSelection,
  isValidNonce,
  NONCE_REGEX,
  RivalSelectionSchema,
  shouldOfferChase,
  type RivalSelection,
} from '@/lib/rivalGhost'

const validNonce = 'a'.repeat(32)
const validRival: RivalSelection = {
  nonce: validNonce,
  initials: 'XYZ',
  lapTimeMs: 42_123,
  rank: 3,
}

describe('NONCE_REGEX', () => {
  it('accepts a 32-char lowercase hex string', () => {
    expect(NONCE_REGEX.test('0123456789abcdef0123456789abcdef')).toBe(true)
  })
  it('rejects an empty string', () => {
    expect(NONCE_REGEX.test('')).toBe(false)
  })
  it('rejects uppercase hex (race tokens are lowercase by convention)', () => {
    expect(NONCE_REGEX.test('A'.repeat(32))).toBe(false)
  })
  it('rejects non-hex characters', () => {
    expect(NONCE_REGEX.test('z'.repeat(32))).toBe(false)
  })
  it('rejects too-short hex', () => {
    expect(NONCE_REGEX.test('a'.repeat(31))).toBe(false)
  })
  it('rejects too-long hex', () => {
    expect(NONCE_REGEX.test('a'.repeat(33))).toBe(false)
  })
})

describe('isValidNonce', () => {
  it('accepts a well-formed nonce', () => {
    expect(isValidNonce(validNonce)).toBe(true)
  })
  it('rejects null', () => {
    expect(isValidNonce(null)).toBe(false)
  })
  it('rejects undefined', () => {
    expect(isValidNonce(undefined)).toBe(false)
  })
  it('rejects a number', () => {
    expect(isValidNonce(0)).toBe(false)
  })
  it('rejects an object', () => {
    expect(isValidNonce({ nonce: validNonce })).toBe(false)
  })
  it('rejects empty string', () => {
    expect(isValidNonce('')).toBe(false)
  })
  it('rejects a malformed string', () => {
    expect(isValidNonce('not a nonce')).toBe(false)
  })
})

describe('RivalSelectionSchema', () => {
  it('accepts a clean payload', () => {
    expect(RivalSelectionSchema.safeParse(validRival).success).toBe(true)
  })
  it('rejects a missing nonce field', () => {
    const { nonce: _nonce, ...rest } = validRival
    expect(RivalSelectionSchema.safeParse(rest).success).toBe(false)
  })
  it('rejects malformed nonce', () => {
    expect(
      RivalSelectionSchema.safeParse({ ...validRival, nonce: 'bogus' }).success,
    ).toBe(false)
  })
  it('rejects empty initials', () => {
    expect(
      RivalSelectionSchema.safeParse({ ...validRival, initials: '' }).success,
    ).toBe(false)
  })
  it('rejects negative lapTimeMs', () => {
    expect(
      RivalSelectionSchema.safeParse({ ...validRival, lapTimeMs: -1 }).success,
    ).toBe(false)
  })
  it('rejects fractional lapTimeMs', () => {
    expect(
      RivalSelectionSchema.safeParse({ ...validRival, lapTimeMs: 42.5 }).success,
    ).toBe(false)
  })
  it('rejects zero rank', () => {
    expect(
      RivalSelectionSchema.safeParse({ ...validRival, rank: 0 }).success,
    ).toBe(false)
  })
  it('rejects unknown extra fields (strict)', () => {
    expect(
      RivalSelectionSchema.safeParse({ ...validRival, extra: true }).success,
    ).toBe(false)
  })
})

describe('isRivalSelection', () => {
  it('accepts a clean payload', () => {
    expect(isRivalSelection(validRival)).toBe(true)
  })
  it('rejects null', () => {
    expect(isRivalSelection(null)).toBe(false)
  })
  it('rejects undefined', () => {
    expect(isRivalSelection(undefined)).toBe(false)
  })
  it('rejects a malformed object', () => {
    expect(isRivalSelection({ nonce: 'bogus' })).toBe(false)
  })
})

describe('formatRivalLapTime', () => {
  it('formats sub-minute time with zero-padded seconds and millis', () => {
    expect(formatRivalLapTime(42_123)).toBe('00:42.123')
  })
  it('formats multi-minute time', () => {
    expect(formatRivalLapTime(83_007)).toBe('01:23.007')
  })
  it('rounds non-integer milliseconds (round, not floor)', () => {
    expect(formatRivalLapTime(42_123.6)).toBe('00:42.124')
  })
  it('zero-pads single-digit millis', () => {
    expect(formatRivalLapTime(60_005)).toBe('01:00.005')
  })
  it('zero-pads two-digit millis', () => {
    expect(formatRivalLapTime(60_050)).toBe('01:00.050')
  })
  it('returns the safe fallback for non-finite input', () => {
    expect(formatRivalLapTime(Number.NaN)).toBe('00:00.000')
    expect(formatRivalLapTime(Number.POSITIVE_INFINITY)).toBe('00:00.000')
  })
  it('returns the safe fallback for negative input', () => {
    expect(formatRivalLapTime(-42)).toBe('00:00.000')
  })
  it('handles zero cleanly', () => {
    expect(formatRivalLapTime(0)).toBe('00:00.000')
  })
})

describe('formatRivalBannerLabel', () => {
  it('returns empty string when no rival is selected', () => {
    expect(formatRivalBannerLabel(null)).toBe('')
  })
  it('renders rank, initials, and formatted time', () => {
    expect(formatRivalBannerLabel(validRival)).toBe(
      'RIVAL #3 XYZ chase 00:42.123',
    )
  })
  it('contains no em-dashes (per AGENTS.md)', () => {
    const label = formatRivalBannerLabel(validRival)
    expect(label.includes('—')).toBe(false)
    expect(label.includes('–')).toBe(false)
  })
})

describe('shouldOfferChase', () => {
  it('offers chase for a stranger row with a valid nonce', () => {
    expect(shouldOfferChase({ isMe: false, nonce: validNonce })).toBe(true)
  })
  it('does not offer chase for the player own row', () => {
    expect(shouldOfferChase({ isMe: true, nonce: validNonce })).toBe(false)
  })
  it('does not offer chase when nonce is null', () => {
    expect(shouldOfferChase({ isMe: false, nonce: null })).toBe(false)
  })
  it('does not offer chase when nonce is undefined', () => {
    expect(shouldOfferChase({ isMe: false, nonce: undefined })).toBe(false)
  })
  it('does not offer chase when nonce is malformed', () => {
    expect(shouldOfferChase({ isMe: false, nonce: 'bogus' })).toBe(false)
  })
  it('me-flag suppresses even with a valid nonce', () => {
    expect(shouldOfferChase({ isMe: true, nonce: validNonce })).toBe(false)
  })
})
