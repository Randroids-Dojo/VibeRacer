/**
 * Pure helpers for the snow particle system.
 *
 * Mirrors the rain layer in shape but tunes the constants for snowfall: each
 * particle is a small white point that drifts downward slowly under gravity
 * with a gentle horizontal sway so the flakes read as windblown rather than
 * marching in straight lines. The renderer (sceneBuilder) keeps a fixed-size
 * pool of points whose positions follow the camera so the player always sees a
 * consistent flurry regardless of where on the track they are.
 *
 * Every helper here is pure so the math is unit-testable without a DOM, WebGL
 * context, or seeded RNG implementation detail leaking into the renderer.
 *
 * Render-side wiring (Points mesh, sprite material, group-following-the-
 * camera) lives in `sceneBuilder.ts`. This module only knows about positions,
 * velocities, the 3D box the snow occupies relative to the camera, the per-
 * particle phase that drives the sway animation, and the per-frame tick that
 * advances each particle and wraps it back to the top of the box once it
 * reaches the ground.
 */

// Volume the snow occupies relative to a follow point (typically the camera
// or car). Wide enough that the player always sees flakes even when looking
// to the side, deep enough to fill the camera's near and far distance. The
// vertical envelope is similar to rain but the floor sits a bit higher so
// flakes do not visually pile up on top of the road.
export const SNOW_BOX_HALF_WIDTH = 70
export const SNOW_BOX_HALF_DEPTH = 70
export const SNOW_BOX_TOP = 35
export const SNOW_BOX_FLOOR = 1

// Default particle count. Snow benefits from a higher density than rain
// because each flake is a single dot (no streak length to imply motion blur),
// so we lean on count + drift to read as a flurry. 520 points is still well
// inside the cheap-render-path budget (a single Points draw call).
export const DEFAULT_SNOW_PARTICLES = 520

// Each flake is a small textured Point. Size is in world units so the renderer
// scales it with distance via `sizeAttenuation`. A 0.45-unit point at 30 units
// away reads as a soft pea-sized flake against the asphalt; the alpha edge of
// the procedurally generated sprite hides the square outline that raw Points
// would otherwise show.
export const SNOW_POINT_SIZE = 0.45

// Default fall speed in world units per second. Snow falls roughly an order of
// magnitude slower than rain; 4 m/s is roughly terminal velocity for a real
// snowflake and lets the eye track individual flakes against a moving car.
export const SNOW_FALL_SPEED = 4

// Sway constants. The sway amplitude (`SNOW_SWAY_AMP`) is the horizontal
// excursion in world units; the frequency (`SNOW_SWAY_FREQ_HZ`) is how many
// full sway cycles a single flake completes per second. Combined with the
// per-particle phase the flakes drift in a soft sinusoid that reads as wind.
// Tuned so the sway is visible but the dominant motion is still vertical.
export const SNOW_SWAY_AMP = 0.6
export const SNOW_SWAY_FREQ_HZ = 0.35

// Tiny constant horizontal drift on top of the sway so the flurry has a
// visible weather direction. Picked small so the flakes still fall mostly
// straight down but the scene reads as windy.
export const SNOW_WIND_X = 1.2
export const SNOW_WIND_Z = 0

// Color and base alpha for the point material. Pure white reads against both
// the dark asphalt and the lighter overcast sky. Alpha picked so the flakes
// look like solid dots rather than ghostly smears.
export const SNOW_COLOR_HEX = 0xffffff
export const SNOW_OPACITY = 0.85

export interface SnowConfig {
  // Dimensions of the snow volume around the follow point.
  halfWidth: number
  halfDepth: number
  top: number
  floor: number
  // World units per second. Positive falls downward (negative Y velocity).
  fallSpeed: number
  // Horizontal sway amplitude in world units and frequency in Hz.
  swayAmp: number
  swayFreqHz: number
  // Constant horizontal drift in world units per second on top of sway.
  windX: number
  windZ: number
}

