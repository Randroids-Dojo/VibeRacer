/**
 * Speed lines.
 *
 * Pure helpers for the screen-space speed-line streak overlay. When the player
 * is going fast (above a fractional threshold of their tuning's `maxSpeed`)
 * thin streaks radiate outward from the screen center to sell the feeling of
 * velocity. Inspired by anime racing titles and the rush moments in Forza
 * Horizon: a cosmetic visual layer that never affects gameplay.
 *
 * Coordinate system: every spawn / tick / draw value is in NORMALIZED viewport
 * units (0..1), so a window resize does not knock the simulation out of sync.
 * The draw pass multiplies by the current canvas size on each paint.
 *
 * Design constraints:
 *
 * - Zero idle cost when the player is below the speed threshold. The
 *   `speedLineSpawnCount` helper returns 0 below threshold; the renderer
 *   short-circuits on an empty pool.
 * - Streaks never spawn on top of the player car (visible in the lower middle
 *   third of the screen). Each spawn rolls an angle plus an inner radius so
 *   the streak starts well outside that band and travels outward.
 * - Streak intensity (count + opacity + length) ramps with how far the player
 *   is past the threshold so the effect builds gradually instead of snapping
 *   on at one specific speed.
 * - All RNG comes from a small Mulberry32-style 32-bit hash so a given
 *   `(seed, frame)` pair always yields the same spawn pattern in tests.
 */

// Speed fraction (live speed / maxSpeed) at which the first streak appears.
// Below this the overlay is invisible and the spawn helper returns 0.
export const SPEED_LINES_THRESHOLD = 0.65
// Speed fraction at which the effect saturates (max spawn rate, max opacity,
// max length). Past this the renderer tops out so a tuned car at 100% does not
// produce an unreadable wall of white.
export const SPEED_LINES_SATURATION = 0.95
// Maximum number of streaks alive at any time. Soft ceiling: the renderer
// drops the oldest streak when this is exceeded so the effect never runaway-
// allocates on a long top-speed straight.
export const SPEED_LINES_POOL_MAX = 80
// Per-second spawn rate at saturation. Below saturation the rate scales
// linearly with the speed-past-threshold fraction.
export const SPEED_LINES_SPAWN_PER_SEC = 60
// How long each streak lives before it is fully faded out.
export const SPEED_LINES_LIFE_MS = 350
// Inner spawn radius (normalized; 0 = screen center, 0.5 = halfway to edge).
// Streaks always start outside this radius so the player car (rendered near
// the bottom-center) is never covered by a fresh streak.
export const SPEED_LINES_INNER_RADIUS = 0.32
// Outer spawn radius. A streak's start point is uniformly chosen between
// inner and outer; lower values keep the streak inside the viewport, higher
// values let some streaks start at the very edge for variety.
export const SPEED_LINES_OUTER_RADIUS = 0.7
// Per-streak length at saturation (normalized; multiplied by the screen min
// dimension on draw). Length scales linearly with the speed-past-threshold
// fraction down to half-length at threshold.
export const SPEED_LINES_LENGTH_SAT = 0.18
// Per-streak peak opacity at saturation. Below saturation the opacity scales
// down linearly so the threshold crossing is a gentle fade-in.
export const SPEED_LINES_PEAK_ALPHA = 0.65
// Streak color hex (rgb()-friendly string). Cool white with a subtle blue
// tint so the layer reads as "wind" rather than "snow".
export const SPEED_LINES_COLOR_HEX = '#dff3ff'

export interface SpeedLineParticle {
  // Angle (radians) the streak radiates along. 0 = right, PI/2 = down.
  angle: number
  // Distance from screen center (normalized) of the streak's INNER end. The
  // streak extends outward from this point along `angle` for `length` units.
  startRadius: number
  // Length of the streak (normalized). The OUTER end sits at
  // `(startRadius + length)` along `angle`.
  length: number
  // Peak alpha for this streak. Combined with the per-frame `streakAlpha`
  // ramp so a fading streak does not exceed its peak.
  peakAlpha: number
  // Age in milliseconds. 0 at spawn, advances each tick, fully faded once
  // it crosses `SPEED_LINES_LIFE_MS`.
  ageMs: number
}

