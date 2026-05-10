import type { TrackBiome } from './biomes'
import type { TimeOfDay } from './lighting'
import type { Weather } from './weather'
import {
  ALL_DERBY_VEHICLES,
  derbyVehicleCanonical,
} from './derbyVehicles'
import type { DerbyArenaSlug } from './schemas'

// Derby arena catalog. v1 ships one arena (dust-bowl). Each arena is a closed
// disk with a perimeter wall, lit and skyboxed via the existing biome /
// weather / timeOfDay pipeline. Arena geometry lives outside the piece-grid
// track system: the disk + wall is built directly in src/game/derbyArena.ts
// (slice 5) so the loop and drag track schemas stay clean.

export type DerbyArenaSurface = 'dirt'

export interface DerbyArenaConfig {
  slug: DerbyArenaSlug
  displayName: string
  // Arena radius in world units. Cars are constrained inside this disk.
  radius: number
  surface: DerbyArenaSurface
  biome: TrackBiome
  weather: Weather
  timeOfDay: TimeOfDay
  // Hard cap on round duration. The round ends with outcome 'timeout' when
  // this elapses; remaining cars are ranked by health.
  roundDurationMs: number
  // Number of CPU opponents in this arena. v1 always 3 (player + 3 CPU = 4
  // total) but kept on the arena config so future arenas can scale.
  cpuCount: number
  blurb: string
}

const DUST_BOWL: DerbyArenaConfig = {
  slug: 'dust-bowl',
  displayName: 'Dust Bowl',
  radius: 60,
  surface: 'dirt',
  biome: 'desert',
  weather: 'clear',
  timeOfDay: 'noon',
  roundDurationMs: 180_000,
  cpuCount: 3,
  blurb: 'Sun-baked clay ring. No cover, no escape. Last car wheels-down wins.',
}

export const DERBY_ARENAS: Record<DerbyArenaSlug, DerbyArenaConfig> = {
  'dust-bowl': DUST_BOWL,
}

export const ALL_DERBY_ARENAS: readonly DerbyArenaConfig[] = (
  ['dust-bowl'] as const
).map((s) => DERBY_ARENAS[s])

// Canonical bytes pinned into the start token's configHash. Includes both
// the arena and the entire vehicle catalog so a server-side tuning change
// invalidates in-flight tokens cleanly. Cosmetic fields (displayName, blurb,
// surface, biome, weather, timeOfDay) are excluded so visual polish does not
// retire active tokens.
export function derbyConfigCanonical(arena: DerbyArenaConfig): string {
  return JSON.stringify({
    arena: {
      slug: arena.slug,
      radius: arena.radius,
      roundDurationMs: arena.roundDurationMs,
      cpuCount: arena.cpuCount,
    },
    vehicles: ALL_DERBY_VEHICLES.map(derbyVehicleCanonical),
  })
}
