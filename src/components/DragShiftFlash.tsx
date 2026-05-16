'use client'
import type { CSSProperties } from 'react'
import type { DragShiftQuality } from '@/game/dragTick'

interface DragShiftFlashProps {
  // Most recent shift event. Re-rendering with a fresh `triggeredAt`
  // restarts the CSS animation via the keyed wrapper below, even when
  // the same quality fires twice in a row.
  event: { quality: DragShiftQuality; triggeredAt: number } | null
}

const COLORS: Record<DragShiftQuality, { fill: string; glow: string; border: string }> = {
  early: {
    fill: 'rgba(255, 209, 102, 0.95)',
    glow: 'rgba(255, 209, 102, 0.65)',
    border: 'rgba(255, 240, 180, 0.95)',
  },
  perfect: {
    fill: 'rgba(61, 240, 156, 0.95)',
    glow: 'rgba(61, 240, 156, 0.7)',
    border: 'rgba(180, 255, 220, 0.95)',
  },
  late: {
    fill: 'rgba(255, 92, 92, 0.95)',
    glow: 'rgba(255, 92, 92, 0.7)',
    border: 'rgba(255, 200, 200, 0.95)',
  },
}

const LABELS: Record<DragShiftQuality, string> = {
  early: 'EARLY',
  perfect: 'PERFECT',
  late: 'LATE',
}

// Keyframes are injected with the component so the file is self-contained.
// `viberacer-` prefix mirrors the convention used by HUD.tsx for the road HUD.
const SHIFT_FLASH_CSS = `
@keyframes viberacer-drag-shift-pop {
  0% { transform: translate(-50%, -50%) scale(0.55); opacity: 0 }
  18% { transform: translate(-50%, -50%) scale(1.18); opacity: 1 }
  55% { transform: translate(-50%, -50%) scale(1); opacity: 1 }
  100% { transform: translate(-50%, -50%) scale(1); opacity: 0 }
}
@keyframes viberacer-drag-shift-edge {
  0% { opacity: 0 }
  18% { opacity: 0.8 }
  100% { opacity: 0 }
}
`

export function DragShiftFlash({ event }: DragShiftFlashProps) {
  return (
    <>
      <style>{SHIFT_FLASH_CSS}</style>
      {event && (
        <div key={event.triggeredAt} style={overlayWrap} aria-hidden>
          <div
            style={{
              ...edgeFlash,
              boxShadow: `inset 0 0 120px 20px ${COLORS[event.quality].glow}`,
            }}
          />
          <div
            style={{
              ...chip,
              background: COLORS[event.quality].fill,
              border: `2px solid ${COLORS[event.quality].border}`,
              boxShadow: `0 0 32px ${COLORS[event.quality].glow}`,
            }}
          >
            {LABELS[event.quality]}
          </div>
        </div>
      )}
    </>
  )
}

const overlayWrap: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 12,
}

const edgeFlash: CSSProperties = {
  position: 'absolute',
  inset: 0,
  animation: 'viberacer-drag-shift-edge 700ms ease-out forwards',
}

const chip: CSSProperties = {
  position: 'absolute',
  top: '38%',
  left: '50%',
  padding: '10px 22px',
  borderRadius: 999,
  color: '#0b0b0b',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 22,
  fontWeight: 900,
  letterSpacing: 3,
  animation: 'viberacer-drag-shift-pop 850ms cubic-bezier(0.2, 0.7, 0.3, 1.05) forwards',
  textShadow: '0 1px 2px rgba(0, 0, 0, 0.25)',
}
