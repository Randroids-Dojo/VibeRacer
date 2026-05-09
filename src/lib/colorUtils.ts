// Shared hex-color helpers used by HUD chips, the track-difficulty badge,
// and other surfaces that take a tier accent and need a translucent or
// brightened companion derived from it. Defensive against malformed input
// so a typo in a config never propagates to a thrown render.

const HEX_RE = /^#[0-9a-fA-F]{6}$/

interface Rgb {
  r: number
  g: number
  b: number
}

function parseHex(hex: string): Rgb | null {
  if (typeof hex !== 'string' || !HEX_RE.test(hex)) return null
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

// Append an alpha component to a "#rrggbb" color. Returns
// `rgba(r, g, b, a)`. Returns the original input unchanged when the input
// is not a 7-char hex so a typo in a config does not become a thrown render.
export function hexWithAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

// Lift a saturated tier hex toward white so the text color stays readable
// on a translucent dark background. Mixes the tier color toward white by
// the given fraction (default 0.35). Falls back to plain white on bad input.
export function hexLightenForText(hex: string, mix = 0.35): string {
  const rgb = parseHex(hex)
  if (!rgb) return '#ffffff'
  const lr = Math.round(rgb.r + (255 - rgb.r) * mix)
  const lg = Math.round(rgb.g + (255 - rgb.g) * mix)
  const lb = Math.round(rgb.b + (255 - rgb.b) * mix)
  return `rgb(${lr},${lg},${lb})`
}
