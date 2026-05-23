'use client'

import { useClickSfx } from '@/hooks/useClickSfx'
import { menuTheme } from './menuTheme'
import type { CompassDir } from '@/game/destruction/cardinalCamera'

// Four-button compass that locks the camera to a car-relative
// side view (N / S / E / W). Tapping the currently-selected
// direction deselects it, which returns the camera to the
// overhead view that owns pan / zoom. Sized small enough to sit
// at the bottom-left of the canvas without colliding with the
// HUD panel on the right.

interface Props {
  selected: CompassDir | null
  onSelect: (dir: CompassDir | null) => void
}

const DIR_LABELS: Record<CompassDir, string> = {
  N: 'N',
  E: 'E',
  S: 'S',
  W: 'W',
}

const DIR_ARIA: Record<CompassDir, string> = {
  N: 'Front camera view (north)',
  E: 'Right-side camera view (east)',
  S: 'Rear camera view (south)',
  W: 'Left-side camera view (west)',
}

export function DestructionCompass({ selected, onSelect }: Props) {
  const click = useClickSfx('confirm')
  function handle(dir: CompassDir) {
    click()
    onSelect(selected === dir ? null : dir)
  }
  return (
    <div
      style={containerStyle}
      role="radiogroup"
      aria-label="Camera compass"
    >
      <div style={ringStyle}>
        <CompassButton
          dir="N"
          style={{ ...buttonStyle, ...northStyle }}
          selected={selected === 'N'}
          onClick={handle}
        />
        <CompassButton
          dir="E"
          style={{ ...buttonStyle, ...eastStyle }}
          selected={selected === 'E'}
          onClick={handle}
        />
        <CompassButton
          dir="S"
          style={{ ...buttonStyle, ...southStyle }}
          selected={selected === 'S'}
          onClick={handle}
        />
        <CompassButton
          dir="W"
          style={{ ...buttonStyle, ...westStyle }}
          selected={selected === 'W'}
          onClick={handle}
        />
      </div>
    </div>
  )
}

function CompassButton({
  dir,
  style,
  selected,
  onClick,
}: {
  dir: CompassDir
  style: React.CSSProperties
  selected: boolean
  onClick: (dir: CompassDir) => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={DIR_ARIA[dir]}
      onClick={() => onClick(dir)}
      style={{
        ...style,
        background: selected ? menuTheme.ctaBg : 'rgba(0,0,0,0.55)',
        borderColor: selected
          ? menuTheme.ctaBg
          : 'rgba(255,255,255,0.25)',
        color: selected ? 'white' : 'rgba(255,255,255,0.88)',
        boxShadow: selected ? `0 3px 0 ${menuTheme.ctaShadow}` : 'none',
      }}
    >
      {DIR_LABELS[dir]}
    </button>
  )
}

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  left: 16,
  bottom: 16,
  width: 128,
  height: 128,
  zIndex: 10,
  pointerEvents: 'none',
}
// The ring is a relative-positioned square that the four buttons
// anchor to. pointerEvents reset to auto on the buttons so the
// container's outer ring is non-interactive (taps fall through to
// the canvas).
const ringStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
}
const buttonStyle: React.CSSProperties = {
  position: 'absolute',
  width: 36,
  height: 36,
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'rgba(0,0,0,0.55)',
  color: 'rgba(255,255,255,0.88)',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: 1,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  pointerEvents: 'auto',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
}
const northStyle: React.CSSProperties = { top: 0, left: 46 }
const eastStyle: React.CSSProperties = { top: 46, right: 0 }
const southStyle: React.CSSProperties = { bottom: 0, left: 46 }
const westStyle: React.CSSProperties = { top: 46, left: 0 }
