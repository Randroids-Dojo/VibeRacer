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

import { fnv1a32 } from '@/lib/fnv1a'

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

/**
 * Stable 32-bit FNV-1a hash of the slug. Returns 0 for empty or non-string
 * input so the caller can fall back to the neutral personalization.
 */
export function slugMusicSeed(slug: string): number {
  if (typeof slug !== 'string' || slug.length === 0) return 0
  return fnv1a32(slug)
}

/**
 * Pick a stable personalization for a slug. The returned object is fresh
 * (safe to mutate by the caller, though the renderer treats it as read-only).
 */
export function personalizeForSlug(slug: string): MusicPersonalization {
  return personalizationFromSeed(slugMusicSeed(slug))
}

/**
 * Stable 32-bit FNV-1a hash of the player's three-letter initials. Returns 0
 * for empty / non-string / wrong-length input so the caller can fall back to
 * a slug-only personalization. The hash is uppercased internally so the same
 * tag produces the same fingerprint regardless of how the player typed it.
 */
export function initialsMusicSeed(initials: string): number {
  if (typeof initials !== 'string') return 0
  const trimmed = initials.trim()
  if (trimmed.length === 0) return 0
  return fnv1a32(trimmed, (code) => {
    // Uppercase a-z to A-Z by clearing bit 5; leaves digits and other
    // characters untouched. The upstream InitialsSchema enforces A-Z only,
    // but defending here means a hand-rolled call cannot poison the seed.
    const byte = code & 0xff
    return byte >= 0x61 && byte <= 0x7a ? byte & 0xdf : byte
  })
}

/**
 * Pick a stable personalization for a (slug, initials) pair. The two seeds
 * are folded together with a 13-bit rotate-left on the slug seed before XOR
 * so flipping a single initial reshuffles every output dimension instead of
 * flipping just one bit. Falls back to slug-only when initials are missing
 * or empty so a player who has not entered initials yet still hears the
 * existing per-track flavor unchanged.
 */
export function personalizeForRacer(
  slug: string,
  initials: string | null | undefined,
): MusicPersonalization {
  const slugSeed = slugMusicSeed(slug)
  const initialsSeed =
    typeof initials === 'string' ? initialsMusicSeed(initials) : 0
  if (slugSeed === 0 && initialsSeed === 0) {
    return { ...NEUTRAL_PERSONALIZATION }
  }
  if (initialsSeed === 0) return personalizationFromSeed(slugSeed)
  // Rotate left by 13 so a single-bit flip in the initials seed lands on a
  // different lane of the modulo arithmetic below than the slug seed
  // contributed. 13 is a coprime shift relative to the menu sizes (3 / 7 /
  // 8) so the slug and initials contributions stay independent.
  const rotated = ((slugSeed << 13) | (slugSeed >>> 19)) >>> 0
  const combined = (rotated ^ initialsSeed) >>> 0
  // Force a non-zero combined seed so the empty short-circuit above is the
  // only path that returns the neutral tweak. (The XOR would land on zero
  // if rotated and initials were equal; OR-in a small constant keeps the
  // downstream modulo arithmetic deterministic in that edge case.)
  const seed = combined === 0 ? 1 : combined
  return personalizationFromSeed(seed)
}

// Shared draw used by both the slug-only and the slug+initials helpers so
// any change to the menu indexing math lands in one place.
function personalizationFromSeed(seed: number): MusicPersonalization {
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
