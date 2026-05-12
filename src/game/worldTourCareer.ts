/**
 * World Tour career save schema. The career save is the player's persistent
 * progression through the World Tour championship: money, owned cars, active
 * car, completed tours, unlocked tours, and the current in-progress tour
 * cursor.
 *
 * Pure helpers only. The storage wrapper (localStorage round-trip,
 * CustomEvent dispatch) lives in `src/lib/worldTourCareerStorage.ts` so this
 * module can be unit tested without a DOM. Every public function returns a
 * fresh value so callers can route results straight to React state without
 * aliasing a shared default.
 *
 * Migrations are forward-only and accumulate in `migrateCareer`. Bump
 * `CAREER_SCHEMA_VERSION` whenever the shape changes; never break a v1
 * save. The car id `starter` is the seed car a fresh career starts with;
 * tour `velvet-coast` is the first unlocked tour.
 */

export const CAREER_SCHEMA_VERSION = 1 as const

// Starting cash for a fresh career. Tuned to be enough to repair after a
// bad first race but not enough to buy a tier 1 upgrade outright, so the
// player has to earn purse money before progressing the car.
export const CAREER_STARTING_MONEY = 1000

// The seed car every player starts with. The car-spec table lives in the
// championship data module; this constant is the id contract.
export const CAREER_STARTING_CAR_ID = 'starter'

// The first unlocked tour. A fresh career has exactly this id in both
// `unlockedTourIds` and as the only available tour to enter.
export const CAREER_FIRST_TOUR_ID = 'velvet-coast'

/**
 * A single race result inside an in-progress tour. `placement` is 1-indexed
 * (1 = winner). `dnf` is true when the player did not finish (wreck, off-
 * track timeout, or no-progress timeout). `cashEarned` is the purse for
 * that race, including any tour-completion bonus when this is the final
 * race of a tour.
 */
export interface TourRaceResult {
  trackId: string
  placement: number
  dnf: boolean
  cashEarned: number
}

/**
 * The in-progress tour cursor. Present while the player is partway through
 * a tour. Cleared on tour completion (pass OR fail) so the player can pick
 * the next tour from the selection screen. `raceIndex` is 0-based and
 * points at the NEXT race to play (so a fresh `activeTour` has `raceIndex
 * = 0` and `results.length === 0`; a fully complete tour has `raceIndex =
 * 4` and `results.length === 4`).
 */
export interface ActiveTour {
  tourId: string
  raceIndex: number
  results: TourRaceResult[]
}

/**
 * The full career save. Versioned for forward-only migrations. All array
 * fields are deduped and the cursor (`activeTour`) is either a fully
 * populated object or `null`; intermediate states are not representable.
 *
 * `activeCarDamage` is the post-race damage on the currently active car,
 * in [0, 1]. Phase 5b generalizes this to a `damageByCarId` map; for the
 * MVP we only track the one car so the storage cost is a single number.
 */
export interface WorldTourCareer {
  version: typeof CAREER_SCHEMA_VERSION
  money: number
  ownedCarIds: string[]
  activeCarId: string
  activeCarDamage: number
  completedTourIds: string[]
  unlockedTourIds: string[]
  activeTour: ActiveTour | null
}

/**
 * Build a fresh career. Returns a NEW object each call (no shared
 * reference) so callers can mutate the result without poisoning the next
 * default. Use this when the storage layer cannot find a save, when a
 * stored save fails schema validation, or when the player explicitly
 * resets their career.
 */
export function defaultCareer(): WorldTourCareer {
  return {
    version: CAREER_SCHEMA_VERSION,
    money: CAREER_STARTING_MONEY,
    ownedCarIds: [CAREER_STARTING_CAR_ID],
    activeCarId: CAREER_STARTING_CAR_ID,
    activeCarDamage: 0,
    completedTourIds: [],
    unlockedTourIds: [CAREER_FIRST_TOUR_ID],
    activeTour: null,
  }
}

/**
 * Deep clone a career save. Used by the reducer (`applyRaceResult`) and
 * the storage layer to guarantee no aliasing between the prior value and
 * the new value. Fresh arrays and a fresh `activeTour` object are
 * produced; the contents of `results` are also cloned so the caller can
 * mutate the returned value freely.
 */
export function cloneCareer(career: WorldTourCareer): WorldTourCareer {
  return {
    version: career.version,
    money: career.money,
    ownedCarIds: [...career.ownedCarIds],
    activeCarId: career.activeCarId,
    activeCarDamage: career.activeCarDamage,
    completedTourIds: [...career.completedTourIds],
    unlockedTourIds: [...career.unlockedTourIds],
    activeTour:
      career.activeTour === null
        ? null
        : {
            tourId: career.activeTour.tourId,
            raceIndex: career.activeTour.raceIndex,
            results: career.activeTour.results.map((r) => ({ ...r })),
          },
  }
}

function isFiniteNonNegativeNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

function sanitizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  for (const v of raw) {
    if (isNonEmptyString(v)) seen.add(v)
  }
  return Array.from(seen)
}

function sanitizeRaceResult(raw: unknown): TourRaceResult | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (!isNonEmptyString(r.trackId)) return null
  const placement = typeof r.placement === 'number' ? Math.floor(r.placement) : NaN
  if (!Number.isFinite(placement) || placement < 1) return null
  const dnf = r.dnf === true
  const cashEarned = isFiniteNonNegativeNumber(r.cashEarned)
    ? Math.floor(r.cashEarned)
    : 0
  return { trackId: r.trackId, placement, dnf, cashEarned }
}

function sanitizeActiveTour(raw: unknown): ActiveTour | null {
  if (typeof raw !== 'object' || raw === null) return null
  const t = raw as Record<string, unknown>
  if (!isNonEmptyString(t.tourId)) return null
  const raceIndex =
    typeof t.raceIndex === 'number' ? Math.floor(t.raceIndex) : NaN
  if (!Number.isFinite(raceIndex) || raceIndex < 0) return null
  const results = Array.isArray(t.results)
    ? (t.results
        .map(sanitizeRaceResult)
        .filter((v): v is TourRaceResult => v !== null))
    : []
  return { tourId: t.tourId, raceIndex, results }
}

/**
 * Forward-only migration from any stored shape to the current
 * `WorldTourCareer`. Returns a fresh object. A wholly unrecognized payload
 * yields `defaultCareer()`. Add new cases at the END (never re-order) so
 * older saves keep migrating through the same path.
 */
export function migrateCareer(raw: unknown): WorldTourCareer {
  if (typeof raw !== 'object' || raw === null) return defaultCareer()
  const r = raw as Record<string, unknown>
  // v1 is the only shape we know today. The version field is loose: a save
  // missing the field is treated as v1 (it could be a hand-edited payload).
  const seed = defaultCareer()
  const money = isFiniteNonNegativeNumber(r.money) ? Math.floor(r.money) : seed.money
  const activeCarDamage = isFiniteNonNegativeNumber(r.activeCarDamage)
    ? Math.min(1, r.activeCarDamage)
    : 0
  const ownedCarIds = sanitizeStringArray(r.ownedCarIds)
  const completedTourIds = sanitizeStringArray(r.completedTourIds)
  const unlockedTourIds = sanitizeStringArray(r.unlockedTourIds)
  const activeTour = sanitizeActiveTour(r.activeTour)
  // The active car must be in the owned list. If neither is valid, fall
  // back to the seed car to avoid an "I own no cars" state that would
  // soft-lock the career.
  let owned = ownedCarIds.length > 0 ? ownedCarIds : seed.ownedCarIds.slice()
  let activeCarId = isNonEmptyString(r.activeCarId) ? r.activeCarId : owned[0]!
  if (!owned.includes(activeCarId)) {
    owned = [activeCarId, ...owned]
  }
  // The first tour is always unlocked. A save that lost it (corruption or
  // a future migration that dropped the array) gets it back so the player
  // can always at least replay the opener.
  const unlocked = unlockedTourIds.includes(CAREER_FIRST_TOUR_ID)
    ? unlockedTourIds
    : [CAREER_FIRST_TOUR_ID, ...unlockedTourIds]
  return {
    version: CAREER_SCHEMA_VERSION,
    money,
    ownedCarIds: owned,
    activeCarId,
    activeCarDamage,
    completedTourIds,
    unlockedTourIds: unlocked,
    activeTour,
  }
}

/**
 * True when the career has an in-progress tour the player can resume.
 * Used by the home-page tile and the tour-selection screen to decide
 * whether the primary CTA is "Resume tour" or "Start tour".
 */
export function hasActiveTour(career: WorldTourCareer): boolean {
  return career.activeTour !== null
}

/**
 * True when the player has cleared every tour they have unlocked. A
 * convenience helper for the home-page tile. Returns false on a fresh
 * career (one tour unlocked, none completed).
 */
export function isCareerComplete(
  career: WorldTourCareer,
  allTourIds: readonly string[],
): boolean {
  if (allTourIds.length === 0) return false
  for (const id of allTourIds) {
    if (!career.completedTourIds.includes(id)) return false
  }
  return true
}
