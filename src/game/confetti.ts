/**
 * Pure helpers for the PB / record celebration confetti.
 *
 * The renderer (a 2D canvas overlay in `ConfettiOverlay.tsx`) owns the DOM,
 * the animation frame loop, and the actual draw calls. This module is
 * responsible for:
 *
 *  1. Spawning a fresh batch of particles given a seeded RNG, count, palette,
 *     and burst origin (`spawnConfettiBatch`),
 *  2. Stepping each particle forward one physics frame (`stepConfetti`),
 *  3. Computing per-particle alpha as it ages (`confettiAlpha`),
 *  4. Reporting whether a batch is fully expired (`isBatchExpired`).
 *
 * Coordinates are in normalized 0..1 viewport space (x: left, y: top). The
 * renderer multiplies by the current canvas pixel size at draw time so a
 * resize never breaks the simulation in flight.
 *
 * Determinism: every spawn takes a `seed` (a numeric RNG seed). Two spawns
 * with the same seed and inputs produce the same particle array, which keeps
 * the simulation testable without snapshotting random output.
 */

// Number of particles in a 'pb' (personal best) burst. Big enough to feel
// celebratory but small enough that low-end mobile keeps a steady 60 fps.
export const CONFETTI_PB_COUNT = 80

// Number of particles in a 'record' (track-wide top time) burst. Larger
// because beating the global best deserves more visual weight than beating
// your own.
export const CONFETTI_RECORD_COUNT = 140

// How long after spawn a particle starts fading toward zero (ms). Before
// this, particles render at full opacity.
export const CONFETTI_FADE_START_MS = 1800

// How long after spawn a particle is considered fully expired (ms). The
// renderer can drop the particle from its array once it crosses this age.
export const CONFETTI_FADE_END_MS = 3200

// Gravity applied to each particle's vertical velocity per second
// (normalized viewport units / sec^2). Roughly 1.6 means a particle falls
// the full screen height in ~1.1 seconds when starting at rest.
export const CONFETTI_GRAVITY = 1.6

// Per-second velocity drag (multiplicative). 0.9 means each particle keeps
// 90% of its velocity per second of simulation, simulating air resistance.
export const CONFETTI_DRAG_PER_SEC = 0.92

// Particle palettes by celebration kind. The PB palette skews green to match
// the existing HUD burst (#5fe08a). The record palette is multicolor with a
// gold lead because beating the global record is a louder event.
export const CONFETTI_PALETTE_PB = [
  '#5fe08a',
  '#a7f3c2',
  '#2bc06f',
  '#e7fff1',
  '#79f0a0',
]

export const CONFETTI_PALETTE_RECORD = [
  '#ffd25a',
  '#ffaa3c',
  '#ff7a3c',
  '#fff5cc',
  '#ff5acd',
  '#5fe0ff',
  '#a76bff',
]

export interface ConfettiParticle {
  // Position in normalized 0..1 viewport coords.
  x: number
  y: number
  // Velocity in normalized viewport units / sec.
  vx: number
  vy: number
  // Particle size in normalized viewport units (a pixel multiplier at draw
  // time). Roughly 0.005 to 0.015 is a comfortable range.
  size: number
  // Hex color string (renderer paints fillStyle directly).
  color: string
  // Rotation in radians plus angular velocity (rad / sec). Lets the renderer
  // spin each chip for a tumbling-paper look.
  rot: number
  vrot: number
  // Age in ms since spawn. The renderer increments this each frame; when it
  // exceeds CONFETTI_FADE_END_MS the particle is dropped.
  ageMs: number
}

/**
 * Tiny seeded LCG (Mulberry32 variant). Returns a function that yields a new
 * float in [0, 1) on each call. We avoid `Math.random` so spawns are
 * deterministic from a seed: tests can assert exact particle layouts.
 */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0
  if (s === 0) s = 1
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface SpawnConfettiOpts {
  // Number of particles to spawn.
  count: number
  // Color palette. Particles pick uniformly from this list.
  palette: readonly string[]
  // Burst origin in normalized 0..1 viewport coords. The whole batch starts
  // here and explodes outward.
  origin?: { x: number; y: number }
  // RNG seed. Same seed plus same opts yields the same particles.
  seed: number
  // Initial velocity magnitude floor and ceiling (normalized units / sec).
  // Particles draw their speed uniformly from this range.
  speedMin?: number
  speedMax?: number
  // Spread half-angle in radians (0 = straight up, PI/2 = full hemisphere).
  // Default PI/2 sprays in the upper half of the screen.
  spread?: number
  // Particle size floor and ceiling in normalized viewport units.
  sizeMin?: number
  sizeMax?: number
  // Initial angular velocity range in rad / sec.
  vrotMin?: number
  vrotMax?: number
}

const DEFAULT_ORIGIN = { x: 0.5, y: 0.4 }
const DEFAULT_SPEED_MIN = 0.4
const DEFAULT_SPEED_MAX = 1.1
const DEFAULT_SPREAD = Math.PI / 2
const DEFAULT_SIZE_MIN = 0.006
const DEFAULT_SIZE_MAX = 0.014
const DEFAULT_VROT_MIN = -8
const DEFAULT_VROT_MAX = 8

