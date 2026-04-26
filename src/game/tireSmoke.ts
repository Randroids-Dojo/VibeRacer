/**
 * Pure helpers for the tire smoke puff system.
 *
 * Whenever the player slides hard or stamps the brake at speed, the rear
 * wheels eject a brief soft white puff that rises off the asphalt, expands,
 * and fades. Visually distinct from the dark skid mark trail (which sits flat
 * on the road and persists for seconds): smoke puffs are lighter, volumetric,
 * and gone within a second so a long slide reads as a steady cloud rather
 * than an opaque smear.
 *
 * The renderer (sceneBuilder) owns a fixed-size pool of pre-allocated sprites
 * that are recycled in a ring buffer. These helpers decide:
 *
 *  1. The intensity of a puff this frame (`puffIntensity`) given the player's
 *     slide intensity, brake input, speed, and on/off-track state,
 *  2. Whether to spawn a new puff this frame (`shouldSpawnTireSmoke`) given
 *     intensity, speed, and time since the last spawn,
 *  3. The starting opacity, scale, and rise velocity for a fresh puff,
 *  4. How a puff's size, opacity, and Y-offset evolve over its lifetime
 *     (`puffAlpha`, `puffScale`, `puffRise`),
 *  5. How to advance the ring-buffer write pointer.
 *
 * Render-side wiring (sprite material, color, blending, billboarding) lives in
 * `sceneBuilder.ts`. This module is fully unit-testable without a DOM or WebGL
 * context.
 */

// Cadence for paired-puff spawns while the player is sliding. Slightly slower
// than the skid-mark cadence so the puffs read as discrete blobs rather than
// a continuous smear (the dark skid trail handles the continuous read; smoke
// is the punchier, lighter accent).
export const TIRE_SMOKE_SPAWN_INTERVAL_MS = 130

// Minimum combined puff intensity required before any smoke is emitted. Below
// this the slide is too weak to read visually. Picked just above the floor of
// `puffIntensity` so a nudge of the wheel does not pop a puff on a straight.
export const TIRE_SMOKE_MIN_INTENSITY = 0.32

// Minimum world-units-per-second speed for any puff. Stops parking-lot wheel
// spins from firing visible smoke. Picked above the physics steering floor of
// 0.8 u/s so the car must actually be moving with intent. Slightly lower than
// the skid-mark floor so a hard brake at low speed (which does not lay marks)
// can still puff some smoke.
export const TIRE_SMOKE_MIN_SPEED = 3

// Total size of the per-side pool. Two puffs spawn per gate (one per rear
// wheel), so the effective unique spawn slots is half this number. 60 slots
// gives roughly 4 seconds of puffs at the default cadence (well past the
// individual puff lifetime so puffs never get recycled mid-fade).
export const TIRE_SMOKE_POOL_SIZE = 60

// How long (ms) after spawn a puff fully fades to zero opacity. Picked short
// so the cloud reads as a flash rather than a persistent fog.
export const TIRE_SMOKE_FADE_MS = 900

// Peak opacity at spawn for a max-intensity puff. Multiplied by the actual
// puff intensity so weak slides leave fainter, more transparent puffs.
export const TIRE_SMOKE_BASE_ALPHA = 0.7

// Starting world-unit scale of a fresh puff sprite. Tuned so the puff reads
// as roughly the size of a tire's contact patch at spawn.
export const TIRE_SMOKE_START_SCALE = 0.7

// Ending world-unit scale a puff swells to over its lifetime. Larger than
// the start scale so the cloud "blooms" as it dissipates.
export const TIRE_SMOKE_END_SCALE = 2.6

// Vertical rise speed in world units / second. Puff starts at the rear-wheel
// y and floats upward as it fades.
export const TIRE_SMOKE_RISE_SPEED = 1.6

// How a brake input contributes to puff intensity beyond the slide cue. A
// hard brake at speed (especially with the handbrake) should puff smoke even
// if the steering wheel is centered. Capped at 1.
export const TIRE_SMOKE_BRAKE_WEIGHT = 0.8

// Slight extra lift a puff gets immediately at spawn so the bottom of the
// puff is not embedded in the road plane. World units.
export const TIRE_SMOKE_BASE_Y = 0.35

export interface TireSmokeSpawnDecision {
  spawn: boolean
  intervalMs: number
}

/**
 * Combined puff intensity in [0..1] from the per-frame inputs that make a
 * tire actually smoke in real life: slide angle, hard braking, and speed.
 *
 * The slide cue uses the same shape as the skid intensity (steering deflection
 * scaled by speed ratio) so the SFX, skid marks, and tire smoke all stay in
 * sync. The brake cue is a separate additive that lets a hard straight-line
 * brake at speed puff smoke without any steering input. Off-track adds a
 * small flat boost so a wheel dropping into the grass still puffs.
 *
 * Defensive against non-finite or out-of-range inputs so the renderer can
 * call this every frame without guarding the call site.
 */