// Mulberry32-style RNG. Returns a function that yields uniform [0, 1) floats.
// Seeded so a given seed reproduces the same spawn sequence in tests.
export function makeSpeedLinesRng(seed: number): () => number {
  let state = (Number.isFinite(seed) ? seed : 0) >>> 0
  if (state === 0) state = 0x9e3779b9 // Avoid the zero-state degenerate output.
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Map the live speed fraction to a 0..1 "intensity" that drives spawn rate,
// length, and opacity. Returns 0 below threshold, 1 at saturation, and a
// linear ramp between.
export function speedLinesIntensity(speedFraction: number): number {
  if (!Number.isFinite(speedFraction) || speedFraction <= SPEED_LINES_THRESHOLD)
    return 0
  if (speedFraction >= SPEED_LINES_SATURATION) return 1
  const range = SPEED_LINES_SATURATION - SPEED_LINES_THRESHOLD
  if (range <= 0) return 1
  const t = (speedFraction - SPEED_LINES_THRESHOLD) / range
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t
}

// How many streaks to spawn this frame given the live speed fraction and the
// elapsed time since the last frame. Returns a non-negative integer; the
// caller is responsible for capping the active pool. Defensive against bad
// dt inputs (NaN, Infinity, negative, zero) so a one-frame glitch cannot
// swarm the renderer.
//
// Carries forward fractional spawn over multiple frames via the `carry`
// argument. The caller passes the previous frame's returned `nextCarry` so
// even at low spawn rates the streaks accumulate smoothly instead of
// snapping in once per second.
export function speedLineSpawnCount(
  speedFraction: number,
  dtSec: number,
  carry: number,
): { spawn: number; nextCarry: number } {
  const intensity = speedLinesIntensity(speedFraction)
  if (intensity <= 0) return { spawn: 0, nextCarry: 0 }
  if (!Number.isFinite(dtSec) || dtSec <= 0) {
    return { spawn: 0, nextCarry: Number.isFinite(carry) ? carry : 0 }
  }
  const safeCarry = Number.isFinite(carry) && carry >= 0 ? carry : 0
  const want = SPEED_LINES_SPAWN_PER_SEC * intensity * dtSec + safeCarry
  const spawn = Math.floor(want)
  const nextCarry = want - spawn
  return { spawn, nextCarry }
}

// Roll a fresh streak from the RNG. Angle is uniform 0..2*PI; start radius is
// uniform between inner and outer; length scales with intensity from half-
// length at threshold (intensity = 0+) up to full length at saturation;
// peak alpha scales the same way.
export function spawnSpeedLine(
  rng: () => number,
  intensity: number,
): SpeedLineParticle {
  const safeIntensity = clamp01(intensity)
  const angle = rng() * Math.PI * 2
  const radiusSpan = SPEED_LINES_OUTER_RADIUS - SPEED_LINES_INNER_RADIUS
  const startRadius = SPEED_LINES_INNER_RADIUS + rng() * radiusSpan
  const lengthScale = 0.5 + 0.5 * safeIntensity
  const length = SPEED_LINES_LENGTH_SAT * lengthScale
  // Add a small per-streak alpha jitter (+/- 15%) so the layer does not read
  // as a perfectly uniform fan of identical streaks; the eye picks up the
  // randomness as motion noise, which is exactly what we want.
  const alphaJitter = 0.85 + rng() * 0.3
  const peakAlpha = SPEED_LINES_PEAK_ALPHA * safeIntensity * alphaJitter
  return {
    angle,
    startRadius,
    length,
    peakAlpha,
    ageMs: 0,
  }
}

// Step every active streak forward by dtMs. Streaks past their life span are
// flagged for removal by the caller (this helper does not mutate the array
// length, only per-particle state). Defensive against non-finite dt so the
// pool never collects NaN ages.
export function stepSpeedLines(
  particles: SpeedLineParticle[],
  dtMs: number,
): void {
  if (!Array.isArray(particles) || particles.length === 0) return
  if (!Number.isFinite(dtMs) || dtMs <= 0) return
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    if (!p) continue
    p.ageMs += dtMs
  }
}

// Per-streak opacity ramp. Streaks fade in over the first 20% of their life
// (so they do not pop), hold at peak for the next 30%, then linearly fade out
// over the remaining 50%. Returns 0 once the streak is fully expired so the
// renderer can skip the draw.
export function streakAlpha(ageMs: number, peakAlpha: number): number {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 0
  if (ageMs >= SPEED_LINES_LIFE_MS) return 0
  const safePeak = clamp01(Number.isFinite(peakAlpha) ? peakAlpha : 0)
  if (safePeak <= 0) return 0
  const t = ageMs / SPEED_LINES_LIFE_MS
  if (t < 0.2) {
    return safePeak * (t / 0.2)
  }
  if (t < 0.5) {
    return safePeak
  }
  // Fade out from t = 0.5 to t = 1.0
  return safePeak * (1 - (t - 0.5) / 0.5)
}

// True once the streak has aged past its life span. The renderer compacts
// expired streaks out of the active array between draw calls.
export function isStreakExpired(particle: SpeedLineParticle | undefined): boolean {
  if (!particle) return true
  if (!Number.isFinite(particle.ageMs)) return true
  return particle.ageMs >= SPEED_LINES_LIFE_MS
}

function clamp01(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0
  if (v >= 1) return 1
  return v
}
