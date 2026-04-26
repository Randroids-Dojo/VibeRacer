import { describe, it, expect } from 'vitest'
import {
  BPM_OFFSETS,
  NEUTRAL_PERSONALIZATION,
  ROOT_OFFSETS,
  SCALE_FLAVORS,
  personalizationEquals,
  personalizeForSlug,
  slugMusicSeed,
  type MusicPersonalization,
} from '@/game/musicPersonalization'

describe('NEUTRAL_PERSONALIZATION', () => {
  it('is a true no-op (zero offsets, minor scale)', () => {
    expect(NEUTRAL_PERSONALIZATION.rootMidiOffset).toBe(0)
    expect(NEUTRAL_PERSONALIZATION.bpmOffset).toBe(0)
    expect(NEUTRAL_PERSONALIZATION.scaleFlavor).toBe('minor')
  })
})

describe('ROOT_OFFSETS / SCALE_FLAVORS / BPM_OFFSETS', () => {
  it('expose at least one option each so the modulo math always picks something', () => {
    expect(ROOT_OFFSETS.length).toBeGreaterThan(0)
    expect(SCALE_FLAVORS.length).toBeGreaterThan(0)
    expect(BPM_OFFSETS.length).toBeGreaterThan(0)
  })

  it('keep the BPM offset in a musical band so the 70%-tempo intensity still sits well above the 40 BPM floor', () => {
    // Default game BPM is 140; combined with the smallest offset and the 70%
    // intensity factor the slowest the music can play is (140 + min)*0.7.
    const minBpm = (140 + Math.min(...BPM_OFFSETS)) * 0.7
    expect(minBpm).toBeGreaterThan(40)
  })

  it('keep the root offset inside one octave so the music stays in the same register', () => {
    for (const o of ROOT_OFFSETS) {
      expect(Math.abs(o)).toBeLessThanOrEqual(12)
    }
  })

  it('only exposes the three scale flavors implemented by the music engine', () => {
    expect(SCALE_FLAVORS).toEqual(['minor', 'dorian', 'pentatonic'])
  })
})

describe('slugMusicSeed', () => {
  it('returns 0 for an empty string', () => {
    expect(slugMusicSeed('')).toBe(0)
  })

  it('returns 0 for non-string input (defensive)', () => {
    // @ts-expect-error intentionally passing wrong type
    expect(slugMusicSeed(undefined)).toBe(0)
    // @ts-expect-error intentionally passing wrong type
    expect(slugMusicSeed(null)).toBe(0)
    // @ts-expect-error intentionally passing wrong type
    expect(slugMusicSeed(42)).toBe(0)
  })

  it('is deterministic across calls', () => {
    expect(slugMusicSeed('vibe-circuit')).toBe(slugMusicSeed('vibe-circuit'))
  })

  it('produces a non-zero unsigned 32-bit integer for any non-empty slug', () => {
    const slugs = ['a', 'rainbow', 'race-04', 'M', 'a/b/c', 'longest-slug-name']
    for (const s of slugs) {
      const h = slugMusicSeed(s)
      expect(h).toBeGreaterThan(0)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeLessThan(2 ** 32)
    }
  })

  it('differs between distinct slugs', () => {
    const a = slugMusicSeed('alpha')
    const b = slugMusicSeed('beta')
    const c = slugMusicSeed('gamma')
    expect(a).not.toBe(b)
    expect(b).not.toBe(c)
    expect(a).not.toBe(c)
  })

  it('is sensitive to single-character changes (not just length)', () => {
    expect(slugMusicSeed('aaa')).not.toBe(slugMusicSeed('aab'))
    expect(slugMusicSeed('default')).not.toBe(slugMusicSeed('defaul7'))
  })
})

describe('personalizeForSlug', () => {
  it('returns the neutral tweak for the empty slug', () => {
    const p = personalizeForSlug('')
    expect(p).toEqual(NEUTRAL_PERSONALIZATION)
  })

  it('returns a fresh object so callers can mutate without leaking through', () => {
    const a = personalizeForSlug('')
    const b = personalizeForSlug('')
    expect(a).not.toBe(b)
    expect(a).not.toBe(NEUTRAL_PERSONALIZATION)
  })

  it('always picks values from the published menus', () => {
    const slugs = ['a', 'rainbow', 'race-04', 'longest-slug-name', 'oval', 'M']
    for (const slug of slugs) {
      const p = personalizeForSlug(slug)
      expect(ROOT_OFFSETS).toContain(p.rootMidiOffset)
      expect(SCALE_FLAVORS).toContain(p.scaleFlavor)
      expect(BPM_OFFSETS).toContain(p.bpmOffset)
    }
  })

  it('is deterministic for the same slug', () => {
    const a = personalizeForSlug('vibe-circuit')
    const b = personalizeForSlug('vibe-circuit')
    expect(a).toEqual(b)
  })

  it('produces different fingerprints across distinct slugs (most of the time)', () => {
    // Pick a handful of slugs and confirm we do not collapse all to one tweak.
    const slugs = [
      'a',
      'b',
      'oval',
      'rainbow',
      'twin-peaks',
      'figure-8',
      'mountain-pass',
      'race-04',
    ]
    const tweaks = slugs.map(personalizeForSlug)
    const distinctRoots = new Set(tweaks.map((t) => t.rootMidiOffset))
    const distinctScales = new Set(tweaks.map((t) => t.scaleFlavor))
    const distinctBpms = new Set(tweaks.map((t) => t.bpmOffset))
    // Eight slugs across three menus that have 3-8 entries each should
    // exercise more than one option in every dimension.
    expect(distinctRoots.size).toBeGreaterThan(1)
    expect(distinctScales.size).toBeGreaterThan(1)
    expect(distinctBpms.size).toBeGreaterThan(1)
  })
})

describe('personalizationEquals', () => {
  const a: MusicPersonalization = {
    rootMidiOffset: 2,
    scaleFlavor: 'dorian',
    bpmOffset: 4,
  }

  it('returns true for identical objects', () => {
    expect(personalizationEquals(a, a)).toBe(true)
  })

  it('returns true for distinct objects with matching values', () => {
    expect(personalizationEquals(a, { ...a })).toBe(true)
  })

  it('returns true for null vs null', () => {
    expect(personalizationEquals(null, null)).toBe(true)
  })

  it('returns false when one side is null', () => {
    expect(personalizationEquals(a, null)).toBe(false)
    expect(personalizationEquals(null, a)).toBe(false)
  })

  it('returns false on any field mismatch', () => {
    expect(personalizationEquals(a, { ...a, rootMidiOffset: 0 })).toBe(false)
    expect(personalizationEquals(a, { ...a, scaleFlavor: 'minor' })).toBe(false)
    expect(personalizationEquals(a, { ...a, bpmOffset: 0 })).toBe(false)
  })
})