export function puffIntensity(
  speedAbs: number,
  maxSpeed: number,
  steerAbs: number,
  brakeInput: number,
  onTrack: boolean,
): number {
  if (!Number.isFinite(speedAbs) || speedAbs < 0) return 0
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0) return 0
  if (!Number.isFinite(steerAbs) || steerAbs < 0) steerAbs = 0
  if (!Number.isFinite(brakeInput)) brakeInput = 0
  const speedRatio = clamp01(speedAbs / maxSpeed)
  const slide = clamp01(steerAbs) * speedRatio * 1.5
  const brake = clamp01(Math.max(0, brakeInput)) * speedRatio * TIRE_SMOKE_BRAKE_WEIGHT
  const offBoost = onTrack ? 0 : 0.25
  return clamp01(slide + brake + offBoost)
}

/**
 * Returns whether to spawn a new puff this frame and the effective spawn
 * interval. Same time-based cadence as the skid mark layer so paired stripes
 * and paired puffs land at the same beat.
 */
export function shouldSpawnTireSmoke(
  intensity: number,
  speedAbs: number,
  msSinceLastSpawn: number,
  intervalMs = TIRE_SMOKE_SPAWN_INTERVAL_MS,
): TireSmokeSpawnDecision {
  if (intensity < TIRE_SMOKE_MIN_INTENSITY) return { spawn: false, intervalMs }
  if (speedAbs < TIRE_SMOKE_MIN_SPEED) return { spawn: false, intervalMs }
  if (msSinceLastSpawn < intervalMs) return { spawn: false, intervalMs }
  return { spawn: true, intervalMs }
}

/**
 * Per-puff alpha as it ages. Linear ramp from `peak` at age 0 to 0 at
 * `TIRE_SMOKE_FADE_MS`. Returns 0 once the puff has fully expired so the
 * caller can hide the sprite without an extra epsilon check.
 */
export function puffAlpha(
  ageMs: number,
  peak: number,
  fadeMs = TIRE_SMOKE_FADE_MS,
): number {
  if (!Number.isFinite(ageMs) || ageMs <= 0) return clamp01(peak)
  if (!Number.isFinite(fadeMs) || fadeMs <= 0) return 0
  if (ageMs >= fadeMs) return 0
  return clamp01(peak) * (1 - ageMs / fadeMs)
}

/**
 * Per-puff world-unit scale as it ages. Linear ramp from `TIRE_SMOKE_START_SCALE`
 * at age 0 to `TIRE_SMOKE_END_SCALE` at `TIRE_SMOKE_FADE_MS`, so the puff
 * blooms outward as it dissipates.
 */
export function puffScale(
  ageMs: number,
  fadeMs = TIRE_SMOKE_FADE_MS,
  startScale = TIRE_SMOKE_START_SCALE,
  endScale = TIRE_SMOKE_END_SCALE,
): number {
  if (!Number.isFinite(ageMs) || ageMs <= 0) return startScale
  if (!Number.isFinite(fadeMs) || fadeMs <= 0) return startScale
  if (ageMs >= fadeMs) return endScale
  const k = ageMs / fadeMs
  return startScale + (endScale - startScale) * k
}

/**
 * How far above the spawn point the puff has risen, in world units. Linear
 * with age at `TIRE_SMOKE_RISE_SPEED` units per second.
 */
export function puffRise(
  ageMs: number,
  riseSpeed = TIRE_SMOKE_RISE_SPEED,
): number {
  if (!Number.isFinite(ageMs) || ageMs <= 0) return 0
  if (!Number.isFinite(riseSpeed) || riseSpeed <= 0) return 0
  return (ageMs / 1000) * riseSpeed
}

/**
 * Peak opacity for a freshly spawned puff, scaled by the puff's intensity
 * and clamped to `TIRE_SMOKE_BASE_ALPHA`.
 */
export function puffPeakAlpha(intensity: number): number {
  return clamp01(intensity) * TIRE_SMOKE_BASE_ALPHA
}

/**
 * Advance the ring-buffer write index by 1 wrap. Each spawn places two
 * puffs (one per rear wheel) so the renderer normally calls this twice in
 * sequence. Defensive against zero-or-negative pool sizes (returns 0).
 */
export function nextTireSmokeIndex(
  current: number,
  poolSize = TIRE_SMOKE_POOL_SIZE,
): number {
  if (!Number.isFinite(poolSize) || poolSize <= 0) return 0
  return (current + 1) % poolSize
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}
