/**
 * Pure helpers for the rain particle system.
 *
 * The renderer (sceneBuilder) owns a fixed-size pool of small line segments
 * representing falling rain streaks. The pool follows the camera so the
 * player always sees a consistent density of rain regardless of where on the
 * track they are. Every helper here is pure so the math is unit-testable
 * without a DOM, WebGL context, or seeded RNG implementation detail leaking
 * into the renderer.
 *
 * Render-side wiring (lines, materials, group-following-the-camera) lives in
 * `sceneBuilder.ts`. This module only knows about positions, velocities, the
 * 3D box the rain occupies relative to the camera, and the per-frame tick
 * that advances each particle and wraps it back to the top of the box once
 * it reaches the ground.
 */

// Volume the rain occupies relative to a follow point (typically the camera
// or car). Wide enough that the player always sees rain even when looking
// to the side, deep enough to fill the camera's near and far distance.
export const RAIN_BOX_HALF_WIDTH = 70
export const RAIN_BOX_HALF_DEPTH = 70
// Rain spawns near the top of the box and falls to the bottom. Bottom is at
// `-RAIN_BOX_FLOOR` so the streaks hit the ground plane (which sits at y=0)
// before disappearing; top is `RAIN_BOX_TOP` above the follow point so the
// streaks reach a comfortable spawn height even when the camera is close to
// the road.
export const RAIN_BOX_TOP = 35
export const RAIN_BOX_FLOOR = 1

// Default particle count. 380 streaks gives a solid downpour without making
// the GPU sweat. Each streak is a single colored line segment (two vertices)
// so the cost is cheaper than a comparable Points cloud with custom shaders.
export const DEFAULT_RAIN_PARTICLES = 380

// Each streak is drawn as a short line segment from (x, y, z) up to
// (x, y + RAIN_STREAK_LENGTH, z). The length feels right when the streak is
// roughly 30% of the average per-frame fall distance at default speed so the
// player perceives motion blur instead of a static dot.
export const RAIN_STREAK_LENGTH = 1.6

// Default fall speed in world units per second. World units are roughly
// meters in the rest of the game, so 50 m/s feels like a heavy downpour
// while still letting the eye track individual streaks.
export const RAIN_FALL_SPEED = 50

// Tiny constant horizontal drift so the rain reads as wind-blown rather than
// perfectly vertical. Picked small so the streaks still look near-vertical
// but the scene has visible weather direction.
export const RAIN_WIND_X = 4
export const RAIN_WIND_Z = 0

// Color and base alpha for the streak material. Picked to read against both
// dark asphalt and the lighter grey overcast sky without drowning the scene.
export const RAIN_COLOR_HEX = 0xc8d6e6
export const RAIN_OPACITY = 0.55

export interface RainConfig {
  // Dimensions of the rain volume around the follow point.
  halfWidth: number
  halfDepth: number
  top: number
  floor: number
  // Length of a single streak, in world units. Drawn upward from each
  // particle's recorded position so the bottom of the streak is the
  // "leading edge" at ground impact.
  streakLength: number
  // World units per second. Positive falls downward (negative Y velocity).
  fallSpeed: number
  // Constant horizontal drift in world units per second.
  windX: number
  windZ: number
}

export const DEFAULT_RAIN_CONFIG: RainConfig = {
  halfWidth: RAIN_BOX_HALF_WIDTH,
  halfDepth: RAIN_BOX_HALF_DEPTH,
  top: RAIN_BOX_TOP,
  floor: RAIN_BOX_FLOOR,
  streakLength: RAIN_STREAK_LENGTH,
  fallSpeed: RAIN_FALL_SPEED,
  windX: RAIN_WIND_X,
  windZ: RAIN_WIND_Z,
}

