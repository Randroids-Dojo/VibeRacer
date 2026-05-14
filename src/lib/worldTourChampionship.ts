/**
 * Pure types and helpers for the World Tour championship data. The actual
 * championship constants (one bundled championship `world-tour-standard`
 * with one tour `velvet-coast`) live in `src/data/worldTourChampionship.ts`.
 *
 * A `Championship` is an ordered list of `Tour`s; the tour order is
 * the unlock order. A `Tour` declares its four track ids (the four
 * races the player runs in order), an aggregate `requiredStanding`
 * the player must meet across the four races to pass and unlock the
 * next tour, an `aiDriverIds` roster (length must equal
 * `tour.fieldSize - 1`), and a `region` color theme. Velvet Coast
 * (the opener) runs at `FIELD_SIZE_MVP = 4`; the rest of the tours
 * run at `FIELD_SIZE_FULL = 12` (3 lanes by 4 rows).
 *
 * Pure functions only. No localStorage, no IO, no Date.now, no
 * Math.random. Same inputs always produce deep-equal outputs.
 */

// MVP field size: player plus three AI opponents. Velvet Coast (the
// opener) ships at this size to keep the launch tutorial mellow.
// Keep the constant in this module so the race-session and grid-spawn
// code can size their arrays without hard-coding a literal.
export const FIELD_SIZE_MVP = 4

// Full grid: player plus eleven AI opponents (3 lanes by 4 rows).
// Tours 2 and onward use this size.
export const FIELD_SIZE_FULL = 12

/**
 * A single AI driver entry. The driver is referenced by id from every
 * `Tour.aiDriverIds` that uses it. `name` is the display label on the
 * pre-race grid and the in-race standings panel. `color` is the car-
 * paint hex string the renderer picks for that opponent.
 */
export interface AiDriver {
  id: string
  name: string
  color: string
}

/**
 * Weather tag the tour applies to every race. Each tour pins one
 * per tour. Velvet Coast is clear; later tours pick from cloudy,
 * rainy, and snow. The value is a free-form string here; the
 * renderer resolves it via the existing weather table.
 */
export type TourWeather = 'clear' | 'cloudy' | 'rainy' | 'snow'

/**
 * Region color theme the tour-card and race intro card use. The exact
 * palette is up to the renderer; this module just carries the three
 * named hex strings.
 */
export interface TourRegionTheme {
  primary: string
  secondary: string
  accent: string
}

/**
 * One tour inside a championship. The tour's four `trackIds` are run in
 * order; the player must place at or above `requiredStanding` in the
 * aggregate-points standings after race four to pass. The `aiDriverIds`
 * roster fills out the rest of the grid; its length plus the player must
 * equal `fieldSize`.
 */
export interface Tour {
  id: string
  name: string
  region: string
  theme: TourRegionTheme
  weather: TourWeather
  requiredStanding: number
  fieldSize: number
  trackIds: string[]
  aiDriverIds: string[]
}

/**
 * A full championship. The first entry in `tours` is the opener; every
 * subsequent entry is unlocked by passing the prior one.
 */
export interface Championship {
  id: string
  name: string
  tours: Tour[]
  drivers: AiDriver[]
}

/**
 * Find a tour by id. Returns `null` when the id is unknown so callers do
 * not have to remember whether the underlying store throws.
 */
export function findTour(
  championship: Championship,
  tourId: string,
): Tour | null {
  for (const t of championship.tours) {
    if (t.id === tourId) return t
  }
  return null
}

/**
 * Return the tour that follows `tourId` in the championship order, or
 * `null` when `tourId` is the final tour (or is not in the championship
 * at all).
 */
export function nextTourOf(
  championship: Championship,
  tourId: string,
): Tour | null {
  const idx = championship.tours.findIndex((t) => t.id === tourId)
  if (idx < 0) return null
  if (idx >= championship.tours.length - 1) return null
  return championship.tours[idx + 1] ?? null
}

/**
 * Validate the championship data is internally consistent: every tour's
 * AI roster references a known driver id, every roster has exactly
 * `fieldSize - 1` entries, every tour has exactly four tracks, and every
 * tour id is unique. Returns a `{ ok: true }` discriminant on success or
 * a `{ ok: false, errors }` list on failure. Used at startup and at
 * test-time to catch bad data before the race scene tries to spawn a
 * grid against it.
 */
export function validateChampionship(
  championship: Championship,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const seenTourIds = new Set<string>()
  const driverIds = new Set(championship.drivers.map((d) => d.id))
  for (const tour of championship.tours) {
    if (seenTourIds.has(tour.id)) {
      errors.push(`duplicate tour id: ${tour.id}`)
    }
    seenTourIds.add(tour.id)
    if (tour.trackIds.length !== 4) {
      errors.push(
        `tour ${tour.id} has ${tour.trackIds.length} tracks (expected 4)`,
      )
    }
    if (tour.aiDriverIds.length !== tour.fieldSize - 1) {
      errors.push(
        `tour ${tour.id} has ${tour.aiDriverIds.length} ai drivers for a field of ${tour.fieldSize} (expected ${tour.fieldSize - 1})`,
      )
    }
    if (tour.requiredStanding < 1 || tour.requiredStanding > tour.fieldSize) {
      errors.push(
        `tour ${tour.id} requiredStanding ${tour.requiredStanding} is out of range for a field of ${tour.fieldSize}`,
      )
    }
    for (const did of tour.aiDriverIds) {
      if (!driverIds.has(did)) {
        errors.push(`tour ${tour.id} references unknown ai driver: ${did}`)
      }
    }
  }
  if (errors.length === 0) return { ok: true }
  return { ok: false, errors }
}

/**
 * Resolve every AI driver id in a tour to its full driver record.
 * Returns `null` when any id is unknown (the championship is misshaped).
 */
export function tourDrivers(
  championship: Championship,
  tour: Tour,
): AiDriver[] | null {
  const out: AiDriver[] = []
  const byId = new Map(championship.drivers.map((d) => [d.id, d]))
  for (const did of tour.aiDriverIds) {
    const driver = byId.get(did)
    if (!driver) return null
    out.push(driver)
  }
  return out
}
