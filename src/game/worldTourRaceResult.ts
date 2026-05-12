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
 * gets 10, then 7, 5, 3, etc. A car outside the array scores 0 (so the
 * 12-car expansion in Phase 4 only requires extending the table).
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
 * final race. Currently a flat amount; Phase 6 may scale it per tour
 * difficulty.
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
  // The player is always car index 0 in this MVP. The defensive
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
 * Each AI driver's per-race placement is approximated by their final
 * standing in the just-finished race for any race the career did not
 * record (the MVP only stores the player's per-race result, not the
 * full grid history). Phase 4 will record the full per-race grid so
 * the aggregate standings reflect mid-tour swings.
 */
export function aggregatePoints(args: {
  career: WorldTourCareer
  tour: Tour
  finalRaceStandings: RaceStandingEntry[]
}): { playerStanding: number; pointsByCar: Map<string, number> } {
  const pointsByCar = new Map<string, number>()
  const playerKey = 'player'

  const prior: TourRaceResult[] =
    args.career.activeTour?.tourId === args.tour.id
      ? args.career.activeTour.results
      : []

  // Player's accumulated points from earlier races plus the just-
  // finished final race.
  let playerPoints = 0
  for (const r of prior) {
    playerPoints += r.dnf ? 0 : placementPoints(r.placement)
  }
  const playerFinal = args.finalRaceStandings.find((e) => e.isPlayer)
  if (playerFinal) playerPoints += playerFinal.points
  pointsByCar.set(playerKey, playerPoints)

  // AI cars: only the final race is known per-car. Approximate every
  // prior race as identical to the final standings (Phase 4 will
  // record real per-race standings).
  for (const entry of args.finalRaceStandings) {
    if (entry.isPlayer) continue
    const key = entry.driverId ?? entry.carId
    const seenRaces = prior.length + 1
    const pts = entry.points * seenRaces
    pointsByCar.set(key, pts)
  }

  // Resolve the player's standing: count cars with strictly more
  // points and add 1.
  let ahead = 0
  for (const [key, pts] of pointsByCar.entries()) {
    if (key === playerKey) continue
    if (pts > playerPoints) ahead++
  }
  return { playerStanding: ahead + 1, pointsByCar }
}
