/**
 * World Tour garage. Pure helpers for the repair flow between races.
 * Phase 2 ships a single "Repair fully" button at a flat per-percent
 * rate. Phase 4 layers a small per-tour difficulty markup; Phase 5
 * adds the upgrade and car-buy flows.
 *
 * Pure: no IO, no Date.now, no Math.random. The storage layer is the
 * existing `worldTourCareerStorage.ts`; this module only exposes the
 * math and the reducer.
 */

import { cloneCareer, type WorldTourCareer } from './worldTourCareer'
import type { Championship } from '@/lib/worldTourChampionship'
import { findTour } from '@/lib/worldTourChampionship'

// Cost in credits per 1% of damage. Tuned so a fully wrecked car costs
// 500 credits to fully repair, which is the placement-1 race purse.
// A typical mid-race scrape (~20% damage) costs 100 credits, well
// under a single race's earnings.
export const REPAIR_COST_PER_PERCENT = 5

// Extra cost markup per tour-completed difficulty step, in absolute
// credits per percent. Velvet Coast (the opener) adds nothing; later
// tours scale up. Currently a flat schedule; Phase 4 may key off the
// championship's tour ordering.
export const REPAIR_COST_DIFFICULTY_MARKUP_PER_PERCENT = 1

/**
 * Compute the credits required to fully repair a car at the given
 * damage level. Damage is in [0, 1]. Defensive against non-finite
 * inputs (returns 0).
 */
export function repairCost(damage: number, difficultyTier = 0): number {
  if (!Number.isFinite(damage) || damage <= 0) return 0
  const clampedDamage = Math.min(1, Math.max(0, damage))
  const clampedTier = Math.max(0, Math.floor(difficultyTier))
  const perPercent =
    REPAIR_COST_PER_PERCENT +
    clampedTier * REPAIR_COST_DIFFICULTY_MARKUP_PER_PERCENT
  return Math.ceil(clampedDamage * 100 * perPercent)
}

/**
 * Resolve the difficulty tier the garage uses for the markup. Returns
 * the index of the player's currently active tour (0 for the opener,
 * 1 for tour 2, etc) so later tours cost more to repair. Falls back to
 * 0 when no active tour exists.
 */
export function difficultyTierForCareer(
  championship: Championship,
  career: WorldTourCareer,
): number {
  if (!career.activeTour) return 0
  const idx = championship.tours.findIndex(
    (t) => t.id === career.activeTour!.tourId,
  )
  return Math.max(0, idx)
}

export type RepairResult =
  | { ok: true; career: WorldTourCareer; spent: number }
  | { ok: false; reason: 'no-damage' | 'insufficient-funds' }

/**
 * Apply a full repair to the career. Returns a fresh career with
 * damage zeroed and the cost deducted, or an error result on
 * insufficient funds. The input is never mutated.
 *
 * Idempotence: calling repair on a car at zero damage is a no-op (the
 * function returns `{ ok: false, reason: 'no-damage' }` so the UI can
 * keep the button disabled and the wallet untouched).
 */
export function applyFullRepair(
  career: WorldTourCareer,
  championship: Championship,
): RepairResult {
  if (career.activeCarDamage <= 0) {
    return { ok: false, reason: 'no-damage' }
  }
  const tier = difficultyTierForCareer(championship, career)
  const cost = repairCost(career.activeCarDamage, tier)
  if (career.money < cost) {
    return { ok: false, reason: 'insufficient-funds' }
  }
  const next = cloneCareer(career)
  next.money = career.money - cost
  next.activeCarDamage = 0
  return { ok: true, career: next, spent: cost }
}

/**
 * Tour-level helper used by the garage page header. Returns the next
 * race info given the career's `activeTour` cursor; null when no tour
 * is in progress.
 */
export function nextRaceFor(
  championship: Championship,
  career: WorldTourCareer,
): { tourId: string; tourName: string; raceIndex: number; trackId: string } | null {
  if (!career.activeTour) return null
  const tour = findTour(championship, career.activeTour.tourId)
  if (!tour) return null
  const trackId = tour.trackIds[career.activeTour.raceIndex]
  if (!trackId) return null
  return {
    tourId: tour.id,
    tourName: tour.name,
    raceIndex: career.activeTour.raceIndex,
    trackId,
  }
}
