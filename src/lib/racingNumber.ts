import { z } from 'zod'

// Racing number plate decal. Adds a small flat plate on the roof of the
// player car showing a 1-2 digit racing number in the player's chosen plate
// and text colors. Pure cosmetic. Default off so legacy stored payloads keep
// the exact car silhouette they had on upgrade; players who want a number on
// their car flip the toggle once in Settings.
//
// The number is stored as a string ('00'-'99') so the schema can validate the
// shape directly and an empty input collapses to a sane default. The plate
// and text colors are picked from a curated palette so the Settings UI stays
// short on mobile and the chosen colors read on top of every paint swatch.
//
// Schema rules (all enforced server- and client-side):
//   * `value` is exactly 1 or 2 digits, [0-9]. Empty / non-string falls back
//     to '7' on read.
//   * `plateColor` and `textColor` are 7-character lowercase hex strings.
//   * `enabled` is a boolean. When false, the plate is hidden entirely.

export const RACING_NUMBER_MIN_LENGTH = 1
export const RACING_NUMBER_MAX_LENGTH = 2

// Default value when the user enables the plate without picking anything.
// '7' is the lucky-seven default that a new player can easily change.
export const RACING_NUMBER_DEFAULT_VALUE = '7'

// Plate-color palette: bright opaque backgrounds that read against every car
// paint swatch. Order is high-contrast first (white) so the picker reads as
// "white plate, then color options".
export interface RacingNumberSwatch {
  id: string
  name: string
  // 7-character lowercase hex string (`#rrggbb`). Matches CSS color literals
  // so the same value works for both the canvas-texture fill and the swatch
  // chip in Settings.
  hex: string
}

export const RACING_NUMBER_PLATE_COLORS: readonly RacingNumberSwatch[] = [
  { id: 'white', name: 'White', hex: '#ffffff' },
  { id: 'yellow', name: 'Yellow', hex: '#f6d23a' },
  { id: 'red', name: 'Red', hex: '#d23a3a' },
  { id: 'blue', name: 'Blue', hex: '#3b6cf4' },
  { id: 'green', name: 'Green', hex: '#7ed957' },
  { id: 'black', name: 'Black', hex: '#1a1a1a' },
] as const

// Text-color palette: dark / light pair so the player can pair a dark number
// on a light plate (default racing convention) or invert for a black plate.
export const RACING_NUMBER_TEXT_COLORS: readonly RacingNumberSwatch[] = [
  { id: 'black', name: 'Black', hex: '#1a1a1a' },
  { id: 'white', name: 'White', hex: '#ffffff' },
  { id: 'red', name: 'Red', hex: '#d23a3a' },
  { id: 'blue', name: 'Blue', hex: '#3b6cf4' },
] as const

export const RACING_NUMBER_DEFAULT_PLATE_HEX =
  RACING_NUMBER_PLATE_COLORS[0].hex // white
export const RACING_NUMBER_DEFAULT_TEXT_HEX =
  RACING_NUMBER_TEXT_COLORS[0].hex // black

const HEX_REGEX = /^#[0-9a-f]{6}$/
const NUMBER_REGEX = /^[0-9]{1,2}$/

const RacingNumberHexSchema = z
  .string()
  .transform((v) => v.toLowerCase())
  .pipe(z.string().regex(HEX_REGEX))

const RacingNumberValueSchema = z
  .string()
  // Strip whitespace so a hand-typed leading space does not invalidate
  // an otherwise well-formed value.
  .transform((v) => v.trim())
  .pipe(z.string().regex(NUMBER_REGEX))

export const RacingNumberSettingSchema = z.object({
  enabled: z.boolean(),
  value: RacingNumberValueSchema,
  plateHex: RacingNumberHexSchema,
  textHex: RacingNumberHexSchema,
})

export type RacingNumberSetting = z.infer<typeof RacingNumberSettingSchema>

export const DEFAULT_RACING_NUMBER: RacingNumberSetting = {
  enabled: false,
  value: RACING_NUMBER_DEFAULT_VALUE,
  plateHex: RACING_NUMBER_DEFAULT_PLATE_HEX,
  textHex: RACING_NUMBER_DEFAULT_TEXT_HEX,
}

// Find a palette entry by hex (lowercased). Returns null when the hex does
// not appear in the palette so the UI can render the swatch as "custom" or
// fall back to the default plate color.
export function findPlateColor(hex: string | null): RacingNumberSwatch | null {
  if (hex === null) return null
  const lc = hex.toLowerCase()
  return RACING_NUMBER_PLATE_COLORS.find((p) => p.hex === lc) ?? null
}

export function findTextColor(hex: string | null): RacingNumberSwatch | null {
  if (hex === null) return null
  const lc = hex.toLowerCase()
  return RACING_NUMBER_TEXT_COLORS.find((p) => p.hex === lc) ?? null
}

// Validate and clamp an arbitrary user-typed number string into the schema
// shape. Strips non-digit characters, caps at two digits, and falls back to
// the default value when the result is empty. Pure helper so the Settings UI
// can sanitize keystrokes without surfacing zod errors.
export function sanitizeRacingNumber(raw: string): string {
  if (typeof raw !== 'string') return RACING_NUMBER_DEFAULT_VALUE
  const digits = raw.replace(/[^0-9]/g, '').slice(0, RACING_NUMBER_MAX_LENGTH)
  if (digits.length === 0) return RACING_NUMBER_DEFAULT_VALUE
  return digits
}

// Convert `#rrggbb` to a Three.js-style 0xRRGGBB integer. Returns null when
// the input is missing or malformed so the renderer can skip the plate
// instead of drawing a broken color. Mirrors carPaint.hexToColorInt.
export function racingNumberHexToColorInt(hex: string): number | null {
  const lc = hex.toLowerCase()
  if (!HEX_REGEX.test(lc)) return null
  return parseInt(lc.slice(1), 16)
}

// Compute the canvas font size for a given number string. Single-digit
// numbers fill more of the plate so they read at the same visual weight as
// two-digit numbers. Returned in device pixels.
export function racingNumberFontSizePx(
  value: string,
  canvasSizePx: number,
): number {
  const length = sanitizeRacingNumber(value).length
  // Tuned so '7' and '77' both read clearly from the chase camera.
  const ratio = length === 1 ? 0.78 : 0.58
  return Math.round(canvasSizePx * ratio)
}

// Draw the racing number onto a 2D canvas context. Pure helper so the test
// suite can assert pixel reads without spinning up Three.js. The canvas is
// expected to be square; the caller is responsible for sizing it before
// calling.
export function drawRacingNumberToCanvas(
  ctx: CanvasRenderingContext2D,
  size: number,
  value: string,
  plateHex: string,
  textHex: string,
): void {
  // Plate background.
  ctx.fillStyle = plateHex
  ctx.fillRect(0, 0, size, size)
  // Black border around the plate so a white-on-white car still reads.
  const borderPx = Math.max(2, Math.round(size * 0.04))
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, size, borderPx)
  ctx.fillRect(0, size - borderPx, size, borderPx)
  ctx.fillRect(0, 0, borderPx, size)
  ctx.fillRect(size - borderPx, 0, borderPx, size)
  // Number.
  const sanitized = sanitizeRacingNumber(value)
  const fontSize = racingNumberFontSizePx(sanitized, size)
  ctx.fillStyle = textHex
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Use a stack of common sans-serifs so the plate looks like a real racing
  // sticker rather than the default serif.
  ctx.font = `bold ${fontSize}px "Helvetica Neue", "Arial Black", Arial, sans-serif`
  ctx.fillText(sanitized, size / 2, size / 2 + fontSize * 0.04)
}
