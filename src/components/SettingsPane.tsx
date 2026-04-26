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
import { SPEED_UNITS, unitLabel, type SpeedUnit } from '@/lib/speedometer'
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

  function setShowGhost(value: boolean) {
    onChange({ ...settings, showGhost: value })
  }

  function setShowMinimap(value: boolean) {
    onChange({ ...settings, showMinimap: value })
  }

  function setShowSkidMarks(value: boolean) {
    onChange({ ...settings, showSkidMarks: value })
  }

  function setShowSpeedometer(value: boolean) {
    onChange({ ...settings, showSpeedometer: value })
  }

  function setSpeedUnit(unit: SpeedUnit) {
    clickSoft()
    onChange({ ...settings, speedUnit: unit })
  }

  function setCarPaint(value: string | null) {
    clickSoft()
    onChange({ ...settings, carPaint: value })
  }

  function setCamera(next: CameraRigSettings) {
    onChange({ ...settings, camera: next })
  }

  function resetCamera() {
    clickSoft()
    setCamera(cloneDefaultCameraSettings())
  }

  const cameraIsDefault =
    settings.camera.height === DEFAULT_CAMERA_SETTINGS.height &&
    settings.camera.distance === DEFAULT_CAMERA_SETTINGS.distance &&
    settings.camera.lookAhead === DEFAULT_CAMERA_SETTINGS.lookAhead &&
    settings.camera.followSpeed === DEFAULT_CAMERA_SETTINGS.followSpeed &&
    settings.camera.fov === DEFAULT_CAMERA_SETTINGS.fov

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
              Race a translucent car that drives the fastest known lap on this
              track. Switches to your own path once you set a personal best.
            </MenuHint>
            <div style={audioRow}>
              <div style={audioLabel}>Show ghost</div>
              <MenuToggle
                value={settings.showGhost}
                onChange={setShowGhost}
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

        <MenuSection title="Camera">
          <MenuHint>
            Tune the trailing chase camera. Higher views see more of the track,
            lower views feel faster. Look-ahead leans the camera into corners.
            Follow speed is how snappy the camera tracks the car: lower is
            looser and more cinematic, higher is locked-on.
          </MenuHint>
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