/**
 * Build a fresh batch of confetti particles around `origin`, sprayed in the
 * upper hemisphere with a slight upward bias so the burst initially climbs
 * before gravity wins. Each particle picks color, size, speed, angle, and
 * angular velocity from the seeded RNG.
 */
export function spawnConfettiBatch(opts: SpawnConfettiOpts): ConfettiParticle[] {
  if (opts.count <= 0) return []
  if (opts.palette.length === 0) return []
  const rng = makeRng(opts.seed)
  const origin = opts.origin ?? DEFAULT_ORIGIN
  const speedMin = opts.speedMin ?? DEFAULT_SPEED_MIN
  const speedMax = Math.max(speedMin, opts.speedMax ?? DEFAULT_SPEED_MAX)
  const spread = clamp(opts.spread ?? DEFAULT_SPREAD, 0, Math.PI)
  const sizeMin = opts.sizeMin ?? DEFAULT_SIZE_MIN
  const sizeMax = Math.max(sizeMin, opts.sizeMax ?? DEFAULT_SIZE_MAX)
  const vrotMin = opts.vrotMin ?? DEFAULT_VROT_MIN
  const vrotMax = Math.max(vrotMin, opts.vrotMax ?? DEFAULT_VROT_MAX)
  const out: ConfettiParticle[] = new Array(opts.count)
  for (let i = 0; i < opts.count; i++) {
    // Angle: 0 means straight up (negative Y in screen space). Spread is the
    // half-angle so the full cone is 2*spread wide. Negate Y velocity below.
    const angle = (rng() * 2 - 1) * spread
    const speed = lerp(speedMin, speedMax, rng())
    const vx = Math.sin(angle) * speed
    const vy = -Math.cos(angle) * speed
    const color = opts.palette[Math.floor(rng() * opts.palette.length)]!
    const size = lerp(sizeMin, sizeMax, rng())
    const rot = rng() * Math.PI * 2
    const vrot = lerp(vrotMin, vrotMax, rng())
    out[i] = {
      x: origin.x,
      y: origin.y,
      vx,
      vy,
      color,
      size,
      rot,
      vrot,
      ageMs: 0,
    }
  }
  return out
}

/**
 * Step every particle forward by `dtSec` seconds, applying gravity to vy and
 * a per-second multiplicative drag to both axes. Mutates the input array in
 * place for zero per-frame allocation. Returns the same array for chaining.
 *
 * The renderer is expected to call this once per rAF frame. `dtMs` is added
 * to each particle's `ageMs` so the caller does not have to pass two clocks.
 */
export function stepConfetti(
  particles: ConfettiParticle[],
  dtSec: number,
  dtMs: number,
  gravity = CONFETTI_GRAVITY,
  dragPerSec = CONFETTI_DRAG_PER_SEC,
): ConfettiParticle[] {
  if (dtSec <= 0) return particles
  // Per-frame drag scalar from the per-second drag. Math.pow handles the
  // common case where a frame is much shorter than 1 second cleanly: 0.92
  // per second at 60 fps becomes ~0.9986 per frame.
  const dragFrame = Math.pow(clamp(dragPerSec, 0, 1), dtSec)
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!
    p.vy += gravity * dtSec
    p.vx *= dragFrame
    p.vy *= dragFrame
    p.x += p.vx * dtSec
    p.y += p.vy * dtSec
    p.rot += p.vrot * dtSec
    p.ageMs += dtMs
  }
  return particles
}

/**
 * Per-particle alpha as it ages. Holds at 1.0 until `fadeStartMs`, then
 * linearly ramps to 0 by `fadeEndMs`. Returns 0 once the particle has fully
 * expired so the renderer can hide it without an extra epsilon check.
 */
export function confettiAlpha(
  ageMs: number,
  fadeStartMs = CONFETTI_FADE_START_MS,
  fadeEndMs = CONFETTI_FADE_END_MS,
): number {
  if (ageMs <= fadeStartMs) return 1
  if (ageMs >= fadeEndMs) return 0
  const span = Math.max(1, fadeEndMs - fadeStartMs)
  return 1 - (ageMs - fadeStartMs) / span
}

/**
 * True when every particle in the batch has aged past `fadeEndMs`. The
 * renderer uses this to drop the batch and stop the rAF loop once the
 * celebration has fully cleared.
 */
export function isBatchExpired(
  particles: ConfettiParticle[],
  fadeEndMs = CONFETTI_FADE_END_MS,
): boolean {
  if (particles.length === 0) return true
  for (let i = 0; i < particles.length; i++) {
    if (particles[i]!.ageMs < fadeEndMs) return false
  }
  return true
}

function clamp(x: number, lo: number, hi: number): number {
  if (x < lo) return lo
  if (x > hi) return hi
  return x
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
