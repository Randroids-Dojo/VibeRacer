/**
 * World Tour progression reducer. Applies a race result to a career
 * save and returns the next career plus the same race result with its
 * `tourProgress` payload finalised.
 *
 * Pure: no IO, no Date.now, no Math.random. Re-applying the same
 * result on the same career is idempotent: the second application
 * detects that `raceIndex` already advanced and short-circuits.
 *
 * Two flows:
 *
 * Mid-tour: append the result to `activeTour.results`, advance
 * `activeTour.raceIndex`. The next race CTA on the results page reads
 * the result's `nextRace` field.
 *
 * Final race: append the final result, then clear `activeTour`. On
 * pass: add the tour id to `completedTourIds` and the next tour id (if
 * any) to `unlockedTourIds`. On fail: keep money and upgrades, do not
 * unlock anything past the current tour. The career retains a memory
 * of the attempt by NOT removing the tour from `unlockedTourIds` (it
 * stays available for a retry).
 */

import { cloneCareer, type WorldTourCareer } from './worldTourCareer'
import type { Championship } from '@/lib/worldTourChampionship'
import { findTour, nextTourOf } from '@/lib/worldTourChampionship'
import type { RaceResult } from './worldTourRaceResult'

export interface ApplyRaceResultInput {
  readonly career: WorldTourCareer
  readonly raceResult: RaceResult
  readonly championship: Championship
}

export interface ApplyRaceResultOutput {
  readonly career: WorldTourCareer
  readonly raceResult: RaceResult
}

/**
 * Apply a race result to the career. Returns a fresh `career` (the
 * input is never mutated). The returned `raceResult` is the same
 * object the caller passed in; the tourProgress payload is already
 * authoritative because `buildRaceResult` derives it from the same
 * championship the reducer reads.
 *
 * The reducer never mutates the player's money outside of adding the
 * race's `cashEarned`. The full purse formula (placement + tour
 * bonus) lives in `buildRaceResult`.
 *
 * Idempotence: if `activeTour.results` already records this
 * `raceIndex`, the function returns the career unchanged so an
 * accidental double-apply (e.g. from a redirect retry) cannot
 * double-credit the player.
 */
export function applyRaceResult(
  input: ApplyRaceResultInput,
): ApplyRaceResultOutput {
  const career = cloneCareer(input.career)
  const tour = findTour(input.championship, input.raceResult.tourProgress.tourId)
  if (!tour) {
    throw new Error(
      `unknown tour for race result: ${input.raceResult.tourProgress.tourId}`,
    )
  }
  const expectedIndex = input.raceResult.tourProgress.raceIndex
  const active = career.activeTour
  // Idempotence guard: if this race index is already recorded, skip.
  if (active && active.tourId === tour.id) {
    if (active.results.length > expectedIndex) {
      return { career: input.career, raceResult: input.raceResult }
    }
  }

  // Initialise the active tour cursor if missing. This recovers from
  // a save that lost the cursor mid-tour.
  if (!career.activeTour || career.activeTour.tourId !== tour.id) {
    career.activeTour = {
      tourId: tour.id,
      raceIndex: expectedIndex,
      results: [],
    }
  }

  career.activeTour.results.push({
    trackId: input.raceResult.trackId,
    placement: input.raceResult.playerPlacement,
    dnf: input.raceResult.playerDnf,
    cashEarned: input.raceResult.cashEarned,
  })
  career.money = career.money + input.raceResult.cashEarned
  // Post-race damage replaces the prior value (damage does not stack
  // across races until the player visits the garage). A clean run on a
  // damaged car still walks away with that damage; the race-session
  // accumulates damage from the carried-over starting value.
  if (Number.isFinite(input.raceResult.playerDamage)) {
    career.activeCarDamage = Math.min(
      1,
      Math.max(0, input.raceResult.playerDamage),
    )
  }

  // Mid-tour: advance the cursor and exit.
  if (input.raceResult.tourProgress.nextRaceIndex !== null) {
    career.activeTour.raceIndex = input.raceResult.tourProgress.nextRaceIndex
    return { career, raceResult: input.raceResult }
  }

  // Final race of the tour.
  const passed = input.raceResult.tourProgress.passed === true
  if (passed) {
    if (!career.completedTourIds.includes(tour.id)) {
      career.completedTourIds = [...career.completedTourIds, tour.id]
    }
    const next = nextTourOf(input.championship, tour.id)
    if (next && !career.unlockedTourIds.includes(next.id)) {
      career.unlockedTourIds = [...career.unlockedTourIds, next.id]
    }
  }
  // Always clear the active cursor on a finished tour (pass or fail)
  // so the player returns to the tour-selection screen.
  career.activeTour = null
  return { career, raceResult: input.raceResult }
}

/**
 * Summary surfaced on the final-race results screen. Distilled from
 * the race result and the championship so the renderer does not need
 * to re-derive the gate math.
 */
export interface TourCompletionSummary {
  tourId: string
  tourName: string
  passed: boolean
  playerStanding: number
  requiredStanding: number
  fieldSize: number
  nextTourId: string | null
  nextTourName: string | null
  bonusEarned: number
}

/**
 * Build the tour-completion summary from a race result. Returns null
 * for a mid-tour result (so the results page can branch on the return
 * value).
 */
export function buildTourCompletionSummary(
  championship: Championship,
  raceResult: RaceResult,
): TourCompletionSummary | null {
  if (!raceResult.tourProgress.completed) return null
  if (raceResult.tourProgress.passed === null) return null
  if (raceResult.tourProgress.playerStanding === null) return null
  const tour = findTour(championship, raceResult.tourProgress.tourId)
  if (!tour) return null
  const next = nextTourOf(championship, tour.id)
  return {
    tourId: tour.id,
    tourName: tour.name,
    passed: raceResult.tourProgress.passed,
    playerStanding: raceResult.tourProgress.playerStanding,
    requiredStanding: tour.requiredStanding,
    fieldSize: tour.fieldSize,
    nextTourId: next?.id ?? null,
    nextTourName: next?.name ?? null,
    bonusEarned: raceResult.bonusEarned,
  }
}
