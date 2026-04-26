// Camera preset library. The Camera section of Settings ships five sliders
// (height, distance, look-ahead, follow speed, fov) that together describe
// the trailing chase rig. Most players never touch them and a handful want
// a curated mood without doing slider math, so this module surfaces a small
// set of named snapshots that one click apply to all five values.
//
// A preset is just a `CameraRigSettings` object plus a friendly name + blurb.
// Picking one writes its values into the existing settings field. The user
// can still tune any slider afterwards: `matchCameraPreset` returns the
// name that exactly matches the current values, or null when the camera has
// drifted off any preset (the picker shows that as "Custom").
//
// Pure module. No DOM, no React, no localStorage. Every value is fully inside
// the existing slider ranges in `controlSettings.ts` so applying a preset
// never lands a value the schema would reject.

import {
  CAMERA_DISTANCE_MAX,
  CAMERA_DISTANCE_MIN,
  CAMERA_FOLLOW_SPEED_MAX,
  CAMERA_FOLLOW_SPEED_MIN,
  CAMERA_FOV_MAX,
  CAMERA_FOV_MIN,
  CAMERA_HEIGHT_MAX,
  CAMERA_HEIGHT_MIN,
  CAMERA_LOOK_AHEAD_MAX,
  CAMERA_LOOK_AHEAD_MIN,
  DEFAULT_CAMERA_SETTINGS,
  type CameraRigSettings,
} from './controlSettings'

export const CAMERA_PRESET_NAMES = [
  'chase',
  'hood',
  'cinematic',
  'low',
] as const
export type CameraPresetName = (typeof CAMERA_PRESET_NAMES)[number]

export const DEFAULT_CAMERA_PRESET: CameraPresetName = 'chase'

// Friendly display labels for the picker. Single source of truth for
// capitalization so the picker UI and any test snapshots cannot drift apart.
export const CAMERA_PRESET_LABELS: Record<CameraPresetName, string> = {
  chase: 'Chase',
  hood: 'Hood',
  cinematic: 'Cinematic',
  low: 'Low',
}

// One-sentence blurb shown below the swatch and on the button's title /
// aria-label. Keeps the picker self-explanatory without forcing the player
// to apply a preset to discover what it does.
export const CAMERA_PRESET_DESCRIPTIONS: Record<CameraPresetName, string> = {
  chase: 'Default trailing chase camera. The original look.',
  hood: 'Low close-up just over the bumper. Feels fast.',
  cinematic: 'High and far back with a calm follow. Wide framing.',
  low: 'Low and tight chase. Aggressive, locked-on feel.',
}

// Hand-tuned snapshot for each preset. The chase preset is `DEFAULT_CAMERA_SETTINGS`
// verbatim so picking it matches the legacy hardcoded view exactly. Each value
// stays inside the existing slider bounds so users can fine-tune from any
// preset without first hitting a clamp.
const RAW_PRESETS: Record<CameraPresetName, CameraRigSettings> = {
  chase: { ...DEFAULT_CAMERA_SETTINGS },
  // Bumper / hood cam. Sits just over the front of the car looking forward.
  // Higher fov widens the view so peripheral motion sells the speed.
  hood: {
    height: 1.8,
    distance: 6,
    lookAhead: 9,
    followSpeed: 1.4,
    fov: 95,
  },
  // High and far. Slow follow gives a calm cinematic drift through corners.
  // Narrow fov compresses the scene like a long lens.
  cinematic: {
    height: 10,
    distance: 22,
    lookAhead: 5,
    followSpeed: 0.6,
    fov: 60,
  },
  // Low close chase. Aggressive and locked-on. Mid fov keeps the car readable.
  low: {
    height: 3.5,
    distance: 9,
    lookAhead: 5,
    followSpeed: 1.3,
    fov: 78,
  },
}

// Defensive copy + clamp. The clamp is a safety net rather than a behavioral
// expectation: every raw value above is already inside the slider bounds. If
// a future contributor pushes a preset out of range, this still returns a
// schema-valid object instead of crashing the renderer.
export function getCameraPreset(name: CameraPresetName): CameraRigSettings {
  const raw = RAW_PRESETS[name] ?? RAW_PRESETS[DEFAULT_CAMERA_PRESET]
  return {
    height: clamp(raw.height, CAMERA_HEIGHT_MIN, CAMERA_HEIGHT_MAX),
    distance: clamp(raw.distance, CAMERA_DISTANCE_MIN, CAMERA_DISTANCE_MAX),
    lookAhead: clamp(raw.lookAhead, CAMERA_LOOK_AHEAD_MIN, CAMERA_LOOK_AHEAD_MAX),
    followSpeed: clamp(
      raw.followSpeed,
      CAMERA_FOLLOW_SPEED_MIN,
      CAMERA_FOLLOW_SPEED_MAX,
    ),
    fov: clamp(raw.fov, CAMERA_FOV_MIN, CAMERA_FOV_MAX),
  }
}

// Identify which preset (if any) matches the current camera settings. Used
// by the Settings UI to highlight the active swatch, and to surface "Custom"
// when the player has drifted off any preset by tweaking a slider.
//
// Equality is exact rather than fuzzy. The sliders all step in coarse units
// (0.1 / 0.05 / 1) and presets are exact-stepped values, so an exact match
// is what the player actually sees on the slider; a tolerance would falsely
// claim a preset is active when the player has nudged a slider by one tick.
export function matchCameraPreset(
  camera: CameraRigSettings,
): CameraPresetName | null {
  for (const name of CAMERA_PRESET_NAMES) {
    const preset = getCameraPreset(name)
    if (
      preset.height === camera.height &&
      preset.distance === camera.distance &&
      preset.lookAhead === camera.lookAhead &&
      preset.followSpeed === camera.followSpeed &&
      preset.fov === camera.fov
    ) {
      return name
    }
  }
  return null
}

export function isCameraPresetName(value: unknown): value is CameraPresetName {
  return (
    typeof value === 'string' &&
    (CAMERA_PRESET_NAMES as readonly string[]).includes(value)
  )
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}
