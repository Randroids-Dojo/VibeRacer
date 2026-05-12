/**
 * World Tour car upgrades. Per-zone tier integers on the career save
 * scale the player's physics parameters. Phase 3 ships four zones
 * (engine, tires, brakes, body); each zone has four tiers (0 = stock,
 * 3 = top spec).
 *
 * Pure: no IO, no Date.now, no Math.random. Idempotent purchase
 * helpers; price curve is a closed form so the UI and the reducer
 * never drift.
 *
 * Effects:
 * - engine: raises top speed and acceleration.
 * - tires: raises low-speed and high-speed steering rates (grip
 *   proxy in VibeRacer's `CarParams`).
 * - brakes: raises braking deceleration.
 * - body: lowers per-contact damage accrual (durability). The race
 *   session reads `damageAbsorption` directly off the resolved spec
 *   so a tier 3 body still takes damage from major crashes but
 *   shrugs off minor scrapes.
 */

import { DEFAULT_CAR_PARAMS, type CarParams } from './physics'

export type UpgradeZone = 'engine' | 'tires' | 'brakes' | 'body'

export const UPGRADE_MAX_TIER = 3

/**
 * Per-zone tier set on a single car. Defaults to all zeros for the
 * stock starter car. The save schema clamps each field into
 * [0, UPGRADE_MAX_TIER] on read so a hand-edited payload cannot drive
 * the physics off the documented envelope.
 */
export interface CarUpgrades {
  engine: number
  tires: number
  brakes: number
  body: number
}

export function stockUpgrades(): CarUpgrades {
  return { engine: 0, tires: 0, brakes: 0, body: 0 }
}

/**
 * Multiplicative effect per tier step. A tier 3 engine is at
 * 1 + 3 * 0.05 = 1.15 top-speed scalar. Tuned so a stacked car beats
 * a stock car by a meaningful margin on a single straight but never
 * makes any one zone game-breaking.
 */
export const TIER_EFFECT = Object.freeze({
  engineMaxSpeedPerTier: 0.05,
  engineAccelPerTier: 0.06,
  tiresSteerPerTier: 0.05,
  brakesPerTier: 0.08,
  // Damage absorption: each tier reduces the multiplier on the
  // per-contact damage accrual by this fraction. Tier 3 absorbs
  // ~24% of incoming damage.
  bodyAbsorbPerTier: 0.08,
})

/**
 * Resolve the effective car parameters for a given upgrade tier set.
 * Used by the race session when creating the player's car. Returns a
 * fresh object; the input `base` is never mutated.
 */
export function resolveCarParams(
  base: CarParams,
  upgrades: CarUpgrades,
): CarParams {
  const eng = clampTier(upgrades.engine)
  const tires = clampTier(upgrades.tires)
  const brakes = clampTier(upgrades.brakes)
  return {
    ...base,
    maxSpeed: base.maxSpeed * (1 + eng * TIER_EFFECT.engineMaxSpeedPerTier),
    accel: base.accel * (1 + eng * TIER_EFFECT.engineAccelPerTier),
    brake: base.brake * (1 + brakes * TIER_EFFECT.brakesPerTier),
    steerRateLow:
      base.steerRateLow * (1 + tires * TIER_EFFECT.tiresSteerPerTier),
    steerRateHigh:
      base.steerRateHigh * (1 + tires * TIER_EFFECT.tiresSteerPerTier),
  }
}

/**
 * Damage absorption multiplier for a given body tier. Multiply this
 * value against the base per-contact damage rate to get the effective
 * accrual. Returns a value in (0, 1]; tier 0 returns 1.
 */
export function damageAbsorption(upgrades: CarUpgrades): number {
  const body = clampTier(upgrades.body)
  return Math.max(0.1, 1 - body * TIER_EFFECT.bodyAbsorbPerTier)
}

// Base cost for a tier-1 upgrade. The cost scales linearly with the
// tier you are buying (tier 1 = BASE, tier 2 = 2 * BASE, tier 3 =
// 3 * BASE) so the late-game stacks of upgrades cost the most.
export const BASE_TIER_COST = 600

/**
 * Cost to advance the given zone from its current tier to the next.
 * Returns 0 when the zone is already at max (the UI also disables the
 * button in that case).
 */
export function nextTierCost(
  upgrades: CarUpgrades,
  zone: UpgradeZone,
): number {
  const current = clampTier(upgrades[zone])
  if (current >= UPGRADE_MAX_TIER) return 0
  const nextTier = current + 1
  return BASE_TIER_COST * nextTier
}

export type UpgradePurchaseResult =
  | { ok: true; upgrades: CarUpgrades; spent: number }
  | { ok: false; reason: 'max-tier' | 'insufficient-funds' }

/**
 * Apply a single tier purchase. Returns a fresh `upgrades` object on
 * success or a typed reason on failure. The cost calculation is
 * fixed: clamp to a valid tier, compute the cost, deduct the cost
 * from `walletCredits` (the caller is responsible for persisting the
 * new wallet balance).
 */
export function applyUpgradePurchase(
  upgrades: CarUpgrades,
  zone: UpgradeZone,
  walletCredits: number,
): UpgradePurchaseResult {
  const current = clampTier(upgrades[zone])
  if (current >= UPGRADE_MAX_TIER) {
    return { ok: false, reason: 'max-tier' }
  }
  const cost = nextTierCost(upgrades, zone)
  if (walletCredits < cost) {
    return { ok: false, reason: 'insufficient-funds' }
  }
  const next: CarUpgrades = { ...upgrades, [zone]: current + 1 }
  return { ok: true, upgrades: next, spent: cost }
}

function clampTier(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  return Math.max(0, Math.min(UPGRADE_MAX_TIER, Math.floor(v)))
}

/**
 * Defensive sanitizer for stored upgrades. Forces every zone into the
 * legal range and supplies a stock zero for any missing field.
 */
export function sanitizeUpgrades(raw: unknown): CarUpgrades {
  if (typeof raw !== 'object' || raw === null) return stockUpgrades()
  const r = raw as Record<string, unknown>
  return {
    engine: clampTier(r.engine),
    tires: clampTier(r.tires),
    brakes: clampTier(r.brakes),
    body: clampTier(r.body),
  }
}

/**
 * The default base car params. Re-exported so callers do not have to
 * import physics.ts directly when wiring `resolveCarParams`.
 */
export const STOCK_BASE_PARAMS: CarParams = DEFAULT_CAR_PARAMS
