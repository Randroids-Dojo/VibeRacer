'use client'
import { useEffect, useState } from 'react'
import { playCountdownBeep } from '@/game/music'

const STEP_MS = 800
const GO_HOLD_MS = 600

const LABELS = ['READY', 'SET', 'GO'] as const
const LAST_STEP = LABELS.length - 1

const LAMP_COLORS = [
  { color: '#ff2d3a', glow: 'rgba(255,45,58,0.75)' },
  { color: '#ffb020', glow: 'rgba(255,176,32,0.75)' },
  { color: '#30d46a', glow: 'rgba(48,212,106,0.75)' },
] as const

const LABEL_COLORS = ['#ff6470', '#ffc566', '#5fe08a'] as const

export function Countdown({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => {
        if (s >= LAST_STEP) {
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
    playCountdownBeep(step === LAST_STEP)
  }, [step])

  useEffect(() => {
    if (step !== LAST_STEP) return
    const t = setTimeout(onDone, GO_HOLD_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  return (
    <div style={overlay}>
      <div style={housing}>
        {LAMP_COLORS.map((lamp, i) => (
          <Lamp key={i} lit={step === i} color={lamp.color} glow={lamp.glow} />
        ))}
      </div>
      <div style={{ ...labelStyle, color: LABEL_COLORS[step] }}>
        {LABELS[step]}
      </div>
    </div>
  )
}

function Lamp({
  lit,
  color,
  glow,
}: {
  lit: boolean
  color: string
  glow: string
}) {
  return (
    <div
      style={{
        width: 84,
        height: 84,
        borderRadius: '50%',
        background: lit ? color : '#1a1a1a',
        boxShadow: lit
          ? `0 0 36px 6px ${glow}, inset 0 6px 14px rgba(255,255,255,0.25), inset 0 -6px 14px rgba(0,0,0,0.4)`
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
  flexDirection: 'column',
  alignItems: 'center',
  gap: 14,
  padding: 18,
  borderRadius: 20,
  background: '#0a0a0a',
  border: '2px solid #2a2a2a',
  boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
}

const labelStyle: React.CSSProperties = {
  fontSize: 64,
  fontWeight: 800,
  textShadow: '0 4px 24px rgba(0,0,0,0.6)',
  letterSpacing: 2,
}
