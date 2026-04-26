import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  CAMERA_DEFAULT_POSITION_LERP,
  CAMERA_DEFAULT_TARGET_LERP,
  CAMERA_FOLLOW_SPEED_MAX,
  CAMERA_FOLLOW_SPEED_MIN,
  CAMERA_HEIGHT_MAX,
  CAMERA_HEIGHT_MIN,
  CONTROL_SETTINGS_STORAGE_KEY,
  DEFAULT_CAMERA_SETTINGS,
  DEFAULT_CONTROL_SETTINGS,
  DEFAULT_KEY_BINDINGS,
  actionForCode,
  cameraLerpsFor,
  clearBinding,
  cloneBindings,
  cloneDefaultCameraSettings,
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

  it('defaults showGhost to true', () => {
    expect(DEFAULT_CONTROL_SETTINGS.showGhost).toBe(true)
    expect(cloneDefaultSettings().showGhost).toBe(true)
  })

  it('round-trips a disabled showGhost flag', () => {
    const custom = cloneDefaultSettings()
    custom.showGhost = false
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it('backfills showGhost when reading legacy storage that omits it', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
    })
    expect(readStoredControlSettings().showGhost).toBe(true)
  })

  it('defaults showMinimap to true', () => {
    expect(DEFAULT_CONTROL_SETTINGS.showMinimap).toBe(true)
    expect(cloneDefaultSettings().showMinimap).toBe(true)
  })

  it('round-trips a disabled showMinimap flag', () => {
    const custom = cloneDefaultSettings()
    custom.showMinimap = false
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it('backfills showMinimap when reading legacy storage that omits it', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
    })
    expect(readStoredControlSettings().showMinimap).toBe(true)
  })

  it('backfills camera when reading legacy storage that omits it', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
    })
    expect(readStoredControlSettings().camera).toEqual(DEFAULT_CAMERA_SETTINGS)
  })

  it('round-trips a tweaked camera rig', () => {
    const custom = cloneDefaultSettings()
    custom.camera = {
      height: 4,
      distance: 18,
      lookAhead: 8,
      followSpeed: 1.3,
    }
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings().camera).toEqual(custom.camera)
  })

  it('falls back to defaults when stored camera values are out of range', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      ...cloneDefaultSettings(),
      camera: {
        // Off-the-rails values would otherwise produce a renderer underground
        // shot or a no-follow camera. Reject the whole payload back to defaults.
        height: -50,
        distance: 9999,
        lookAhead: -3,
        followSpeed: 12,
      },
    })
    expect(readStoredControlSettings().camera).toEqual(DEFAULT_CAMERA_SETTINGS)
  })

  it('defaults carPaint to null (stock colormap)', () => {
    expect(DEFAULT_CONTROL_SETTINGS.carPaint).toBeNull()
    expect(cloneDefaultSettings().carPaint).toBeNull()
  })

  it('round-trips a chosen paint hex', () => {
    const custom = cloneDefaultSettings()
    custom.carPaint = '#3b6cf4'
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings().carPaint).toBe('#3b6cf4')
  })

  it('lowercases stored carPaint hex on read', () => {
    const custom = cloneDefaultSettings()
    custom.carPaint = '#3B6CF4'
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings().carPaint).toBe('#3b6cf4')
  })

  it('backfills carPaint when reading legacy storage that omits it', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      camera: DEFAULT_CAMERA_SETTINGS,
    })
    expect(readStoredControlSettings().carPaint).toBeNull()
  })

  it('falls back to defaults when stored carPaint is malformed', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      ...cloneDefaultSettings(),
      carPaint: 'not-a-hex',
    })
    expect(readStoredControlSettings()).toEqual(DEFAULT_CONTROL_SETTINGS)
  })
})

describe('camera defaults', () => {
  it('cloneDefaultCameraSettings returns a fresh copy', () => {
    const a = cloneDefaultCameraSettings()
    a.height = 1
    expect(cloneDefaultCameraSettings()).toEqual(DEFAULT_CAMERA_SETTINGS)
  })

  it('default ControlSettings carries the default camera rig', () => {
    expect(DEFAULT_CONTROL_SETTINGS.camera).toEqual(DEFAULT_CAMERA_SETTINGS)
    expect(cloneDefaultSettings().camera).toEqual(DEFAULT_CAMERA_SETTINGS)
  })

  it('defaults sit inside the slider ranges', () => {
    expect(DEFAULT_CAMERA_SETTINGS.height).toBeGreaterThanOrEqual(
      CAMERA_HEIGHT_MIN,
    )
    expect(DEFAULT_CAMERA_SETTINGS.height).toBeLessThanOrEqual(CAMERA_HEIGHT_MAX)
  })
})

describe('cameraLerpsFor', () => {
  it('matches the legacy lerps at followSpeed = 1', () => {
    const out = cameraLerpsFor(1)
    expect(out.positionLerp).toBeCloseTo(CAMERA_DEFAULT_POSITION_LERP, 6)
    expect(out.targetLerp).toBeCloseTo(CAMERA_DEFAULT_TARGET_LERP, 6)
  })

  it('scales linearly with followSpeed', () => {
    const slow = cameraLerpsFor(0.5)
    expect(slow.positionLerp).toBeCloseTo(CAMERA_DEFAULT_POSITION_LERP * 0.5, 6)
    expect(slow.targetLerp).toBeCloseTo(CAMERA_DEFAULT_TARGET_LERP * 0.5, 6)
    const fast = cameraLerpsFor(1.5)
    expect(fast.positionLerp).toBeCloseTo(CAMERA_DEFAULT_POSITION_LERP * 1.5, 6)
    expect(fast.targetLerp).toBeCloseTo(CAMERA_DEFAULT_TARGET_LERP * 1.5, 6)
  })

  it('clamps inputs to the supported range', () => {
    expect(cameraLerpsFor(-1)).toEqual(cameraLerpsFor(CAMERA_FOLLOW_SPEED_MIN))
    expect(cameraLerpsFor(99)).toEqual(cameraLerpsFor(CAMERA_FOLLOW_SPEED_MAX))
  })

  it('keeps both lerps in [0, 1]', () => {
    for (const s of [
      CAMERA_FOLLOW_SPEED_MIN,
      1,
      CAMERA_FOLLOW_SPEED_MAX,
    ]) {
      const { positionLerp, targetLerp } = cameraLerpsFor(s)
      expect(positionLerp).toBeGreaterThan(0)
      expect(positionLerp).toBeLessThanOrEqual(1)
      expect(targetLerp).toBeGreaterThan(0)
      expect(targetLerp).toBeLessThanOrEqual(1)
    }
  })
})
