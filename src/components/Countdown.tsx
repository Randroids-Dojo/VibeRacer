'use client'
import { useEffect, useState } from 'react'

const STEP_MS = 800
const GO_HOLD_MS = 600

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
    if (step !== 3) return
    const t = setTimeout(onDone, GO_HOLD_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const label = step === 0 ? '3' : step === 1 ? '2' : step === 2 ? '1' : 'GO'
  const color = step === 3 ? '#5fe08a' : '#ffd24d'

  return (
    <div style={overlay}>
      <div style={{ ...big, color }}>{label}</div>
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  display: 'grid',
  placeItems: 'center',
  zIndex: 50,
  fontFamily: 'system-ui, sans-serif',
}
const big: React.CSSProperties = {
  fontSize: 180,
  fontWeight: 800,
  textShadow: '0 4px 24px rgba(0,0,0,0.6)',
}
