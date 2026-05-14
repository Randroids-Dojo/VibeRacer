/**
 * World Tour car catalog and ownership helpers. Pure data and a small
 * reducer for buying a new car. The shop pricing scales linearly with
 * the car's tier index so the late-game cars cost meaningfully more
 * than the starter.
 *
 * Pure: no IO, no Date.now, no Math.random.
 */

import { DEFAULT_CAR_PARAMS, type CarParams } from './physics'

/**
 * One car the player can buy or already owns. `baseParams` is the
 * stock physics shape (engine, tires, brakes); upgrades scale these
 * via the per-car `activeCarUpgrades` tier set. `price` is the cost
 * in credits; the starter is free (`0`) and pre-owned.
 */
export interface CarSpec {
  id: string
  name: string
  price: number
  // Display-only tier label. Tier 0 is the starter; later tours unlock
  // tier 1 and 2 cars at the shop. The tier is for sorting and
  // pricing, not a physics scalar.
  tier: number
  baseParams: CarParams
}

/**
 * The bundled car catalog. The first entry is the starter and must
 * always be price 0; it is the car a fresh career owns out of the
 * gate. Later entries unlock as the player earns enough credits to
 * afford them.
 */
export const CAR_CATALOG: ReadonlyArray<CarSpec> = Object.freeze([
  {
    id: 'starter',
    name: 'Starter',
    price: 0,
    tier: 0,
    baseParams: DEFAULT_CAR_PARAMS,
  },
  {
    id: 'speeder',
    name: 'Speeder',
    price: 4000,
    tier: 1,
    baseParams: {
      ...DEFAULT_CAR_PARAMS,
      maxSpeed: DEFAULT_CAR_PARAMS.maxSpeed * 1.1,
      accel: DEFAULT_CAR_PARAMS.accel * 1.1,
    },
  },
  {
    id: 'apex',
    name: 'Apex',
    price: 9000,
    tier: 2,
    baseParams: {
      ...DEFAULT_CAR_PARAMS,
      maxSpeed: DEFAULT_CAR_PARAMS.maxSpeed * 1.2,
      accel: DEFAULT_CAR_PARAMS.accel * 1.15,
      brake: DEFAULT_CAR_PARAMS.brake * 1.1,
      steerRateLow: DEFAULT_CAR_PARAMS.steerRateLow * 1.1,
      steerRateHigh: DEFAULT_CAR_PARAMS.steerRateHigh * 1.1,
    },
  },
])

export const STARTER_CAR_ID = 'starter'

export function findCarSpec(carId: string): CarSpec | null {
  for (const c of CAR_CATALOG) {
    if (c.id === carId) return c
  }
  return null
}

/**
 * Return the base physics params for a car id. Falls back to the
 * starter's params when the id is unknown (a stored save that lost
 * the active car id, or a hand-edited payload).
 */
export function baseParamsFor(carId: string): CarParams {
  const spec = findCarSpec(carId)
  return spec ? spec.baseParams : DEFAULT_CAR_PARAMS
}

export type BuyCarResult =
  | { ok: true; spent: number }
  | { ok: false; reason: 'unknown-car' | 'already-owned' | 'insufficient-funds' }

/**
 * Decide whether the given wallet can buy the named car. Pure: does
 * not mutate any inputs. The caller is responsible for applying the
 * result to the career save.
 */
export function buyCarPreflight(args: {
  carId: string
  ownedCarIds: ReadonlyArray<string>
  walletCredits: number
}): BuyCarResult {
  const spec = findCarSpec(args.carId)
  if (!spec) return { ok: false, reason: 'unknown-car' }
  if (args.ownedCarIds.includes(args.carId)) {
    return { ok: false, reason: 'already-owned' }
  }
  if (args.walletCredits < spec.price) {
    return { ok: false, reason: 'insufficient-funds' }
  }
  return { ok: true, spent: spec.price }
}
