import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  CONTROL_SETTINGS_STORAGE_KEY,
  DEFAULT_CONTROL_SETTINGS,
  DEFAULT_KEY_BINDINGS,
  actionForCode,
  clearBinding,
  cloneBindings,
  cloneDefaultSettings,
  formatKeyCode,
  rebindKey,
  readStoredControlSettings,
  writeStoredControlSettings,
} from '@/lib/controlSettings'

describe('actionForCode', () => {
  it('resolves default keyboard codes to actions', () => {
    expect(actionForCode(DEFAULT_KEY_BINDINGS, 'KeyW')).toBe('forward')
    expect(actionForCode(DEFAULT_KEY_BINDINGS, 'ArrowDown')).toBe('backward')
    expect(actionForCode(DEFAULT_KEY_BINDINGS, 'KeyA')).toBe('left')
    expect(actionForCode(DEFAULT_KEY_BINDINGS, 'ArrowRight')).toBe('right')
    expect(actionForCode(DEFAULT_KEY_BINDINGS, 'Space')).toBe('handbrake')
  })

  it('returns null for unbound codes', () => {
    expect(actionForCode(DEFAULT_KEY_BINDINGS, 'KeyZ')).toBeNull()
    expect(actionForCode(DEFAULT_KEY_BINDINGS, 'Tab')).toBeNull()
  })
})

describe('rebindKey', () => {
  it('assigns a fresh code to a target action slot', () => {
    const next = rebindKey(DEFAULT_KEY_BINDINGS, 'forward', 0, 'KeyT')
    expect(next.forward[0]).toBe('KeyT')
    expect(actionForCode(next, 'KeyT')).toBe('forward')
  })

  it('removes the code from any other action that previously held it', () => {
    const next = rebindKey(DEFAULT_KEY_BINDINGS, 'forward', 0, 'KeyA')
    expect(next.forward).toContain('KeyA')
    expect(next.left).not.toContain('KeyA')
  })

  it('does not mutate the input', () => {
    const before = cloneBindings(DEFAULT_KEY_BINDINGS)
    rebindKey(DEFAULT_KEY_BINDINGS, 'right', 1, 'KeyL')
    expect(DEFAULT_KEY_BINDINGS).toEqual(before)
  })

  it('extends the slot list when binding past the current length', () => {
    const empty = {
      forward: [],
      backward: [],
      left: [],
      right: [],
      handbrake: [],
    }
    const next = rebindKey(empty, 'forward', 1, 'KeyT')
    expect(next.forward).toEqual(['KeyT'])
  })
})

describe('clearBinding', () => {
  it('removes the slot at the given index', () => {
    const next = clearBinding(DEFAULT_KEY_BINDINGS, 'forward', 0)
    expect(next.forward).toEqual(['ArrowUp'])
  })

  it('is a no-op for an out-of-range slot', () => {
    const next = clearBinding(DEFAULT_KEY_BINDINGS, 'handbrake', 5)
    expect(next.handbrake).toEqual(['Space'])
  })
})

describe('formatKeyCode', () => {
  it.each([
    ['KeyW', 'W'],
    ['Digit1', '1'],
    ['ArrowLeft', 'Left arrow'],
    ['Space', 'Space'],
    ['Slash', '/'],
    ['NumpadEnter', 'Num Enter'],
    ['', ''],
  ])('formats %s as %s', (input, expected) => {
    expect(formatKeyCode(input)).toBe(expected)
  })
})

describe('localStorage round-trip', () => {
  const originalWindow = (globalThis as { window?: unknown }).window
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    const fakeWindow = {
      localStorage: {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = v
        },
        removeItem: (k: string) => {
          delete store[k]
        },
        clear: () => {
          store = {}
        },
      },
    }
    ;(globalThis as { window?: unknown }).window = fakeWindow
  })

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window
    } else {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  })

  it('returns defaults when storage is empty', () => {
    expect(readStoredControlSettings()).toEqual(DEFAULT_CONTROL_SETTINGS)
  })

  it('returns defaults when storage holds garbage', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = 'not-json'
    expect(readStoredControlSettings()).toEqual(DEFAULT_CONTROL_SETTINGS)
  })

  it('returns defaults when storage holds a wrong shape', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({ touchMode: 'foo' })
    expect(readStoredControlSettings()).toEqual(DEFAULT_CONTROL_SETTINGS)
  })

  it('reads back what was written', () => {
    const custom = cloneDefaultSettings()
    custom.touchMode = 'single'
    custom.keyBindings = rebindKey(custom.keyBindings, 'forward', 0, 'KeyI')
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })
})
