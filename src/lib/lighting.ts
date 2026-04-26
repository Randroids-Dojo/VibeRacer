import { z } from 'zod'

// Time-of-day lighting presets. The user picks a name in Settings and the
// renderer reads the preset's colors, intensities, and sun direction to skin
// the scene without re-instantiating the renderer or any meshes. Pure data so
// it round-trips through localStorage and unit tests cleanly.
//
// The six presets cover a full day cycle (dawn, morning, noon, sunset, dusk,
// night) without exploding into a tunable color picker. Defaults stay 'noon'
// so users who never open Settings see exactly the scene they always have.

export const TIME_OF_DAY_NAMES = [
  'noon',
  'morning',
  'sunset',
  'night',
  'dawn',
  'dusk',
] as const
export type TimeOfDay = (typeof TIME_OF_DAY_NAMES)[number]

export const DEFAULT_TIME_OF_DAY: TimeOfDay = 'noon'

export const TimeOfDaySchema = z.enum(TIME_OF_DAY_NAMES)

// Friendly label for the Settings UI. Keeps the source of truth for capitalization
// in one place so renames do not drift between the picker and the persisted enum.
export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  noon: 'Noon',
  morning: 'Morning',
  sunset: 'Sunset',
  night: 'Night',
  dawn: 'Dawn',
  dusk: 'Dusk',
}

// A short blurb shown beneath the swatch so the player knows what they are
// picking before they commit to a race.
export const TIME_OF_DAY_DESCRIPTIONS: Record<TimeOfDay, string> = {
  noon: 'Bright midday sun. The original look.',
  morning: 'Soft cool light from the east. Long shadows.',
  sunset: 'Warm orange light low in the west. Pink sky.',
  night: 'Cool moonlight under a deep blue sky.',
  dawn: 'Cool predawn glow with the sun about to rise in the east.',
  dusk: 'Soft purple twilight after sunset, sun gone in the west.',
}

export interface LightingPreset {
  // Three.js color ints (0xRRGGBB). Stored as numbers so the renderer can
  // assign them to existing materials without an extra parse step per frame.
  skyColor: number
  groundColor: number
  ambientColor: number
  ambientIntensity: number
  sunColor: number
  sunIntensity: number
  // World-space sun direction. Always normalized in `getLightingPreset` so the
  // renderer can use it verbatim. Y is up; positive X is east, negative X is
  // west, positive Z is south, negative Z is north.
  sunDirection: { x: number; y: number; z: number }
}

// Hand-tuned preset table. Numbers chosen so noon matches the legacy hardcoded
// scene exactly: skyColor 0x9ad8ff, groundColor 0x6fb26f, ambient 0xffffff at
// 0.55, sun 0xffffff at 0.9 from (80, 160, 60). The other three lean into a
// distinct mood without going so dark that the road becomes hard to read.
const RAW_PRESETS: Record<TimeOfDay, LightingPreset> = {
  noon: {
    skyColor: 0x9ad8ff,
    groundColor: 0x6fb26f,
    ambientColor: 0xffffff,
    ambientIntensity: 0.55,
    sunColor: 0xffffff,
    sunIntensity: 0.9,
    // High in the sky, slight tilt to the west and south so shadows have
    // some direction to them. Matches the legacy (80, 160, 60) bias.
    sunDirection: { x: 80, y: 160, z: 60 },
  },
  morning: {
    // Cool pale blue sky, mossy ground a touch darker than noon, low golden
    // sun coming from the east.
    skyColor: 0xb4e0ff,
    groundColor: 0x5fa05f,
    ambientColor: 0xb6cfe6,
    ambientIntensity: 0.5,
    sunColor: 0xfff0c8,
    sunIntensity: 0.85,
    // Sun low in the east. Smaller Y so the angle is shallow and shadows
    // stretch long.
    sunDirection: { x: 140, y: 60, z: 30 },
  },
  sunset: {
    // Pink and orange sky, warm grass tone, low warm sun from the west.
    skyColor: 0xffb38a,
    groundColor: 0x8a6f4f,
    ambientColor: 0xffc7a8,
    ambientIntensity: 0.5,
    sunColor: 0xff9a4a,
    sunIntensity: 0.95,
    sunDirection: { x: -150, y: 50, z: -20 },
  },
  night: {
    // Deep navy sky, cool ground, dim cool moonlight from high above.
    skyColor: 0x0c1a3a,
    groundColor: 0x2c3848,
    ambientColor: 0x4860a0,
    ambientIntensity: 0.4,
    sunColor: 0xb6c8ff,
    sunIntensity: 0.55,
    sunDirection: { x: 40, y: 180, z: -40 },
  },
  dawn: {
    // Pale lavender sky brightening to peach near the horizon, cool dewy
    // ground, soft pink sun rising low in the east. Brighter than night but
    // dimmer than morning, with a noticeably warmer-cool gradient than the
    // straight blue of morning.
    skyColor: 0xc8b8d8,
    groundColor: 0x4f6058,
    ambientColor: 0xa098b8,
    ambientIntensity: 0.45,
    sunColor: 0xffc8b0,
    sunIntensity: 0.65,
    // Sun very low in the east, slightly south of the equator. Even shallower
    // than morning so shadows stretch longer.
    sunDirection: { x: 160, y: 30, z: 20 },
  },
  dusk: {
    // Deep purple-blue sky after sunset, cool muted ground, very low warm sun
    // already below the horizon casting a soft amber glow from the west. The
    // step between sunset and night, when the streetlights would just be
    // coming on.
    skyColor: 0x4a3a6a,
    groundColor: 0x3a4250,
    ambientColor: 0x7868a8,
    ambientIntensity: 0.45,
    sunColor: 0xff9070,
    sunIntensity: 0.5,
    // Sun low in the west, just below the equator so the angle is shallow and
    // the warm tint reads as the last glow of sunset.
    sunDirection: { x: -150, y: 25, z: 10 },
  },
}

// Defensive copy + sun direction normalization. Returning a fresh object means
// callers can mutate it without polluting the table; the renderer multiplies
// the unit vector by its own scene-scale distance so direction (not magnitude)
// is what we care about.
export function getLightingPreset(name: TimeOfDay): LightingPreset {
  const raw = RAW_PRESETS[name] ?? RAW_PRESETS[DEFAULT_TIME_OF_DAY]
  const d = raw.sunDirection
  const len = Math.hypot(d.x, d.y, d.z)
  // Guard the degenerate (0,0,0) case by falling back to straight up so the
  // DirectionalLight still has a defined source. Ditto NaN / Infinity.
  const safe =
    !Number.isFinite(len) || len <= 0
      ? { x: 0, y: 1, z: 0 }
      : { x: d.x / len, y: d.y / len, z: d.z / len }
  return {
    skyColor: raw.skyColor,
    groundColor: raw.groundColor,
    ambientColor: raw.ambientColor,
    ambientIntensity: raw.ambientIntensity,
    sunColor: raw.sunColor,
    sunIntensity: raw.sunIntensity,
    sunDirection: safe,
  }
}

// Multiplier the renderer applies to the unit sun direction so the
// DirectionalLight sits well outside the scene. Centralizes the magic number
// so any future scene-scale tweak only changes here.
export const SUN_DISTANCE = 200

export function isTimeOfDay(value: unknown): value is TimeOfDay {
  return (
    typeof value === 'string' &&
    (TIME_OF_DAY_NAMES as readonly string[]).includes(value)
  )
}
