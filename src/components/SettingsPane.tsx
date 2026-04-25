'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ACTION_LABELS,
  CONTROL_ACTIONS,
  TOUCH_MODES,
  clearBinding,
  formatKeyCode,
  rebindKey,
  type ControlAction,
  type ControlSettings,
  type TouchMode,
} from '@/lib/controlSettings'
import { useClickSfx } from '@/hooks/useClickSfx'

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
  const clickConfirm = useClickSfx('confirm')
  const clickBack = useClickSfx('back')
  const clickSoft = useClickSfx('soft')

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

  function clearSlot(action: ControlAction, slot: number) {
    onChange({
      ...settings,
      keyBindings: clearBinding(settings.keyBindings, action, slot),
    })
  }

  function resetAll() {
    clickSoft()
    onReset()
    setCapture(null)
  }

  return (
    <div style={overlay}>
      <div style={panel}>
        <div style={header}>
          <div style={title}>SETTINGS</div>
          <button
            onClick={() => {
              clickBack()
              onClose()
            }}
            style={closeBtn}
            aria-label="Close settings"
          >
            CLOSE
          </button>
        </div>

        <div style={sectionWrap}>
          <div style={sectionTitle}>Controls</div>

          {hasKeyboard ? (
            <div style={subSection}>
              <div style={subTitle}>Keyboard</div>
              <div style={kbHint}>
                Click a slot, then press the key you want.
                {capture ? ' Press Esc to cancel.' : ''}
              </div>
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
              <div style={kbHint}>
                Dual stick: left thumb steers, right thumb gas / brake. Single
                stick: one thumb steers and controls gas / brake.
              </div>
              <div style={touchToggleRow}>
                {TOUCH_MODES.map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setTouchMode(mode)}
                    style={{
                      ...touchToggleBtn,
                      background:
                        settings.touchMode === mode ? '#ff6b35' : '#2a2a2a',
                      color: 'white',
                    }}
                  >
                    {mode === 'dual' ? 'Dual stick' : 'Single stick'}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div style={sectionWrap}>
          <div style={sectionTitle}>Tuning</div>
          <div style={subSection}>
            <div style={kbHint}>
              The Tuning Lab drives a curated test loop and uses your feedback
              to suggest car-param updates. Saved tunings can be applied to
              your next race.
            </div>
            <button onClick={openTuningLab} style={openLabBtn}>
              Open Tuning Lab
            </button>
          </div>
        </div>

        <div style={footer}>
          <button onClick={resetAll} style={resetBtn}>
            Reset to defaults
          </button>
          <button
            onClick={() => {
              clickConfirm()
              onClose()
            }}
            style={doneBtn}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
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
          background: highlighted ? '#3a2a14' : '#0e0e0e',
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

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 110,
  fontFamily: 'system-ui, sans-serif',
  padding: 16,
}
const panel: React.CSSProperties = {
  background: '#161616',
  color: 'white',
  borderRadius: 12,
  padding: '20px 22px',
  minWidth: 320,
  maxWidth: 460,
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  border: '1px solid #2a2a2a',
  maxHeight: 'calc(100vh - 32px)',
  overflow: 'auto',
}
const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}
const title: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: 2,
}
const closeBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#ccc',
  cursor: 'pointer',
  fontSize: 12,
  letterSpacing: 1,
  fontFamily: 'inherit',
}
const sectionWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
}
const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 1.6,
  textTransform: 'uppercase',
  color: '#9aa0a6',
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
const kbHint: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  lineHeight: 1.4,
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
  background: '#1d1d1d',
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
const touchToggleBtn: React.CSSProperties = {
  flex: 1,
  border: 'none',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const openLabBtn: React.CSSProperties = {
  background: '#ff6b35',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const footer: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  marginTop: 4,
}
const resetBtn: React.CSSProperties = {
  background: 'transparent',
  color: '#cfcfcf',
  border: '1px solid #3a3a3a',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const doneBtn: React.CSSProperties = {
  background: '#ff6b35',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '10px 18px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
