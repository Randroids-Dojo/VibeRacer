/**
 * World Tour race result builder. Converts a finished
 * `RaceSessionState` into the result payload the results page and the
 * career reducer consume.
 *
 * Pure: no IO, no Date.now, no Math.random.
 *
 * Placement points and tour-completion bonuses follow the World Tour
 * plan ("§7 placement points; tour-completion bonus on the final race
 * of a passed tour"). The numbers are tunable at the top of this file
 * so the §15 economy work can rebalance them without touching the
 * shape.
 */

import {
  findTour,
  nextTourOf,
  type Championship,
  type Tour,
} from '@/lib/worldTourChampionship'
import type { RaceSessionState } from './worldTourRaceSession'
import { finishingStandings } from './worldTourRaceSession'
import type { TourRaceResult, WorldTourCareer } from './worldTourCareer'

/**
 * Placement points by 0-indexed finishing position. Index 0 (winner)
 * gets 10, then 7, 5, 3, etc. A car outside the array scores 0; the
 * table currently runs to 8 places, which covers the 12-car grid for
 * scoring even though the bottom four cars earn nothing.
 */
export const PLACEMENT_POINTS: number[] = [10, 7, 5, 3, 2, 1, 1, 1]

/**
 * Cash purse by 0-indexed placement. Mirrors the TG2-style "even a
 * losing finish pays" rule from the plan so the player can grind a
 * single tour to fund upgrades.
 */
export const PLACEMENT_PURSE: number[] = [500, 350, 250, 150, 100, 75, 50, 25]

/**
 * Tour-completion bonus paid when the player passes a tour on the
 * final race. Flat across every tour today; a future balancing pass
 * may scale this per tour difficulty.
 */
export const TOUR_COMPLETION_BONUS = 1000

/**
 * Look up the points awarded for a placement. Defensive against an
 * out-of-range placement (DNF or a degenerate field).
 */
export function placementPoints(placement: number): number {
  if (!Number.isFinite(placement) || placement < 1) return 0
  const idx = Math.floor(placement) - 1
  return PLACEMENT_POINTS[idx] ?? 0
}

/**
 * Look up the purse paid for a placement. Same defensive shape as
 * `placementPoints`.
 */
export function placementPurse(placement: number): number {
  if (!Number.isFinite(placement) || placement < 1) return 0
  const idx = Math.floor(placement) - 1
  return PLACEMENT_PURSE[idx] ?? 0
}

/**
 * One finished car as reported in the race result. The renderer uses
 * this to render the finishing-order table; the career reducer uses
 * the player's entry to update the save.
 */
export interface RaceStandingEntry {
  carIndex: number
  isPlayer: boolean
  driverId: string | null
  carId: string
  placement: number
  dnf: boolean
  points: number
  cashEarned: number
}

/**
 * Tour progress payload attached to the race result. Drives the
 * results-page CTA: continue to the next race, return to the tour
 * selection screen on a pass, or show the failure summary.
 */
export interface TourProgressPayload {
  tourId: string
  raceIndex: number
  // The next race index to play, or null when this was the final race.
  nextRaceIndex: number | null
  // True only once every race in the tour is logged. Stays false for
  // mid-tour races so the results page renders the "continue" CTA
  // without prematurely showing a tour summary.
  completed: boolean
  // True when the tour passed the required-standing gate. Null mid-
  // tour; non-null only on a completed tour.
  passed: boolean | null
  // The player's aggregate placement after race 4, 1-indexed. Null
  // mid-tour.
  playerStanding: number | null
}

export interface RaceResult {
  trackId: string
  totalLaps: number
  finishingOrder: RaceStandingEntry[]
  playerPlacement: number
  playerDnf: boolean
  pointsEarned: number
  cashBaseEarned: number
  bonusEarned: number
  cashEarned: number
  // Player's car damage at the end of the race, in [0, 1]. The tour-
  // progress reducer writes this back to the career so the garage page
  // can show the right repair cost.
  playerDamage: number
  tourProgress: TourProgressPayload
  // The next race in the tour, or null on the final race. Lets the
  // results-page CTA route straight to the next race without re-
  // resolving the championship.
  nextRace: { tourId: string; raceIndex: number; trackId: string } | null
}

export interface BuildRaceResultInput {
  readonly finalState: RaceSessionState
  readonly career: WorldTourCareer
  readonly championship: Championship
  readonly tourId: string
  readonly trackIndex: number
  readonly playerCarId: string
}

/**
 * Build the race result payload. Aggregates the per-car standings,
 * computes points and purse, and attaches the tour progress payload so
 * the results page can render the right CTA without re-querying the
 * career.
 */
