'use client'
import { useEffect, type CSSProperties } from 'react'
import { JOYSTICK_RADIUS, type JoystickState } from '@/game/virtual-joystick'
import { useTouchControls } from '@/hooks/useTouchControls'
import type { KeyInput } from '@/hooks/useKeyboard'
import type { TouchMode } from '@/lib/controlSettings'

interface TouchControlsProps {
  keys: { current: KeyInput }
  enabled: boolean
  mode?: TouchMode
  showShifter?: boolean
}

const KNOB_RADIUS = 26

export function TouchControls({
  keys,
  enabled,
  mode = 'single',
  showShifter = false,
}: TouchControlsProps) {
  const sticks = useTouchControls(keys, enabled, mode)
  if (!enabled) return null
  // Single-stick mode reuses the steer joystick for both axes, so we render
  // it with a neutral tint to signal "this controls everything".
  if (mode === 'single') {
    return (
      <>
        <JoystickVisual js={sticks.steer} tint="rgba(255, 255, 255, 0.85)" />
        {showShifter ? <TouchShifter keys={keys} /> : null}
      </>
    )
  }
  return (
    <>
      <JoystickVisual js={sticks.steer} tint="rgba(95, 224, 138, 0.85)" />
      <JoystickVisual js={sticks.throttle} tint="rgba(255, 179, 77, 0.85)" />
      {showShifter ? <TouchShifter keys={keys} /> : null}
    </>
  )
}

function TouchShifter({ keys }: { keys: { current: KeyInput } }) {
  useEffect(() => {
    return () => {
      keys.current.shiftDown = false
      keys.current.shiftUp = false
    }
  }, [keys])

  return (
    <div style={shifterWrap} aria-label="Manual shift controls">
      <ShiftButton
        label="DOWN"
        onPress={(pressed) => {
          keys.current.shiftDown = pressed
        }}
      />
      <ShiftButton
        label="UP"
        onPress={(pressed) => {
          keys.current.shiftUp = pressed
        }}
      />
    </div>
  )
}

function ShiftButton({
  label,
  onPress,
}: {
  label: string
  onPress: (pressed: boolean) => void
}) {
  return (
    <button
      type="button"
      style={shiftBtn}
      onPointerDown={(e) => {
        onPress(true)
        e.currentTarget.setPointerCapture(e.pointerId)
        e.preventDefault()
      }}
      onPointerUp={(e) => {
        onPress(false)
        e.preventDefault()
      }}
      onPointerCancel={() => onPress(false)}
      onPointerLeave={() => onPress(false)}
    >
      {label}
    </button>
  )
}

function JoystickVisual({ js, tint }: { js: JoystickState; tint: string }) {
  if (!js.active) return null
  const dx = js.currentX - js.originX
  const dy = js.currentY - js.originY
  const len = Math.hypot(dx, dy)
  const clamp = len > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / len : 1
  const knobX = js.originX + dx * clamp
  const knobY = js.originY + dy * clamp
  return (
    <>
      <div
        style={{
          position: 'fixed',
          left: js.originX - JOYSTICK_RADIUS,
          top: js.originY - JOYSTICK_RADIUS,
          width: JOYSTICK_RADIUS * 2,
          height: JOYSTICK_RADIUS * 2,
          borderRadius: '50%',
          border: `2px solid ${tint}`,
          background: 'rgba(0, 0, 0, 0.2)',
          pointerEvents: 'none',
          zIndex: 15,
        }}
      />
      <div
        style={{
          position: 'fixed',
          left: knobX - KNOB_RADIUS,
          top: knobY - KNOB_RADIUS,
          width: KNOB_RADIUS * 2,
          height: KNOB_RADIUS * 2,
          borderRadius: '50%',
          background: tint,
          boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
          pointerEvents: 'none',
          zIndex: 15,
        }}
      />
    </>
  )
}

const shifterWrap: CSSProperties = {
  position: 'fixed',
  right: 22,
  bottom: 150,
  display: 'flex',
  gap: 10,
  zIndex: 16,
  pointerEvents: 'auto',
}

const shiftBtn: CSSProperties = {
  width: 72,
  height: 54,
  borderRadius: 10,
  border: '1px solid rgba(255, 211, 107, 0.55)',
  background: 'rgba(5, 10, 18, 0.72)',
  color: '#ffd36b',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: 1,
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
  touchAction: 'none',
}
