import { describe, expect, it } from 'vitest'
import {
  MAX_DECORATIONS_PER_TRACK,
  TRACK_DECORATION_KINDS,
  TRACK_DECORATION_LABELS,
  TRACK_DECORATION_PALETTES,
  decorationCellKey,
  getDecorationPaletteForBiome,
  isTrackDecorationKind,
} from '@/lib/decorations'
import { TRACK_BIOME_NAMES } from '@/lib/biomes'

describe('track decorations', () => {
  it('has labels for every decoration kind', () => {
    for (const kind of TRACK_DECORATION_KINDS) {
      expect(TRACK_DECORATION_LABELS[kind]).toMatch(/\S/)
    }
  })

  it('has a positive placement cap', () => {
    expect(MAX_DECORATIONS_PER_TRACK).toBeGreaterThan(0)
  })

  it('returns a biome-specific palette for every biome', () => {
    for (const biome of TRACK_BIOME_NAMES) {
      const palette = getDecorationPaletteForBiome(biome)
      expect(palette).toEqual(TRACK_DECORATION_PALETTES[biome])
      expect(palette.length).toBeGreaterThan(0)
      for (const kind of palette) {
        expect(isTrackDecorationKind(kind)).toBe(true)
      }
    }
  })

  it('falls back to classic forest decorations without a biome', () => {
    expect(getDecorationPaletteForBiome(null)).toEqual(['tree', 'rock'])
    expect(getDecorationPaletteForBiome(undefined)).toEqual(['tree', 'rock'])
  })

  it('narrows valid decoration kinds', () => {
    expect(isTrackDecorationKind('cactus')).toBe(true)
    expect(isTrackDecorationKind('billboard')).toBe(false)
  })

  it('builds stable cell keys', () => {
    expect(decorationCellKey({ row: -2, col: 4 })).toBe('-2,4')
  })
})
