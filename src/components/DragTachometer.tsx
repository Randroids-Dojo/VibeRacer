'use client'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import {
  formatSpeed,
  unitLabel,
  type SpeedUnit,
} from '@/lib/speedometer'
import {
  dragTachFraction,
  TACH_REDLINE_FRACTION,
  TACH_RED_ZONE_VISUAL_START,
} from '@/lib/dragTachometer'
import { DRAG_MANUAL_GEAR_MAX } from '@/game/dragTick'

interface DragTachometerProps {
  speedRef: MutableRefObject<number>
  // Gear-7 cap (the full car-tuning maxSpeed). Used to derive the
  // per-gear speed band the needle sweeps inside.
  maxSpeedRef: MutableRefObject<number>
  // Live gear, written by the rAF tick in DragRace each frame. Drives
  // both the dial math (each gear has its own speed band) and the big
  // central gear digit.
  gearRef: MutableRefObject<number>
  unit: SpeedUnit
}

// Dial geometry. Mirrors the road Speedometer's hub so the two HUDs feel
// like one car's cluster across modes. The viewBox keeps headroom above
// the dial so the topmost numeric labels never clip.
const CX = 60
const CY = 56
const RADIUS_ARC = 48
const TICK_INNER_MAJOR = 42
const TICK_OUTER = 50
const LABEL_RADIUS = 58
const TICK_COLOR = 'rgba(255, 255, 255, 0.55)'

// Synthetic RPM range we paint on the dial. The numbers are cosmetic
// (drag mode doesn't simulate engine RPM in physics; the needle is
// per-gear progress), but stamping 0..8 with a red zone in the last
// stretch is what makes the gauge READ as a tachometer instead of a
// repainted speed dial.
const TACH_RPM_MAX = 8

