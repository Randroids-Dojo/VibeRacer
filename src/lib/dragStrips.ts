import { createHash } from 'node:crypto'
import { z } from 'zod'
import { CELL_SIZE } from '@/game/cellSize'
import {
  TrackBiomeSchema,
  type Piece,
  type Track,
  type TrackCheckpoint,
  type VersionHash,
} from './schemas'
import { TimeOfDaySchema, type TimeOfDay } from './lighting'
import { WeatherSchema, type Weather } from './weather'
import type { TrackBiome } from './biomes'
import {
  verticalProfileFromNormalized,
  type VerticalProfile,
} from '@/game/dragVerticalProfile'
import type { SurfaceKey } from './dragParts'

// Drag racing strip catalog. Four predefined strips, each a chain of straight
// pieces in the (row, col) grid plus a vertical profile that gives the strip
// its visible hill shape. The vertical profile lives only on this config: it
// is not part of the persisted Track schema, so closed-loop tracks and their
// leaderboards remain entirely unaffected. Each strip's own leaderboard is
// keyed by `kvKeys.leaderboard(slug, dragStripVersionHash(strip))`; tweaking
// any stable field of the config (length, biome, weather, profile keyframes)
// rotates the version hash and retires the prior board cleanly. Cosmetic
// fields are excluded from the hash so visual polish does not wipe times.

export const DRAG_STRIP_SLUGS = [
  'salt-flats',
  'coastal-strip',
  'alpine-pass',
  'harbor-night',
] as const

export const DragStripSlugSchema = z.enum(DRAG_STRIP_SLUGS)
export type DragStripSlug = z.infer<typeof DragStripSlugSchema>

const DRAG_STRIP_FORMAT_VERSION = 1

export interface DragStripConfig {
  slug: DragStripSlug
  displayName: string
  // Number of cells along the strip. The strip is laid out at column 0 with
  // rows 0 through -(lengthCells - 1); pieces[0] is the start piece. Each
  // cell is CELL_SIZE world units; the world length is lengthCells * CELL_SIZE.
  lengthCells: number
  biome: TrackBiome
  weather: Weather
  timeOfDay: TimeOfDay
  // Vertical profile keyframes scaled to the strip's world length. Built from
  // a normalized helper so configs read in fractions of the strip.
  verticalProfile: VerticalProfile
  // Short blurb shown on the strip card.
  blurb: string
}

function stripWorldLength(lengthCells: number): number {
  return lengthCells * CELL_SIZE
}

const SALT_FLATS_LENGTH = 40
const COASTAL_LENGTH = 24
const ALPINE_LENGTH = 30
const HARBOR_LENGTH = 20

const SALT_FLATS_PROFILE = verticalProfileFromNormalized(
  stripWorldLength(SALT_FLATS_LENGTH),
  [
    { sFrac: 0, height: 0 },
    { sFrac: 1, height: 0 },
  ],
)

const COASTAL_PROFILE = verticalProfileFromNormalized(
  stripWorldLength(COASTAL_LENGTH),
  [
    { sFrac: 0, height: 0 },
    { sFrac: 0.25, height: 2 },
    { sFrac: 0.5, height: 0 },
    { sFrac: 0.75, height: -2 },
    { sFrac: 1, height: 0 },
  ],
)

const ALPINE_PROFILE = verticalProfileFromNormalized(
  stripWorldLength(ALPINE_LENGTH),
  [
    { sFrac: 0, height: 0 },
    { sFrac: 0.5, height: 3 },
    { sFrac: 1, height: 6 },
  ],
)

const HARBOR_PROFILE = verticalProfileFromNormalized(
  stripWorldLength(HARBOR_LENGTH),
  [
    { sFrac: 0, height: 0 },
    { sFrac: 0.85, height: -4 },
    { sFrac: 1, height: -3.6 },
  ],
)

