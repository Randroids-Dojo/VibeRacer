'use client'
import { JOYSTICK_RADIUS, type JoystickState } from '@/game/virtual-joystick'
import { useTouchControls } from '@/hooks/useTouchControls'
import type { KeyInput } from '@/hooks/useKeyboard'
import type { TouchMode } from '@/lib/controlSettings'

interface TouchControlsProps {
  keys: { current: KeyInput }
  enabled: boolean
  mode?: TouchMode
}

const KNOB_RADIUS = 26

export function TouchControls({ keys, enabled, mode = 'single' }: TouchControlsProps) {
  const sticks = useTouchControls(keys, enabled, mode)
  if (!enabled) return null
  // Single-stick mode reuses the steer joystick for both axes, so we render
  // it with a neutral tint to signal "this controls everything".
  if (mode === 'single') {
    return <JoystickVisual js={sticks.steer} tint="rgba(255, 255, 255, 0.85)" />
  }
  return (
    <>
      <JoystickVisual js={sticks.steer} tint="rgba(95, 224, 138, 0.85)" />
      <JoystickVisual js={sticks.throttle} tint="rgba(255, 179, 77, 0.85)" />
    </>
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
