/**
 * Pure helpers for the small world-space health bar that floats above
 * every vehicle in multi-car modes (World Tour). The bar reads each
 * car's current `damage` (0..1) and renders a colored fill so the
 * player can tell at a glance which rivals are limping and which are
 * fresh.
 *
 * The renderer-side Sprite is built in `src/game/sceneBuilder.ts`;
 * these constants and helpers stay pure so they unit-test without a
 * DOM.
 */

// CanvasTexture pixel dimensions. The bar is a flat rectangle, much
// wider than tall, so power-of-two width and a small height keep the
// upload cheap. Tall enough that the colored fill plus the dark
// background read as distinct strips from chase-cam distance.
export const HEALTH_BAR_TEXTURE_WIDTH = 128
export const HEALTH_BAR_TEXTURE_HEIGHT = 32

// World-space sprite size. Narrower than the ghost nameplate so it
// reads as a quick status pip rather than a label. 2x0.5 sits cleanly
// above the car body without covering the silhouette.
export const HEALTH_BAR_SPRITE_WIDTH = 2
export const HEALTH_BAR_SPRITE_HEIGHT = 0.5

// Y-offset above the vehicle group origin. The car body sits with its
// roof near y = 1.5, so 2.2 floats the bar above the roof but well
// below the ghost nameplate's 3.0 so the two never collide on a ghost
// car running in a multi-car field.
export const HEALTH_BAR_Y_OFFSET = 2.2

// Background / border colors. Dark slate with a thin black border so
// the fill color reads clearly against any track or sky preset.
export const HEALTH_BAR_BG_HEX = '#0e1620'
export const HEALTH_BAR_BORDER_HEX = '#000000'

// Pick a fill color from the same palette the Derby HUD uses for the
// player health bar so the two read as the same visual language.
// `frac` is health remaining, 0..1.
export function healthBarFillColor(frac: number): string {
  if (frac > 0.6) return '#3ddc84'
  if (frac > 0.3) return '#f5c518'
  if (frac > 0.1) return '#f29423'
  return '#e84a5f'
}

// Defensive clamp. The render path polls every frame, so a malformed
// upstream value (NaN, negative, > 1) collapses to a sane bar rather
// than crashing the canvas draw.
export function clampHealthFraction(value: unknown): number {
  if (typeof value !== 'number') return 1
  if (!Number.isFinite(value)) return 1
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}
