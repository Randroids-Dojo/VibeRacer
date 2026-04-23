'use client'
import { useEffect, useState } from 'react'
import { playCountdownBeep } from '@/game/music'

const STEP_MS = 800
const GO_HOLD_MS = 600

const LAMP_COUNT = 5
// F1 staging: lights light up sequentially, then all extinguish on GO.
// Three numbered ticks fill the row to 5 lit, then GO blacks out the bar.
const LIT_PER_STEP: readonly number[] = [2, 4, 5, 0]
const LABELS = ['3', '2', '1', 'GO'] as const

const RED = '#ff2d3a'
const RED_GLOW = 'rgba(255,45,58,0.75)'

export function Countdown({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => {
        if (s >= 3) {
          clearInterval(id)
          return s
        }
        return s + 1
      })
    }, STEP_MS)
    return () => clearInterval(id)
    // onDone intentionally omitted: the setTimeout below captures the callback
    // active at the moment we reach GO. It is stable enough for the 600 ms hold.
  }, [])

  useEffect(() => {
    playCountdownBeep(step === 3)
  }, [step])

  useEffect(() => {
    if (step !== 3) return
    const t = setTimeout(onDone, GO_HOLD_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const litCount = LIT_PER_STEP[step]
  const label = LABELS[step]

  return (
    <div style={overlay}>
      <div style={housing}>
        {Array.from({ length: LAMP_COUNT }, (_, i) => (
          <Lamp key={i} lit={i < litCount} />
        ))}
      </div>
      <div style={{ ...label_s, color: step === 3 ? '#5fe08a' : '#ffd24d' }}>
        {label}
      </div>
    </div>
  )
}

function Lamp({ lit }: { lit: boolean }) {
  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: '50%',
        background: lit ? RED : '#1a1a1a',
        boxShadow: lit
          ? `0 0 32px 6px ${RED_GLOW}, inset 0 6px 14px rgba(255,255,255,0.25), inset 0 -6px 14px rgba(0,0,0,0.4)`
          : 'inset 0 6px 14px rgba(0,0,0,0.6), inset 0 -4px 10px rgba(255,255,255,0.04)',
        transition: 'background 120ms ease, box-shadow 120ms ease',
      }}
    />
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  display: 'grid',
  placeItems: 'center',
  gridAutoFlow: 'row',
  gap: 24,
  zIndex: 50,
  fontFamily: 'system-ui, sans-serif',
}

const housing: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 14,
  padding: 18,
  borderRadius: 20,
  background: '#0a0a0a',
  border: '2px solid #2a2a2a',
  boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
}

const label_s: React.CSSProperties = {
  fontSize: 72,
  fontWeight: 800,
  textShadow: '0 4px 24px rgba(0,0,0,0.6)',
  letterSpacing: 2,
}
