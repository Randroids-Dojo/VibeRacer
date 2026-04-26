'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ACTION_LABELS,
  CAMERA_DISTANCE_MAX,
  CAMERA_DISTANCE_MIN,
  CAMERA_FOLLOW_SPEED_MAX,
  CAMERA_FOLLOW_SPEED_MIN,
  CAMERA_HEIGHT_MAX,
  CAMERA_HEIGHT_MIN,
  CAMERA_LOOK_AHEAD_MAX,
  CAMERA_LOOK_AHEAD_MIN,
  CONTROL_ACTIONS,
  DEFAULT_CAMERA_SETTINGS,
  TOUCH_MODES,
  clearBinding,
  cloneDefaultCameraSettings,
  formatKeyCode,
  rebindKey,
  type CameraRigSettings,
  type ControlAction,
  type ControlSettings,
  type TouchMode,
} from '@/lib/controlSettings'
import { useClickSfx } from '@/hooks/useClickSfx'
import { useAudioSettings } from '@/hooks/useAudioSettings'
import { InitialsSchema } from '@/lib/schemas'
import { readStoredInitials, writeStoredInitials } from '@/lib/initials'
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

export function SettingsPane({
  settings,
  onChange,
  onClose,
  onReset,
  inRace,
}: SettingsPaneProps) {
  const router = useRouter()
  const [capture, setCapture] = useState<CaptureTarget | null>(null)
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

  function setTouchMode(mode: TouchMode) {
    onChange({ ...settings, touchMode: mode })
  }

  function setShowGhost(value: boolean) {
    onChange({ ...settings, showGhost: value })
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
    settings.camera.followSpeed === DEFAULT_CAMERA_SETTINGS.followSpeed

  function clearSlot(action: ControlAction, slot: number) {
    onChange({
      ...settings,
      keyBindings: clearBinding(settings.keyBindings, action, slot),
    })
  }

  function resetAll() {
    clickSoft()
    onReset()
    resetAudio()
    setCapture(null)
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
                            onClick={() => setCapture({ action, slot })}
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
              Plug in a controller and the game uses the right trigger for
              gas, the left trigger for brake / reverse, the left stick for
              steering, the right shoulder for handbrake, and Start to pause.
              The bindings are not yet remappable.
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
