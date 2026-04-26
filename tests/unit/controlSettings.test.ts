import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  CAMERA_DEFAULT_POSITION_LERP,
  CAMERA_DEFAULT_TARGET_LERP,
  CAMERA_FOLLOW_SPEED_MAX,
  CAMERA_FOLLOW_SPEED_MIN,
  CAMERA_FOV_MAX,
  CAMERA_FOV_MIN,
  CAMERA_HEIGHT_MAX,
  CAMERA_HEIGHT_MIN,
  CONTROL_SETTINGS_STORAGE_KEY,
  DEFAULT_CAMERA_SETTINGS,
  DEFAULT_CONTROL_SETTINGS,
  DEFAULT_GAMEPAD_BINDINGS,
  DEFAULT_KEY_BINDINGS,
  GAMEPAD_BUTTON_MAX_INDEX,
  actionForCode,
  cameraLerpsFor,
  clearBinding,
  clearGamepadBinding,
  cloneBindings,
  cloneDefaultCameraSettings,
  cloneDefaultGamepadBindings,
  cloneDefaultSettings,
  cloneGamepadBindings,
  formatGamepadButton,
  formatKeyCode,
  gamepadActionForIndex,
  isContinuousAction,
  rebindGamepadButton,
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

  it('resolves the default restartLap binding to KeyR', () => {
    expect(actionForCode(DEFAULT_KEY_BINDINGS, 'KeyR')).toBe('restartLap')
  })

  it('returns null for unbound codes', () => {
    expect(actionForCode(DEFAULT_KEY_BINDINGS, 'KeyZ')).toBeNull()
    expect(actionForCode(DEFAULT_KEY_BINDINGS, 'Tab')).toBeNull()
  })
})

