'use client'
import { useEffect, useRef, type MutableRefObject } from 'react'
import {
  formatSpeed,
  speedFraction,
  unitLabel,
  type SpeedUnit,
} from '@/lib/speedometer'

interface SpeedometerProps {
  // Live signed speed (world units / second) the racing canvas writes every
  // frame. Reading via a ref so a 60 Hz speed update never re-renders React.
  speedRef: MutableRefObject<number>
  // Live tuning's `maxSpeed`. Read each frame so the gauge needle reflects
  // the player's current setup (a higher max stretches the dial range).
  maxSpeedRef: MutableRefObject<number>
  unit: SpeedUnit
}

// Bottom-center HUD overlay. A slim semicircular arc with a needle plus a
// large numeric readout. Updates run inside a self-owned rAF loop so the
// readout can refresh at 60 Hz without sending React re-renders into the
// rest of the HUD tree.
export function Speedometer({ speedRef, maxSpeedRef, unit }: SpeedometerProps) {
  const numberRef = useRef<HTMLDivElement | null>(null)
  const needleRef = useRef<SVGLineElement | null>(null)
  const reverseRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let raf = 0
    let prevText = ''
    let prevAngle = NaN
    let prevReverse = false

    function tick() {
      const raw = speedRef.current
      const max = maxSpeedRef.current
      const text = formatSpeed(raw, unit)
      if (text !== prevText && numberRef.current) {
        numberRef.current.textContent = text
        prevText = text
      }
      const f = speedFraction(raw, max)
      // Sweep the needle from -90deg (left, zero) to +90deg (right, max).
      const angle = -90 + f * 180
      if (angle !== prevAngle && needleRef.current) {
        needleRef.current.setAttribute(
          'transform',
          `rotate(${angle.toFixed(2)} 60 56)`,
        )
        prevAngle = angle
      }
      const reversing = raw < -0.05
      if (reversing !== prevReverse && reverseRef.current) {
        reverseRef.current.style.opacity = reversing ? '1' : '0'
        prevReverse = reversing
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [speedRef, maxSpeedRef, unit])

  return (
    <div style={wrap} aria-hidden>
      <div style={card}>
        <svg viewBox="0 0 120 64" style={gauge}>
          {/* Background arc from 180deg (left) to 0deg (right). */}
          <path
            d="M 12 56 A 48 48 0 0 1 108 56"
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* Tick marks at 0 / 25 / 50 / 75 / 100 percent. */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const ang = (-180 + f * 180) * (Math.PI / 180)
            const r1 = 44
            const r2 = 50
            const cx = 60
            const cy = 56
            const x1 = cx + Math.cos(ang) * r1
            const y1 = cy + Math.sin(ang) * r1
            const x2 = cx + Math.cos(ang) * r2
            const y2 = cy + Math.sin(ang) * r2
            return (
              <line
                key={f}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(255,255,255,0.45)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )
          })}
          {/* Hot zone near top end. */}
          <path
            d="M 84 16.6 A 48 48 0 0 1 108 56"
            fill="none"
            stroke="rgba(255, 120, 90, 0.7)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* Needle. Rotated each frame around the hub at (60, 56). */}
          <line
            ref={needleRef}
            x1="60"
            y1="56"
            x2="60"
            y2="14"
            stroke="#ffd24a"
            strokeWidth="3"
            strokeLinecap="round"
            transform="rotate(-90 60 56)"
          />
          <circle cx="60" cy="56" r="4" fill="#ffd24a" />
          <circle cx="60" cy="56" r="2" fill="#1b1b1b" />
        </svg>
        <div style={readoutRow}>
          <div ref={numberRef} style={number}>
            0
          </div>
          <div style={unitStyle}>{unitLabel(unit)}</div>
        </div>
        <div ref={reverseRef} style={reverseBadge}>
          REV
        </div>
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
  zIndex: 11,
}
const card: React.CSSProperties = {
  position: 'relative',
  background: 'rgba(0, 0, 0, 0.45)',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  borderRadius: 12,
  padding: '6px 14px 8px 14px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minWidth: 160,
  boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
  fontFamily: 'system-ui, sans-serif',
  color: 'white',
  textShadow: '0 1px 4px rgba(0, 0, 0, 0.6)',
}
const gauge: React.CSSProperties = {
  width: 140,
  height: 'auto',
  display: 'block',
}
const readoutRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  marginTop: -6,
}
const number: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 'clamp(22px, 5vw, 30px)',
  fontWeight: 800,
  lineHeight: 1,
  minWidth: '2ch',
  textAlign: 'right',
  letterSpacing: 0.5,
}
const unitStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.5,
  fontWeight: 700,
  opacity: 0.85,
}
const reverseBadge: React.CSSProperties = {
  position: 'absolute',
  top: 4,
  right: 6,
  fontSize: 10,
  letterSpacing: 1.5,
  fontWeight: 800,
  color: '#ff7b6e',
  opacity: 0,
  transition: 'opacity 0.15s linear',
}
