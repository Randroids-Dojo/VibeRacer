import { z } from 'zod'

// Curated paint palette. Players pick a swatch in Settings; the body mesh of
// the Kenney race car GLB is recolored at render time. `null` keeps the stock
// red colormap baked into the model so users who never touch the panel see
// the same car they always did.
//
// The palette is intentionally short (8 paints + stock) so the Settings UI
// stays readable on mobile, and the colors are saturated cartoon hues to
// match the rest of the visual style. Hex strings are validated server- and
// client-side via `CarPaintSchema` so a corrupted localStorage payload does
// not crash the renderer.

export interface CarPaint {
  // Stable id so renames or palette reorderings do not invalidate stored
  // settings. `null` is stock and is not in this list.
  id: string
  name: string
  // 7-character lowercase hex string (`#rrggbb`). Matches CSS color literals
  // so the same value works for both the Three.js material and the swatch
  // chip in Settings.
  hex: string
}

export const CAR_PAINTS: readonly CarPaint[] = [
  { id: 'crimson', name: 'Crimson', hex: '#d23a3a' },
  { id: 'tangerine', name: 'Tangerine', hex: '#ff8a3d' },
  { id: 'mustard', name: 'Mustard', hex: '#e8c547' },
  { id: 'lime', name: 'Lime', hex: '#7ed957' },
  { id: 'teal', name: 'Teal', hex: '#3ad1c4' },
  { id: 'cobalt', name: 'Cobalt', hex: '#3b6cf4' },
  { id: 'orchid', name: 'Orchid', hex: '#c265e0' },
  { id: 'midnight', name: 'Midnight', hex: '#2a2a36' },
] as const

const HEX_REGEX = /^#[0-9a-f]{6}$/

// Hex strings are stored verbatim so the Settings UI can compare against the
// palette by string equality. Coercing to lowercase keeps a hand-edited
// localStorage payload well-formed.
export const CarPaintSchema = z
  .string()
  .transform((v) => v.toLowerCase())
  .pipe(z.string().regex(HEX_REGEX))

export const CarPaintSettingSchema = z.union([z.null(), CarPaintSchema])

// Find a paint preset by hex (lowercased). Returns null when the hex does
// not appear in the palette so the UI can render the swatch as "custom" or
// fall back to the closest preset.
export function findPaintByHex(hex: string | null): CarPaint | null {
  if (hex === null) return null
  const lc = hex.toLowerCase()
  return CAR_PAINTS.find((p) => p.hex === lc) ?? null
}

// Convert `#rrggbb` to a Three.js-style 0xRRGGBB integer. Returns null when
// the input is missing or malformed so the renderer can short-circuit to the
// stock colormap.
export function hexToColorInt(hex: string | null): number | null {
  if (hex === null) return null
  const lc = hex.toLowerCase()
  if (!HEX_REGEX.test(lc)) return null
  return parseInt(lc.slice(1), 16)
}
