import { z } from 'zod'
import type { TrackBiome } from './biomes'

export const TRACK_DECORATION_KINDS = [
  'tree',
  'pine',
  'rock',
  'cactus',
  'palm',
  'building',
  'snowPile',
] as const

export const TrackDecorationKindSchema = z.enum(TRACK_DECORATION_KINDS)
export type TrackDecorationKind = z.infer<typeof TrackDecorationKindSchema>

export const TrackDecorationSchema = z
  .object({
    kind: TrackDecorationKindSchema,
    row: z.number().int(),
    col: z.number().int(),
  })
  .strict()
export type TrackDecoration = z.infer<typeof TrackDecorationSchema>

export const MAX_DECORATIONS_PER_TRACK = 48

export const TRACK_DECORATION_LABELS: Record<TrackDecorationKind, string> = {
  tree: 'Tree',
  pine: 'Pine',
  rock: 'Rock',
  cactus: 'Cactus',
  palm: 'Palm',
  building: 'Building',
  snowPile: 'Snow pile',
}

const CLASSIC_DECORATIONS: readonly TrackDecorationKind[] = ['tree', 'rock']

export const TRACK_DECORATION_PALETTES: Record<
  TrackBiome,
  readonly TrackDecorationKind[]
> = {
  snow: ['pine', 'snowPile', 'rock'],
  desert: ['cactus', 'rock'],
  beach: ['palm', 'rock'],
  mountains: ['pine', 'tree', 'rock'],
  city: ['building', 'tree', 'rock'],
}

export function getDecorationPaletteForBiome(
  biome: TrackBiome | null | undefined,
): readonly TrackDecorationKind[] {
  if (biome === null || biome === undefined) return CLASSIC_DECORATIONS
  return TRACK_DECORATION_PALETTES[biome]
}

export function isTrackDecorationKind(
  value: unknown,
): value is TrackDecorationKind {
  return TRACK_DECORATION_KINDS.includes(value as TrackDecorationKind)
}

export function decorationCellKey(
  decoration: Pick<TrackDecoration, 'row' | 'col'>,
): string {
  return `${decoration.row},${decoration.col}`
}
