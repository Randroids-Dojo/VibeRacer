/**
 * Per-slug music personalization. Hashes a slug into a stable integer seed,
 * then selects a small set of tweaks (root key offset, scale flavor, BPM
 * offset) to apply on top of the legacy game-track defaults so each track
 * sounds slightly different without writing per-slug patterns.
 *
 * Pure helpers only. The renderer in `music.ts` consumes the result.
 *
 * Stability invariants:
 * - The same slug always returns the same personalization across processes
 *   and browsers. Hash is deterministic (FNV-1a 32-bit) over the slug's
 *   UTF-16 code units; we never depend on locale, time, or RNG state.
 * - Empty string and any non-string slug fall back to the identity tweak
 *   (no offset, default scale, no BPM change) so the legacy game track
 *   sounds exactly as it did before this feature shipped.
 */

export type ScaleFlavor = 'minor' | 'dorian' | 'pentatonic'

export interface MusicPersonalization {
  /** Semitone offset applied to the game track's root MIDI note. */
  rootMidiOffset: number
  /** Which scale flavor to feed the game track's pattern renderer. */
  scaleFlavor: ScaleFlavor
  /** BPM offset added to the game track's configured tempo. */
  bpmOffset: number
}

/**
 * Identity tweak. Applied when the player turns personalization off, when
 * the slug is empty / non-string, or when the engine is asked to clear an
 * existing personalization. Equivalent to the legacy hardcoded game track.
 */
export const NEUTRAL_PERSONALIZATION: MusicPersonalization = {
  rootMidiOffset: 0,
  scaleFlavor: 'minor',
  bpmOffset: 0,
}

/**
 * Distinct semitone offsets the personalization is allowed to pick from.
 * Stays inside one octave of the default G3 root so the game track still
 * sits in the same audible register no matter which slug is loaded.
 */
export const ROOT_OFFSETS: readonly number[] = [
  -5, -3, -2, 0, 2, 3, 5, 7,
]

export const SCALE_FLAVORS: readonly ScaleFlavor[] = [
  'minor',
  'dorian',
  'pentatonic',
]

/**
 * BPM nudges the personalization is allowed to apply. Bounded so the music
 * stays musical against the existing 70%-to-100% intensity tempo ramp; a
 * slow-leaning slug will never drop below the configured minimum factor.
 */
export const BPM_OFFSETS: readonly number[] = [-12, -8, -4, 0, 4, 8, 12, 16]

const FNV_OFFSET_BASIS_32 = 0x811c9dc5
const FNV_PRIME_32 = 0x01000193

/**
 * Stable 32-bit FNV-1a hash of the slug. Returns 0 for empty or non-string
 * input so the caller can fall back to the neutral personalization.
 */
export function slugMusicSeed(slug: string): number {
  if (typeof slug !== 'string' || slug.length === 0) return 0
  let hash = FNV_OFFSET_BASIS_32
  for (let i = 0; i < slug.length; i++) {
    hash ^= slug.charCodeAt(i) & 0xff
    // Math.imul keeps the multiply as a 32-bit signed int so the hash stays
    // stable across JS engines that would otherwise promote to double.
    hash = Math.imul(hash, FNV_PRIME_32)
  }
  // Force unsigned representation so downstream modulo arithmetic does not
  // surprise readers with a negative seed.
  return hash >>> 0
}

/**
 * Pick a stable personalization for a slug. The returned object is fresh
 * (safe to mutate by the caller, though the renderer treats it as read-only).
 */
export function personalizeForSlug(slug: string): MusicPersonalization {
  const seed = slugMusicSeed(slug)
  if (seed === 0) return { ...NEUTRAL_PERSONALIZATION }
  // Three independent draws from the same seed, each spread across a
  // different prime so the choices do not move in lockstep.
  const rootIdx = seed % ROOT_OFFSETS.length
  const scaleIdx = Math.floor(seed / 7) % SCALE_FLAVORS.length
  const bpmIdx = Math.floor(seed / 53) % BPM_OFFSETS.length
  return {
    rootMidiOffset: ROOT_OFFSETS[rootIdx],
    scaleFlavor: SCALE_FLAVORS[scaleIdx],
    bpmOffset: BPM_OFFSETS[bpmIdx],
  }
}

/**
 * Reference equality on the three fields. Cheap enough to call every frame
 * for a "nothing changed" short-circuit in the renderer.
 */
export function personalizationEquals(
  a: MusicPersonalization | null,
  b: MusicPersonalization | null,
): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  return (
    a.rootMidiOffset === b.rootMidiOffset &&
    a.scaleFlavor === b.scaleFlavor &&
    a.bpmOffset === b.bpmOffset
  )
}
