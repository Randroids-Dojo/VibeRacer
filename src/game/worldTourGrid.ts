/**
 * World Tour grid spawn. Ported from VibeGear2's `aiGrid.ts` and adapted
 * for VibeRacer's track width helpers and seeded RNG (`mulberry32`).
 *
 * Given a track width, a lane count, a row count, and an AI driver
 * roster, this module returns one spawned car per grid slot. Slot 0 is
 * always the player (front pole, lane 0, row 0). Slots 1..n are AI cars,
 * driver assignments shuffled by the seed so a deterministic replay
 * always pairs the same driver with the same slot.
 *
 * Pure: no IO, no Date.now, no Math.random. Identical inputs always
 * yield deep-equal outputs. The seed is the only entropy source.
 */

import { mulberry32 } from './derbyRoundState'
import { DEFAULT_TRACK_WIDTH } from './trackWidth'

// Default longitudinal spacing between grid rows, in meters. Two rows of
// four-meter spacing puts the back row eight meters behind the player at
// the start line, which is enough headroom that the cars do not visibly
// overlap on the starting straight but tight enough that the launch
// scramble plays out within the first second.
export const DEFAULT_ROW_SPACING_METERS = 4

// Default offset between the start line (z = 0) and the front row. Cars
// spawn entirely behind the start line so the first finish-line crossing
// completes a full lap.
export const DEFAULT_GRID_OFFSET_METERS = 0

/**
 * One member of the AI roster. The grid module only needs the id (so
 * each spawned slot can reference back into the championship data) and
 * lets the caller resolve names, paint, and stats from the full
 * `Championship.drivers` table.
 */
export interface GridDriver {
  readonly id: string
}

export interface SpawnGridInput {
  // Number of grid slots, including the player's pole slot. Velvet
  // Coast (player plus three AI) uses 4; later tours use 12. The
  // output array always has exactly `slotCount` entries.
  readonly slotCount: number
  // Lane count across the grid. Velvet Coast (4-car field) uses 2;
  // 12-car tours use 3 so the grid is 3 lanes by 4 rows.
  readonly laneCount: number
  // Effective track width at the start segment, used to space lanes
  // across the full road. Defaults to `DEFAULT_TRACK_WIDTH`.
  readonly trackWidth?: number
  // AI driver roster. Length must be at least `slotCount - 1` (the
  // player takes slot 0). Excess drivers are not used.
  readonly aiDrivers: ReadonlyArray<GridDriver>
  // Deterministic seed. Same seed always shuffles the AI roster to the
  // same assignment.
  readonly seed: number
  // Optional override for row spacing.
  readonly rowSpacingMeters?: number
  // Optional offset between the start line and the front row.
  readonly gridOffsetMeters?: number
}

/**
 * One grid slot. `gridSlot === 0` is the player; `gridSlot > 0` is an AI
 * car. The player slot has `driverId === null`. AI slots always have a
 * resolved driverId.
 */
export interface SpawnedGridCar {
  readonly gridSlot: number
  readonly lane: number
  readonly row: number
  readonly startX: number
  readonly startZ: number
  readonly driverId: string | null
  // Per-slot RNG seed. Use this to drive each AI driver's mistake /
  // brilliant decorators so two slots making the "same call at the same
  // tick" cannot diverge across replays.
  readonly seed: number
}

/**
 * Map a slot index to a lane number. Slot 0 sits in lane 0 (the pole).
 * Subsequent slots fan out from the centerline outward (lane 0, lane 1,
 * lane 2, ...) so a small grid stays close to the racing line. With two
 * lanes the assignment alternates lane 0, lane 1, lane 0, lane 1; with
 * three lanes it goes center, left, right, center, left, right.
 */
function laneForSlot(slot: number, laneCount: number): number {
  if (laneCount <= 1) return 0
  return slot % laneCount
}

/**
 * Map a slot index to a row number. The pole (slot 0) is row 0; row
 * advances every `laneCount` slots.
 */
function rowForSlot(slot: number, laneCount: number): number {
  if (laneCount <= 1) return slot
  return Math.floor(slot / laneCount)
}

