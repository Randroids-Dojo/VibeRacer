// Drag-mode tachometer math. Pure helper so the gauge component, the
// unit tests, and any future telemetry surface all agree on what the
// needle is doing.
//
// Why a tachometer (and not the old speed dial): a real-world tach reads
// engine RPM, which rises across each gear and *drops* the moment the
// driver upshifts because the new gear ratio spins the engine more
// slowly for the same wheel speed. Drag mode's manual box gives us the
// same shape for free: each gear caps at a higher speed than the last,
// and the gear specs are stacked end-to-end so the cap of gear N is
// exactly the bottom of gear N+1. Mapping the needle to the player's
// progress *inside the current gear's band* gives a clean 0..1 sweep
// per gear, with a snap-back to 0 on every upshift. That is the visual
// cue Forza Horizon and most arcade racers use to teach the player when
// to shift.

import {
  DRAG_MANUAL_GEAR_SPECS,
  clampDragGear,
  dragGearSpec,
} from '@/game/dragTick'

// Bottom of a gear's speed band. Defined as the previous gear's cap so
// every shift up snaps the tach back to 0. Gear 1 starts at 0.
export function dragGearLowSpeed(gear: number, maxSpeed: number): number {
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0) return 0
  const g = clampDragGear(gear)
  if (g <= 1) return 0
  const prev = DRAG_MANUAL_GEAR_SPECS[g - 2]
  return prev.maxSpeedFactor * maxSpeed
}

// Top of a gear's speed band. Equals the gear's own cap; the needle
// reaches 1.0 (redline) exactly here, which is also where the shift
// classifier opens the PERFECT window.
export function dragGearHighSpeed(gear: number, maxSpeed: number): number {
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0) return 0
  return dragGearSpec(gear).maxSpeedFactor * maxSpeed
}

// Map a live speed + gear pair onto the 0..1 fraction the tach needle
// uses. Clamped both ends:
//   - Reverse or pre-launch speed -> 0
//   - Speed past the gear cap (the "bog" zone the physics still caps to
//     +epsilon, or a downshift that overruns the new gear) -> 1
// Defensive against zero / negative maxSpeed and non-finite inputs so a
// one-frame physics glitch can never poison the dial with NaN.
export function dragTachFraction(
  rawSpeedUs: number,
  gear: number,
  maxSpeed: number,
): number {
  if (!Number.isFinite(rawSpeedUs)) return 0
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0) return 0
  if (rawSpeedUs <= 0) return 0
  const low = dragGearLowSpeed(gear, maxSpeed)
  const high = dragGearHighSpeed(gear, maxSpeed)
  if (high <= low) return 0
  const f = (rawSpeedUs - low) / (high - low)
  if (f <= 0) return 0
  if (f >= 1) return 1
  return f
}

// Where the red zone starts on the dial, as a 0..1 fraction. Pinned at
// the same redline ratio the bog-detector uses (DRAG_REDLINE_RATIO in
// dragTick.ts) so the needle enters red exactly when gearPeakHoldSec
// starts ticking. Held as its own constant so the dial can render a
// wider red BAND visually (we draw the arc from RED_ZONE_VISUAL_START)
// while keeping the math thresholds identical.
export const TACH_REDLINE_FRACTION = 0.99

// Visual start of the red arc. Wider than TACH_REDLINE_FRACTION so the
// red is readable at a glance from across the screen; the precise
// redline-tick mark inside the arc still sits at the actual threshold.
export const TACH_RED_ZONE_VISUAL_START = 0.85