export const DRAG_STRIPS: Record<DragStripSlug, DragStripConfig> = {
  'salt-flats': {
    slug: 'salt-flats',
    displayName: 'Salt Flats Mile',
    lengthCells: SALT_FLATS_LENGTH,
    biome: 'desert',
    weather: 'clear',
    timeOfDay: 'noon',
    verticalProfile: SALT_FLATS_PROFILE,
    blurb: 'Long flat strip baking under midday sun. Top end wins.',
  },
  'coastal-strip': {
    slug: 'coastal-strip',
    displayName: 'Coastal Strip',
    lengthCells: COASTAL_LENGTH,
    biome: 'beach',
    weather: 'cloudy',
    timeOfDay: 'morning',
    verticalProfile: COASTAL_PROFILE,
    blurb: 'Rolling dunes on a damp morning. Torque and rebound matter.',
  },
  'alpine-pass': {
    slug: 'alpine-pass',
    displayName: 'Alpine Pass',
    lengthCells: ALPINE_LENGTH,
    biome: 'mountains',
    weather: 'snowy',
    timeOfDay: 'dawn',
    verticalProfile: ALPINE_PROFILE,
    blurb: 'Steady climb through snowfall. Save weight, gear short.',
  },
  'harbor-night': {
    slug: 'harbor-night',
    displayName: 'Harbor Night Run',
    lengthCells: HARBOR_LENGTH,
    biome: 'city',
    weather: 'rainy',
    timeOfDay: 'night',
    verticalProfile: HARBOR_PROFILE,
    blurb: 'Wet downhill through the docks with a kicker before the line.',
  },
}

export function dragStripPieces(strip: DragStripConfig): Piece[] {
  const pieces: Piece[] = []
  for (let i = 0; i < strip.lengthCells; i++) {
    pieces.push({
      type: 'straight',
      row: i === 0 ? 0 : -i,
      col: 0,
      rotation: 0,
    })
  }
  return pieces
}

export function dragStripCheckpoints(
  strip: DragStripConfig,
): TrackCheckpoint[] {
  const last = strip.lengthCells - 1
  // Three checkpoints: a 60ft-equivalent split near the start, a midpoint
  // split, and the finish. None can land on the start piece (row 0). Indices
  // are clamped so very short strips still produce three distinct rows.
  const sixtyFt = Math.max(2, Math.min(last - 2, 2))
  const midpoint = Math.max(sixtyFt + 1, Math.floor(last / 2))
  const finish = last
  return [
    { row: -sixtyFt, col: 0 },
    { row: -midpoint, col: 0 },
    { row: -finish, col: 0 },
  ]
}

export function dragStripToTrack(strip: DragStripConfig): Track {
  return {
    pieces: dragStripPieces(strip),
    checkpoints: dragStripCheckpoints(strip),
    biome: strip.biome,
    mood: {
      timeOfDay: strip.timeOfDay,
      weather: strip.weather,
    },
  }
}

export function dragStripVersionHash(strip: DragStripConfig): VersionHash {
  // Hash only stable fields. Display strings and blurb are excluded so a copy
  // edit does not retire the leaderboard. The vertical profile keyframes ARE
  // included because changing them changes the physics and rendering of the
  // strip and therefore changes what a posted time means.
  const payload = {
    formatVersion: DRAG_STRIP_FORMAT_VERSION,
    slug: strip.slug,
    lengthCells: strip.lengthCells,
    biome: strip.biome,
    weather: strip.weather,
    timeOfDay: strip.timeOfDay,
    verticalProfile: strip.verticalProfile.map((k) => ({
      s: k.s,
      height: k.height,
    })),
  }
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

// Pick the surface key the tire affinity table is keyed by, given the strip's
// biome and weather. A drag tire's per-surface multiplier is then looked up
// against this key. The mapping is intentionally simple: weather wins when it
// is decisive (rain implies wet, snow implies snow), otherwise the biome
// supplies the fallback (desert -> sand, beach -> dry, others -> dry). Future
// strips can map to other surface keys without expanding the catalog.
export function surfaceFromBiomeWeather(
  strip: Pick<DragStripConfig, 'biome' | 'weather'>,
): SurfaceKey {
  const { biome, weather } = strip
  if (weather === 'rainy' || weather === 'foggy') return 'wet'
  if (weather === 'snowy') return 'snow'
  if (biome === 'desert') return 'sand'
  if (biome === 'snow') return 'snow'
  return 'dry'
}

export const ALL_DRAG_STRIPS: readonly DragStripConfig[] = DRAG_STRIP_SLUGS.map(
  (slug) => DRAG_STRIPS[slug],
)

// Re-export the schemas so route handlers can validate without importing
// from multiple files.
export { TrackBiomeSchema, TimeOfDaySchema, WeatherSchema }
