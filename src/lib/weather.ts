import { z } from 'zod'

// Weather presets. The user picks a name in Settings and the renderer reads
// the preset's fog density, sky tint factor, ambient and sun intensity
// multipliers to skin the scene without rebuilding any geometry. Pure data so
// it round-trips through localStorage and unit tests cleanly.
//
// The three presets cover the obvious arcade-racer weather moods (clear, light
// haze, heavy fog) without exploding into a tunable color picker. Default
// stays 'clear' so users who never open Settings see exactly the scene they
// always have.
//
// Weather composes with the time-of-day preset: the time-of-day picks the base
// sky color, ambient color, and sun direction, then the weather preset mixes a
// fog tint into the sky and applies the multipliers below.

export const WEATHER_NAMES = ['clear', 'cloudy', 'foggy', 'rainy'] as const
export type Weather = (typeof WEATHER_NAMES)[number]

export const DEFAULT_WEATHER: Weather = 'clear'

export const WeatherSchema = z.enum(WEATHER_NAMES)

// Friendly label for the Settings UI. Keeps the source of truth for
// capitalization in one place so renames do not drift between the picker and
// the persisted enum.
export const WEATHER_LABELS: Record<Weather, string> = {
  clear: 'Clear',
  cloudy: 'Cloudy',
  foggy: 'Foggy',
  rainy: 'Rainy',
}

// A short blurb shown beneath the swatch so the player knows what they are
// picking before they commit to a race.
export const WEATHER_DESCRIPTIONS: Record<Weather, string> = {
  clear: 'No haze. Distant scenery stays crisp.',
  cloudy: 'Light overcast. Far props soften into a thin haze.',
  foggy: 'Thick fog rolls in. Vision drops to the next corner.',
  rainy: 'Steady downpour with falling streaks and a grey overcast.',
}

export interface WeatherPreset {
  // Three.js FogExp2 density. 0 disables fog. 0.005..0.04 covers light haze
  // to thick murk on this scene's scale (CELL_SIZE = 20, default track ~60
  // units across).
  fogDensity: number
  // Three.js color int (0xRRGGBB) for the fog. The renderer mixes this with
  // the time-of-day sky color so the horizon blends naturally rather than
  // showing a hard cutoff. 0 means "use the sky color as-is".
  fogColor: number
  // 0..1 mix factor between the time-of-day sky color (0) and the fog color
  // above (1). Higher values pull the sky toward grey or white. Set to 0 to
  // leave the sky untouched.
  skyTintMix: number
  // Multipliers applied on top of the time-of-day preset's ambient and sun
  // intensities. 1.0 means "no change". Cloudy and foggy dim the directional
  // sun a bit (overcast skies have no harsh shadows) and lift the ambient
  // slightly so the road still reads.
  ambientMultiplier: number
  sunMultiplier: number
}

// Hand-tuned preset table. Numbers chosen so 'clear' is a true no-op: zero
// fog density, no sky tint, both intensity multipliers at 1.0. The other two
// lean into a mood without going so dark that the road becomes hard to read.
const RAW_PRESETS: Record<Weather, WeatherPreset> = {
  clear: {
    fogDensity: 0,
    fogColor: 0xffffff,
    skyTintMix: 0,
    ambientMultiplier: 1,
    sunMultiplier: 1,
  },
  cloudy: {
    // Light haze: distant trees and the far end of the straight start to
    // soften but the next two corners still read crisply.
    fogDensity: 0.012,
    fogColor: 0xc8d4dc,
    skyTintMix: 0.35,
    ambientMultiplier: 1.05,
    sunMultiplier: 0.85,
  },
  foggy: {
    // Heavy fog: anything past one corner fades to grey. Drives like an
    // entirely different track.
    fogDensity: 0.035,
    fogColor: 0xb6bcc2,
    skyTintMix: 0.7,
    ambientMultiplier: 1.15,
    sunMultiplier: 0.6,
  },
  rainy: {
    // Moderate haze plus a darker grey overcast. The rain particles (rendered
    // separately by the scene's rain layer) are what sell the weather; fog
    // density stays between cloudy and foggy so distant track features still
    // read but the sky looks heavy.
    fogDensity: 0.018,
    fogColor: 0x8a909a,
    skyTintMix: 0.6,
    ambientMultiplier: 1.1,
    sunMultiplier: 0.55,
  },
}

// Defensive copy. Returning a fresh object means callers can mutate it
// without polluting the table.
export function getWeatherPreset(name: Weather): WeatherPreset {
  const raw = RAW_PRESETS[name] ?? RAW_PRESETS[DEFAULT_WEATHER]
  return {
    fogDensity: raw.fogDensity,
    fogColor: raw.fogColor,
    skyTintMix: raw.skyTintMix,
    ambientMultiplier: raw.ambientMultiplier,
    sunMultiplier: raw.sunMultiplier,
  }
}

export function isWeather(value: unknown): value is Weather {
  return (
    typeof value === 'string' &&
    (WEATHER_NAMES as readonly string[]).includes(value)
  )
}

// Linearly mix two 0xRRGGBB ints by `t` in [0, 1]. Returns a fresh int so the
// renderer can hand it straight to `Color.setHex`. Pure helper exposed so the
// scene code and unit tests both go through the same math.
export function mixColorHex(a: number, b: number, t: number): number {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t
  const ar = (a >> 16) & 0xff
  const ag = (a >> 8) & 0xff
  const ab = a & 0xff
  const br = (b >> 16) & 0xff
  const bg = (b >> 8) & 0xff
  const bb = b & 0xff
  const r = Math.round(ar + (br - ar) * tc) & 0xff
  const g = Math.round(ag + (bg - ag) * tc) & 0xff
  const bl = Math.round(ab + (bb - ab) * tc) & 0xff
  return (r << 16) | (g << 8) | bl
}
