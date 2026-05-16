'use client'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import {
  formatSpeed,
  speedFraction,
  topSpeedFraction,
  unitLabel,
  updateTopSpeed,
  type SpeedUnit,
} from '@/lib/speedometer'
import {
  DRAG_MANUAL_GEAR_MAX,
  DRAG_MANUAL_GEAR_SPECS,
} from '@/game/dragTick'

interface DragSpeedometerProps {
  speedRef: MutableRefObject<number>
  // Gear-7 cap (the full car-tuning maxSpeed). The dial's 100 % position.
  maxSpeedRef: MutableRefObject<number>
  unit: SpeedUnit
  topSpeedRef?: MutableRefObject<number>
  showTopSpeedMarker?: boolean
}

// Geometry constants. Match the road Speedometer so the visual mass of
// the two HUDs stays consistent across modes. The viewBox grants extra
// headroom above the dial so the topmost gear labels never get clipped
// against the SVG edge.
const CX = 60
const CY = 56
const TICK_INNER = 44
const TICK_OUTER = 50
const LABEL_RADIUS = 58
const TICK_COLOR = 'rgba(255, 255, 255, 0.55)'

// Speedometer variant for drag mode. In addition to the live needle and
// peak marker, renders one tick + numeric label per gear-boundary on the
// dial. Each label shows the gear the player is shifting INTO at that
// speed (e.g. the tick at gear 1's cap is labeled "2" because crossing
// it is the cue to upshift from 1 to 2). No color highlighting: the
// driver watches the needle climb past each label and pulls the shift
// themselves. The optional peak marker stays available for finished-run
// telemetry.
export function DragSpeedometer({
  speedRef,
  maxSpeedRef,
  unit,
  topSpeedRef,
  showTopSpeedMarker = false,
}: DragSpeedometerProps) {
  const numberRef = useRef<HTMLDivElement | null>(null)
  const needleRef = useRef<SVGLineElement | null>(null)
  const reverseRef = useRef<HTMLDivElement | null>(null)
  const peakTickRef = useRef<SVGLineElement | null>(null)
  const peakTextRef = useRef<HTMLDivElement | null>(null)
  const peakRowRef = useRef<HTMLDivElement | null>(null)

  // One marker per gear boundary. spec.gear is the gear whose CAP we sit
  // at; the player should shift INTO `spec.gear + 1` once the needle
  // crosses it, so the label uses the next gear number. Computed once
  // because the spec table is static.
  const shiftPoints = useMemo(
    () =>
      DRAG_MANUAL_GEAR_SPECS.slice(0, DRAG_MANUAL_GEAR_MAX - 1).map((spec) => {
        const ang = (-180 + spec.maxSpeedFactor * 180) * (Math.PI / 180)
        return {
          shiftIntoGear: spec.gear + 1,
          x1: CX + Math.cos(ang) * TICK_INNER,
          y1: CY + Math.sin(ang) * TICK_INNER,
          x2: CX + Math.cos(ang) * TICK_OUTER,
          y2: CY + Math.sin(ang) * TICK_OUTER,
          labelX: CX + Math.cos(ang) * LABEL_RADIUS,
          labelY: CY + Math.sin(ang) * LABEL_RADIUS,
        }
      }),
    [],
  )

  useEffect(() => {
    let raf = 0
    let prevText = ''
    let prevAngle = NaN
    let prevReverse = false
    let prevPeakAngle = NaN
    let prevPeakText = ''
    let prevPeakVisible: boolean | null = null
    let prevTickVisible: boolean | null = null

    function tick() {
      const raw = speedRef.current
      const max = maxSpeedRef.current
      const text = formatSpeed(raw, unit)
      if (text !== prevText && numberRef.current) {
        numberRef.current.textContent = text
        prevText = text
      }
      const f = speedFraction(raw, max)
      const angle = -90 + f * 180
      if (angle !== prevAngle && needleRef.current) {
        needleRef.current.setAttribute(
          'transform',
          `rotate(${angle.toFixed(2)} ${CX} ${CY})`,
        )
        prevAngle = angle
      }
      const reversing = raw < -0.05
      if (reversing !== prevReverse && reverseRef.current) {
        reverseRef.current.style.opacity = reversing ? '1' : '0'
        prevReverse = reversing
      }

      // Top-speed marker. Same logic as the road Speedometer.
      let topUs = topSpeedRef ? topSpeedRef.current : 0
      if (topSpeedRef) {
        const next = updateTopSpeed(topUs, raw)
        if (next.becameTop) topSpeedRef.current = next.topUs
        topUs = next.topUs
      }
      const peakF = topSpeedFraction(topUs, max)
      const peakAngle = -180 + peakF * 180
      const peakText = formatSpeed(topUs, unit)
      const peakActive = showTopSpeedMarker && topUs > 0
      if (peakActive !== prevTickVisible && peakTickRef.current) {
        peakTickRef.current.setAttribute('opacity', peakActive ? '1' : '0')
        prevTickVisible = peakActive
      }
      if (peakActive && peakAngle !== prevPeakAngle && peakTickRef.current) {
        peakTickRef.current.setAttribute(
          'transform',
          `rotate(${(peakAngle + 90).toFixed(2)} ${CX} ${CY})`,
        )
        prevPeakAngle = peakAngle
      }
      if (peakActive !== prevPeakVisible && peakRowRef.current) {
        peakRowRef.current.style.opacity = peakActive ? '1' : '0'
        prevPeakVisible = peakActive
      }
      if (peakActive && peakText !== prevPeakText && peakTextRef.current) {
        peakTextRef.current.textContent = peakText
        prevPeakText = peakText
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [speedRef, maxSpeedRef, unit, topSpeedRef, showTopSpeedMarker])

  return (
    <div style={wrap} aria-hidden>
      <div style={card} data-testid="hud-drag-speedometer">
        {/* viewBox grants 10 units of headroom above the dial so the
            gear-label glyphs that sit at the top of the arc (gears whose
            cap lands near sFrac=0.5 on the dial) never clip. */}
        <svg viewBox="0 -10 120 74" style={gauge}>
          {/* Background arc. */}
          <path
            d="M 12 56 A 48 48 0 0 1 108 56"
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* Per-gear shift-point ticks + labels. All ticks render the
              same; the player watches the needle climb past each label
              and pulls the shift themselves. */}
          {shiftPoints.map((p) => (
            <g key={p.shiftIntoGear}>
              <line
                data-testid={`speedometer-shift-tick-${p.shiftIntoGear}`}
                x1={p.x1}
                y1={p.y1}
                x2={p.x2}
                y2={p.y2}
                stroke={TICK_COLOR}
                strokeWidth="2"
                strokeLinecap="round"
              />
              <text
                x={p.labelX}
                y={p.labelY}
                fontFamily="system-ui, sans-serif"
                fontSize="6.5"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
                fill={TICK_COLOR}
                opacity="0.85"
              >
                {p.shiftIntoGear}
              </text>
            </g>
          ))}
          {/* Peak-speed marker. Identical visual to the road Speedometer. */}
          <line
            ref={peakTickRef}
            data-testid="speedometer-peak"
            x1={CX}
            y1="8"
            x2={CX}
            y2="20"
            stroke="#7df09c"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0"
            transform={`rotate(-90 ${CX} ${CY})`}
          />
          {/* Live needle. */}
          <line
            ref={needleRef}
            data-testid="speedometer-needle"
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
        <div ref={peakRowRef} style={peakRow}>
          <span style={peakLabel}>PEAK</span>
          <span ref={peakTextRef} style={peakValue}>
            0
          </span>
          <span style={peakUnit}>{unitLabel(unit)}</span>
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
const peakRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 4,
  marginTop: 2,
  fontFamily: 'system-ui, sans-serif',
  fontSize: 10,
  letterSpacing: 1.4,
  fontWeight: 700,
  opacity: 0,
  transition: 'opacity 0.2s linear',
  color: '#7df09c',
}
const peakLabel: React.CSSProperties = {
  opacity: 0.9,
}
const peakValue: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.4,
  minWidth: '2ch',
  textAlign: 'right',
}
const peakUnit: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: 1.2,
  opacity: 0.8,
}
