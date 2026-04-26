import { describe, it, expect } from 'vitest'
import {
  BPM_OFFSETS,
  NEUTRAL_PERSONALIZATION,
  ROOT_OFFSETS,
  SCALE_FLAVORS,
  initialsMusicSeed,
  personalizationEquals,
  personalizeForRacer,
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

describe('initialsMusicSeed', () => {
  it('returns 0 for the empty string', () => {
    expect(initialsMusicSeed('')).toBe(0)
  })

  it('returns 0 for whitespace-only input', () => {
    expect(initialsMusicSeed('   ')).toBe(0)
    expect(initialsMusicSeed('\t')).toBe(0)
  })

  it('returns 0 for non-string input (defensive)', () => {
    // @ts-expect-error intentionally passing wrong type
    expect(initialsMusicSeed(undefined)).toBe(0)
    // @ts-expect-error intentionally passing wrong type
    expect(initialsMusicSeed(null)).toBe(0)
    // @ts-expect-error intentionally passing wrong type
    expect(initialsMusicSeed(42)).toBe(0)
  })

  it('is deterministic across calls', () => {
    expect(initialsMusicSeed('RND')).toBe(initialsMusicSeed('RND'))
  })

  it('is case-insensitive (lowercase folds to uppercase)', () => {
    expect(initialsMusicSeed('rnd')).toBe(initialsMusicSeed('RND'))
    expect(initialsMusicSeed('Aaa')).toBe(initialsMusicSeed('AAA'))
  })

  it('returns a non-zero unsigned 32-bit integer for any non-empty initials', () => {
    const tags = ['A', 'AAA', 'RND', 'XYZ', 'MOM', 'TOP']
    for (const t of tags) {
      const h = initialsMusicSeed(t)
      expect(h).toBeGreaterThan(0)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeLessThan(2 ** 32)
    }
  })

  it('is sensitive to single-letter changes', () => {
    expect(initialsMusicSeed('AAA')).not.toBe(initialsMusicSeed('AAB'))
    expect(initialsMusicSeed('XYZ')).not.toBe(initialsMusicSeed('XYA'))
    expect(initialsMusicSeed('ABC')).not.toBe(initialsMusicSeed('ACB'))
  })

  it('trims surrounding whitespace before hashing', () => {
    expect(initialsMusicSeed('  RND  ')).toBe(initialsMusicSeed('RND'))
  })
})

describe('personalizeForRacer', () => {
  it('returns the neutral tweak when both slug and initials are empty', () => {
    expect(personalizeForRacer('', '')).toEqual(NEUTRAL_PERSONALIZATION)
    expect(personalizeForRacer('', null)).toEqual(NEUTRAL_PERSONALIZATION)
    expect(personalizeForRacer('', undefined)).toEqual(NEUTRAL_PERSONALIZATION)
  })

  it('returns a fresh object so callers can mutate without leaking through', () => {
    const a = personalizeForRacer('', '')
    const b = personalizeForRacer('', '')
    expect(a).not.toBe(b)
    expect(a).not.toBe(NEUTRAL_PERSONALIZATION)
  })

  it('falls back to slug-only personalization when initials are missing', () => {
    expect(personalizeForRacer('vibe-circuit', null)).toEqual(
      personalizeForSlug('vibe-circuit'),
    )
    expect(personalizeForRacer('vibe-circuit', '')).toEqual(
      personalizeForSlug('vibe-circuit'),
    )
    expect(personalizeForRacer('vibe-circuit', undefined)).toEqual(
      personalizeForSlug('vibe-circuit'),
    )
  })

  it('always picks values from the published menus', () => {
    const slugs = ['a', 'rainbow', 'race-04', 'longest-slug-name', 'oval', 'M']
    const tags = ['A', 'AAA', 'RND', 'XYZ', 'MOM']
    for (const slug of slugs) {
      for (const tag of tags) {
        const p = personalizeForRacer(slug, tag)
        expect(ROOT_OFFSETS).toContain(p.rootMidiOffset)
        expect(SCALE_FLAVORS).toContain(p.scaleFlavor)
        expect(BPM_OFFSETS).toContain(p.bpmOffset)
      }
    }
  })

  it('is deterministic for the same (slug, initials) pair', () => {
    const a = personalizeForRacer('vibe-circuit', 'RND')
    const b = personalizeForRacer('vibe-circuit', 'RND')
    expect(a).toEqual(b)
  })

  it('is case-insensitive on initials', () => {
    const a = personalizeForRacer('vibe-circuit', 'rnd')
    const b = personalizeForRacer('vibe-circuit', 'RND')
    expect(a).toEqual(b)
  })

  it('produces a different fingerprint when initials change on the same slug (most of the time)', () => {
    const slug = 'oval'
    const tags = ['AAA', 'BBB', 'RND', 'XYZ', 'MOM', 'TOP', 'CAT', 'DOG']
    const tweaks = tags.map((t) => personalizeForRacer(slug, t))
    const distinctRoots = new Set(tweaks.map((t) => t.rootMidiOffset))
    const distinctScales = new Set(tweaks.map((t) => t.scaleFlavor))
    const distinctBpms = new Set(tweaks.map((t) => t.bpmOffset))
    // Eight tags across three menus that hold 3-8 entries each should
    // exercise more than one option in every dimension.
    expect(distinctRoots.size).toBeGreaterThan(1)
    expect(distinctScales.size).toBeGreaterThan(1)
    expect(distinctBpms.size).toBeGreaterThan(1)
  })

  it('produces a different fingerprint when slug changes for the same initials (most of the time)', () => {
    const tag = 'RND'
    const slugs = [
      'oval',
      'rainbow',
      'twin-peaks',
      'figure-8',
      'mountain-pass',
      'race-04',
      'sandbox',
      'start',
    ]
    const tweaks = slugs.map((s) => personalizeForRacer(s, tag))
    const distinctRoots = new Set(tweaks.map((t) => t.rootMidiOffset))
    const distinctScales = new Set(tweaks.map((t) => t.scaleFlavor))
    const distinctBpms = new Set(tweaks.map((t) => t.bpmOffset))
    expect(distinctRoots.size).toBeGreaterThan(1)
    expect(distinctScales.size).toBeGreaterThan(1)
    expect(distinctBpms.size).toBeGreaterThan(1)
  })

  it('typically picks a different fingerprint than the slug-only personalization for the same slug', () => {
    // The slug+initials seed is a XOR of the rotated slug seed with the
    // initials seed, so it almost always lands on a different tweak than
    // the slug-only path. A handful of (slug, initials) pairs may collide
    // by chance; this test confirms that the majority diverge.
    const cases: Array<[string, string]> = [
      ['oval', 'RND'],
      ['rainbow', 'XYZ'],
      ['twin-peaks', 'CAT'],
      ['mountain-pass', 'MOM'],
      ['race-04', 'TOP'],
      ['sandbox', 'AAA'],
      ['figure-8', 'BBB'],
      ['start', 'DOG'],
    ]
    let diverged = 0
    for (const [slug, tag] of cases) {
      const slugOnly = personalizeForSlug(slug)
      const racer = personalizeForRacer(slug, tag)
      if (!personalizationEquals(slugOnly, racer)) diverged += 1
    }
    expect(diverged).toBeGreaterThan(cases.length / 2)
  })

  it('handles the edge case where slug and initials seeds would XOR to zero', () => {
    // Hard to construct synthetically without knowing the FNV hashes; the
    // helper guards against the zero-after-XOR case by OR-ing in a small
    // constant. We exercise the guard by checking that no real (slug, tag)
    // pair returns the neutral tweak (the only thing the zero short-circuit
    // would produce).
    const cases: Array<[string, string]> = [
      ['oval', 'RND'],
      ['rainbow', 'XYZ'],
      ['twin-peaks', 'CAT'],
    ]
    for (const [slug, tag] of cases) {
      const p = personalizeForRacer(slug, tag)
      expect(p).not.toEqual(NEUTRAL_PERSONALIZATION)
    }
  })
})
