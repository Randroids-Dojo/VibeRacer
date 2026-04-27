import { describe, expect, it } from 'vitest'
import {
  NAMEPLATE_BG_HEX,
  NAMEPLATE_BORDER_HEX,
  NAMEPLATE_SOURCE_TAGS,
  NAMEPLATE_SPRITE_HEIGHT,
  NAMEPLATE_SPRITE_WIDTH,
  NAMEPLATE_TAG_HEX,
  NAMEPLATE_TEXT_HEX,
  NAMEPLATE_TEXTURE_HEIGHT,
  NAMEPLATE_TEXTURE_WIDTH,
  NAMEPLATE_Y_OFFSET,
  formatNameplateInitials,
  formatNameplateLapTime,
  nameplateCacheKey,
} from '@/game/ghostNameplate'
import { GHOST_SOURCES } from '@/lib/ghostSource'

describe('ghostNameplate constants', () => {
  it('defines a tag for every ghost source', () => {
    for (const src of GHOST_SOURCES) {
      const tag = NAMEPLATE_SOURCE_TAGS[src]
      expect(typeof tag).toBe('string')
      expect(tag.length).toBeGreaterThan(0)
    }
  })

  it('uses non-empty unique source tags', () => {
    const tags = GHOST_SOURCES.map((s) => NAMEPLATE_SOURCE_TAGS[s])
    const unique = new Set(tags)
    expect(unique.size).toBe(tags.length)
  })

  it('every visual constant is a 7-character hex color string', () => {
    for (const hex of [
      NAMEPLATE_BG_HEX,
      NAMEPLATE_BORDER_HEX,
      NAMEPLATE_TEXT_HEX,
      NAMEPLATE_TAG_HEX,
    ]) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('texture dimensions are positive powers-of-two-friendly integers', () => {
    expect(Number.isInteger(NAMEPLATE_TEXTURE_WIDTH)).toBe(true)
    expect(Number.isInteger(NAMEPLATE_TEXTURE_HEIGHT)).toBe(true)
    expect(NAMEPLATE_TEXTURE_WIDTH).toBeGreaterThan(0)
    expect(NAMEPLATE_TEXTURE_HEIGHT).toBeGreaterThan(0)
    // Plate is wider than tall so the rectangle reads as a billboard pill.
    expect(NAMEPLATE_TEXTURE_WIDTH).toBeGreaterThan(NAMEPLATE_TEXTURE_HEIGHT)
  })

  it('sprite scale is positive and wider than tall', () => {
    expect(NAMEPLATE_SPRITE_WIDTH).toBeGreaterThan(0)
    expect(NAMEPLATE_SPRITE_HEIGHT).toBeGreaterThan(0)
    expect(NAMEPLATE_SPRITE_WIDTH).toBeGreaterThan(NAMEPLATE_SPRITE_HEIGHT)
  })

  it('Y offset floats the plate above the ghost roof', () => {
    expect(Number.isFinite(NAMEPLATE_Y_OFFSET)).toBe(true)
    expect(NAMEPLATE_Y_OFFSET).toBeGreaterThan(1)
  })

  it('source tags carry no em-dashes', () => {
    for (const src of GHOST_SOURCES) {
      expect(NAMEPLATE_SOURCE_TAGS[src]).not.toContain('\u2014')
    }
  })
})

describe('formatNameplateInitials', () => {
  it('passes through normal three-letter initials', () => {
    expect(formatNameplateInitials('ABC')).toBe('ABC')
  })

  it('uppercases lowercase input', () => {
    expect(formatNameplateInitials('xyz')).toBe('XYZ')
  })

  it('caps to three characters', () => {
    expect(formatNameplateInitials('ABCDE')).toBe('ABC')
  })

  it('trims whitespace', () => {
    expect(formatNameplateInitials('  AB ')).toBe('AB')
  })

  it('returns "???" placeholder on empty string', () => {
    expect(formatNameplateInitials('')).toBe('???')
  })

  it('returns "???" placeholder on whitespace-only input', () => {
    expect(formatNameplateInitials('   ')).toBe('???')
  })

  it('returns "???" on non-string input', () => {
    expect(formatNameplateInitials(null)).toBe('???')
    expect(formatNameplateInitials(undefined)).toBe('???')
    expect(formatNameplateInitials(42)).toBe('???')
    expect(formatNameplateInitials({})).toBe('???')
  })

  it('handles single-character initials', () => {
    expect(formatNameplateInitials('a')).toBe('A')
  })
})

describe('formatNameplateLapTime', () => {
  it('formats normal lap times via the share helper', () => {
    expect(formatNameplateLapTime(42_123)).toBe('00:42.123')
  })

  it('rounds milliseconds via the share helper', () => {
    expect(formatNameplateLapTime(42_123.6)).toBe('00:42.124')
  })

  it('handles a multi-minute lap', () => {
    expect(formatNameplateLapTime(125_500)).toBe('02:05.500')
  })

  it('returns the placeholder on zero', () => {
    expect(formatNameplateLapTime(0)).toBe('--:--.---')
  })

  it('returns the placeholder on negative input', () => {
    expect(formatNameplateLapTime(-5)).toBe('--:--.---')
  })

  it('returns the placeholder on non-finite input', () => {
    expect(formatNameplateLapTime(Number.NaN)).toBe('--:--.---')
    expect(formatNameplateLapTime(Number.POSITIVE_INFINITY)).toBe('--:--.---')
    expect(formatNameplateLapTime(Number.NEGATIVE_INFINITY)).toBe('--:--.---')
  })

  it('returns the placeholder on non-number input', () => {
    expect(formatNameplateLapTime(null)).toBe('--:--.---')
    expect(formatNameplateLapTime(undefined)).toBe('--:--.---')
    expect(formatNameplateLapTime('42123')).toBe('--:--.---')
  })
})

describe('nameplateCacheKey', () => {
  it('returns a stable key for the same inputs', () => {
    const meta = { initials: 'ABC', lapTimeMs: 42_123 }
    expect(nameplateCacheKey(meta, 'top')).toBe(
      nameplateCacheKey(meta, 'top'),
    )
  })

  it('changes when the source changes', () => {
    const meta = { initials: 'ABC', lapTimeMs: 42_123 }
    expect(nameplateCacheKey(meta, 'top')).not.toBe(
      nameplateCacheKey(meta, 'pb'),
    )
  })

  it('changes when the initials change', () => {
    expect(
      nameplateCacheKey({ initials: 'ABC', lapTimeMs: 42_000 }, 'top'),
    ).not.toBe(
      nameplateCacheKey({ initials: 'XYZ', lapTimeMs: 42_000 }, 'top'),
    )
  })

  it('changes when the lap time changes', () => {
    expect(
      nameplateCacheKey({ initials: 'ABC', lapTimeMs: 42_000 }, 'top'),
    ).not.toBe(
      nameplateCacheKey({ initials: 'ABC', lapTimeMs: 41_000 }, 'top'),
    )
  })

  it('returns a distinct null-marker key', () => {
    const nullKey = nameplateCacheKey(null, 'top')
    const realKey = nameplateCacheKey({ initials: 'ABC', lapTimeMs: 42_000 }, 'top')
    expect(nullKey).not.toBe(realKey)
    expect(nullKey).toContain('top')
  })

  it('is robust to malformed initials in the meta tuple', () => {
    // The renderer guards through `formatNameplateInitials`, so the cache
    // key reflects the post-sanitization value: hand-edited initials that
    // would otherwise read as different display strings still collapse to
    // the same key once they normalize the same way.
    const a = nameplateCacheKey({ initials: 'abc', lapTimeMs: 42_000 }, 'auto')
    const b = nameplateCacheKey({ initials: 'ABC', lapTimeMs: 42_000 }, 'auto')
    expect(a).toBe(b)
  })

  it('is robust to non-positive lap times', () => {
    // Both collapse to the placeholder, so the cache key is stable.
    const a = nameplateCacheKey({ initials: 'ABC', lapTimeMs: 0 }, 'auto')
    const b = nameplateCacheKey({ initials: 'ABC', lapTimeMs: -1 }, 'auto')
    expect(a).toBe(b)
  })
})
