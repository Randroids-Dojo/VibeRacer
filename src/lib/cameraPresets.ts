// Camera preset library. The Camera section of Settings ships five sliders
// (height, distance, look-ahead, follow speed, fov) that together describe
// the camera rig. Most players never touch them and a handful want a curated
// view without doing slider math, so this module surfaces a small set of
// named snapshots that one click apply to the public sliders plus optional
// preset-only local offsets.
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
  CAMERA_FORWARD_MAX,
  CAMERA_FORWARD_MIN,
  CAMERA_FOV_MAX,
  CAMERA_FOV_MIN,
  CAMERA_HEIGHT_MAX,
  CAMERA_HEIGHT_MIN,
  CAMERA_LOOK_AHEAD_MAX,
  CAMERA_LOOK_AHEAD_MIN,
  CAMERA_TARGET_HEIGHT_MAX,
  CAMERA_TARGET_HEIGHT_MIN,
  DEFAULT_CAMERA_SETTINGS,
  type CameraRigSettings,
} from './controlSettings'

export const CAMERA_PRESET_NAMES = [
  'chaseFar',
  'chaseClose',
  'cockpit',
  'dashboard',
  'hood',
  'bumper',
] as const
export type CameraPresetName = (typeof CAMERA_PRESET_NAMES)[number]

export const DEFAULT_CAMERA_PRESET: CameraPresetName = 'chaseFar'

// Friendly display labels for the picker. Single source of truth for
// capitalization so the picker UI and any test snapshots cannot drift apart.
export const CAMERA_PRESET_LABELS: Record<CameraPresetName, string> = {
  chaseFar: 'Chase far',
  chaseClose: 'Chase close',
  cockpit: 'Cockpit',
  dashboard: 'Dashboard',
  hood: 'Hood',
  bumper: 'Bumper',
}

// One-sentence blurb shown below the swatch and on the button's title /
// aria-label. Keeps the picker self-explanatory without forcing the player
// to apply a preset to discover what it does.
export const CAMERA_PRESET_DESCRIPTIONS: Record<CameraPresetName, string> = {
  chaseFar: 'Far behind, elevated view with more road and horizon visible.',
  chaseClose: 'Just behind the car with the body larger in frame.',
  cockpit: "From the driver's seat, looking out over the nose.",
  dashboard: 'Behind the windshield with a low road-focused angle.',
  hood: 'Mounted on the hood with a clear forward view.',
  bumper: 'Low at the front for the fastest-feeling view.',
}

// Hand-tuned snapshot for each preset. The chase far preset is
// `DEFAULT_CAMERA_SETTINGS` verbatim so the default remains unchanged. Each
// value stays inside the existing slider bounds so users can fine-tune from
// any preset without first hitting a clamp. Non-chase presets set
// `cameraForward` to place the camera inside or in front of the car.
const RAW_PRESETS: Record<CameraPresetName, CameraRigSettings> = {
  chaseFar: { ...DEFAULT_CAMERA_SETTINGS },
  // Forza-style close chase: just behind and slightly above the car, with
  // enough look-ahead to keep the road centerline visible.
  chaseClose: {
    height: 4.2,
    distance: 8.5,
    lookAhead: 7,
    followSpeed: 1.2,
    fov: 76,
  },
  cockpit: {
    height: 1.55,
    distance: 6,
    lookAhead: 11,
    followSpeed: 1.45,
    cameraForward: 0.6,
    targetHeight: 1.35,
    fov: 82,
  },
  dashboard: {
    height: 1.8,
    distance: 6,
    lookAhead: 11,
    followSpeed: 1.4,
    cameraForward: 1.25,
    targetHeight: 1.15,
    fov: 86,
  },
  hood: {
    height: 1.75,
    distance: 6,
    lookAhead: 12,
    followSpeed: 1.4,
    cameraForward: 2.25,
    targetHeight: 1,
    fov: 95,
  },
  bumper: {
    height: 0.65,
    distance: 6,
    lookAhead: 12,
    followSpeed: 1.55,
    cameraForward: 3.3,
    targetHeight: 0.8,
    fov: 102,
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
    ...(raw.cameraForward !== undefined
      ? {
          cameraForward: clamp(
            raw.cameraForward,
            CAMERA_FORWARD_MIN,
            CAMERA_FORWARD_MAX,
          ),
        }
      : {}),
    ...(raw.targetHeight !== undefined
      ? {
          targetHeight: clamp(
            raw.targetHeight,
            CAMERA_TARGET_HEIGHT_MIN,
            CAMERA_TARGET_HEIGHT_MAX,
          ),
        }
      : {}),
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
      preset.cameraForward === camera.cameraForward &&
      preset.targetHeight === camera.targetHeight &&
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
