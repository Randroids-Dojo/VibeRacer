import { z } from 'zod'

export const TRACK_BIOME_NAMES = [
  'snow',
  'desert',
  'beach',
  'mountains',
  'city',
] as const

export const TrackBiomeSchema = z.enum(TRACK_BIOME_NAMES)
export type TrackBiome = z.infer<typeof TrackBiomeSchema>

export const TRACK_BIOME_LABELS: Record<TrackBiome, string> = {
  snow: 'Snow',
  desert: 'Desert',
  beach: 'Beach',
  mountains: 'Mountains',
  city: 'City',
}

export const TRACK_BIOME_DESCRIPTIONS: Record<TrackBiome, string> = {
  snow: 'Cold terrain, pale sky, icy road shoulders, and frosty scenery.',
  desert: 'Warm terrain, dry sky, dusty asphalt, and sparse roadside props.',
  beach: 'Bright sand, coastal sky, sun-bleached road, and relaxed scenery.',
  mountains: 'Cool highland terrain, deeper sky, dark road, and pine colors.',
  city: 'Muted pavement, urban sky, clean asphalt, and construction accents.',
}

export interface TrackBiomePreset {
  groundColor: number
  groundTintMix: number
  skyTintColor: number
  skyTintMix: number
  trackColor: number
  treeFoliage: readonly number[]
  treeTrunk: number
  coneColor: number
  barrierA: number
  barrierB: number
  treeDensity: number
}

const CLASSIC_BIOME: TrackBiomePreset = {
  groundColor: 0x6fb26f,
  groundTintMix: 0,
  skyTintColor: 0x9ad8ff,
  skyTintMix: 0,
  trackColor: 0x2b2b2b,
  treeFoliage: [0x4caf50, 0x66bb6a],
  treeTrunk: 0x6b4423,
  coneColor: 0xff7a1a,
  barrierA: 0xd0241b,
  barrierB: 0xf0f0f0,
  treeDensity: 0.55,
}

export const TRACK_BIOME_PRESETS: Record<TrackBiome, TrackBiomePreset> = {
  snow: {
    groundColor: 0xdde9f0,
    groundTintMix: 0.82,
    skyTintColor: 0xd9e7f7,
    skyTintMix: 0.26,
    trackColor: 0x34383d,
    treeFoliage: [0x2f6b57, 0x4f806e],
    treeTrunk: 0x5c3a24,
    coneColor: 0xff8a28,
    barrierA: 0xb91c1c,
    barrierB: 0xf8fafc,
    treeDensity: 0.46,
  },
  desert: {
    groundColor: 0xc99a52,
    groundTintMix: 0.72,
    skyTintColor: 0xf0c27b,
    skyTintMix: 0.2,
    trackColor: 0x3a3329,
    treeFoliage: [0x637a32, 0x8a8f3c],
    treeTrunk: 0x6f4721,
    coneColor: 0xff6d1a,
    barrierA: 0xc2410c,
    barrierB: 0xfacc15,
    treeDensity: 0.24,
  },
  beach: {
    groundColor: 0xe7d38d,
    groundTintMix: 0.74,
    skyTintColor: 0x87d7ee,
    skyTintMix: 0.22,
    trackColor: 0x3e4246,
    treeFoliage: [0x2e8f63, 0x57b26b],
    treeTrunk: 0x7c4a25,
    coneColor: 0xff8f24,
    barrierA: 0x0ea5e9,
    barrierB: 0xf8fafc,
    treeDensity: 0.34,
  },
  mountains: {
    groundColor: 0x516b4d,
    groundTintMix: 0.62,
    skyTintColor: 0x8aa8c8,
    skyTintMix: 0.18,
    trackColor: 0x25282c,
    treeFoliage: [0x1f5c39, 0x2f6b46],
    treeTrunk: 0x4f341f,
    coneColor: 0xff7a1a,
    barrierA: 0x9ca3af,
    barrierB: 0xf3f4f6,
    treeDensity: 0.64,
  },
  city: {
    groundColor: 0x5f666a,
    groundTintMix: 0.64,
    skyTintColor: 0xa7b0bc,
    skyTintMix: 0.24,
    trackColor: 0x1f2328,
    treeFoliage: [0x3f7f52, 0x5f8f68],
    treeTrunk: 0x4b3425,
    coneColor: 0xff8a00,
    barrierA: 0xfacc15,
    barrierB: 0x111827,
    treeDensity: 0.18,
  },
}

export function getTrackBiomePreset(
  biome: TrackBiome | null | undefined,
): TrackBiomePreset {
  if (biome === undefined || biome === null) {
    return {
      ...CLASSIC_BIOME,
      treeFoliage: [...CLASSIC_BIOME.treeFoliage],
    }
  }
  const preset = TRACK_BIOME_PRESETS[biome]
  return {
    ...preset,
    treeFoliage: [...preset.treeFoliage],
  }
}

export function isTrackBiome(value: unknown): value is TrackBiome {
  return TRACK_BIOME_NAMES.includes(value as TrackBiome)
}
