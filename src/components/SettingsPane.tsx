'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ACTION_LABELS,
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
  CONTROL_ACTIONS,
  DEFAULT_CAMERA_SETTINGS,
  GAMEPAD_ACTIONS,
  GAMEPAD_ACTION_LABELS,
  TOUCH_MODES,
  clearBinding,
  clearGamepadBinding,
  cloneDefaultCameraSettings,
  formatGamepadButton,
  formatKeyCode,
  rebindGamepadButton,
  rebindKey,
  type CameraRigSettings,
  type ControlAction,
  type ControlSettings,
  type GamepadAction,
  type TouchMode,
} from '@/lib/controlSettings'
import { useClickSfx } from '@/hooks/useClickSfx'
import { useAudioSettings } from '@/hooks/useAudioSettings'
import { InitialsSchema } from '@/lib/schemas'
import { readStoredInitials, writeStoredInitials } from '@/lib/initials'
import { CAR_PAINTS } from '@/lib/carPaint'
import {
  DEFAULT_RACING_NUMBER,
  RACING_NUMBER_MAX_LENGTH,
  RACING_NUMBER_PLATE_COLORS,
  RACING_NUMBER_TEXT_COLORS,
  sanitizeRacingNumber,
  type RacingNumberSetting,
} from '@/lib/racingNumber'
import {
  TIME_OF_DAY_DESCRIPTIONS,
  TIME_OF_DAY_LABELS,
  TIME_OF_DAY_NAMES,
  getLightingPreset,
  type TimeOfDay,
} from '@/lib/lighting'
import {
  WEATHER_DESCRIPTIONS,
  WEATHER_LABELS,
  WEATHER_NAMES,
  getWeatherPreset,
  type Weather,
} from '@/lib/weather'
import {
  CAMERA_PRESET_DESCRIPTIONS,
  CAMERA_PRESET_LABELS,
  CAMERA_PRESET_NAMES,
  getCameraPreset,
  matchCameraPreset,
  type CameraPresetName,
} from '@/lib/cameraPresets'
import { SPEED_UNITS, unitLabel, type SpeedUnit } from '@/lib/speedometer'
import {
  GHOST_SOURCES,
  GHOST_SOURCE_DESCRIPTIONS,
  GHOST_SOURCE_LABELS,
  type GhostSource,
} from '@/lib/ghostSource'
import {
  HEADLIGHT_MODES,
  HEADLIGHT_MODE_DESCRIPTIONS,
  HEADLIGHT_MODE_LABELS,
  type HeadlightMode,
} from '@/lib/headlights'
import {
  BRAKE_LIGHT_MODES,
  BRAKE_LIGHT_MODE_DESCRIPTIONS,
  BRAKE_LIGHT_MODE_LABELS,
  type BrakeLightMode,
} from '@/lib/brakeLights'
import {
  HAPTIC_MODES,
  HAPTIC_MODE_DESCRIPTIONS,
  HAPTIC_MODE_LABELS,
  type HapticMode,
} from '@/lib/haptics'
import {
  TIME_OF_DAY_CYCLE_DESCRIPTIONS,
  TIME_OF_DAY_CYCLE_LABELS,
  TIME_OF_DAY_CYCLE_MODES,
  type TimeOfDayCycleMode,
} from '@/lib/timeOfDayCycle'
import {
  MenuButton,
  MenuHeader,
  MenuHint,
  MenuOverlay,
  MenuPanel,
  MenuSection,
  MenuSlider,
  MenuToggle,
  menuTheme,
} from './MenuUI'

interface SettingsPaneProps {
  settings: ControlSettings
  onChange: (next: ControlSettings) => void
  onClose: () => void
  onReset: () => void
  // Set when SettingsPane is rendered inside the in-game pause overlay so
  // navigating away can warn the player before abandoning the race.
  inRace?: boolean
}

interface CaptureTarget {
  action: ControlAction
  slot: number
}

interface PadCaptureTarget {
  action: GamepadAction
  slot: number
}

