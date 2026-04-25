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

export interface ControlSettings {
  keyBindings: KeyBindings
  touchMode: TouchMode
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
  touchMode: 'dual',
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

const ControlSettingsSchema = z.object({
  keyBindings: KeyBindingsSchema,
  touchMode: z.enum(TOUCH_MODES),
})

export function cloneDefaultSettings(): ControlSettings {
  return {
    keyBindings: cloneDefaultBindings(),
    touchMode: DEFAULT_CONTROL_SETTINGS.touchMode,
  }
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
