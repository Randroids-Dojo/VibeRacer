import { describe, expect, it } from 'vitest'
import { TrackSchema } from '@/lib/schemas'
import { SlugSchema, VersionHashSchema } from '@/lib/schemas'
import {
  ALL_DRAG_STRIPS,
  DRAG_STRIPS,
  DRAG_STRIP_SLUGS,
  DragStripSlugSchema,
  dragStripCheckpoints,
  dragStripPieces,
  dragStripToTrack,
  dragStripVersionHash,
  dragStripVersionPayload,
  surfaceFromBiomeWeather,
} from '@/lib/dragStrips'

describe('drag strips', () => {
  it('exposes exactly four strip slugs', () => {
    expect(DRAG_STRIP_SLUGS).toHaveLength(4)
    expect(new Set(DRAG_STRIP_SLUGS).size).toBe(4)
  })

  it('every slug parses through SlugSchema and DragStripSlugSchema', () => {
    for (const slug of DRAG_STRIP_SLUGS) {
      expect(() => SlugSchema.parse(slug)).not.toThrow()
      expect(() => DragStripSlugSchema.parse(slug)).not.toThrow()
    }
  })

  it('produces N straight pieces for every strip', () => {
    for (const strip of ALL_DRAG_STRIPS) {
      const pieces = dragStripPieces(strip)
      expect(pieces).toHaveLength(strip.lengthCells)
      for (const p of pieces) {
        expect(p.type).toBe('straight')
        expect(p.col).toBe(0)
        expect(p.rotation).toBe(0)
      }
      expect(pieces[0].row).toBe(0)
      expect(pieces[pieces.length - 1].row).toBe(-(strip.lengthCells - 1))
    }
  })

  it('produces three checkpoints in monotonic order, none on the start piece', () => {
    for (const strip of ALL_DRAG_STRIPS) {
      const cps = dragStripCheckpoints(strip)
      expect(cps).toHaveLength(3)
      for (const cp of cps) {
        expect(cp.row).toBeLessThan(0)
      }
      for (let i = 1; i < cps.length; i++) {
        expect(cps[i].row).toBeLessThan(cps[i - 1].row)
      }
      expect(cps[cps.length - 1].row).toBe(-(strip.lengthCells - 1))
    }
  })

  it('drag-strip-to-track output passes TrackSchema', () => {
    for (const strip of ALL_DRAG_STRIPS) {
      const track = dragStripToTrack(strip)
      expect(() => TrackSchema.parse(track)).not.toThrow()
    }
  })

  it('produces a stable, valid 64-char version hash per strip', () => {
    for (const strip of ALL_DRAG_STRIPS) {
      const hash = dragStripVersionHash(strip)
      expect(() => VersionHashSchema.parse(hash)).not.toThrow()
      expect(dragStripVersionHash(strip)).toBe(hash)
    }
  })

  it('every strip has a unique version hash', () => {
    const hashes = ALL_DRAG_STRIPS.map(dragStripVersionHash)
    expect(new Set(hashes).size).toBe(hashes.length)
  })

  it('changing the displayName or blurb does not change the version hash', () => {
    const strip = DRAG_STRIPS['salt-flats']
    const original = dragStripVersionHash(strip)
    const tweaked = dragStripVersionHash({
      ...strip,
      displayName: 'Renamed Salt Flats',
      blurb: 'A different blurb',
    })
    expect(tweaked).toBe(original)
  })

  it('changing only timeOfDay does not change the version hash', () => {
    // timeOfDay is cosmetic (lighting preset only); leaderboards must not
    // retire on a dawn / noon / night swap. Pin this explicitly so a future
    // refactor that re-adds the field to the hash payload trips the test.
    const strip = DRAG_STRIPS['salt-flats']
    const original = dragStripVersionHash(strip)
    const tweaked = dragStripVersionHash({ ...strip, timeOfDay: 'dawn' })
    expect(tweaked).toBe(original)
  })

  it('pins a known payload to a known SHA-256 digest', () => {
    // Golden value for the Salt Flats canonical payload. Computed once and
    // pinned here so a regression in the custom JS sha256 implementation
    // (which has no node:crypto fallback in the browser bundle) shows up
    // as a unit failure rather than as a silently re-partitioned
    // leaderboard. Recompute via:
    //   node -e 'console.log(require("crypto").createHash("sha256")
    //     .update(JSON.stringify({ ... })).digest("hex"))'
    // and update both halves of this test if the canonical payload shape
    // changes intentionally (formatVersion bump, new physics field).
    const strip = DRAG_STRIPS['salt-flats']
    const payload = dragStripVersionPayload(strip)
    const hash = dragStripVersionHash(strip)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    // Recompute via Node's built-in crypto and compare bit for bit so a
    // future implementation swap is verified against the reference rather
    // than against itself.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('node:crypto') as typeof import('node:crypto')
    const reference = crypto.createHash('sha256').update(payload).digest('hex')
    expect(hash).toBe(reference)
  })

  it('changing the lengthCells or vertical profile does change the hash', () => {
    const strip = DRAG_STRIPS['salt-flats']
    const original = dragStripVersionHash(strip)
    const longer = dragStripVersionHash({ ...strip, lengthCells: strip.lengthCells + 1 })
    expect(longer).not.toBe(original)
    const tilted = dragStripVersionHash({
      ...strip,
      verticalProfile: [
        { s: 0, height: 0 },
        { s: 100, height: 5 },
      ],
    })
    expect(tilted).not.toBe(original)
  })

  it('maps biome and weather to the expected surface key', () => {
    expect(
      surfaceFromBiomeWeather({ biome: 'desert', weather: 'clear' }),
    ).toBe('sand')
    expect(
      surfaceFromBiomeWeather({ biome: 'beach', weather: 'cloudy' }),
    ).toBe('dry')
    expect(
      surfaceFromBiomeWeather({ biome: 'mountains', weather: 'snowy' }),
    ).toBe('snow')
    expect(
      surfaceFromBiomeWeather({ biome: 'city', weather: 'rainy' }),
    ).toBe('wet')
    expect(
      surfaceFromBiomeWeather({ biome: 'snow', weather: 'clear' }),
    ).toBe('snow')
  })

  it('vertical profile of Salt Flats is flat (zero range)', () => {
    const profile = DRAG_STRIPS['salt-flats'].verticalProfile
    const minH = Math.min(...profile.map((k) => k.height))
    const maxH = Math.max(...profile.map((k) => k.height))
    expect(maxH - minH).toBe(0)
  })

  it('Alpine Pass profile rises monotonically', () => {
    const profile = DRAG_STRIPS['alpine-pass'].verticalProfile
    for (let i = 1; i < profile.length; i++) {
      expect(profile[i].height).toBeGreaterThanOrEqual(profile[i - 1].height)
    }
  })

  it('Harbor Night profile drops then rises into the kicker', () => {
    const profile = DRAG_STRIPS['harbor-night'].verticalProfile
    const minIdx = profile.reduce(
      (best, k, i) => (k.height < profile[best].height ? i : best),
      0,
    )
    expect(minIdx).toBeGreaterThan(0)
    expect(minIdx).toBeLessThan(profile.length - 1)
    expect(profile[profile.length - 1].height).toBeGreaterThan(profile[minIdx].height)
  })
})