describe('isContinuousAction', () => {
  it('classifies the five driving actions as continuous (held-down)', () => {
    expect(isContinuousAction('forward')).toBe(true)
    expect(isContinuousAction('backward')).toBe(true)
    expect(isContinuousAction('left')).toBe(true)
    expect(isContinuousAction('right')).toBe(true)
    expect(isContinuousAction('handbrake')).toBe(true)
  })

  it('classifies restartLap as a one-shot (not continuous)', () => {
    // useKeyboard skips one-shot actions so KeyInput stays clean. Game.tsx
    // wires its own keydown listener for restartLap.
    expect(isContinuousAction('restartLap')).toBe(false)
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
      restartLap: [],
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

  it('defaults ghostSource to auto so legacy behavior is preserved', () => {
    expect(DEFAULT_CONTROL_SETTINGS.ghostSource).toBe('auto')
    expect(cloneDefaultSettings().ghostSource).toBe('auto')
  })

  it('round-trips a non-default ghostSource', () => {
    const custom = cloneDefaultSettings()
    custom.ghostSource = 'top'
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it('round-trips ghostSource = pb', () => {
    const custom = cloneDefaultSettings()
    custom.ghostSource = 'pb'
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings().ghostSource).toBe('pb')
  })

  it('backfills ghostSource when reading legacy storage that omits it', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
    })
    expect(readStoredControlSettings().ghostSource).toBe('auto')
  })

  it('falls back to defaults when stored ghostSource is unknown', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      ghostSource: 'unknown',
    })
    // Schema rejection: the whole payload falls back to defaults rather than
    // partially applying with a bogus enum value.
    expect(readStoredControlSettings().ghostSource).toBe('auto')
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

  it('defaults showSkidMarks to true', () => {
    expect(DEFAULT_CONTROL_SETTINGS.showSkidMarks).toBe(true)
    expect(cloneDefaultSettings().showSkidMarks).toBe(true)
  })

  it('round-trips a disabled showSkidMarks flag', () => {
    const custom = cloneDefaultSettings()
    custom.showSkidMarks = false
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it('backfills showSkidMarks when reading legacy storage that omits it', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      showMinimap: true,
    })
    expect(readStoredControlSettings().showSkidMarks).toBe(true)
  })

  it('defaults showTireSmoke to true', () => {
    expect(DEFAULT_CONTROL_SETTINGS.showTireSmoke).toBe(true)
    expect(cloneDefaultSettings().showTireSmoke).toBe(true)
  })

  it('round-trips a disabled showTireSmoke flag', () => {
    const custom = cloneDefaultSettings()
    custom.showTireSmoke = false
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it('backfills showTireSmoke when reading legacy storage that omits it', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      showMinimap: true,
      showSkidMarks: true,
    })
    expect(readStoredControlSettings().showTireSmoke).toBe(true)
  })

  it('defaults showRearview to true', () => {
    expect(DEFAULT_CONTROL_SETTINGS.showRearview).toBe(true)
    expect(cloneDefaultSettings().showRearview).toBe(true)
  })

  it('round-trips a disabled showRearview flag', () => {
    const custom = cloneDefaultSettings()
    custom.showRearview = false
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it('backfills showRearview when reading legacy storage that omits it', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      showMinimap: true,
      showSkidMarks: true,
      showSpeedometer: true,
    })
    expect(readStoredControlSettings().showRearview).toBe(true)
  })

  it('defaults showKerbs to true', () => {
    expect(DEFAULT_CONTROL_SETTINGS.showKerbs).toBe(true)
    expect(cloneDefaultSettings().showKerbs).toBe(true)
  })

  it('round-trips a disabled showKerbs flag', () => {
    const custom = cloneDefaultSettings()
    custom.showKerbs = false
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it('backfills showKerbs when reading legacy storage that omits it', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      showMinimap: true,
      showSkidMarks: true,
      showSpeedometer: true,
      showRearview: true,
    })
    expect(readStoredControlSettings().showKerbs).toBe(true)
  })

  it('defaults showScenery to true', () => {
    expect(DEFAULT_CONTROL_SETTINGS.showScenery).toBe(true)
    expect(cloneDefaultSettings().showScenery).toBe(true)
  })

  it('round-trips a disabled showScenery flag', () => {
    const custom = cloneDefaultSettings()
    custom.showScenery = false
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it('backfills showScenery when reading legacy storage that omits it', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      showMinimap: true,
      showSkidMarks: true,
      showSpeedometer: true,
      showRearview: true,
      showKerbs: true,
    })
    expect(readStoredControlSettings().showScenery).toBe(true)
  })

  it('defaults showDrift to true', () => {
    expect(DEFAULT_CONTROL_SETTINGS.showDrift).toBe(true)
    expect(cloneDefaultSettings().showDrift).toBe(true)
  })

  it('round-trips a disabled showDrift flag', () => {
    const custom = cloneDefaultSettings()
    custom.showDrift = false
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it('backfills showDrift when reading legacy storage that omits it', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      showMinimap: true,
      showSkidMarks: true,
      showSpeedometer: true,
      showRearview: true,
      showKerbs: true,
    })
    expect(readStoredControlSettings().showDrift).toBe(true)
  })

  it('defaults showRacingLine to false (opt-in coaching aid)', () => {
    expect(DEFAULT_CONTROL_SETTINGS.showRacingLine).toBe(false)
    expect(cloneDefaultSettings().showRacingLine).toBe(false)
  })

  it('round-trips an enabled showRacingLine flag', () => {
    const custom = cloneDefaultSettings()
    custom.showRacingLine = true
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it('backfills showRacingLine to false when reading legacy storage that omits it', () => {
    // Legacy payloads that predate the racing-line toggle should keep their
    // existing screen exactly as it was: opt-in, not opt-out, on upgrade.
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      showMinimap: true,
      showSkidMarks: true,
      showSpeedometer: true,
      showRearview: true,
      showKerbs: true,
      showScenery: true,
      showDrift: true,
    })
    expect(readStoredControlSettings().showRacingLine).toBe(false)
  })

  it("defaults headlights to 'auto'", () => {
    expect(DEFAULT_CONTROL_SETTINGS.headlights).toBe('auto')
    expect(cloneDefaultSettings().headlights).toBe('auto')
  })

  it("round-trips a headlights pick of 'on'", () => {
    const custom = cloneDefaultSettings()
    custom.headlights = 'on'
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it("round-trips a headlights pick of 'off'", () => {
    const custom = cloneDefaultSettings()
    custom.headlights = 'off'
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it("backfills headlights to 'auto' when reading legacy storage that omits it", () => {
    // Legacy payloads that predate the headlights setting should pick up the
    // sensible default so the upgrade is opt-out, not opt-in.
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      showMinimap: true,
      showSkidMarks: true,
      showSpeedometer: true,
      showRearview: true,
      showKerbs: true,
      showScenery: true,
      showDrift: true,
    })
    expect(readStoredControlSettings().headlights).toBe('auto')
  })

  it('rejects an unknown stored headlights value and falls back to defaults', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      ...cloneDefaultSettings(),
      headlights: 'flicker',
    })
    expect(readStoredControlSettings().headlights).toBe('auto')
  })

  it("defaults brakeLights to 'auto'", () => {
    expect(DEFAULT_CONTROL_SETTINGS.brakeLights).toBe('auto')
    expect(cloneDefaultSettings().brakeLights).toBe('auto')
  })

  it("round-trips a brakeLights pick of 'on'", () => {
    const custom = cloneDefaultSettings()
    custom.brakeLights = 'on'
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it("round-trips a brakeLights pick of 'off'", () => {
    const custom = cloneDefaultSettings()
    custom.brakeLights = 'off'
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it("backfills brakeLights to 'auto' when reading legacy storage that omits it", () => {
    // Legacy payloads that predate the brake-light setting should pick up the
    // sensible default so the upgrade is opt-out, not opt-in.
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      showMinimap: true,
      showSkidMarks: true,
      showSpeedometer: true,
      showRearview: true,
      showKerbs: true,
      showScenery: true,
      showDrift: true,
    })
    expect(readStoredControlSettings().brakeLights).toBe('auto')
  })

  it('rejects an unknown stored brakeLights value and falls back to defaults', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      ...cloneDefaultSettings(),
      brakeLights: 'pulsing',
    })
    expect(readStoredControlSettings().brakeLights).toBe('auto')
  })

  it("defaults haptics to 'auto'", () => {
    expect(DEFAULT_CONTROL_SETTINGS.haptics).toBe('auto')
    expect(cloneDefaultSettings().haptics).toBe('auto')
  })

  it("round-trips a haptics pick of 'on'", () => {
    const custom = cloneDefaultSettings()
    custom.haptics = 'on'
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it("round-trips a haptics pick of 'off'", () => {
    const custom = cloneDefaultSettings()
    custom.haptics = 'off'
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it("backfills haptics to 'auto' when reading legacy storage that omits it", () => {
    // Legacy payloads predating the haptics setting should pick up the same
    // default a brand-new install gets so the upgrade is opt-out, not opt-in.
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      showMinimap: true,
      showSkidMarks: true,
      showSpeedometer: true,
      showRearview: true,
      showKerbs: true,
      showScenery: true,
      showDrift: true,
    })
    expect(readStoredControlSettings().haptics).toBe('auto')
  })

  it('rejects an unknown stored haptics value and falls back to defaults', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      ...cloneDefaultSettings(),
      haptics: 'continuous',
    })
    expect(readStoredControlSettings().haptics).toBe('auto')
  })

  it("defaults timeOfDayCycle to 'off'", () => {
    expect(DEFAULT_CONTROL_SETTINGS.timeOfDayCycle).toBe('off')
    expect(cloneDefaultSettings().timeOfDayCycle).toBe('off')
  })

  it("round-trips a timeOfDayCycle pick of 'slow'", () => {
    const custom = cloneDefaultSettings()
    custom.timeOfDayCycle = 'slow'
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it("round-trips a timeOfDayCycle pick of 'fast'", () => {
    const custom = cloneDefaultSettings()
    custom.timeOfDayCycle = 'fast'
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it("backfills timeOfDayCycle to 'off' when reading legacy storage that omits it", () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      showMinimap: true,
      showSkidMarks: true,
      showSpeedometer: true,
      showRearview: true,
      showKerbs: true,
      showScenery: true,
      showDrift: true,
    })
    expect(readStoredControlSettings().timeOfDayCycle).toBe('off')
  })

  it('rejects an unknown stored timeOfDayCycle value and falls back to defaults', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      ...cloneDefaultSettings(),
      timeOfDayCycle: 'instant',
    })
    expect(readStoredControlSettings().timeOfDayCycle).toBe('off')
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
      fov: 85,
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
        fov: 5,
      },
    })
    expect(readStoredControlSettings().camera).toEqual(DEFAULT_CAMERA_SETTINGS)
  })

  it('backfills fov when reading a legacy camera payload that omits it', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      ...cloneDefaultSettings(),
      camera: {
        // Legacy payload predates the FOV field. Expect the rest of the rig
        // to ride through and FOV to backfill from the default rather than
        // falling all the way back to the full default rig (which would lose
        // the player's tweaks).
        height: 5,
        distance: 16,
        lookAhead: 7,
        followSpeed: 1.1,
      },
    })
    const out = readStoredControlSettings().camera
    expect(out.fov).toBe(DEFAULT_CAMERA_SETTINGS.fov)
    expect(out.height).toBe(5)
    expect(out.distance).toBe(16)
    expect(out.lookAhead).toBe(7)
    expect(out.followSpeed).toBeCloseTo(1.1, 6)
  })

  it('rejects an out-of-range FOV but keeps the rest of the payload via defaults', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      ...cloneDefaultSettings(),
      camera: {
        height: DEFAULT_CAMERA_SETTINGS.height,
        distance: DEFAULT_CAMERA_SETTINGS.distance,
        lookAhead: DEFAULT_CAMERA_SETTINGS.lookAhead,
        followSpeed: DEFAULT_CAMERA_SETTINGS.followSpeed,
        // 200 is well outside the slider range; the safeParse should reject
        // the camera payload and fall back to the defaults.
        fov: 200,
      },
    })
    expect(readStoredControlSettings().camera).toEqual(DEFAULT_CAMERA_SETTINGS)
  })

  it('round-trips an FOV at the slider extremes', () => {
    for (const fov of [50, 70, 90, 110]) {
      const custom = cloneDefaultSettings()
      custom.camera = { ...custom.camera, fov }
      writeStoredControlSettings(custom)
      expect(readStoredControlSettings().camera.fov).toBe(fov)
    }
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

  it('defaults racingNumber to disabled with the default value and palette colors', () => {
    expect(DEFAULT_CONTROL_SETTINGS.racingNumber.enabled).toBe(false)
    expect(DEFAULT_CONTROL_SETTINGS.racingNumber.value).toBe('7')
    expect(DEFAULT_CONTROL_SETTINGS.racingNumber.plateHex).toBe('#ffffff')
    expect(DEFAULT_CONTROL_SETTINGS.racingNumber.textHex).toBe('#1a1a1a')
    expect(cloneDefaultSettings().racingNumber).toEqual(
      DEFAULT_CONTROL_SETTINGS.racingNumber,
    )
  })

  it('cloneDefaultSettings returns an isolated racingNumber object', () => {
    const a = cloneDefaultSettings()
    const b = cloneDefaultSettings()
    expect(a.racingNumber).not.toBe(b.racingNumber)
    a.racingNumber.value = '88'
    expect(b.racingNumber.value).toBe('7')
  })

  it('round-trips an enabled racingNumber with a custom value and colors', () => {
    const custom = cloneDefaultSettings()
    custom.racingNumber = {
      enabled: true,
      value: '42',
      plateHex: '#3b6cf4',
      textHex: '#ffffff',
    }
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it('backfills racingNumber when reading legacy storage that omits it', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      camera: DEFAULT_CAMERA_SETTINGS,
      carPaint: null,
    })
    const out = readStoredControlSettings()
    expect(out.racingNumber).toEqual(DEFAULT_CONTROL_SETTINGS.racingNumber)
  })

  it('falls back to defaults when stored racingNumber value is malformed', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      ...cloneDefaultSettings(),
      racingNumber: {
        enabled: true,
        value: 'abc',
        plateHex: '#ffffff',
        textHex: '#1a1a1a',
      },
    })
    expect(readStoredControlSettings()).toEqual(DEFAULT_CONTROL_SETTINGS)
  })

  it('falls back to defaults when stored racingNumber plate hex is malformed', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      ...cloneDefaultSettings(),
      racingNumber: {
        enabled: true,
        value: '7',
        plateHex: 'red',
        textHex: '#1a1a1a',
      },
    })
    expect(readStoredControlSettings()).toEqual(DEFAULT_CONTROL_SETTINGS)
  })

  it('defaults showSpeedometer to true and speedUnit to mph', () => {
    expect(DEFAULT_CONTROL_SETTINGS.showSpeedometer).toBe(true)
    expect(DEFAULT_CONTROL_SETTINGS.speedUnit).toBe('mph')
    expect(cloneDefaultSettings().showSpeedometer).toBe(true)
    expect(cloneDefaultSettings().speedUnit).toBe('mph')
  })

  it('round-trips a disabled speedometer with a non-default unit', () => {
    const custom = cloneDefaultSettings()
    custom.showSpeedometer = false
    custom.speedUnit = 'kmh'
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings()).toEqual(custom)
  })

  it('backfills speedometer flags when reading legacy storage that omits them', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      showMinimap: true,
      showSkidMarks: true,
      camera: DEFAULT_CAMERA_SETTINGS,
      carPaint: null,
    })
    const out = readStoredControlSettings()
    expect(out.showSpeedometer).toBe(true)
    expect(out.speedUnit).toBe('mph')
  })

  it('falls back to defaults when stored speedUnit is malformed', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      ...cloneDefaultSettings(),
      speedUnit: 'knots',
    })
    expect(readStoredControlSettings()).toEqual(DEFAULT_CONTROL_SETTINGS)
  })

  it('defaults showTopSpeedMarker to true', () => {
    expect(DEFAULT_CONTROL_SETTINGS.showTopSpeedMarker).toBe(true)
    expect(cloneDefaultSettings().showTopSpeedMarker).toBe(true)
  })

  it('round-trips a disabled top-speed marker', () => {
    const custom = cloneDefaultSettings()
    custom.showTopSpeedMarker = false
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings().showTopSpeedMarker).toBe(false)
  })

  it('backfills showTopSpeedMarker when reading legacy storage that omits it', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      showMinimap: true,
      showSkidMarks: true,
      camera: DEFAULT_CAMERA_SETTINGS,
      carPaint: null,
    })
    expect(readStoredControlSettings().showTopSpeedMarker).toBe(true)
  })

  it("defaults timeOfDay to 'noon' (the legacy hardcoded scene)", () => {
    expect(DEFAULT_CONTROL_SETTINGS.timeOfDay).toBe('noon')
    expect(cloneDefaultSettings().timeOfDay).toBe('noon')
  })

  it('round-trips a non-default timeOfDay choice', () => {
    const custom = cloneDefaultSettings()
    custom.timeOfDay = 'sunset'
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings().timeOfDay).toBe('sunset')
  })

  it('backfills timeOfDay when reading legacy storage that omits it', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      showMinimap: true,
      showSkidMarks: true,
      camera: DEFAULT_CAMERA_SETTINGS,
      carPaint: null,
    })
    expect(readStoredControlSettings().timeOfDay).toBe('noon')
  })

  it('falls back to defaults when stored timeOfDay is unknown', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      ...cloneDefaultSettings(),
      timeOfDay: 'dusk',
    })
    expect(readStoredControlSettings()).toEqual(DEFAULT_CONTROL_SETTINGS)
  })

  it("defaults weather to 'clear' (no fog, identity multipliers)", () => {
    expect(DEFAULT_CONTROL_SETTINGS.weather).toBe('clear')
    expect(cloneDefaultSettings().weather).toBe('clear')
  })

  it('round-trips a non-default weather choice', () => {
    const custom = cloneDefaultSettings()
    custom.weather = 'foggy'
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings().weather).toBe('foggy')
  })

  it('backfills weather when reading legacy storage that omits it', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      showMinimap: true,
      showSkidMarks: true,
      camera: DEFAULT_CAMERA_SETTINGS,
      carPaint: null,
      timeOfDay: 'noon',
    })
    expect(readStoredControlSettings().weather).toBe('clear')
  })

  it('falls back to defaults when stored weather is unknown', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      ...cloneDefaultSettings(),
      weather: 'hailstorm',
    })
    expect(readStoredControlSettings()).toEqual(DEFAULT_CONTROL_SETTINGS)
  })

  it('defaults respectTrackMood to true so brand-new players see the author look', () => {
    expect(DEFAULT_CONTROL_SETTINGS.respectTrackMood).toBe(true)
    expect(cloneDefaultSettings().respectTrackMood).toBe(true)
  })

  it('round-trips respectTrackMood = false', () => {
    const custom = cloneDefaultSettings()
    custom.respectTrackMood = false
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings().respectTrackMood).toBe(false)
  })

  it('backfills respectTrackMood when reading legacy storage that omits it', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      showMinimap: true,
      showSkidMarks: true,
      camera: DEFAULT_CAMERA_SETTINGS,
      carPaint: null,
      timeOfDay: 'noon',
      weather: 'clear',
    })
    expect(readStoredControlSettings().respectTrackMood).toBe(true)
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
    expect(DEFAULT_CAMERA_SETTINGS.fov).toBeGreaterThanOrEqual(CAMERA_FOV_MIN)
    expect(DEFAULT_CAMERA_SETTINGS.fov).toBeLessThanOrEqual(CAMERA_FOV_MAX)
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

