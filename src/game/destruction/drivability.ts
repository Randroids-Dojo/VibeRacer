import type { PanelId, PanelState } from './panels'
import { PANELS } from './panels'

// Pure derivation of the car's drivability scalars from per-panel HP.
// The orchestrator calls `derive()` every frame and the resulting
// scalars feed straight into stepPhysics (accelFactor, maxSpeedFactor)
// plus the input mixers (steerBias, stalled).
//
// The mapping table is the single source of truth for "what gets worse
// when X breaks". Mirroring the table in the GDD keeps the design and
// the runtime in lockstep.

export interface Drivability {
  // Multiplier applied to stepPhysics's accelFactor. < 1 means slower
  // throttle response and shorter top-end push.
  accelFactor: number
  // Multiplier applied to stepPhysics's maxSpeedFactor. < 1 lowers the
  // top speed achievable this frame.
  maxSpeedFactor: number
  // Additive steer bias applied to both AI and player input. Positive
  // bias drifts left (matches the physics module's steer sign).
  steerBias: number
  // True once the engine has failed. Throttle is clamped to zero.
  stalled: boolean
}

export const IDENTITY_DRIVABILITY: Drivability = {
  accelFactor: 1,
  maxSpeedFactor: 1,
  steerBias: 0,
  stalled: false,
}

function fractionOf(state: PanelState): number {
  const cfg = PANELS[state.id]
  return cfg.maxHp > 0 ? state.hp / cfg.maxHp : 0
}

// Per-panel coefficients tuned so the car "fights you" by ~30% before
// any panel is fully gone, then degrades steeply past the halfway mark.
// Tuning lives here so the team can iterate without chasing it through
// every consumer.
const HOOD_ACCEL_FLOOR = 0.55
const BODY_TOPSPEED_FLOOR = 0.6
const DOOR_STEER_BIAS_MAX = 0.32

export function derive(panels: Readonly<Record<PanelId, PanelState>>): Drivability {
  const hoodF = fractionOf(panels.hood)
  const bodyF = fractionOf(panels.body)
  const engineF = fractionOf(panels.engine)
  const doorLF = fractionOf(panels.door_l)
  const doorRF = fractionOf(panels.door_r)

  // Hood damage chokes the engine bay airflow: accel falls toward a
  // sane floor as hood HP drops. Engine HP gates it further: a totally
  // dead engine returns zero accel even before the stall flag flips.
  const hoodAccel = HOOD_ACCEL_FLOOR + (1 - HOOD_ACCEL_FLOOR) * hoodF
  const engineAccel = Math.max(0, engineF)
  const accelFactor = clamp01(hoodAccel * engineAccel)

  // Body damage flexes the chassis: top speed falls toward a floor.
  const maxSpeedFactor = clamp01(
    BODY_TOPSPEED_FLOOR + (1 - BODY_TOPSPEED_FLOOR) * bodyF,
  )

  // Door damage pulls the car to the damaged side. Sign convention
  // matches the physics module: positive steer turns left, so a
  // damaged left door (which would drag that side down) biases positive
  // steer? No: physically, a wrecked left side adds drag on the left
  // and the car drifts toward the wrecked side. So a damaged door_l
  // pulls left (positive steer bias), and door_r pulls right (negative).
  const doorBias =
    DOOR_STEER_BIAS_MAX * ((1 - doorLF) - (1 - doorRF))

  const stalled = engineF <= 0

  return {
    accelFactor,
    maxSpeedFactor,
    steerBias: doorBias,
    stalled,
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n <= 0) return 0
  if (n >= 1) return 1
  return n
}

// Intensity of the engine smoke plume, 0 (none) to 1 (heavy). Wired
// from engine HP plus a contribution from front-end (hood) damage so
// smoke kicks in before the engine is dead, then ramps to max as the
// engine HP zeros.
export function smokeIntensity(
  panels: Readonly<Record<PanelId, PanelState>>,
): number {
  const engineF = fractionOf(panels.engine)
  const hoodF = fractionOf(panels.hood)
  // Smoke starts when either the hood or the engine drops below 60%.
  // Treat the lower of the two so a heavy hood beating still triggers
  // smoke even when the engine itself is fine.
  const worst = Math.min(engineF, hoodF)
  if (worst >= 0.6) return 0
  return clamp01((0.6 - worst) / 0.6)
}

// Fire emitter turns on only once the engine is fully gone. Returns 0
// or 1 so the caller can flip a boolean directly.
export function fireIntensity(
  panels: Readonly<Record<PanelId, PanelState>>,
): number {
  return panels.engine.hp <= 0 ? 1 : 0
}