export function buildRaceResult(
  input: BuildRaceResultInput,
): RaceResult {
  const tour = findTour(input.championship, input.tourId)
  if (!tour) {
    throw new Error(`unknown tour: ${input.tourId}`)
  }
  const trackId =
    tour.trackIds[input.trackIndex] ??
    (() => {
      throw new Error(
        `track index ${input.trackIndex} out of range for tour ${tour.id}`,
      )
    })()
  const standings = buildStandings(input.finalState)
  const playerEntry = standings.find((e) => e.isPlayer) ?? null
  // The player is always car index 0 in the grid. The defensive
  // fallback to a synthetic DNF entry keeps the downstream payload
  // valid even if a corrupt state lost the player.
  const playerPlacement = playerEntry?.placement ?? standings.length
  const playerDnf = playerEntry?.dnf ?? true
  const pointsEarned = playerEntry?.points ?? 0
  const cashBaseEarned = playerEntry?.cashEarned ?? 0

  const isFinalRace = input.trackIndex === tour.trackIds.length - 1
  let bonusEarned = 0
  let tourCompleted = false
  let passed: boolean | null = null
  let playerStanding: number | null = null

  if (isFinalRace) {
    tourCompleted = true
    const aggregate = aggregatePoints({
      career: input.career,
      tour,
      finalRaceStandings: standings,
    })
    playerStanding = aggregate.playerStanding
    passed = playerStanding <= tour.requiredStanding
    if (passed) bonusEarned = TOUR_COMPLETION_BONUS
  }

  const cashEarned = cashBaseEarned + bonusEarned

  // Surface the player's post-race damage so the tour-progress reducer
  // can write it back to the career. The race-session always carries
  // the player at car index 0.
  const playerCar = input.finalState.cars[0]
  const playerDamage =
    playerCar && Number.isFinite(playerCar.damage)
      ? Math.min(1, Math.max(0, playerCar.damage))
      : 0

  const next = nextTourOf(input.championship, tour.id)
  const nextRaceIndex = isFinalRace ? null : input.trackIndex + 1
  const nextRace =
    nextRaceIndex !== null
      ? {
          tourId: tour.id,
          raceIndex: nextRaceIndex,
          trackId: tour.trackIds[nextRaceIndex]!,
        }
      : null
  // The next tour (if any) is surfaced through the tour-progress
  // reducer in 1c; this builder only emits the next race inside the
  // current tour.
  void next

  return {
    trackId,
    totalLaps: input.finalState.totalLaps,
    finishingOrder: standings,
    playerPlacement,
    playerDnf,
    pointsEarned,
    cashBaseEarned,
    bonusEarned,
    cashEarned,
    playerDamage,
    tourProgress: {
      tourId: tour.id,
      raceIndex: input.trackIndex,
      nextRaceIndex,
      completed: tourCompleted,
      passed,
      playerStanding,
    },
    nextRace,
  }
}

/**
 * Convert the race-session's finishing order into a typed standings
 * list ready for the results screen.
 */
function buildStandings(state: RaceSessionState): RaceStandingEntry[] {
  const order = finishingStandings(state)
  const out: RaceStandingEntry[] = []
  for (let i = 0; i < order.length; i++) {
    const carIndex = order[i]!
    const car = state.cars[carIndex]
    if (!car) continue
    const placement = i + 1
    const dnf = car.status === 'dnf'
    const points = dnf ? 0 : placementPoints(placement)
    const cashEarned = dnf ? 0 : placementPurse(placement)
    out.push({
      carIndex,
      isPlayer: car.isPlayer,
      driverId: car.driverId,
      carId: car.carId,
      placement,
      dnf,
      points,
      cashEarned,
    })
  }
  return out
}

/**
 * Aggregate placement points across every race in the tour, including
 * the just-finished final race. Resolves the player's standing inside
 * the field. Used by the pass / fail gate on the final race.
 *
 * Every prior race's `entries` carries the full per-car grid (stored
 * by `applyRaceResult`), so AI standings reflect actual race-by-race
 * swings instead of the legacy "project the final race backward"
 * approximation. The map key for the player is the literal
 * `'player'`; AI drivers key on `driverId ?? carId`.
 */
export function aggregatePoints(args: {
  career: WorldTourCareer
  tour: Tour
  finalRaceStandings: RaceStandingEntry[]
}): { playerStanding: number; pointsByCar: Map<string, number> } {
  const PLAYER_KEY = 'player'
  const aiKey = (e: { driverId: string | null; carId: string }): string =>
    e.driverId ?? e.carId

  const prior: TourRaceResult[] =
    args.career.activeTour?.tourId === args.tour.id
      ? args.career.activeTour.results
      : []

  const pointsByCar = new Map<string, number>()

  // Sum every prior race's per-car points. Player entries fold into
  // the literal 'player' key so a player whose driverId is null still
  // accumulates a single row.
  for (const r of prior) {
    for (const e of r.entries) {
      const key = e.isPlayer ? PLAYER_KEY : aiKey(e)
      pointsByCar.set(key, (pointsByCar.get(key) ?? 0) + e.points)
    }
  }

  // Add the just-finished race's standings.
  for (const e of args.finalRaceStandings) {
    const key = e.isPlayer ? PLAYER_KEY : aiKey(e)
    pointsByCar.set(key, (pointsByCar.get(key) ?? 0) + e.points)
  }

  const playerPoints = pointsByCar.get(PLAYER_KEY) ?? 0
  // Resolve the player's standing: count cars with strictly more
  // points and add 1.
  let ahead = 0
  for (const [key, pts] of pointsByCar.entries()) {
    if (key === PLAYER_KEY) continue
    if (pts > playerPoints) ahead++
  }
  return { playerStanding: ahead + 1, pointsByCar }
}

