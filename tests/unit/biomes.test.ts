import { describe, expect, it } from 'vitest'
import {
  TRACK_BIOME_DESCRIPTIONS,
  TRACK_BIOME_LABELS,
  TRACK_BIOME_NAMES,
  TRACK_BIOME_PRESETS,
  getTrackBiomePreset,
  isTrackBiome,
} from '@/lib/biomes'

describe('track biomes', () => {
  it('has labels and descriptions for every biome', () => {
    for (const name of TRACK_BIOME_NAMES) {
      expect(TRACK_BIOME_LABELS[name]).toBeTruthy()
      expect(TRACK_BIOME_DESCRIPTIONS[name]).toBeTruthy()
    }
  })

  it('exposes visually distinct preset values', () => {
    const trackColors = new Set(
      TRACK_BIOME_NAMES.map((name) => TRACK_BIOME_PRESETS[name].trackColor),
    )
    expect(trackColors.size).toBeGreaterThan(2)

    for (const name of TRACK_BIOME_NAMES) {
      const preset = TRACK_BIOME_PRESETS[name]
      expect(preset.groundTintMix).toBeGreaterThanOrEqual(0)
      expect(preset.groundTintMix).toBeLessThanOrEqual(1)
      expect(preset.skyTintMix).toBeGreaterThanOrEqual(0)
      expect(preset.skyTintMix).toBeLessThanOrEqual(1)
      expect(preset.treeDensity).toBeGreaterThanOrEqual(0)
      expect(preset.treeDensity).toBeLessThanOrEqual(1)
      expect(preset.treeFoliage.length).toBeGreaterThan(0)
    }
  })

  it('falls back to the classic forest style when no biome is set', () => {
    const classic = getTrackBiomePreset(null)
    expect(classic.groundColor).toBe(0x6fb26f)
    expect(classic.trackColor).toBe(0x2b2b2b)
  })

  it('returns defensive copies for mutable array fields', () => {
    const a = getTrackBiomePreset('snow')
    const b = getTrackBiomePreset('snow')
    expect(a).toEqual(b)
    expect(a.treeFoliage).not.toBe(b.treeFoliage)

    const classicA = getTrackBiomePreset(null)
    const classicB = getTrackBiomePreset(undefined)
    expect(classicA).toEqual(classicB)
    expect(classicA.treeFoliage).not.toBe(classicB.treeFoliage)
  })

  it('narrows valid biome names', () => {
    expect(isTrackBiome('beach')).toBe(true)
    expect(isTrackBiome('forest')).toBe(false)
  })
})