/**
 * X position for a lane index across a track of the given width. Lanes
 * are evenly spaced across the road and centered, so lane 0 sits to the
 * left of the centerline, lane `laneCount - 1` to the right, and the
 * total span never exceeds the road width.
 */
function xForLane(lane: number, laneCount: number, trackWidth: number): number {
  const halfWidth = trackWidth / 2
  if (laneCount <= 1) return 0
  // Lane 0 sits at the leftmost slot, lane n-1 at the rightmost. The
  // outer edges sit at half a lane-width inside the road so the cars do
  // not clip the kerb.
  const usable = trackWidth - trackWidth / laneCount
  const step = usable / (laneCount - 1)
  return -halfWidth + step * lane + (trackWidth - usable) / 2
}

/**
 * Seeded Fisher-Yates shuffle. Returns a fresh array; does not mutate
 * the input. The RNG draws come from a single `mulberry32` stream so
 * identical seeds yield identical shuffles across runs.
 */
function shuffleDrivers(
  drivers: ReadonlyArray<GridDriver>,
  seed: number,
): GridDriver[] {
  const out = drivers.slice()
  const rng = mulberry32(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

/**
 * Spawn the full grid. Returns one entry per slot, in slot order (slot 0
 * first). The output is always exactly `slotCount` long.
 *
 * The function does not validate the AI roster against the championship
 * tour's `aiDriverIds` list; the caller is expected to pass an already-
 * resolved roster (typically derived from `tourDrivers` in
 * `worldTourChampionship.ts`).
 */
export function spawnGrid(input: SpawnGridInput): SpawnedGridCar[] {
  const slotCount = Math.max(1, Math.floor(input.slotCount))
  const laneCount = Math.max(1, Math.floor(input.laneCount))
  const trackWidth =
    input.trackWidth !== undefined && input.trackWidth > 0
      ? input.trackWidth
      : DEFAULT_TRACK_WIDTH
  const rowSpacing =
    input.rowSpacingMeters !== undefined && input.rowSpacingMeters > 0
      ? input.rowSpacingMeters
      : DEFAULT_ROW_SPACING_METERS
  const gridOffset =
    input.gridOffsetMeters !== undefined && input.gridOffsetMeters >= 0
      ? input.gridOffsetMeters
      : DEFAULT_GRID_OFFSET_METERS
  // Shuffle the roster once with the run seed so the same seed yields
  // the same driver-to-slot assignment.
  const shuffled = shuffleDrivers(input.aiDrivers, input.seed)
  const out: SpawnedGridCar[] = []
  for (let slot = 0; slot < slotCount; slot++) {
    const lane = laneForSlot(slot, laneCount)
    const row = rowForSlot(slot, laneCount)
    const startX = xForLane(lane, laneCount, trackWidth)
    // `-0` collapses to `0` here so downstream equality checks do not
    // surprise callers that test against `Object.is`.
    const rawZ = -(gridOffset + row * rowSpacing)
    const startZ = rawZ === 0 ? 0 : rawZ
    // Slot 0 is the player. AI slots draw their driver from the
    // shuffled roster in order so the same seed always assigns the
    // same driver to the same slot.
    let driverId: string | null = null
    if (slot > 0) {
      const driver = shuffled[slot - 1]
      // Defensive: if the caller passed a shorter roster, we still emit
      // the slot so downstream code can decide how to handle a partial
      // field. The slot's driverId is null and `seed` is still derived
      // deterministically.
      driverId = driver ? driver.id : null
    }
    // Per-slot seed: hash the run seed with the slot index so each AI
    // driver gets a different but deterministic RNG stream.
    const seed = mixSeed(input.seed, slot)
    out.push({ gridSlot: slot, lane, row, startX, startZ, driverId, seed })
  }
  return out
}

/**
 * Mix a base seed and an integer key into a new 32-bit seed. Used to
 * derive per-slot RNG seeds so the same `(seed, slot)` pair always
 * produces the same downstream stream.
 */
function mixSeed(seed: number, key: number): number {
  let h = (seed | 0) ^ 0x9e3779b9
  h = Math.imul(h ^ (key | 0), 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}
