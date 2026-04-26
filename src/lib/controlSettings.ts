import { z } from 'zod'

// User-tunable control settings. Persisted to localStorage so the choice
// follows the player across sessions and slugs without server state.

export const CONTROL_ACTIONS = [
  'forward',
  'backward',
  'left',
  'right',
  'handbrake',
] as const
export type ControlAction = (typeof CONTROL_ACTIONS)[number]

export const TOUCH_MODES = ['dual', 'single'] as const
export type TouchMode = (typeof TOUCH_MODES)[number]

export type KeyBindings = Record<ControlAction, string[]>

// Player-tunable camera rig. Mirrors the runtime CameraRigParams in
// src/game/sceneBuilder.ts, but only the four parameters worth surfacing in
// Settings: how high the camera sits, how far it trails, how far ahead the
// look-target leans into turns, and how snappy the follow is. The two lerp
// rates are tied together behind a single `followSpeed` so the UI stays a
// single intuitive slider rather than two fiddly knobs.
export interface CameraRigSettings {
  height: number
  distance: number
  lookAhead: number
  followSpeed: number
}

// Slider ranges. Picked so the extremes still produce a usable view: the
// minimum height (1.5) is roof-cam and the max (14) is helicopter, the
// trailing distance spans tight chase to wide cinematic, lookAhead 0 (center
// the car) to 12 (anticipates corners aggressively), and followSpeed 0.4
// (loose, drifty cam) to 1.6 (snappy, locked-on). Defaults match the legacy
// hardcoded `DEFAULT_CAMERA_RIG` so users who never touch the panel see the
// same view they did before.
export const CAMERA_HEIGHT_MIN = 1.5
export const CAMERA_HEIGHT_MAX = 14
export const CAMERA_DISTANCE_MIN = 6
export const CAMERA_DISTANCE_MAX = 28
export const CAMERA_LOOK_AHEAD_MIN = 0
export const CAMERA_LOOK_AHEAD_MAX = 12
export const CAMERA_FOLLOW_SPEED_MIN = 0.4
export const CAMERA_FOLLOW_SPEED_MAX = 1.6

export const DEFAULT_CAMERA_SETTINGS: CameraRigSettings = {
  height: 6,
  distance: 14,
  lookAhead: 6,
  followSpeed: 1,
}

export interface ControlSettings {
  keyBindings: KeyBindings
  touchMode: TouchMode
  showGhost: boolean
  camera: CameraRigSettings
}

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
}

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  keyBindings: DEFAULT_KEY_BINDINGS,
  touchMode: 'single',
  showGhost: true,
  camera: DEFAULT_CAMERA_SETTINGS,
}

export const CONTROL_SETTINGS_STORAGE_KEY = 'viberacer.controls'

const KeyCodeSchema = z.string().min(1).max(32)

const KeyBindingsSchema = z.object({
  forward: z.array(KeyCodeSchema),
  backward: z.array(KeyCodeSchema),
  left: z.array(KeyCodeSchema),
  right: z.array(KeyCodeSchema),
  handbrake: z.array(KeyCodeSchema),
})

const CameraRigSettingsSchema = z.object({
  height: z.number().min(CAMERA_HEIGHT_MIN).max(CAMERA_HEIGHT_MAX),
  distance: z.number().min(CAMERA_DISTANCE_MIN).max(CAMERA_DISTANCE_MAX),
  lookAhead: z.number().min(CAMERA_LOOK_AHEAD_MIN).max(CAMERA_LOOK_AHEAD_MAX),
  followSpeed: z
    .number()
    .min(CAMERA_FOLLOW_SPEED_MIN)
    .max(CAMERA_FOLLOW_SPEED_MAX),
})

const ControlSettingsSchema = z.object({
  keyBindings: KeyBindingsSchema,
  touchMode: z.enum(TOUCH_MODES),
  // Older stored settings predate this flag; default it on so existing users
  // see the ghost on their next race without having to dig into Settings.
  showGhost: z.boolean().default(true),
  // Camera tunables landed after the original settings shape; backfill from
  // defaults when reading legacy localStorage payloads so existing users do
  // not see a broken Settings pane.
  camera: CameraRigSettingsSchema.default(DEFAULT_CAMERA_SETTINGS),
})

export function cloneDefaultCameraSettings(): CameraRigSettings {
  return { ...DEFAULT_CAMERA_SETTINGS }
}

export function cloneDefaultSettings(): ControlSettings {
  return {
    keyBindings: cloneDefaultBindings(),
    touchMode: DEFAULT_CONTROL_SETTINGS.touchMode,
    showGhost: DEFAULT_CONTROL_SETTINGS.showGhost,
    camera: cloneDefaultCameraSettings(),
  }
}

