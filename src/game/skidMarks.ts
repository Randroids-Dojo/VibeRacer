/**
 * Pure helpers for the skid mark system.
 *
 * The renderer (sceneBuilder) owns a fixed-size pool of dark quads that sit
 * just above the road surface. These helpers decide:
 *
 *  1. When to spawn a new mark (`shouldSpawn`) given current skid intensity,
 *     speed, and time since the last spawn, and
 *  2. How wide each mark should be drawn given the current intensity,
 *  3. How to fade an existing mark's opacity each frame given its age,
 *  4. How to advance the ring-buffer write index on spawn.
 *
 * The renderer-side wiring is the only place that touches Three.js; this
 * module is fully unit-testable without a DOM or WebGL context.
 */

// Default spacing between successive marks while the player is sliding. At
// 100 ms a car traveling 25 u/s lays a mark every 2.5 world units, which
// reads as a continuous streak without flooding the pool.
export const SKID_SPAWN_INTERVAL_MS = 100

// Minimum skid intensity (from `skidIntensity` in audio.ts) required before
// any mark is laid. Below this the slide is too weak to read visually.
export const SKID_SPAWN_MIN_INTENSITY = 0.35

// Minimum speed (world units / sec) to lay a mark. Stops parking-lot wheel
// turns from littering the track. Picked above the physics steering floor of
// 0.8 u/s so the car must actually be moving with intent.
export const SKID_SPAWN_MIN_SPEED = 4

// Maximum number of mark quads in the pool. Each mark is a single quad so
// 220 keeps the GPU footprint tiny while giving roughly 22 seconds of trail
// at the default spawn cadence.
export const SKID_MARK_POOL_SIZE = 220

// How long (ms) after spawn a mark fades to zero opacity. Picked so a fast
// player still sees their last few corners but the trail does not stack
// unboundedly during long slides.
export const SKID_MARK_FADE_MS = 4500

// Peak opacity at spawn for a max-intensity slide. Multiplied by the actual
// intensity at spawn time so weak slides leave fainter marks.
export const SKID_MARK_BASE_ALPHA = 0.85

// Quad dimensions in world units. Width corresponds to the rear-axle track
// width of the car model (about half of TRACK_WIDTH so two distinct stripes
// fit). Length is short so successive marks blend smoothly without obvious
// seams when the car is curving.
export const SKID_MARK_LENGTH = 1.4

export interface SkidMarkSpawnDecision {
  spawn: boolean
  intervalMs: number
}

/**
 * Returns whether to spawn a new skid mark this frame and the effective
 * spawn interval (handy when the caller wants to debounce or back-pressure).
 *
 * The decision is purely time-based: as long as the slide is intense enough
 * and the car is moving, drop a mark every `SKID_SPAWN_INTERVAL_MS`. Slower
 * cars in tight slides still get a continuous streak because the spacing in
 * world space scales with their speed.
 */
export function shouldSpawnSkidMark(
  intensity: number,
  speedAbs: number,
  msSinceLastSpawn: number,
  intervalMs = SKID_SPAWN_INTERVAL_MS,
): SkidMarkSpawnDecision {
  if (intensity < SKID_SPAWN_MIN_INTENSITY) return { spawn: false, intervalMs }
  if (speedAbs < SKID_SPAWN_MIN_SPEED) return { spawn: false, intervalMs }
  if (msSinceLastSpawn < intervalMs) return { spawn: false, intervalMs }
  return { spawn: true, intervalMs }
}

/**
 * Per-mark alpha as it ages. Linear ramp from `peak` at age 0 to 0 at
 * `SKID_MARK_FADE_MS`. Returns 0 once the mark has fully expired so the
 * caller can hide the quad without an extra epsilon check.
 */
export function skidMarkAlpha(
  ageMs: number,
  peak: number,
  fadeMs = SKID_MARK_FADE_MS,
): number {
  if (ageMs <= 0) return clamp01(peak)
  if (ageMs >= fadeMs) return 0
  const k = 1 - ageMs / fadeMs
  return clamp01(peak) * k
}

/**
 * Peak opacity for a freshly spawned mark, scaled by the slide's intensity
 * and clamped to `SKID_MARK_BASE_ALPHA`.
 */
export function skidMarkPeakAlpha(intensity: number): number {
  return clamp01(intensity) * SKID_MARK_BASE_ALPHA
}

/**
 * Advance the ring-buffer write index by 1 wrap. Returning the next index
 * keeps the pool a flat array indexed by integer.
 */
export function nextSkidMarkIndex(
  current: number,
  poolSize = SKID_MARK_POOL_SIZE,
): number {
  if (poolSize <= 0) return 0
  return (current + 1) % poolSize
}

function clamp01(x: number): number {
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}