export function SettingsPane({
  settings,
  onChange,
  onClose,
  onReset,
  inRace,
}: SettingsPaneProps) {
  const router = useRouter()
  const [capture, setCapture] = useState<CaptureTarget | null>(null)
  const [padCapture, setPadCapture] = useState<PadCaptureTarget | null>(null)
  const [hasKeyboard, setHasKeyboard] = useState(true)
  const [hasTouch, setHasTouch] = useState(false)
  const [pad, setPad] = useState<{ connected: boolean; id: string | null }>({
    connected: false,
    id: null,
  })
  const clickConfirm = useClickSfx('confirm')
  const clickSoft = useClickSfx('soft')
  const {
    settings: audio,
    setSettings: setAudio,
    resetSettings: resetAudio,
  } = useAudioSettings()
  // Identity: editable inline. Hydrated from localStorage on mount; saving
  // dispatches the INITIALS_EVENT (via writeStoredInitials) so the HUD picks
  // up the new tag on the next frame without a page reload. Mid-race edits
  // affect future laps only; historical leaderboard entries are immutable.
  const [storedInitials, setStoredInitials] = useState<string>('')
  const [initialsDraft, setInitialsDraft] = useState<string>('')
  const [initialsError, setInitialsError] = useState<string | null>(null)
  const [initialsSaved, setInitialsSaved] = useState<boolean>(false)
  const initialsSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  useEffect(() => {
    const current = readStoredInitials() ?? ''
    setStoredInitials(current)
    setInitialsDraft(current)
  }, [])
  useEffect(() => {
    return () => {
      if (initialsSavedTimerRef.current) {
        clearTimeout(initialsSavedTimerRef.current)
      }
    }
  }, [])

  function saveInitials() {
    const parsed = InitialsSchema.safeParse(initialsDraft)
    if (!parsed.success) {
      setInitialsError('3 letters, A to Z only.')
      return
    }
    writeStoredInitials(parsed.data)
    setStoredInitials(parsed.data)
    setInitialsDraft(parsed.data)
    setInitialsError(null)
    setInitialsSaved(true)
    if (initialsSavedTimerRef.current) {
      clearTimeout(initialsSavedTimerRef.current)
    }
    initialsSavedTimerRef.current = setTimeout(() => {
      setInitialsSaved(false)
      initialsSavedTimerRef.current = null
    }, 1500)
  }

  const initialsDirty =
    initialsDraft.length === 3 && initialsDraft !== storedInitials

  function openTuningLab() {
    if (inRace && !window.confirm('Leave the race to open the Tuning Lab?')) {
      return
    }
    clickConfirm()
    onClose()
    router.push('/tune')
  }

  useEffect(() => {
    const fineQuery = window.matchMedia('(any-pointer: fine)')
    const coarseQuery = window.matchMedia('(any-pointer: coarse)')
    const fallbackTouch =
      typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
    setHasKeyboard(fineQuery.matches || !coarseQuery.matches)
    setHasTouch(coarseQuery.matches || fallbackTouch)
  }, [])

  // Show whether a gamepad is currently plugged in. Some browsers gate
  // getGamepads() until the first connect event, so we listen to both.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return
    function refresh() {
      const pads = navigator.getGamepads()
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i]
        if (p && p.connected) {
          setPad({ connected: true, id: p.id })
          return
        }
      }
      setPad({ connected: false, id: null })
    }
    refresh()
    function onConnect(e: GamepadEvent) {
      setPad({ connected: true, id: e.gamepad.id })
    }
    function onDisconnect() {
      refresh()
    }
    window.addEventListener('gamepadconnected', onConnect)
    window.addEventListener('gamepaddisconnected', onDisconnect)
    const interval = window.setInterval(refresh, 1500)
    return () => {
      window.removeEventListener('gamepadconnected', onConnect)
      window.removeEventListener('gamepaddisconnected', onDisconnect)
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (!capture) return
    const target = capture
    function onKey(e: KeyboardEvent) {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapture(null)
        return
      }
      // Modifiers alone are not useful as a driving binding.
      if (
        e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight' ||
        e.code === 'ControlLeft' ||
        e.code === 'ControlRight' ||
        e.code === 'AltLeft' ||
        e.code === 'AltRight' ||
        e.code === 'MetaLeft' ||
        e.code === 'MetaRight'
      ) {
        return
      }
      onChange({
        ...settings,
        keyBindings: rebindKey(
          settings.keyBindings,
          target.action,
          target.slot,
          e.code,
        ),
      })
      setCapture(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capture, settings, onChange])

  // Gamepad capture flow. Esc cancels (handled by the keyboard listener wired
  // into capture above is keyboard-only, so we add a parallel keydown here).
  // We poll the Gamepad API on rAF and accept the next button that crosses a
  // press threshold. To avoid binding the same button twice in a row when the
  // user taps then holds, we start "armed" only once every previously held
  // button has been released; only fresh presses count.
  useEffect(() => {
    if (!padCapture) return
    const target = padCapture
    if (typeof window === 'undefined') return
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return

    let raf = 0
    // Indices held at capture-start are ignored until released, so a still-held
    // RT does not immediately rebind the slot the user just clicked.
    let armed = new Set<number>()
    let initialized = false

    function snapshotPressed(): Set<number> {
      const pads = navigator.getGamepads()
      const out = new Set<number>()
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i]
        if (!p || !p.connected) continue
        for (let b = 0; b < p.buttons.length; b++) {
          const btn = p.buttons[b]
          if (!btn) continue
          const value = typeof btn.value === 'number' ? btn.value : btn.pressed ? 1 : 0
          if (btn.pressed || value >= 0.5) out.add(b)
        }
        break
      }
      return out
    }

    function poll() {
      const pressed = snapshotPressed()
      if (!initialized) {
        // First sample: anything currently held is parked until released.
        armed = pressed
        initialized = true
        raf = requestAnimationFrame(poll)
        return
      }
      // Drop indices the user has released so they become available again.
      for (const i of Array.from(armed)) {
        if (!pressed.has(i)) armed.delete(i)
      }
      // First fresh press (not in `armed`) wins.
      for (const i of pressed) {
        if (armed.has(i)) continue
        onChange({
          ...settings,
          gamepadBindings: rebindGamepadButton(
            settings.gamepadBindings,
            target.action,
            target.slot,
            i,
          ),
        })
        setPadCapture(null)
        return
      }
      raf = requestAnimationFrame(poll)
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setPadCapture(null)
      }
    }

    raf = requestAnimationFrame(poll)
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [padCapture, settings, onChange])

  function setTouchMode(mode: TouchMode) {
    onChange({ ...settings, touchMode: mode })
  }

  function setGhostSource(value: GhostSource) {
    clickSoft()
    onChange({ ...settings, ghostSource: value, showGhost: true })
  }

  function setGhostOff() {
    clickSoft()
    onChange({ ...settings, showGhost: false })
  }

  function setShowGhostNameplate(value: boolean) {
    onChange({ ...settings, showGhostNameplate: value })
  }

  function setShowGhostGap(value: boolean) {
    onChange({ ...settings, showGhostGap: value })
  }

  function setShowMinimap(value: boolean) {
    onChange({ ...settings, showMinimap: value })
  }

  function setShowSkidMarks(value: boolean) {
    onChange({ ...settings, showSkidMarks: value })
  }

  function setShowTireSmoke(value: boolean) {
    onChange({ ...settings, showTireSmoke: value })
  }

  function setShowSpeedometer(value: boolean) {
    onChange({ ...settings, showSpeedometer: value })
  }

  function setShowTopSpeedMarker(value: boolean) {
    onChange({ ...settings, showTopSpeedMarker: value })
  }

  function setShowRearview(value: boolean) {
    onChange({ ...settings, showRearview: value })
  }

  function setShowKerbs(value: boolean) {
    onChange({ ...settings, showKerbs: value })
  }

  function setShowScenery(value: boolean) {
    onChange({ ...settings, showScenery: value })
  }

  function setShowDrift(value: boolean) {
    onChange({ ...settings, showDrift: value })
  }

  function setShowRacingLine(value: boolean) {
    onChange({ ...settings, showRacingLine: value })
  }

  function setShowSpeedLines(value: boolean) {
    onChange({ ...settings, showSpeedLines: value })
  }

  function setShowReactionTime(value: boolean) {
    onChange({ ...settings, showReactionTime: value })
  }

  function setShowLeaderboardRank(value: boolean) {
    onChange({ ...settings, showLeaderboardRank: value })
  }

  function setSpeedUnit(unit: SpeedUnit) {
    clickSoft()
    onChange({ ...settings, speedUnit: unit })
  }

  function setCarPaint(value: string | null) {
    clickSoft()
    onChange({ ...settings, carPaint: value })
  }

  // Racing number plate setters. The text input mutates `value` without a
  // sound (so each keystroke does not chirp); enabling / disabling the plate
  // and picking a color play the soft click for parity with the paint
  // swatches above.
  function setRacingNumberEnabled(enabled: boolean) {
    clickSoft()
    onChange({ ...settings, racingNumber: { ...settings.racingNumber, enabled } })
  }
  function setRacingNumberValue(rawValue: string) {
    onChange({
      ...settings,
      racingNumber: {
        ...settings.racingNumber,
        value: sanitizeRacingNumber(rawValue),
      },
    })
  }
  function setRacingNumberPlateHex(plateHex: string) {
    clickSoft()
    onChange({
      ...settings,
      racingNumber: { ...settings.racingNumber, plateHex },
    })
  }
  function setRacingNumberTextHex(textHex: string) {
    clickSoft()
    onChange({
      ...settings,
      racingNumber: { ...settings.racingNumber, textHex },
    })
  }
  function resetRacingNumber() {
    clickSoft()
    onChange({ ...settings, racingNumber: { ...DEFAULT_RACING_NUMBER } })
  }

  function setTimeOfDay(value: TimeOfDay) {
    clickSoft()
    onChange({ ...settings, timeOfDay: value })
  }

  function setTimeOfDayCycle(value: TimeOfDayCycleMode) {
    clickSoft()
    onChange({ ...settings, timeOfDayCycle: value })
  }

  function setWeather(value: Weather) {
    clickSoft()
    onChange({ ...settings, weather: value })
  }

  function setHeadlights(value: HeadlightMode) {
    clickSoft()
    onChange({ ...settings, headlights: value })
  }

  function setBrakeLights(value: BrakeLightMode) {
    clickSoft()
    onChange({ ...settings, brakeLights: value })
  }

  function setHaptics(value: HapticMode) {
    clickSoft()
    onChange({ ...settings, haptics: value })
  }

  function setCamera(next: CameraRigSettings) {
    onChange({ ...settings, camera: next })
  }

  function resetCamera() {
    clickSoft()
    setCamera(cloneDefaultCameraSettings())
  }

  function setCameraPreset(name: CameraPresetName) {
    clickSoft()
    setCamera(getCameraPreset(name))
  }

  const cameraIsDefault =
    settings.camera.height === DEFAULT_CAMERA_SETTINGS.height &&
    settings.camera.distance === DEFAULT_CAMERA_SETTINGS.distance &&
    settings.camera.lookAhead === DEFAULT_CAMERA_SETTINGS.lookAhead &&
    settings.camera.followSpeed === DEFAULT_CAMERA_SETTINGS.followSpeed &&
    settings.camera.fov === DEFAULT_CAMERA_SETTINGS.fov

  // Identify which preset (if any) the player is currently on so the picker
  // can highlight it. Returns null when the camera has been tweaked off any
  // preset, which the picker reads as "Custom" (no swatch highlighted).
  const activeCameraPreset = matchCameraPreset(settings.camera)

  function clearSlot(action: ControlAction, slot: number) {
    onChange({
      ...settings,
      keyBindings: clearBinding(settings.keyBindings, action, slot),
    })
  }

  function clearPadSlot(action: GamepadAction, slot: number) {
    onChange({
      ...settings,
      gamepadBindings: clearGamepadBinding(
        settings.gamepadBindings,
        action,
        slot,
      ),
    })
  }

  function resetAll() {
    clickSoft()
    onReset()
    resetAudio()
    setCapture(null)
    setPadCapture(null)
  }

  return (
    <MenuOverlay zIndex={110}>
      <MenuPanel width="wide">
        <MenuHeader title="SETTINGS" onClose={onClose} />

        <MenuSection title="Identity">
          <MenuHint>
            Three letters tag your lap times on the leaderboards. Editing
            them only affects future laps. Past entries keep their old tag.
          </MenuHint>
          <div style={initialsRow}>
            <input
              value={initialsDraft}
              maxLength={3}
              onChange={(e) => {
                setInitialsDraft(
                  e.target.value.toUpperCase().replace(/[^A-Z]/g, ''),
                )
                setInitialsError(null)
                setInitialsSaved(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && initialsDirty) {
                  e.preventDefault()
                  saveInitials()
                }
              }}
              autoComplete="off"
              spellCheck={false}
              aria-label="Initials"
              style={initialsInput}
            />
            <MenuButton
              variant="primary"
              click="confirm"
              fullWidth={false}
              disabled={!initialsDirty}
              onClick={saveInitials}
            >
              Save
            </MenuButton>
          </div>
          {initialsError ? (
            <div style={initialsErr}>{initialsError}</div>
          ) : initialsSaved ? (
            <div style={initialsOk}>Saved.</div>
          ) : null}
        </MenuSection>

        <MenuSection title="Audio">
          <div style={audioRow}>
            <div style={audioLabel}>Music</div>
            <MenuToggle
              value={audio.musicEnabled}
              onChange={(v) => setAudio({ ...audio, musicEnabled: v })}
            />
          </div>
          <MenuSlider
            label="Volume"
            value={audio.musicVolume}
            disabled={!audio.musicEnabled}
            onChange={(v) => setAudio({ ...audio, musicVolume: v })}
          />
          <div style={audioRow}>
            <div style={audioLabel}>Sound effects</div>
            <MenuToggle
              value={audio.sfxEnabled}
              onChange={(v) => setAudio({ ...audio, sfxEnabled: v })}
            />
          </div>
          <MenuSlider
            label="Volume"
            value={audio.sfxVolume}
            disabled={!audio.sfxEnabled}
            onChange={(v) => setAudio({ ...audio, sfxVolume: v })}
          />
          <div style={subSection}>
            <div style={subTitle}>Per-track flavor</div>
            <MenuHint>
              Nudges the in-game music&apos;s root key, scale, and tempo from
              a stable hash of the current track slug so each track has its
              own sound. Turn off for the same loop on every track.
            </MenuHint>
            <div style={audioRow}>
              <div style={audioLabel}>Per-track flavor</div>
              <MenuToggle
                value={audio.musicPerTrack}
                disabled={!audio.musicEnabled}
                onChange={(v) => setAudio({ ...audio, musicPerTrack: v })}
              />
            </div>
            <MenuHint>
              Folds your initials into the seed too, so two racers on the same
              track hear distinct flavors. Off by default; flip on once and the
              choice persists.
            </MenuHint>
            <div style={audioRow}>
              <div style={audioLabel}>Mix in your initials</div>
              <MenuToggle
                value={audio.musicMixInitials}
                disabled={!audio.musicEnabled || !audio.musicPerTrack}
                onChange={(v) => setAudio({ ...audio, musicMixInitials: v })}
              />
            </div>
          </div>
        </MenuSection>

        <MenuSection title="Controls">
          {hasKeyboard ? (
            <div style={subSection}>
              <div style={subTitle}>Keyboard</div>
              <MenuHint>
                Click a slot, then press the key you want.
                {capture ? ' Press Esc to cancel.' : ''}
              </MenuHint>
              <div style={bindingTable}>
                {CONTROL_ACTIONS.map((action) => (
                  <div key={action} style={bindingRow}>
                    <div style={bindingLabel}>{ACTION_LABELS[action]}</div>
                    <div style={bindingSlots}>
                      {[0, 1].map((slot) => {
                        const code = settings.keyBindings[action][slot]
                        const isCapturing =
                          capture?.action === action && capture.slot === slot
                        return (
                          <KeySlot
                            key={slot}
                            label={
                              isCapturing
                                ? 'press a key'
                                : code
                                  ? formatKeyCode(code)
                                  : 'unbound'
                            }
                            highlighted={isCapturing}
                            onClick={() => {
                              if (padCapture) setPadCapture(null)
                              setCapture({ action, slot })
                            }}
                            onClear={
                              code && !isCapturing
                                ? () => clearSlot(action, slot)
                                : undefined
                            }
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {hasTouch ? (
            <div style={subSection}>
              <div style={subTitle}>Mobile touch</div>
              <MenuHint>
                Dual stick: left thumb steers, right thumb gas / brake. Single
                stick: one thumb steers and controls gas / brake.
              </MenuHint>
              <div style={touchToggleRow}>
                {TOUCH_MODES.map((mode) => (
                  <MenuButton
                    key={mode}
                    variant={settings.touchMode === mode ? 'primary' : 'secondary'}
                    onClick={() => setTouchMode(mode)}
                  >
                    {mode === 'dual' ? 'Dual stick' : 'Single stick'}
                  </MenuButton>
                ))}
              </div>
            </div>
          ) : null}

          <div style={subSection}>
            <div style={subTitle}>Gamepad</div>
            <MenuHint>
              Steering stays on the left stick (and dpad). Click a slot, then
              press the controller button you want.
              {padCapture ? ' Press Esc to cancel.' : ''}
            </MenuHint>
            <div style={audioRow}>
              <div style={audioLabel}>Status</div>
              <div
                style={{
                  fontSize: 13,
                  color: pad.connected ? '#5fe08a' : 'rgba(255,255,255,0.55)',
                }}
              >
                {pad.connected
                  ? `Detected: ${truncatePadId(pad.id)}`
                  : 'No controller detected'}
              </div>
            </div>
            <div style={bindingTable}>
              {GAMEPAD_ACTIONS.map((action) => (
                <div key={action} style={bindingRow}>
                  <div style={bindingLabel}>{GAMEPAD_ACTION_LABELS[action]}</div>
                  <div style={bindingSlots}>
                    {[0, 1].map((slot) => {
                      const idx = settings.gamepadBindings[action][slot]
                      const isCapturing =
                        padCapture?.action === action && padCapture.slot === slot
                      return (
                        <KeySlot
                          key={slot}
                          label={
                            isCapturing
                              ? 'press a button'
                              : typeof idx === 'number'
                                ? formatGamepadButton(idx)
                                : 'unbound'
                          }
                          highlighted={isCapturing}
                          onClick={() => {
                            if (capture) setCapture(null)
                            setPadCapture({ action, slot })
                          }}
                          onClear={
                            typeof idx === 'number' && !isCapturing
                              ? () => clearPadSlot(action, slot)
                              : undefined
                          }
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={subSection}>
            <div style={subTitle}>Ghost car</div>
            <MenuHint>
              Race a translucent car that drives a recorded lap. Pick whose
              lap to chase. Off hides the ghost entirely.
            </MenuHint>
            <div style={touchToggleRow}>
              <MenuButton
                variant={!settings.showGhost ? 'primary' : 'secondary'}
                onClick={setGhostOff}
                title="Hide the ghost car entirely."
              >
                Off
              </MenuButton>
              {GHOST_SOURCES.map((source) => {
                const active =
                  settings.showGhost && settings.ghostSource === source
                return (
                  <MenuButton
                    key={source}
                    variant={active ? 'primary' : 'secondary'}
                    onClick={() => setGhostSource(source)}
                    title={GHOST_SOURCE_DESCRIPTIONS[source]}
                  >
                    {GHOST_SOURCE_LABELS[source]}
                  </MenuButton>
                )
              })}
            </div>
            <MenuHint>
              {!settings.showGhost
                ? 'No ghost will appear during the race.'
                : GHOST_SOURCE_DESCRIPTIONS[settings.ghostSource]}
            </MenuHint>
            <div style={audioRow}>
              <div style={audioLabel}>Show nameplate</div>
              <MenuToggle
                value={settings.showGhostNameplate}
                onChange={setShowGhostNameplate}
                disabled={!settings.showGhost}
              />
            </div>
            <MenuHint>
              Floats the ghost racer&apos;s initials and lap time above their
              car so you know whose lap you are chasing without opening the
              leaderboard.
            </MenuHint>
            <div style={audioRow}>
              <div style={audioLabel}>Show live gap</div>
              <MenuToggle
                value={settings.showGhostGap}
                onChange={setShowGhostGap}
                disabled={!settings.showGhost}
              />
            </div>
            <MenuHint>
              A small chip below the &quot;vs PB&quot; tile showing the live
              time gap between you and the ghost car. Negative numbers mean you
              are ahead of the ghost; positive means behind.
            </MenuHint>
          </div>

          <div style={subSection}>
            <div style={subTitle}>Racing line</div>
            <MenuHint>
              Thin cyan line floating just above the road that traces the same
              recorded lap as the ghost car. Use it as a coaching aid to study
              the fast line without needing the ghost on screen.
            </MenuHint>
            <div style={audioRow}>
              <div style={audioLabel}>Show racing line</div>
              <MenuToggle
                value={settings.showRacingLine}
                onChange={setShowRacingLine}
              />
            </div>
          </div>

          <div style={subSection}>
            <div style={subTitle}>Minimap</div>
            <MenuHint>
              Top-down overview tucked into the bottom-right of the screen.
              Useful on unfamiliar tracks; turn it off to keep the screen
              fully clean.
            </MenuHint>
            <div style={audioRow}>
              <div style={audioLabel}>Show minimap</div>
              <MenuToggle
                value={settings.showMinimap}
                onChange={setShowMinimap}
              />
            </div>
          </div>

          <div style={subSection}>
            <div style={subTitle}>Skid marks</div>
            <MenuHint>
              Dark tire trail laid behind the rear wheels during slides and
              off-track moments. Marks fade after a few seconds. Turn off for
              a fully clean track surface.
            </MenuHint>
            <div style={audioRow}>
              <div style={audioLabel}>Show skid marks</div>
              <MenuToggle
                value={settings.showSkidMarks}
                onChange={setShowSkidMarks}
              />
            </div>
          </div>

          <div style={subSection}>
            <div style={subTitle}>Tire smoke</div>
            <MenuHint>
              Soft white puffs that pop off the rear wheels during hard
              slides and braking, then rise and fade. Pairs with the dark
              skid trail without competing with it. Turn off for a cleaner
              cornering scene.
            </MenuHint>
            <div style={audioRow}>
              <div style={audioLabel}>Show tire smoke</div>
              <MenuToggle
                value={settings.showTireSmoke}
                onChange={setShowTireSmoke}
              />
            </div>
          </div>

          <div style={subSection}>
            <div style={subTitle}>Kerbs</div>
            <MenuHint>
              Alternating red and white curb stones along the inside of every
              corner. Helps mark the apex at a glance. Turn off for a pure
              asphalt look.
            </MenuHint>
            <div style={audioRow}>
              <div style={audioLabel}>Show kerbs</div>
              <MenuToggle
                value={settings.showKerbs}
                onChange={setShowKerbs}
              />
            </div>
          </div>

          <div style={subSection}>
            <div style={subTitle}>Trackside scenery</div>
            <MenuHint>
              Trees on the grass, traffic cones at the outside of every
              corner, and red and white barriers framing the start gate. Turn
              off for a clean grass field.
            </MenuHint>
            <div style={audioRow}>
              <div style={audioLabel}>Show scenery</div>
              <MenuToggle
                value={settings.showScenery}
                onChange={setShowScenery}
              />
            </div>
          </div>

          <div style={subSection}>
            <div style={subTitle}>Drift score</div>
            <MenuHint>
              Live drift score that climbs while you slide through corners.
              Longer chained slides hit a bigger multiplier. Per-lap and
              all-time bests sit underneath. Turn off for a clean HUD.
            </MenuHint>
            <div style={audioRow}>
              <div style={audioLabel}>Show drift score</div>
              <MenuToggle
                value={settings.showDrift}
                onChange={setShowDrift}
              />
            </div>
          </div>

          <div style={subSection}>
            <div style={subTitle}>Speedometer</div>
            <MenuHint>
              Bottom-center dial that shows your live speed plus a swept
              needle from zero to your tuning&apos;s top speed.
            </MenuHint>
            <div style={audioRow}>
              <div style={audioLabel}>Show speedometer</div>
              <MenuToggle
                value={settings.showSpeedometer}
                onChange={setShowSpeedometer}
              />
            </div>
            <div style={touchToggleRow}>
              {SPEED_UNITS.map((unit) => (
                <MenuButton
                  key={unit}
                  variant={
                    settings.speedUnit === unit ? 'primary' : 'secondary'
                  }
                  disabled={!settings.showSpeedometer}
                  onClick={() => setSpeedUnit(unit)}
                >
                  {unitLabel(unit)}
                </MenuButton>
              ))}
            </div>
            <div style={audioRow}>
              <div style={audioLabel}>Top-speed marker</div>
              <MenuToggle
                value={settings.showTopSpeedMarker}
                onChange={setShowTopSpeedMarker}
                disabled={!settings.showSpeedometer}
              />
            </div>
            <MenuHint>
              Adds a green tick on the dial at your session-best speed plus a
              PEAK readout below the live number. Resets on Restart.
            </MenuHint>
          </div>

          <div style={subSection}>
            <div style={subTitle}>Rear-view mirror</div>
            <MenuHint>
              Top-center inset that shows what is behind you. Handy for
              keeping an eye on the ghost car. Turn off for a fully clean
              forward view.
            </MenuHint>
            <div style={audioRow}>
              <div style={audioLabel}>Show rear-view</div>
              <MenuToggle
                value={settings.showRearview}
                onChange={setShowRearview}
              />
            </div>
          </div>

          <div style={subSection}>
            <div style={subTitle}>Speed lines</div>
            <MenuHint>
              Thin streaks that radiate outward from the screen center while
              you are pushing past about two-thirds of your tuning&apos;s top
              speed. Pure cosmetic. Sells the rush at full chat. Turn off
              for a fully clean screen at top speed.
            </MenuHint>
            <div style={audioRow}>
              <div style={audioLabel}>Show speed lines</div>
              <MenuToggle
                value={settings.showSpeedLines}
                onChange={setShowSpeedLines}
              />
            </div>
          </div>

          <div style={subSection}>
            <div style={subTitle}>Reaction time</div>
            <MenuHint>
              Pops a small chip the moment you press throttle for a fresh
              race, showing how many milliseconds passed between the GO
              light and your first tap. Tier badge grades the launch:
              LIGHTNING (sub 200 ms), GREAT (sub 350 ms), GOOD (sub 600 ms),
              or HUMAN. Auto-fades after a few seconds.
            </MenuHint>
            <div style={audioRow}>
              <div style={audioLabel}>Show reaction time</div>
              <MenuToggle
                value={settings.showReactionTime}
                onChange={setShowReactionTime}
              />
            </div>
          </div>

          <div style={subSection}>
            <div style={subTitle}>Leaderboard rank</div>
            <MenuHint>
              Pins a small badge alongside your BEST (ALL TIME) tile showing
              where you sit on this track version&apos;s leaderboard: P1 for
              the record holder, PODIUM for top 3, TOP 10 #N, TOP %, TOP
              HALF, or RANKED otherwise. Refreshes after every submitted lap.
            </MenuHint>
            <div style={audioRow}>
              <div style={audioLabel}>Show rank chip</div>
              <MenuToggle
                value={settings.showLeaderboardRank}
                onChange={setShowLeaderboardRank}
              />
            </div>
          </div>
        </MenuSection>

        <MenuSection title="Car paint">
          <MenuHint>
            Pick a paint color for your car. Stock keeps the original red
            finish from the model. Wheels stay dark either way.
          </MenuHint>
          <div style={paintGrid}>
            <PaintSwatch
              label="Stock"
              hex={null}
              selected={settings.carPaint === null}
              onClick={() => setCarPaint(null)}
            />
            {CAR_PAINTS.map((paint) => (
              <PaintSwatch
                key={paint.id}
                label={paint.name}
                hex={paint.hex}
                selected={settings.carPaint === paint.hex}
                onClick={() => setCarPaint(paint.hex)}
              />
            ))}
          </div>
        </MenuSection>

        <MenuSection title="Racing number">
          <MenuHint>
            Stick a 1 or 2 digit racing number plate on the roof of your car.
            Pure cosmetic. Nothing else changes.
          </MenuHint>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: menuTheme.textPrimary }}>Show plate</span>
            <MenuToggle
              value={settings.racingNumber.enabled}
              onChange={setRacingNumberEnabled}
            />
          </div>
          {settings.racingNumber.enabled ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                <label
                  htmlFor="racing-number-input"
                  style={{ color: menuTheme.textPrimary, minWidth: 64 }}
                >
                  Number
                </label>
                <input
                  id="racing-number-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={RACING_NUMBER_MAX_LENGTH}
                  value={settings.racingNumber.value}
                  onChange={(e) => setRacingNumberValue(e.target.value)}
                  style={racingNumberInput}
                  aria-label="Racing number"
                />
                <RacingNumberPreview setting={settings.racingNumber} />
              </div>
              <MenuHint>Plate color</MenuHint>
              <div style={paintGrid}>
                {RACING_NUMBER_PLATE_COLORS.map((sw) => (
                  <PaintSwatch
                    key={`plate-${sw.id}`}
                    label={sw.name}
                    hex={sw.hex}
                    selected={settings.racingNumber.plateHex === sw.hex}
                    onClick={() => setRacingNumberPlateHex(sw.hex)}
                  />
                ))}
              </div>
              <MenuHint>Number color</MenuHint>
              <div style={paintGrid}>
                {RACING_NUMBER_TEXT_COLORS.map((sw) => (
                  <PaintSwatch
                    key={`text-${sw.id}`}
                    label={sw.name}
                    hex={sw.hex}
                    selected={settings.racingNumber.textHex === sw.hex}
                    onClick={() => setRacingNumberTextHex(sw.hex)}
                  />
                ))}
              </div>
              <div style={{ marginTop: 8 }}>
                <MenuButton variant="ghost" onClick={resetRacingNumber}>
                  Reset plate
                </MenuButton>
              </div>
            </>
          ) : null}
        </MenuSection>

        <MenuSection title="Headlights">
          <MenuHint>
            Glowing front lamps and beam cones on your car. Pure cosmetic. Auto
            turns them on at sunset, at night, and in foggy or snowy weather.
          </MenuHint>
          <div style={touchToggleRow}>
            {HEADLIGHT_MODES.map((mode) => {
              const active = settings.headlights === mode
              return (
                <MenuButton
                  key={mode}
                  variant={active ? 'primary' : 'secondary'}
                  onClick={() => setHeadlights(mode)}
                  title={HEADLIGHT_MODE_DESCRIPTIONS[mode]}
                >
                  {HEADLIGHT_MODE_LABELS[mode]}
                </MenuButton>
              )
            })}
          </div>
          <MenuHint>{HEADLIGHT_MODE_DESCRIPTIONS[settings.headlights]}</MenuHint>
        </MenuSection>

        <MenuSection title="Brake lights">
          <MenuHint>
            Glowing red lamps on the rear of your car. Pure cosmetic. Auto
            lights them while you brake or hold the handbrake. Most visible
            from the rear-view mirror.
          </MenuHint>
          <div style={touchToggleRow}>
            {BRAKE_LIGHT_MODES.map((mode) => {
              const active = settings.brakeLights === mode
              return (
                <MenuButton
                  key={mode}
                  variant={active ? 'primary' : 'secondary'}
                  onClick={() => setBrakeLights(mode)}
                  title={BRAKE_LIGHT_MODE_DESCRIPTIONS[mode]}
                >
                  {BRAKE_LIGHT_MODE_LABELS[mode]}
                </MenuButton>
              )
            })}
          </div>
          <MenuHint>{BRAKE_LIGHT_MODE_DESCRIPTIONS[settings.brakeLights]}</MenuHint>
        </MenuSection>

        <MenuSection title="Haptic feedback">
          <MenuHint>
            Buzz the device on lap completion, fresh personal best, and fresh
            track-wide record. Auto fires only on touch devices where the
            buzz is felt.
          </MenuHint>
          <div style={touchToggleRow}>
            {HAPTIC_MODES.map((mode) => {
              const active = settings.haptics === mode
              return (
                <MenuButton
                  key={mode}
                  variant={active ? 'primary' : 'secondary'}
                  onClick={() => setHaptics(mode)}
                  title={HAPTIC_MODE_DESCRIPTIONS[mode]}
                >
                  {HAPTIC_MODE_LABELS[mode]}
                </MenuButton>
              )
            })}
          </div>
          <MenuHint>{HAPTIC_MODE_DESCRIPTIONS[settings.haptics]}</MenuHint>
        </MenuSection>

        <MenuSection title="Time of day">
          <MenuHint>
            Skin the scene with a different lighting preset. The track is
            unchanged. Default is Noon, which matches the original look.
          </MenuHint>
          <div style={paintGrid}>
            {TIME_OF_DAY_NAMES.map((name) => {
              const preset = getLightingPreset(name)
              return (
                <TimeOfDaySwatch
                  key={name}
                  label={TIME_OF_DAY_LABELS[name]}
                  description={TIME_OF_DAY_DESCRIPTIONS[name]}
                  skyHex={preset.skyColor}
                  groundHex={preset.groundColor}
                  selected={settings.timeOfDay === name}
                  onClick={() => setTimeOfDay(name)}
                />
              )
            })}
          </div>
          <MenuHint>
            Auto cycle the sky through noon, morning, sunset, and night while
            you race. The cycle is suppressed when a track author baked in a
            time of day.
          </MenuHint>
          <div style={touchToggleRow}>
            {TIME_OF_DAY_CYCLE_MODES.map((mode) => {
              const active = settings.timeOfDayCycle === mode
              return (
                <MenuButton
                  key={mode}
                  variant={active ? 'primary' : 'secondary'}
                  onClick={() => setTimeOfDayCycle(mode)}
                  title={TIME_OF_DAY_CYCLE_DESCRIPTIONS[mode]}
                >
                  {TIME_OF_DAY_CYCLE_LABELS[mode]}
                </MenuButton>
              )
            })}
          </div>
          <MenuHint>
            {TIME_OF_DAY_CYCLE_DESCRIPTIONS[settings.timeOfDayCycle]}
          </MenuHint>
        </MenuSection>

        <MenuSection title="Weather">
          <MenuHint>
            Layer fog and a softer sky on top of the time-of-day skin. Foggy
            cuts visibility down to the next corner. Default is Clear, which
            matches the original look.
          </MenuHint>
          <div style={paintGrid}>
            {WEATHER_NAMES.map((name) => {
              const preset = getWeatherPreset(name)
              return (
                <WeatherSwatch
                  key={name}
                  label={WEATHER_LABELS[name]}
                  description={WEATHER_DESCRIPTIONS[name]}
                  fogHex={preset.fogColor}
                  fogDensity={preset.fogDensity}
                  selected={settings.weather === name}
                  onClick={() => setWeather(name)}
                />
              )
            })}
          </div>
          <MenuHint>
            When the track author baked in a time of day or weather, use that
            on this track. Turn this off to always use your own picks above.
          </MenuHint>
          <MenuToggle
            label="Respect track mood"
            value={settings.respectTrackMood}
            onChange={(value) =>
              onChange({ ...settings, respectTrackMood: value })
            }
          />
        </MenuSection>

        <MenuSection title="Camera">
          <MenuHint>
            Tune the trailing chase camera. Higher views see more of the track,
            lower views feel faster. Look-ahead leans the camera into corners.
            Follow speed is how snappy the camera tracks the car: lower is
            looser and more cinematic, higher is locked-on. Pick a preset
            below for a one-click starting point, then tune from there.
          </MenuHint>
          <div style={paintGrid}>
            {CAMERA_PRESET_NAMES.map((name) => (
              <CameraPresetSwatch
                key={name}
                label={CAMERA_PRESET_LABELS[name]}
                description={CAMERA_PRESET_DESCRIPTIONS[name]}
                preset={getCameraPreset(name)}
                selected={activeCameraPreset === name}
                onClick={() => setCameraPreset(name)}
              />
            ))}
          </div>
          <div style={cameraPresetStatus}>
            {activeCameraPreset
              ? `Preset: ${CAMERA_PRESET_LABELS[activeCameraPreset]}`
              : 'Preset: Custom'}
          </div>
          <MenuSlider
            label="Height"
            value={settings.camera.height}
            min={CAMERA_HEIGHT_MIN}
            max={CAMERA_HEIGHT_MAX}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => setCamera({ ...settings.camera, height: v })}
          />
          <MenuSlider
            label="Distance"
            value={settings.camera.distance}
            min={CAMERA_DISTANCE_MIN}
            max={CAMERA_DISTANCE_MAX}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => setCamera({ ...settings.camera, distance: v })}
          />
          <MenuSlider
            label="Look ahead"
            value={settings.camera.lookAhead}
            min={CAMERA_LOOK_AHEAD_MIN}
            max={CAMERA_LOOK_AHEAD_MAX}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => setCamera({ ...settings.camera, lookAhead: v })}
          />
          <MenuSlider
            label="Follow speed"
            value={settings.camera.followSpeed}
            min={CAMERA_FOLLOW_SPEED_MIN}
            max={CAMERA_FOLLOW_SPEED_MAX}
            step={0.05}
            format={(v) => `${v.toFixed(2)}x`}
            onChange={(v) => setCamera({ ...settings.camera, followSpeed: v })}
          />
          <MenuSlider
            label="Field of view"
            value={settings.camera.fov}
            min={CAMERA_FOV_MIN}
            max={CAMERA_FOV_MAX}
            step={1}
            format={(v) => `${Math.round(v)} deg`}
            onChange={(v) => setCamera({ ...settings.camera, fov: v })}
          />
          <div style={cameraResetRow}>
            <MenuButton
              variant="ghost"
              fullWidth={false}
              disabled={cameraIsDefault}
              onClick={resetCamera}
            >
              Reset camera
            </MenuButton>
          </div>
        </MenuSection>

        <MenuSection title="Tuning">
          <MenuHint>
            The Tuning Lab drives a curated test loop and uses your feedback
            to suggest car-param updates. Saved tunings can be applied to
            your next race.
          </MenuHint>
          <MenuButton variant="primary" click="confirm" onClick={openTuningLab}>
            Open Tuning Lab
          </MenuButton>
        </MenuSection>

        <div style={footer}>
          <MenuButton variant="ghost" fullWidth={false} onClick={resetAll}>
            Reset to defaults
          </MenuButton>
          <MenuButton
            variant="primary"
            click="confirm"
            fullWidth={false}
            onClick={onClose}
          >
            Done
          </MenuButton>
        </div>
      </MenuPanel>
    </MenuOverlay>
  )
}

function truncatePadId(id: string | null): string {
  if (!id) return ''
  // Browsers report a verbose vendor / product blob like
  // "Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)".
  // Strip the parenthetical so the chip stays readable.
  const trimmed = id.replace(/\s*\([^)]*\)\s*$/, '').trim()
  if (trimmed.length <= 38) return trimmed
  return trimmed.slice(0, 35) + '...'
}

function PaintSwatch({
  label,
  hex,
  selected,
  onClick,
}: {
  label: string
  // `null` for the stock entry, which renders a checker pattern so it does
  // not look like a missing swatch.
  hex: string | null
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...swatchBtn,
        borderColor: selected ? '#ffb74d' : '#3a3a3a',
        boxShadow: selected ? '0 0 0 2px rgba(255,183,77,0.35)' : 'none',
      }}
      aria-label={`Paint: ${label}`}
      aria-pressed={selected}
    >
      <span
        style={{
          ...swatchChip,
          background: hex ?? STOCK_SWATCH_BG,
        }}
      />
      <span style={swatchLabel}>{label}</span>
    </button>
  )
}

const STOCK_SWATCH_BG =
  'repeating-conic-gradient(#bbb 0% 25%, #777 0% 50%) 50% / 12px 12px'

function TimeOfDaySwatch({
  label,
  description,
  skyHex,
  groundHex,
  selected,
  onClick,
}: {
  label: string
  description: string
  // Three.js color ints (0xRRGGBB) so the same value in the lighting preset
  // can be reused without a parse step.
  skyHex: number
  groundHex: number
  selected: boolean
  onClick: () => void
}) {
  const sky = '#' + skyHex.toString(16).padStart(6, '0')
  const ground = '#' + groundHex.toString(16).padStart(6, '0')
  // Half sky, half ground so the swatch reads as a horizon at a glance.
  const background = `linear-gradient(180deg, ${sky} 0%, ${sky} 55%, ${ground} 55%, ${ground} 100%)`
  return (
    <button
      onClick={onClick}
      style={{
        ...swatchBtn,
        borderColor: selected ? '#ffb74d' : '#3a3a3a',
        boxShadow: selected ? '0 0 0 2px rgba(255,183,77,0.35)' : 'none',
      }}
      title={description}
      aria-label={`Time of day: ${label}. ${description}`}
      aria-pressed={selected}
    >
      <span
        style={{
          ...swatchChip,
          background,
          borderRadius: 8,
        }}
      />
      <span style={swatchLabel}>{label}</span>
    </button>
  )
}

function WeatherSwatch({
  label,
  description,
  fogHex,
  fogDensity,
  selected,
  onClick,
}: {
  label: string
  description: string
  // Three.js color int (0xRRGGBB) for the fog tint.
  fogHex: number
  // Preset density. Drives the swatch's haze opacity so 'foggy' visibly
  // reads as denser than 'cloudy' at a glance without needing a number.
  fogDensity: number
  selected: boolean
  onClick: () => void
}) {
  // Sky band on top, road silhouette on the bottom. A semi-transparent fog
  // overlay sits in front, with opacity scaled by the preset density so the
  // 'clear' chip is unobstructed and 'foggy' is mostly grey.
  const fog = '#' + fogHex.toString(16).padStart(6, '0')
  // Map density 0..0.04 onto opacity 0..0.85. Hand-tuned so the swatch reads
  // proportionally to how much the preset actually obscures the scene.
  const fogOpacity = Math.min(0.85, fogDensity * 22)
  return (
    <button
      onClick={onClick}
      style={{
        ...swatchBtn,
        borderColor: selected ? '#ffb74d' : '#3a3a3a',
        boxShadow: selected ? '0 0 0 2px rgba(255,183,77,0.35)' : 'none',
      }}
      title={description}
      aria-label={`Weather: ${label}. ${description}`}
      aria-pressed={selected}
    >
      <span
        style={{
          ...swatchChip,
          borderRadius: 8,
          position: 'relative',
          overflow: 'hidden',
          // Sky on top, ground on bottom: hardcoded hexes so every weather
          // chip shares the same base scene and the fog is the only thing
          // changing chip-to-chip.
          background:
            'linear-gradient(180deg, #9ad8ff 0%, #9ad8ff 55%, #6fb26f 55%, #6fb26f 100%)',
        }}
      >
        {/* A small dark "road bend" silhouette so the fog has something to
            obscure visually. Pure decoration; the visible difference between
            chips is the fog overlay above. */}
        <span
          style={{
            position: 'absolute',
            left: '20%',
            right: '20%',
            bottom: '12%',
            height: 6,
            background: '#2b2b2b',
            borderRadius: 3,
            opacity: 0.7,
          }}
        />
        {/* Fog overlay. Opacity scales with density so chips read in order. */}
        <span
          style={{
            position: 'absolute',
            inset: 0,
            background: fog,
            opacity: fogOpacity,
          }}
        />
      </span>
      <span style={swatchLabel}>{label}</span>
    </button>
  )
}

function CameraPresetSwatch({
  label,
  description,
  preset,
  selected,
  onClick,
}: {
  label: string
  description: string
  preset: CameraRigSettings
  selected: boolean
  onClick: () => void
}) {
  // Render a tiny side-on car + camera diagram so the swatch reads at a
  // glance: a road line at the bottom, a car block on the road, and a small
  // dot at the (height, distance) the preset places the camera. Dot moves
  // up and back as the camera goes higher and further; FOV widens the
  // dashed sight cone projected forward toward the car.
  const chipW = 56
  const chipH = 36
  // Map height (1.5..14) and distance (6..28) onto the chip. Defensive clamps
  // so an out-of-range preset still draws something sensible.
  const heightFrac = clamp01((preset.height - 1.5) / (14 - 1.5))
  const distanceFrac = clamp01((preset.distance - 6) / (28 - 6))
  const carX = chipW * 0.7
  const carY = chipH * 0.8
  const camX = carX - distanceFrac * chipW * 0.55
  const camY = carY - 4 - heightFrac * (chipH * 0.55)
  // FOV cone half-angle. 50..110 degrees mapped onto a small visual spread.
  const halfDeg = preset.fov / 2
  const halfRad = (halfDeg * Math.PI) / 180
  const coneLen = chipW * 0.4
  const dirX = carX - camX
  const dirY = carY - camY
  const dirLen = Math.hypot(dirX, dirY) || 1
  const ux = dirX / dirLen
  const uy = dirY / dirLen
  const px = -uy
  const py = ux
  const tipX = camX + ux * coneLen
  const tipY = camY + uy * coneLen
  const spread = Math.tan(halfRad) * coneLen * 0.6
  return (
    <button
      onClick={onClick}
      style={{
        ...swatchBtn,
        borderColor: selected ? '#ffb74d' : '#3a3a3a',
        boxShadow: selected ? '0 0 0 2px rgba(255,183,77,0.35)' : 'none',
      }}
      title={description}
      aria-label={`Camera preset: ${label}. ${description}`}
      aria-pressed={selected}
    >
      <span
        style={{
          ...swatchChip,
          width: chipW,
          height: chipH,
          borderRadius: 6,
          background:
            'linear-gradient(180deg, #1d2433 0%, #1d2433 65%, #2c3a2a 65%, #2c3a2a 100%)',
        }}
      >
        <svg
          width={chipW}
          height={chipH}
          viewBox={`0 0 ${chipW} ${chipH}`}
          style={{ display: 'block' }}
          aria-hidden
        >
          <line
            x1={2}
            y1={chipH * 0.78}
            x2={chipW - 2}
            y2={chipH * 0.78}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={1}
            strokeDasharray="3 2"
          />
          <rect
            x={carX - 6}
            y={carY - 6}
            width={10}
            height={6}
            rx={1}
            fill="#ffb74d"
          />
          <line
            x1={camX}
            y1={camY}
            x2={tipX + px * spread}
            y2={tipY + py * spread}
            stroke="rgba(170,210,255,0.55)"
            strokeWidth={0.75}
          />
          <line
            x1={camX}
            y1={camY}
            x2={tipX - px * spread}
            y2={tipY - py * spread}
            stroke="rgba(170,210,255,0.55)"
            strokeWidth={0.75}
          />
          <circle cx={camX} cy={camY} r={2.5} fill="#aad2ff" />
        </svg>
      </span>
      <span style={swatchLabel}>{label}</span>
    </button>
  )
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

function KeySlot({
  label,
  highlighted,
  onClick,
  onClear,
}: {
  label: string
  highlighted?: boolean
  onClick: () => void
  onClear?: () => void
}) {
  return (
    <div style={slotWrap}>
      <button
        onClick={onClick}
        style={{
          ...slotBtn,
          borderColor: highlighted ? '#ffb74d' : '#3a3a3a',
          background: highlighted ? '#3a2a14' : menuTheme.inputBg,
        }}
      >
        {label}
      </button>
      {onClear ? (
        <button onClick={onClear} style={clearBtn} aria-label="Clear binding">
          x
        </button>
      ) : null}
    </div>
  )
}

const subSection: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}
const subTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
}
const audioRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}
const audioLabel: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
}
const bindingTable: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}
const bindingRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  background: menuTheme.rowBg,
  borderRadius: 8,
}
const bindingLabel: React.CSSProperties = {
  fontSize: 14,
}
const bindingSlots: React.CSSProperties = {
  display: 'flex',
  gap: 6,
}
const slotWrap: React.CSSProperties = {
  position: 'relative',
}
const slotBtn: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 13,
  minWidth: 88,
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid #3a3a3a',
  cursor: 'pointer',
  color: 'white',
}
const clearBtn: React.CSSProperties = {
  position: 'absolute',
  top: -6,
  right: -6,
  width: 18,
  height: 18,
  borderRadius: '50%',
  border: 'none',
  background: '#444',
  color: 'white',
  cursor: 'pointer',
  fontSize: 11,
  lineHeight: '18px',
  padding: 0,
}
const touchToggleRow: React.CSSProperties = {
  display: 'flex',
  gap: 8,
}
const footer: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  marginTop: 4,
}
const initialsRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
}
const initialsInput: React.CSSProperties = {
  flex: 1,
  fontFamily: 'monospace',
  fontSize: 28,
  textAlign: 'center',
  letterSpacing: 8,
  padding: '6px 10px',
  background: menuTheme.inputBg,
  color: 'white',
  border: `2px solid ${menuTheme.ghostBorder}`,
  borderRadius: 8,
  outline: 'none',
  textTransform: 'uppercase',
}
const initialsErr: React.CSSProperties = {
  color: '#ffb3b3',
  fontSize: 12,
}
const initialsOk: React.CSSProperties = {
  color: '#5fe08a',
  fontSize: 12,
}
const cameraResetRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  marginTop: 4,
}
const cameraPresetStatus: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  opacity: 0.65,
  marginTop: 2,
}
const paintGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(82px, 1fr))',
  gap: 8,
}
const swatchBtn: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  padding: '8px 4px 6px',
  borderRadius: 8,
  border: '2px solid #3a3a3a',
  background: 'rgba(255,255,255,0.04)',
  cursor: 'pointer',
  color: 'white',
  transition: 'border-color 120ms ease, box-shadow 120ms ease',
}
const swatchChip: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  border: '1px solid rgba(0,0,0,0.4)',
  display: 'block',
}
const swatchLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
}

const racingNumberInput: React.CSSProperties = {
  flex: 1,
  fontFamily: 'monospace',
  fontSize: 22,
  textAlign: 'center',
  letterSpacing: 4,
  padding: '6px 10px',
  background: menuTheme.inputBg,
  color: 'white',
  border: `2px solid ${menuTheme.ghostBorder}`,
  borderRadius: 8,
  outline: 'none',
  width: 92,
}

// Mini live preview of the plate so the player can see their picks before
// they leave Settings. Renders the same plate-on-border-with-text shape the
// 3D mesh uses, but in DOM so it costs nothing per frame.
function RacingNumberPreview({ setting }: { setting: RacingNumberSetting }) {
  return (
    <span
      aria-label={`Plate preview: ${setting.value}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 56,
        height: 56,
        borderRadius: 8,
        background: setting.plateHex,
        color: setting.textHex,
        border: '2px solid #000',
        fontFamily: '"Helvetica Neue", "Arial Black", Arial, sans-serif',
        fontWeight: 800,
        fontSize: setting.value.length === 1 ? 30 : 22,
        letterSpacing: 1,
      }}
    >
      {setting.value}
    </span>
  )
}