// Compact 32-bit Mulberry32-style RNG. Pure: same seed always returns the
// same sequence. Picked over Math.random so unit tests can pin every spawn
// position without monkey-patching globals.
export function makeRainRng(seed: number): () => number {
  let s = (seed | 0) || 1
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface RainParticle {
  // World position offset relative to the follow point (camera or car). The
  // renderer adds the follow point's world position each frame to get the
  // final placement. Storing offsets means the particles never need to be
  // teleported when the follow point moves; only when one falls below the
  // floor does it wrap back to the top.
  ox: number
  oy: number
  oz: number
}

/**
 * Build the initial particle pool. Positions are uniformly distributed in
 * the rain box so the player sees a steady downpour from the very first
 * frame instead of waiting for the spawn ring to fill in.
 */
export function initRainParticles(
  count: number,
  rng: () => number,
  config: RainConfig = DEFAULT_RAIN_CONFIG,
): RainParticle[] {
  if (count <= 0) return []
  const out: RainParticle[] = new Array(count)
  for (let i = 0; i < count; i++) {
    out[i] = {
      ox: (rng() * 2 - 1) * config.halfWidth,
      oy: rng() * (config.top + config.floor) - config.floor,
      oz: (rng() * 2 - 1) * config.halfDepth,
    }
  }
  return out
}

/**
 * Advance every particle by `dtSec` seconds. Mutates the array in place so
 * the renderer can keep one allocation across the whole game session. When
 * a particle falls below the floor it wraps back to a fresh random spawn
 * near the top so the rain is endless without growing the pool.
 *
 * The horizontal wind is applied as a constant drift; particles that drift
 * outside the box wrap back to the opposite side so the volume always stays
 * filled. Returns the same array for chaining.
 */
export function tickRainParticles(
  particles: RainParticle[],
  dtSec: number,
  rng: () => number,
  config: RainConfig = DEFAULT_RAIN_CONFIG,
): RainParticle[] {
  if (particles.length === 0) return particles
  if (dtSec <= 0 || !Number.isFinite(dtSec)) return particles
  const fallStep = config.fallSpeed * dtSec
  const driftX = config.windX * dtSec
  const driftZ = config.windZ * dtSec
  const w = config.halfWidth
  const d = config.halfDepth
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    p.oy -= fallStep
    p.ox += driftX
    p.oz += driftZ
    if (p.oy < -config.floor) {
      // Wrap to the top. Pick a new random horizontal position so the rain
      // shower stays visually noisy instead of marching in lock-step rows.
      p.oy = config.top
      p.ox = (rng() * 2 - 1) * w
      p.oz = (rng() * 2 - 1) * d
      continue
    }
    // Wrap horizontally so the wind never carries the cloud off the box.
    if (p.ox > w) p.ox -= w * 2
    else if (p.ox < -w) p.ox += w * 2
    if (p.oz > d) p.oz -= d * 2
    else if (p.oz < -d) p.oz += d * 2
  }
  return particles
}

/**
 * Write the particle positions into a Float32Array suitable for a Three.js
 * `BufferAttribute` of size `count * 6` (two vertices per streak: start at
 * (ox, oy, oz) + follow, end at (ox, oy + streakLength, oz) + follow). The
 * renderer hands the same buffer in every frame so this allocates nothing.
 *
 * The follow offset is added here so the renderer can keep its `Group`
 * positioned at the world origin and just stream new vertex positions; the
 * alternative (positioning the group on the follow point) means every
 * vertex's world position would still be the same plus the group offset, so
 * either approach works. Doing the math here keeps the helper testable.
 */
export function writeRainGeometry(
  particles: RainParticle[],
  followX: number,
  followY: number,
  followZ: number,
  streakLength: number,
  positions: Float32Array,
): Float32Array {
  const want = particles.length * 6
  if (positions.length < want) {
    throw new Error(
      `writeRainGeometry: positions buffer too small (need ${want}, have ${positions.length})`,
    )
  }
  let ptr = 0
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    const x = p.ox + followX
    const yBottom = p.oy + followY
    const z = p.oz + followZ
    positions[ptr++] = x
    positions[ptr++] = yBottom
    positions[ptr++] = z
    positions[ptr++] = x
    positions[ptr++] = yBottom + streakLength
    positions[ptr++] = z
  }
  return positions
}