/**
 * One row in the championship standings panel. `key` matches the
 * `pointsByCar` map key used by `aggregatePoints` (the literal
 * `'player'` for the player; `driverId ?? carId` for every AI). The
 * `label` is the display name the renderer shows on the row.
 */
export interface ChampionshipStandingsRow {
  key: string
  label: string
  points: number
  isPlayer: boolean
  isGhost: boolean
}

/**
 * Mid-tour championship standings the garage and the results page
 * render. Iterates `career.activeTour.results` (already populated with
 * the full per-car grid per race) and returns rows sorted by points
 * descending. The player's `playerStanding` is 1-indexed and counts
 * AI rows with strictly more points than the player plus one.
 *
 * Returns null when the career has no active tour, when the active
 * tour does not match `tour.id`, or when the championship lookup
 * fails. Returns a zero-results shape (the player row alone at
 * standing 1) when the active tour has not finished any race yet.
 *
 * A row is marked `isGhost: true` when it represents a roster driver
 * who has not yet appeared in any recorded race (every AI in the
 * tour's roster is surfaced so the panel does not look like the
 * field shrank between races); ghosts have `points: 0`.
 */
export function currentChampionshipStandings(args: {
  career: WorldTourCareer
  tour: Tour
  championship: Championship
}): {
  rows: ChampionshipStandingsRow[]
  playerStanding: number
  fieldSize: number
  racesCompleted: number
} | null {
  const PLAYER_KEY = 'player'
  const active = args.career.activeTour
  if (!active || active.tourId !== args.tour.id) return null

  const pointsByKey = new Map<string, number>()
  const labelByKey = new Map<string, string>()
  pointsByKey.set(PLAYER_KEY, 0)
  labelByKey.set(PLAYER_KEY, 'You')

  // Walk every race the player has completed in this active tour. The
  // career storage layer has already validated `entries` is non-empty
  // for every persisted result, so the loop is safe even on a freshly
  // seeded cursor.
  for (const r of active.results) {
    for (const e of r.entries) {
      const key = e.isPlayer ? PLAYER_KEY : (e.driverId ?? e.carId)
      pointsByKey.set(key, (pointsByKey.get(key) ?? 0) + e.points)
      if (!labelByKey.has(key)) {
        labelByKey.set(key, e.isPlayer ? 'You' : (e.driverId ?? e.carId))
      }
    }
  }

  // Resolve display names for AI drivers from the championship roster
  // so a row reads as "Maple Quartz" rather than "driver-3". Ghosts
  // (roster drivers who have not raced yet) get added with 0 points
  // so the panel always shows the full field size.
  const driverNameById = new Map(args.championship.drivers.map((d) => [d.id, d.name]))
  for (const id of args.tour.aiDriverIds) {
    const name = driverNameById.get(id) ?? id
    labelByKey.set(id, name)
    if (!pointsByKey.has(id)) {
      pointsByKey.set(id, 0)
    }
  }

  const playerPoints = pointsByKey.get(PLAYER_KEY) ?? 0
  let ahead = 0
  for (const [key, pts] of pointsByKey.entries()) {
    if (key === PLAYER_KEY) continue
    if (pts > playerPoints) ahead++
  }

  const seenAi = new Set<string>()
  for (const r of active.results) {
    for (const e of r.entries) {
      if (e.isPlayer) continue
      seenAi.add(e.driverId ?? e.carId)
    }
  }

  const rows: ChampionshipStandingsRow[] = []
  for (const [key, points] of pointsByKey.entries()) {
    rows.push({
      key,
      label: labelByKey.get(key) ?? key,
      points,
      isPlayer: key === PLAYER_KEY,
      isGhost: key !== PLAYER_KEY && !seenAi.has(key),
    })
  }
  // Sort by points desc; the player wins ties so the panel never
  // shows the player below a 0-point ghost on a clean run. Stable
  // tiebreak on the key keeps the order deterministic across renders.
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (a.isPlayer) return -1
    if (b.isPlayer) return 1
    return a.key.localeCompare(b.key)
  })

  return {
    rows,
    playerStanding: ahead + 1,
    fieldSize: args.tour.fieldSize,
    racesCompleted: active.results.length,
  }
}
