import { z } from 'zod'
import type { TimeOfDay } from './lighting'
import type { Weather } from './weather'

// Headlights setting. Controls whether the front lamp lenses and real light
// sources turn on for the player car.
//
// - off: never lit.
// - auto: lit during dim scenes (dawn, sunset, dusk, night, foggy, snowy,
//   rainy). Lets the player set-and-forget so the lamps appear exactly when
//   they would help in real life.
// - on: always lit. For players who like the look of the lamps in broad
//   daylight too (or want to see them on a fresh track without changing the
//   time-of-day picker).
//
// Visual only. The lights illuminate nearby scenery and track surfaces, but
// they never affect physics, lap times, or anti-cheat in any way.
export const HEADLIGHT_MODES = ['off', 'auto', 'on'] as const
export type HeadlightMode = (typeof HEADLIGHT_MODES)[number]

export const DEFAULT_HEADLIGHT_MODE: HeadlightMode = 'auto'

export const HeadlightModeSchema = z.enum(HEADLIGHT_MODES)

export const HEADLIGHT_MODE_LABELS: Record<HeadlightMode, string> = {
  off: 'Off',
  auto: 'Auto',
  on: 'On',
}

export const HEADLIGHT_MODE_DESCRIPTIONS: Record<HeadlightMode, string> = {
  off: 'Headlights stay dark.',
  auto: 'Headlights turn on around dawn, sunset, dusk, at night, and in foggy or snowy weather.',
  on: 'Headlights always glow, even at noon.',
}

export function isHeadlightMode(value: unknown): value is HeadlightMode {
  return (
    typeof value === 'string' &&
    (HEADLIGHT_MODES as readonly string[]).includes(value)
  )
}

// Decide whether the headlight meshes should be visible right now. Used by the
// renderer's poll-and-set helper so a swatch click in Settings (or a track
// author baking in a 'night' mood) flips the lamps on the next frame without
// rebuilding any geometry.
//
// The auto rule covers the obvious cases where real headlights help:
//   - dawn, sunset, dusk, and night for low ambient light;
//   - foggy / snowy / rainy weather for low visibility.
// Morning and noon under clear / cloudy sky stay dark on auto.
export function shouldHeadlightsBeOn(
  mode: HeadlightMode,
  timeOfDay: TimeOfDay,
  weather: Weather,
): boolean {
  if (mode === 'off') return false
  if (mode === 'on') return true
  // auto
  if (
    timeOfDay === 'dawn' ||
    timeOfDay === 'sunset' ||
    timeOfDay === 'dusk' ||
    timeOfDay === 'night'
  ) {
    return true
  }
  if (weather === 'foggy' || weather === 'snowy' || weather === 'rainy') return true
  return false
}

// Visual tunables for the headlight assembly. Centralized so a future polish
// pass on the lamp size or beam length only changes here. Numbers are in world
// units (meters in the car's local frame after the inner-group scale).
//
// The lamps sit just above the bumper line and slightly to either side of the
// car's centerline. Each lamp is a small glowing sphere with a SpotLight aimed
// forward along +X, the car's forward axis at heading 0.
export const HEADLIGHT_LAMP_OFFSET_X = 1.05 // forward of the car pivot
export const HEADLIGHT_LAMP_OFFSET_Y = 0.6 // above the chassis pivot
export const HEADLIGHT_LAMP_OFFSET_Z = 0.55 // half-spread between left and right lamps
export const HEADLIGHT_LAMP_RADIUS = 0.16
export const HEADLIGHT_SPOT_TARGET_X = 9
export const HEADLIGHT_SPOT_DISTANCE = 18
export const HEADLIGHT_SPOT_ANGLE = Math.PI / 7
export const HEADLIGHT_SPOT_PENUMBRA = 0.55
export const HEADLIGHT_SPOT_DECAY = 1.25
export const HEADLIGHT_SPOT_INTENSITY = 7
// Warm white, slightly yellow so the lamps read as classic headlights against
// the cool moonlight tint of the night preset.
export const HEADLIGHT_LAMP_COLOR_HEX = 0xfff4d2
export const HEADLIGHT_SPOT_COLOR_HEX = 0xffe9a8