describe('gamepad bindings', () => {
  it('default bindings carry the expected analog + fallback indices', () => {
    expect(DEFAULT_GAMEPAD_BINDINGS.forward).toEqual([7, 0])
    expect(DEFAULT_GAMEPAD_BINDINGS.backward).toEqual([6, 1])
    expect(DEFAULT_GAMEPAD_BINDINGS.handbrake).toEqual([5, 2])
    expect(DEFAULT_GAMEPAD_BINDINGS.pause).toEqual([9])
  })

  it('cloneDefaultGamepadBindings returns a fresh copy', () => {
    const a = cloneDefaultGamepadBindings()
    a.forward.push(99)
    expect(cloneDefaultGamepadBindings().forward).toEqual(
      DEFAULT_GAMEPAD_BINDINGS.forward,
    )
  })

  it('cloneGamepadBindings deep-copies the lists', () => {
    const original = DEFAULT_GAMEPAD_BINDINGS
    const clone = cloneGamepadBindings(original)
    clone.handbrake.push(11)
    expect(original.handbrake).toEqual([5, 2])
  })

  it('default settings carry the default gamepad bindings', () => {
    expect(DEFAULT_CONTROL_SETTINGS.gamepadBindings).toEqual(
      DEFAULT_GAMEPAD_BINDINGS,
    )
    expect(cloneDefaultSettings().gamepadBindings).toEqual(
      DEFAULT_GAMEPAD_BINDINGS,
    )
  })

  it('gamepadActionForIndex resolves defaults', () => {
    expect(gamepadActionForIndex(DEFAULT_GAMEPAD_BINDINGS, 7)).toBe('forward')
    expect(gamepadActionForIndex(DEFAULT_GAMEPAD_BINDINGS, 6)).toBe('backward')
    expect(gamepadActionForIndex(DEFAULT_GAMEPAD_BINDINGS, 5)).toBe('handbrake')
    expect(gamepadActionForIndex(DEFAULT_GAMEPAD_BINDINGS, 9)).toBe('pause')
    expect(gamepadActionForIndex(DEFAULT_GAMEPAD_BINDINGS, 12)).toBeNull()
  })

  it('rebindGamepadButton transfers an index from one action to another', () => {
    const next = rebindGamepadButton(
      DEFAULT_GAMEPAD_BINDINGS,
      'handbrake',
      0,
      7, // RT, currently bound to forward
    )
    expect(next.handbrake[0]).toBe(7)
    expect(next.forward).not.toContain(7)
    expect(gamepadActionForIndex(next, 7)).toBe('handbrake')
  })

  it('rebindGamepadButton extends the slot list when binding past length', () => {
    const empty = {
      forward: [] as number[],
      backward: [] as number[],
      handbrake: [] as number[],
      pause: [] as number[],
    }
    const next = rebindGamepadButton(empty, 'pause', 1, 8)
    expect(next.pause).toEqual([8])
  })

  it('rebindGamepadButton does not mutate the input', () => {
    const before = cloneGamepadBindings(DEFAULT_GAMEPAD_BINDINGS)
    rebindGamepadButton(DEFAULT_GAMEPAD_BINDINGS, 'forward', 0, 3)
    expect(DEFAULT_GAMEPAD_BINDINGS).toEqual(before)
  })

  it('clearGamepadBinding removes the slot at the given index', () => {
    const next = clearGamepadBinding(DEFAULT_GAMEPAD_BINDINGS, 'forward', 0)
    expect(next.forward).toEqual([0])
  })

  it('clearGamepadBinding is a no-op for an out-of-range slot', () => {
    const next = clearGamepadBinding(DEFAULT_GAMEPAD_BINDINGS, 'pause', 5)
    expect(next.pause).toEqual([9])
  })

  it.each([
    [0, 'A / Cross'],
    [1, 'B / Circle'],
    [4, 'LB'],
    [5, 'RB'],
    [6, 'LT'],
    [7, 'RT'],
    [9, 'Start'],
    [14, 'Dpad left'],
    [15, 'Dpad right'],
  ])('formats button %i as %s', (idx, label) => {
    expect(formatGamepadButton(idx)).toBe(label)
  })

  it('formats unknown indices with a fallback label', () => {
    expect(formatGamepadButton(99)).toBe('Button 99')
  })

  it('GAMEPAD_BUTTON_MAX_INDEX is 16 (Standard layout cap)', () => {
    expect(GAMEPAD_BUTTON_MAX_INDEX).toBe(16)
  })
})