// Tachometer variant for drag mode. Replaces the per-gear speedometer
// with a sweeping tach whose needle climbs across the current gear's
// speed band and snaps back to 0 on every upshift. That snap-back is
// the whole point: it's the Forza-Horizon-style cue that tells the
// player "you just shifted, hold the throttle, watch me climb again".
//
// The center of the dial shows the live gear digit so the player has
// one focus point for both how-hard and what-gear without darting back
// to the bottom-left gear chip mid-launch.
export function DragTachometer({
  speedRef,
  maxSpeedRef,
  gearRef,
  unit,
}: DragTachometerProps) {
  const numberRef = useRef<HTMLDivElement | null>(null)
  const needleRef = useRef<SVGLineElement | null>(null)
  const gearDigitRef = useRef<SVGTextElement | null>(null)
  const reverseRef = useRef<HTMLDivElement | null>(null)

  // Static tick + label set for the 0..8 synthetic RPM scale. Built
  // once: the dial face never changes shape across the run, only the
  // needle on top of it moves. We render major ticks at every integer
  // (so the player can eyeball where the needle is) and oversized
  // labels at the 0 / 4 / 8 ends so the red end is unmistakable.
  const ticks = useMemo(() => {
    const out: Array<{
      key: string
      x1: number
      y1: number
      x2: number
      y2: number
      labelX: number
      labelY: number
      label: string
      inRed: boolean
    }> = []
    for (let i = 0; i <= TACH_RPM_MAX; i++) {
      const f = i / TACH_RPM_MAX
      const ang = (-180 + f * 180) * (Math.PI / 180)
      const inner = TICK_INNER_MAJOR
      const inRed = f >= TACH_RED_ZONE_VISUAL_START
      out.push({
        key: `t${i}`,
        x1: CX + Math.cos(ang) * inner,
        y1: CY + Math.sin(ang) * inner,
        x2: CX + Math.cos(ang) * TICK_OUTER,
        y2: CY + Math.sin(ang) * TICK_OUTER,
        labelX: CX + Math.cos(ang) * LABEL_RADIUS,
        labelY: CY + Math.sin(ang) * LABEL_RADIUS,
        label: String(i),
        inRed,
      })
    }
    return out
  }, [])

  // Redline tick. Marks the exact bog threshold the physics uses (i.e.
  // where gearPeakHoldSec starts accumulating). Sits inside the visual
  // red band so the player gets both a wide warning zone and a precise
  // "shift here" line.
  const redlineTick = useMemo(() => {
    const ang =
      (-180 + TACH_REDLINE_FRACTION * 180) * (Math.PI / 180)
    return {
      x1: CX + Math.cos(ang) * TICK_INNER_MAJOR,
      y1: CY + Math.sin(ang) * TICK_INNER_MAJOR,
      x2: CX + Math.cos(ang) * (TICK_OUTER + 2),
      y2: CY + Math.sin(ang) * (TICK_OUTER + 2),
    }
  }, [])

  // Red arc path, drawn over the base grey arc from the visual start
  // of the red band to the end. The two arcs share radius so the
  // overlay is pixel-aligned with the dial face.
  const redArc = useMemo(() => {
    const startAng =
      (-180 + TACH_RED_ZONE_VISUAL_START * 180) * (Math.PI / 180)
    const endAng = 0
    const x1 = CX + Math.cos(startAng) * RADIUS_ARC
    const y1 = CY + Math.sin(startAng) * RADIUS_ARC
    const x2 = CX + Math.cos(endAng) * RADIUS_ARC
    const y2 = CY + Math.sin(endAng) * RADIUS_ARC
    return `M ${x1} ${y1} A ${RADIUS_ARC} ${RADIUS_ARC} 0 0 1 ${x2} ${y2}`
  }, [])

  useEffect(() => {
    let raf = 0
    let prevText = ''
    let prevAngle = NaN
    let prevReverse = false
    let prevGearDigit = ''

    function tick() {
      const raw = speedRef.current
      const max = maxSpeedRef.current
      const gear = gearRef.current
      const text = formatSpeed(raw, unit)
      if (text !== prevText && numberRef.current) {
        numberRef.current.textContent = text
        prevText = text
      }
      const f = dragTachFraction(raw, gear, max)
      const angle = -90 + f * 180
      if (angle !== prevAngle && needleRef.current) {
        needleRef.current.setAttribute(
          'transform',
          `rotate(${angle.toFixed(2)} ${CX} ${CY})`,
        )
        prevAngle = angle
      }
      const digit = String(Math.max(1, Math.min(DRAG_MANUAL_GEAR_MAX, gear)))
      if (digit !== prevGearDigit && gearDigitRef.current) {
        gearDigitRef.current.textContent = digit
        prevGearDigit = digit
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
  }, [speedRef, maxSpeedRef, gearRef, unit])

  return (
    <div style={wrap} aria-hidden>
      <div style={card} data-testid="hud-drag-tachometer">
        <svg viewBox="0 -10 120 74" style={gauge}>
          {/* Background arc (cool grey). The full sweep from 0 to max. */}
          <path
            d="M 12 56 A 48 48 0 0 1 108 56"
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* Red zone overlay. Sits on top of the grey arc and paints
              the last stretch in warning red so the player can see the
              shift cue from a corner of the eye. */}
          <path
            data-testid="tachometer-redzone"
            d={redArc}
            fill="none"
            stroke="rgba(255, 64, 64, 0.85)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* Major integer ticks, 0..8. Red ones inherit the red zone's
              tone so the eye groups them with the warning band. */}
          {ticks.map((t) => (
            <g key={t.key}>
              <line
                data-testid={`tachometer-tick-${t.label}`}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke={t.inRed ? 'rgba(255, 100, 100, 0.9)' : TICK_COLOR}
                strokeWidth="2"
                strokeLinecap="round"
              />
              <text
                x={t.labelX}
                y={t.labelY}
                fontFamily="system-ui, sans-serif"
                fontSize="6.5"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
                fill={t.inRed ? '#ff8e8e' : TICK_COLOR}
                opacity={t.inRed ? '1' : '0.85'}
              >
                {t.label}
              </text>
            </g>
          ))}
          {/* Precise redline marker. Inside the red zone, marks the
              exact bog threshold the classifier and the redline-tint
              overlay both key off. */}
          <line
            data-testid="tachometer-redline"
            x1={redlineTick.x1}
            y1={redlineTick.y1}
            x2={redlineTick.x2}
            y2={redlineTick.y2}
            stroke="#ff2424"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Big gear digit at the dial's center. Player's primary focus
              point: the gear they're in PLUS the needle that tells them
              when to leave it. */}
          <text
            ref={gearDigitRef}
            data-testid="tachometer-gear-digit"
            x={CX}
            y={CY - 6}
            fontFamily="monospace"
            fontSize="22"
            fontWeight="800"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(255, 211, 107, 0.95)"
          >
            1
          </text>
          {/* Live needle. Rotated each frame around the hub at (CX, CY). */}
          <line
            ref={needleRef}
            data-testid="tachometer-needle"
            x1={CX}
            y1={CY}
            x2={CX}
            y2="14"
            stroke="#ffd24a"
            strokeWidth="3"
            strokeLinecap="round"
            transform={`rotate(-90 ${CX} ${CY})`}
          />
          <circle cx={CX} cy={CY} r="4" fill="#ffd24a" />
          <circle cx={CX} cy={CY} r="2" fill="#1b1b1b" />
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
  boxSizing: 'border-box',
  background: 'rgba(0, 0, 0, 0.45)',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  borderRadius: 12,
  padding: '6px 14px 8px 14px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minWidth: 170,
  boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
  fontFamily: 'system-ui, sans-serif',
  color: 'white',
  textShadow: '0 1px 4px rgba(0, 0, 0, 0.6)',
}
const gauge: React.CSSProperties = {
  width: 158,
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