export const DEFAULT_SNOW_CONFIG: SnowConfig = {
  halfWidth: SNOW_BOX_HALF_WIDTH,
  halfDepth: SNOW_BOX_HALF_DEPTH,
  top: SNOW_BOX_TOP,
  floor: SNOW_BOX_FLOOR,
  fallSpeed: SNOW_FALL_SPEED,
  swayAmp: SNOW_SWAY_AMP,
  swayFreqHz: SNOW_SWAY_FREQ_HZ,
  windX: SNOW_WIND_X,
  windZ: SNOW_WIND_Z,
}

// Compact 32-bit Mulberry32-style RNG. Pure: same seed always returns the
// same sequence. Picked over Math.random so unit tests can pin every spawn
// position without monkey-patching globals. Mirrors `makeRainRng` so the two
// particle systems share the same defensive properties.
export function makeSnowRng(seed: number): () => number {
  let s = (seed | 0) || 1
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface SnowParticle {
  // World position offset relative to the follow point (camera or car). The
  // renderer adds the follow point's world position each frame to get the
  // final placement. Storing offsets means the particles never need to be
  // teleported when the follow point moves; only when one falls below the
  // floor does it wrap back to the top.
  ox: number
  oy: number
  oz: number
  // Per-particle phase in radians. Used by the sway calculation so adjacent
  // flakes are out-of-phase and the flurry reads as a soft natural drift
  // instead of every flake oscillating in lockstep.
  phase: number
  // Per-particle sway frequency multiplier in [0.5, 1.5] so two flakes that
  // share a phase do not visibly track each other. Multiplies the global
  // `swayFreqHz` from the config.
  freqScale: number
}

/**
 * Build the initial particle pool. Positions are uniformly distributed in
 * the snow box so the player sees a steady flurry from the very first frame
 * instead of waiting for the spawn ring to fill in. Phase and freqScale are
 * also drawn from the RNG so the sway looks natural the moment the layer
 * becomes visible.
 */
export function initSnowParticles(
  count: number,
  rng: () => number,
  config: SnowConfig = DEFAULT_SNOW_CONFIG,
): SnowParticle[] {
  if (count <= 0) return []
  const out: SnowParticle[] = new Array(count)
  for (let i = 0; i < count; i++) {
    out[i] = {
      ox: (rng() * 2 - 1) * config.halfWidth,
      oy: rng() * (config.top + config.floor) - config.floor,
      oz: (rng() * 2 - 1) * config.halfDepth,
      phase: rng() * Math.PI * 2,
      // Map [0, 1) -> [0.5, 1.5) so every flake has a slightly different
      // sway period. Visible variety, no extreme outliers.
      freqScale: 0.5 + rng(),
    }
  }
  return out
}

/**
 * Advance every particle by `dtSec` seconds. Mutates the array in place so
 * the renderer can keep one allocation across the whole game session. When a
 * particle falls below the floor it wraps back to a fresh random spawn near
 * the top so the snow is endless without growing the pool.
 *
 * `nowSec` drives the sway phase. The horizontal wind is applied as a constant
 * drift; particles that drift outside the box wrap back to the opposite side
 * so the volume always stays filled. Returns the same array for chaining.
 */
export function tickSnowParticles(
  particles: SnowParticle[],
  dtSec: number,
  nowSec: number,
  rng: () => number,
  config: SnowConfig = DEFAULT_SNOW_CONFIG,
): SnowParticle[] {
  if (particles.length === 0) return particles
  if (dtSec <= 0 || !Number.isFinite(dtSec)) return particles
  if (!Number.isFinite(nowSec)) return particles
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
      // Wrap to the top. Pick a new random horizontal position plus a fresh
      // phase / freqScale so the flurry stays visually noisy instead of
      // marching in lock-step rows.
      p.oy = config.top
      p.ox = (rng() * 2 - 1) * w
      p.oz = (rng() * 2 - 1) * d
      p.phase = rng() * Math.PI * 2
      p.freqScale = 0.5 + rng()
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
 * Compute the X-axis sway offset for a single particle at time `nowSec`. Pure
 * so the renderer can compose it with the particle's stored offset and the
 * follow point inside `writeSnowGeometry` without needing a sin / cos call
 * tree leaked into a shader. Called per-particle per-frame, so the math is
 * intentionally tight: one multiply for the angular frequency, one sin call,
 * one multiply for the amplitude.
 */
export function snowSwayOffset(
  particle: SnowParticle,
  nowSec: number,
  config: SnowConfig = DEFAULT_SNOW_CONFIG,
): number {
  if (!Number.isFinite(nowSec)) return 0
  const omega = 2 * Math.PI * config.swayFreqHz * particle.freqScale
  return config.swayAmp * Math.sin(omega * nowSec + particle.phase)
}

/**
 * Write the particle positions into a Float32Array suitable for a Three.js
 * `BufferAttribute` of size `count * 3` (one vertex per flake; the renderer
 * draws Points so each particle is one vertex, not two like the rain
 * streaks). The renderer hands the same buffer in every frame so this
 * allocates nothing.
 *
 * The follow offset is added here so the renderer can keep its `Group`
 * positioned at the world origin and just stream new vertex positions; the
 * alternative (positioning the group on the follow point) means every vertex's
 * world position would still be the same plus the group offset, so either
 * approach works. Doing the math here keeps the helper testable and matches
 * how the rain layer is structured.
 */
export function writeSnowGeometry(
  particles: SnowParticle[],
  followX: number,
  followY: number,
  followZ: number,
  nowSec: number,
  positions: Float32Array,
  config: SnowConfig = DEFAULT_SNOW_CONFIG,
): Float32Array {
  const want = particles.length * 3
  if (positions.length < want) {
    throw new Error(
      `writeSnowGeometry: positions buffer too small (need ${want}, have ${positions.length})`,
    )
  }
  const safeNow = Number.isFinite(nowSec) ? nowSec : 0
  let ptr = 0
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    const sway = snowSwayOffset(p, safeNow, config)
    positions[ptr++] = p.ox + followX + sway
    positions[ptr++] = p.oy + followY
    positions[ptr++] = p.oz + followZ
  }
  return positions
}

/**
 * Build an alpha-feathered circular sprite as raw RGBA bytes. Used by the
 * renderer to tint the Points so each flake reads as a soft round dot instead
 * of the default square. Pure so the unit tests can pin pixel values.
 *
 * Returns a square (size x size) RGBA byte array. White center fades to
 * transparent at the edge through a smoothstep curve so the sprite has no
 * visible square outline against the sky.
 */
export function buildSnowflakeSprite(size: number): Uint8Array {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error(`buildSnowflakeSprite: size must be a positive integer (got ${size})`)
  }
  const out = new Uint8Array(size * size * 4)
  const c = (size - 1) / 2
  // Map distance-from-center to alpha. Inside the inner radius we are fully
  // opaque; outside the outer radius we are fully transparent; in between we
  // ramp through smoothstep so the edge is feathered.
  const innerR = size * 0.18
  const outerR = size * 0.5
  const ramp = outerR - innerR
  let p = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c
      const dy = y - c
      const r = Math.sqrt(dx * dx + dy * dy)
      let alpha: number
      if (r <= innerR) alpha = 1
      else if (r >= outerR) alpha = 0
      else {
        const t = 1 - (r - innerR) / ramp
        // Smoothstep so the falloff has no visible band edge.
        alpha = t * t * (3 - 2 * t)
      }
      const a = Math.round(alpha * 255)
      out[p++] = 255 // R
      out[p++] = 255 // G
      out[p++] = 255 // B
      out[p++] = a
    }
  }
  return out
}