describe('gamepad bindings storage round-trip', () => {
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

  it('round-trips a rebound pause button', () => {
    const custom = cloneDefaultSettings()
    custom.gamepadBindings = rebindGamepadButton(
      custom.gamepadBindings,
      'pause',
      0,
      8, // Back / Select
    )
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings().gamepadBindings.pause).toEqual([8])
  })

  it('backfills gamepadBindings when reading legacy storage that omits them', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      keyBindings: DEFAULT_KEY_BINDINGS,
      touchMode: 'single',
      showGhost: true,
      showMinimap: true,
      showSkidMarks: true,
      showSpeedometer: true,
      speedUnit: 'mph',
      camera: DEFAULT_CAMERA_SETTINGS,
      carPaint: null,
    })
    expect(readStoredControlSettings().gamepadBindings).toEqual(
      DEFAULT_GAMEPAD_BINDINGS,
    )
  })

  it('falls back to defaults when stored gamepadBindings have an out-of-range index', () => {
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      ...cloneDefaultSettings(),
      gamepadBindings: {
        forward: [42], // invalid
        backward: [6],
        handbrake: [5],
        pause: [9],
      },
    })
    expect(readStoredControlSettings()).toEqual(DEFAULT_CONTROL_SETTINGS)
  })

  it('defaults restartLap to KeyR', () => {
    expect(DEFAULT_KEY_BINDINGS.restartLap).toEqual(['KeyR'])
    expect(cloneDefaultSettings().keyBindings.restartLap).toEqual(['KeyR'])
  })

  it('round-trips a remapped restartLap binding', () => {
    const custom = cloneDefaultSettings()
    custom.keyBindings = rebindKey(custom.keyBindings, 'restartLap', 0, 'KeyT')
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings().keyBindings.restartLap).toEqual(['KeyT'])
  })

  it('backfills restartLap when reading legacy storage that omits it', () => {
    // Legacy keyBindings shape: pre-restartLap, only the five continuous
    // actions. The schema should slot in the default R binding rather than
    // rejecting the entire payload.
    store[CONTROL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      ...cloneDefaultSettings(),
      keyBindings: {
        forward: ['KeyW', 'ArrowUp'],
        backward: ['KeyS', 'ArrowDown'],
        left: ['KeyA', 'ArrowLeft'],
        right: ['KeyD', 'ArrowRight'],
        handbrake: ['Space'],
      },
    })
    expect(readStoredControlSettings().keyBindings.restartLap).toEqual(['KeyR'])
  })

  it('lets the player clear the restartLap binding entirely', () => {
    const custom = cloneDefaultSettings()
    custom.keyBindings = clearBinding(custom.keyBindings, 'restartLap', 0)
    writeStoredControlSettings(custom)
    expect(readStoredControlSettings().keyBindings.restartLap).toEqual([])
  })
})
