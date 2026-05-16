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
  DRAG_REDLINE_RATIO,
} from '@/game/dragTick'

interface DragSpeedometerProps {
  speedRef: MutableRefObject<number>
  // Gear-7 cap (the full car-tuning maxSpeed). The dial's 100 % position.
  maxSpeedRef: MutableRefObject<number>
  // Current gear index (1..DRAG_MANUAL_GEAR_MAX). Drives which shift
  // marker is brightened and where the green perfect-shift arc sits.
  gearRef: MutableRefObject<number>
  unit: SpeedUnit
  topSpeedRef?: MutableRefObject<number>
  showTopSpeedMarker?: boolean
}

// Geometry constants. Match the road Speedometer so the visual mass of
// the two HUDs stays consistent across modes.
const CX = 60
const CY = 56
const ARC_RADIUS = 48
const TICK_INNER = 44
const TICK_OUTER = 50
const LABEL_RADIUS = 56

// Speedometer variant for drag mode. In addition to the live needle and
// peak marker, renders one tick + numeric label per gear at the gear's
// cap (the speed past which the next upshift becomes available), and a
// short green "perfect-shift" arc at the current gear's redline window
// [DRAG_REDLINE_RATIO .. 1.0] of cap. Ticks already passed dim out,
// future ticks render in a muted color, and the active "shift next"
// tick brightens as the needle approaches it.
export function DragSpeedometer({
  speedRef,
  maxSpeedRef,
  gearRef,
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
  const perfectArcRef = useRef<SVGPathElement | null>(null)
  // One pair per upshift point. The tick is drawn at each gear's cap
  // (gear 1 cap = shift 1->2, ... gear 6 cap = shift 6->7). Gear 7 has
  // no upshift, so the table has DRAG_MANUAL_GEAR_MAX - 1 entries.
  const gearTickRefs = useRef<Array<SVGLineElement | null>>(
    Array(DRAG_MANUAL_GEAR_MAX - 1).fill(null),
  )
  const gearLabelRefs = useRef<Array<SVGTextElement | null>>(
    Array(DRAG_MANUAL_GEAR_MAX - 1).fill(null),
  )

  // The shift markers are placed at each gear's maxSpeedFactor on the
  // dial. Computed once because the table is static.
  const shiftPoints = useMemo(
    () =>
      DRAG_MANUAL_GEAR_SPECS.slice(0, DRAG_MANUAL_GEAR_MAX - 1).map((spec) => {
        const ang = (-180 + spec.maxSpeedFactor * 180) * (Math.PI / 180)
        return {
          gear: spec.gear,
          fraction: spec.maxSpeedFactor,
          // Tick endpoints on the dial arc.
          x1: CX + Math.cos(ang) * TICK_INNER,
          y1: CY + Math.sin(ang) * TICK_INNER,
          x2: CX + Math.cos(ang) * TICK_OUTER,
          y2: CY + Math.sin(ang) * TICK_OUTER,
          // Label position just outside the outer tick endpoint.
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
    let prevGear = -1
    let prevPerfectActive: boolean | null = null

    function tick() {
      const raw = speedRef.current
      const max = maxSpeedRef.current
      const gear = clampGearIndex(gearRef.current)
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

      // Recolor shift-point ticks any time the current gear changes.
      // Active = the tick for the player's current gear (where they should
      // shift NEXT). Passed = ticks for gears below current. Future =
      // ticks for gears above current. Top-gear (DRAG_MANUAL_GEAR_MAX) has
      // no upshift so every tick is dimmed past it.
      if (gear !== prevGear) {
        for (let i = 0; i < shiftPoints.length; i++) {
          const tickEl = gearTickRefs.current[i]
          const labelEl = gearLabelRefs.current[i]
          const tickGear = shiftPoints[i].gear
          const role: TickRole =
            gear === tickGear ? 'active'
              : tickGear < gear ? 'passed'
                : 'future'
          if (tickEl) {
            tickEl.setAttribute('stroke', TICK_STROKE[role])
            tickEl.setAttribute('stroke-width', role === 'active' ? '3' : '2')
          }
          if (labelEl) {
            labelEl.setAttribute('fill', TICK_STROKE[role])
            labelEl.setAttribute(
              'opacity',
              role === 'active' ? '1' : role === 'passed' ? '0.35' : '0.7',
            )
            labelEl.setAttribute(
              'font-weight',
              role === 'active' ? '900' : '700',
            )
          }
        }
        // Recompute the perfect-shift arc for the new current gear. The
        // arc spans [DRAG_REDLINE_RATIO * cap .. cap] of the current gear's
        // band. Top gear has no upshift so we hide the arc entirely.
        if (perfectArcRef.current) {
          if (gear >= DRAG_MANUAL_GEAR_MAX) {
            perfectArcRef.current.setAttribute('opacity', '0')
            prevPerfectActive = false
          } else {
            const spec = DRAG_MANUAL_GEAR_SPECS[gear - 1]
            const startFrac = spec.maxSpeedFactor * DRAG_REDLINE_RATIO
            const endFrac = spec.maxSpeedFactor
            perfectArcRef.current.setAttribute(
              'd',
              arcPath(startFrac, endFrac, ARC_RADIUS),
            )
            prevPerfectActive = null
          }
        }
        prevGear = gear
      }

      // Brighten the perfect-shift arc when the needle is inside it.
      const inPerfectWindow =
        gear < DRAG_MANUAL_GEAR_MAX &&
        f >= DRAG_MANUAL_GEAR_SPECS[gear - 1].maxSpeedFactor * DRAG_REDLINE_RATIO &&
        f <= DRAG_MANUAL_GEAR_SPECS[gear - 1].maxSpeedFactor
      if (
        inPerfectWindow !== prevPerfectActive &&
        perfectArcRef.current &&
        gear < DRAG_MANUAL_GEAR_MAX
      ) {
        perfectArcRef.current.setAttribute(
          'opacity',
          inPerfectWindow ? '1' : '0.55',
        )
        perfectArcRef.current.setAttribute(
          'stroke-width',
          inPerfectWindow ? '6' : '4',
        )
        prevPerfectActive = inPerfectWindow
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
  }, [speedRef, maxSpeedRef, gearRef, unit, topSpeedRef, showTopSpeedMarker, shiftPoints])

  return (
    <div style={wrap} aria-hidden>
      <div style={card} data-testid="hud-drag-speedometer">
        <svg viewBox="0 0 120 72" style={gauge}>
          {/* Background arc. */}
          <path
            d="M 12 56 A 48 48 0 0 1 108 56"
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* Perfect-shift arc for the current gear. Layered above the
              background ring so it pops; the rAF loop swaps its `d`
              attribute every time the gear changes. */}
          <path
            ref={perfectArcRef}
            data-testid="speedometer-perfect-window"
            d=""
            fill="none"
            stroke="#3df09c"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0"
          />
          {/* Per-gear shift-point ticks + numeric labels. The line is
              rendered first so the label sits visually on top. */}
          {shiftPoints.map((p, i) => (
            <g key={p.gear}>
              <line
                ref={(el) => {
                  gearTickRefs.current[i] = el
                }}
                data-testid={`speedometer-shift-tick-${p.gear}`}
                x1={p.x1}
                y1={p.y1}
                x2={p.x2}
                y2={p.y2}
                stroke={TICK_STROKE.future}
                strokeWidth="2"
                strokeLinecap="round"
              />
              <text
                ref={(el) => {
                  gearLabelRefs.current[i] = el
                }}
                x={p.labelX}
                y={p.labelY}
                fontFamily="system-ui, sans-serif"
                fontSize="6.5"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
                fill={TICK_STROKE.future}
                opacity="0.7"
              >
                {p.gear}
              </text>
            </g>
          ))}
          {/* Peak-speed marker. Identical visual to the road Speedometer
              so the two modes feel like one game. */}
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

type TickRole = 'active' | 'passed' | 'future'

// Tick + label color per role. Active is the gear the player is currently
// in, which is also the next upshift point on the dial. Passed gears dim
// to grey so they read as "already done". Future gears stay visible at a
// medium intensity so the player can plan ahead.
const TICK_STROKE: Record<TickRole, string> = {
  active: '#ffd24a',
  passed: 'rgba(255, 255, 255, 0.28)',
  future: 'rgba(255, 255, 255, 0.55)',
}

function clampGearIndex(g: number): number {
  if (!Number.isFinite(g)) return 1
  if (g < 1) return 1
  if (g > DRAG_MANUAL_GEAR_MAX) return DRAG_MANUAL_GEAR_MAX
  return Math.round(g)
}

// Build an SVG arc path between two fractions of the dial (0..1) along
// the same r=ARC_RADIUS circle the background ring uses.
function arcPath(startFrac: number, endFrac: number, r: number): string {
  const a1 = (-180 + startFrac * 180) * (Math.PI / 180)
  const a2 = (-180 + endFrac * 180) * (Math.PI / 180)
  const x1 = CX + Math.cos(a1) * r
  const y1 = CY + Math.sin(a1) * r
  const x2 = CX + Math.cos(a2) * r
  const y2 = CY + Math.sin(a2) * r
  // Arcs in this dial are always small (< 60 deg), so largeArcFlag stays 0.
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
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
