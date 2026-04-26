/**
 * Pure helpers for the floating nameplate that hovers above the ghost car.
 *
 * The nameplate carries WHO the ghost belongs to (initials) and the lap time
 * the ghost is replaying. Without this, a player chasing the leaderboard #1
 * has no idea whose time they are racing; with it the whole "ghost car" UX
 * gains a face and a number.
 *
 * Lives in `src/game/` (alongside the rest of the renderer-adjacent helpers)
 * so it can import `formatLapTime` from `src/lib/share.ts` without dragging
 * the share button's runtime concerns along.
 *
 * The renderer-side Sprite is built in `src/game/sceneBuilder.ts` (next to
 * the existing CanvasTexture-backed racing-number plate); these helpers stay
 * pure so they unit-test without a DOM.
 */

import { formatLapTime } from '@/lib/share'
import type { GhostSource } from '@/lib/ghostSource'

// Per-source visual tunables. Reads "GHOST" / "TOP" / "PB" / "LAST" so the
// player can tell at a glance whose lap the ghost is replaying without
// having to read the initials. Kept as plain strings so the Canvas renderer
// can draw them directly without an extra mapping step.
export const NAMEPLATE_SOURCE_TAGS: Record<GhostSource, string> = {
  auto: 'GHOST',
  top: 'TOP',
  pb: 'PB',
  lastLap: 'LAST',
}

// Color palette (hex strings, NOT 0xRRGGBB ints, so the Canvas renderer can
// pass them straight to fillStyle / strokeStyle). Picked to read against the
// translucent cyan ghost car: the bg is the same dark slate as the other
// HUD cards so the plate reads as a UI element rather than a paint job.
export const NAMEPLATE_BG_HEX = '#0e1620'
export const NAMEPLATE_BORDER_HEX = '#55e0ff'
export const NAMEPLATE_TEXT_HEX = '#f6fbff'
// Tag color matches the cyan ghost paint so it visually links to the car.
export const NAMEPLATE_TAG_HEX = '#55e0ff'

// CanvasTexture pixel dimensions. Wider than tall so the rectangle plate
// reads as a billboard pill. Power-of-two for clean GPU upload + mipmaps.
export const NAMEPLATE_TEXTURE_WIDTH = 256
export const NAMEPLATE_TEXTURE_HEIGHT = 128

// World-space sprite size (Three.js Sprite scale). 4x2 keeps the plate
// readable from the trailing chase camera at the default rig height (6) and
// distance (14) without being so big it covers the ghost car silhouette.
export const NAMEPLATE_SPRITE_WIDTH = 4
export const NAMEPLATE_SPRITE_HEIGHT = 2

// Y-offset above the ghost group origin. The ghost mesh's centerline sits
// near the road, so 3.0 floats the plate above the roof without floating
// out into the sky on dawn / dusk presets.
export const NAMEPLATE_Y_OFFSET = 3.0

export interface GhostMeta {
  // Player initials (3 uppercase letters in normal use; the renderer guards
  // against arbitrary text by sanitizing through `formatNameplateInitials`).
  initials: string
  // Lap time the ghost is replaying. Always positive in normal use; the
  // renderer guards via `formatNameplateLapTime` so a corrupted value never
  // crashes the texture.
  lapTimeMs: number
}

// Trim, uppercase, and cap to 3 characters so a hand-edited localStorage
// payload or an unsanitized leaderboard parse never blows up the canvas
// renderer. Empty / non-string input collapses to "???" so the plate still
// reads as a recognizable placeholder rather than a blank square.
export function formatNameplateInitials(value: unknown): string {
  if (typeof value !== 'string') return '???'
  const trimmed = value.trim().toUpperCase()
  if (trimmed.length === 0) return '???'
  return trimmed.slice(0, 3)
}

// Defensive lap-time formatter. Mirrors `formatLapTime` but treats zero,
// negative, and non-finite inputs as "missing" so the plate never reads
// "-0:00.001" or "NaN:NaN.---".
export function formatNameplateLapTime(value: unknown): string {
  if (typeof value !== 'number') return '--:--.---'
  if (!Number.isFinite(value)) return '--:--.---'
  if (value <= 0) return '--:--.---'
  return formatLapTime(value)
}

// Stable cache key so the renderer can short-circuit canvas redraws when
// the meta + source pair has not changed since the last frame. The rAF
// loop polls every frame, so a string compare per frame is the right cost.
export function nameplateCacheKey(
  meta: GhostMeta | null,
  source: GhostSource,
): string {
  if (meta === null) return `${source}|<none>`
  const ini = formatNameplateInitials(meta.initials)
  const lap = formatNameplateLapTime(meta.lapTimeMs)
  return `${source}|${ini}|${lap}`
}
