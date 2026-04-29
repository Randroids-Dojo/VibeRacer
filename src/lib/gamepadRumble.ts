// Pure mapper from per-frame physics state to dual-rumble magnitudes.
// Drives the Forza-lite continuous rumble loop on a connected gamepad: the
// strong (low-frequency) motor carries chassis / engine information and the
// weak (high-frequency) motor carries grip / surface information.
//
// This module is deliberately pure: no DOM access, no actuator calls. The
// caller (Game.tsx) feeds in the same `speed`, `onTrack`, and `driftIntensity`
// state the rest of the per-frame loop already computed, and writes the
// result through `setGamepadContinuousRumble` in `src/lib/haptics.ts`.

import { RUMBLE_EPSILON } from './haptics'

export interface ContinuousRumbleInput {
  // Absolute speed in world units per second. Negative reverse motion is
  // treated identically to forward motion for rumble purposes (the engine
  // works just as hard backing up).
  speedAbs: number
  // Tuning's max forward speed. Used to compute the [0, 1] speed ratio that
  // drives the engine purr channel. Non-positive values disable the channel
  // (safety: prevents a divide-by-zero on a malformed tuning payload).
  maxSpeed: number
  // Whether the car is currently on the racing surface. False adds a chassis
  // rumble step on top of the engine purr (grass / gravel feel).
  onTrack: boolean
  // 0..1 from `driftIntensity()` in `src/game/drift.ts`. Drives the weak
  // motor: a hard slide buzzes the high-frequency motor harder than a slow
  // straight-line cruise.
  driftIntensity: number
  // True when the brake key is held down at very low speed. Adds a short ABS
  // flutter on the weak motor so a panic-stop has tactile bite.
  brakeLock: boolean
}

export interface DualRumbleMagnitudes {
  strongMagnitude: number
  weakMagnitude: number
}

const ENGINE_GAIN = 0.35
const OFF_TRACK_BIAS = 0.25
const SLIP_GAIN = 0.5
const BRAKE_LOCK_BIAS = 0.3

const SILENT: DualRumbleMagnitudes = { strongMagnitude: 0, weakMagnitude: 0 }

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

// Map per-frame physics state to dual-rumble magnitudes. Both motors are
// summed from independent channels and clamped to [0, 1]. When both end up
// below RUMBLE_EPSILON the function snaps to exact zero so the call site can
// short-circuit to a motor reset rather than perpetually scheduling a
// near-zero rumble.
export function computeContinuousRumble(
  input: ContinuousRumbleInput,
): DualRumbleMagnitudes {
  if (!Number.isFinite(input.maxSpeed) || input.maxSpeed <= 0) {
    return { ...SILENT }
  }
  const speedRatio = clamp01(Math.abs(input.speedAbs) / input.maxSpeed)
  const strongRaw =
    ENGINE_GAIN * speedRatio + (input.onTrack ? 0 : OFF_TRACK_BIAS)
  const slip = clamp01(input.driftIntensity)
  const weakRaw = SLIP_GAIN * slip + (input.brakeLock ? BRAKE_LOCK_BIAS : 0)
  const strong = clamp01(strongRaw)
  const weak = clamp01(weakRaw)
  if (strong < RUMBLE_EPSILON && weak < RUMBLE_EPSILON) {
    return { ...SILENT }
  }
  return { strongMagnitude: strong, weakMagnitude: weak }
}