// Map the two-knob `followSpeed` slider onto sceneBuilder's positionLerp +
// targetLerp pair. Defaults: positionLerp 0.12, targetLerp 0.20 at speed 1.0.
// Linear scaling with `followSpeed` keeps the legacy default exact while
// letting users push the camera looser or tighter without exposing the two
// raw knobs.
export const CAMERA_DEFAULT_POSITION_LERP = 0.12
export const CAMERA_DEFAULT_TARGET_LERP = 0.2
export function cameraLerpsFor(followSpeed: number): {
  positionLerp: number
  targetLerp: number
} {
  const clamped = Math.min(
    Math.max(followSpeed, CAMERA_FOLLOW_SPEED_MIN),
    CAMERA_FOLLOW_SPEED_MAX,
  )
  return {
    positionLerp: clamp01(CAMERA_DEFAULT_POSITION_LERP * clamped),
    targetLerp: clamp01(CAMERA_DEFAULT_TARGET_LERP * clamped),
  }
}

function clamp01(x: number): number {
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

export function cloneDefaultBindings(): KeyBindings {
  return {
    forward: [...DEFAULT_KEY_BINDINGS.forward],
    backward: [...DEFAULT_KEY_BINDINGS.backward],
    left: [...DEFAULT_KEY_BINDINGS.left],
    right: [...DEFAULT_KEY_BINDINGS.right],
    handbrake: [...DEFAULT_KEY_BINDINGS.handbrake],
  }
}

// Look up which action (if any) a KeyboardEvent.code is bound to. First match
// wins, so if a code appears in two actions only the first action fires.
export function actionForCode(
  bindings: KeyBindings,
  code: string,
): ControlAction | null {
  for (const action of CONTROL_ACTIONS) {
    if (bindings[action].includes(code)) return action
  }
  return null
}

// Replace whichever action currently holds `code` (if any) and assign `code`
// to `target`. Each code maps to at most one action across the whole set.
// Returns a fresh KeyBindings object.
export function rebindKey(
  bindings: KeyBindings,
  target: ControlAction,
  slot: number,
  code: string,
): KeyBindings {
  const next = cloneBindings(bindings)
  for (const action of CONTROL_ACTIONS) {
    next[action] = next[action].filter((c) => c !== code)
  }
  const list = next[target]
  while (list.length <= slot) list.push('')
  list[slot] = code
  next[target] = list.filter((c) => c.length > 0)
  return next
}

export function clearBinding(
  bindings: KeyBindings,
  target: ControlAction,
  slot: number,
): KeyBindings {
  const next = cloneBindings(bindings)
  if (slot >= 0 && slot < next[target].length) {
    next[target] = next[target].filter((_, i) => i !== slot)
  }
  return next
}

export function cloneBindings(bindings: KeyBindings): KeyBindings {
  return {
    forward: [...bindings.forward],
    backward: [...bindings.backward],
    left: [...bindings.left],
    right: [...bindings.right],
    handbrake: [...bindings.handbrake],
  }
}

export function readStoredControlSettings(): ControlSettings {
  if (typeof window === 'undefined') return cloneDefaultSettings()
  const raw = window.localStorage.getItem(CONTROL_SETTINGS_STORAGE_KEY)
  if (!raw) return cloneDefaultSettings()
  try {
    const parsed = ControlSettingsSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return cloneDefaultSettings()
    return parsed.data
  } catch {
    return cloneDefaultSettings()
  }
}

export function writeStoredControlSettings(settings: ControlSettings): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    CONTROL_SETTINGS_STORAGE_KEY,
    JSON.stringify(settings),
  )
}

// Friendly label for a KeyboardEvent.code value. Keeps the Settings UI
// readable without a lookup table at the call site.
export function formatKeyCode(code: string): string {
  if (!code) return ''
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6)
  if (code.startsWith('Arrow')) return code.slice(5) + ' arrow'
  switch (code) {
    case 'Space':
      return 'Space'
    case 'ShiftLeft':
      return 'Left Shift'
    case 'ShiftRight':
      return 'Right Shift'
    case 'ControlLeft':
      return 'Left Ctrl'
    case 'ControlRight':
      return 'Right Ctrl'
    case 'AltLeft':
      return 'Left Alt'
    case 'AltRight':
      return 'Right Alt'
    case 'MetaLeft':
    case 'MetaRight':
      return 'Meta'
    case 'Enter':
      return 'Enter'
    case 'Tab':
      return 'Tab'
    case 'Backspace':
      return 'Backspace'
    case 'Escape':
      return 'Esc'
    case 'Backquote':
      return '`'
    case 'Minus':
      return '-'
    case 'Equal':
      return '='
    case 'BracketLeft':
      return '['
    case 'BracketRight':
      return ']'
    case 'Semicolon':
      return ';'
    case 'Quote':
      return "'"
    case 'Comma':
      return ','
    case 'Period':
      return '.'
    case 'Slash':
      return '/'
    case 'Backslash':
      return '\\'
    default:
      return code
  }
}

export const ACTION_LABELS: Record<ControlAction, string> = {
  forward: 'Accelerate',
  backward: 'Brake / reverse',
  left: 'Steer left',
  right: 'Steer right',
  handbrake: 'Handbrake',
}
