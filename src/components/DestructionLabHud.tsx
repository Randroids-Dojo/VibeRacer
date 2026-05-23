'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useClickSfx } from '@/hooks/useClickSfx'
import { menuTheme } from './menuTheme'

// Pure presentation. The lab feeds a snapshot of the per-panel HP and
// the current drivability scalars on every HUD push (every hit + every
// ~100ms). The HUD has no scene knowledge; it just renders bars +
// stats and surfaces three buttons (Repair, Detonate, Take the Wheel)
// the parent wires to refs.
//
// On portrait / small-screen viewports the HUD defaults to a compact
// chip so the destruction canvas keeps the upper half of the screen
// free for the chase camera. Tapping the chip expands the full panel
// with the per-panel bars and the action buttons.

export interface PanelHudState {
  hp: number
  max: number
  detached: boolean
}

export interface DestructionHudState {
  panels: {
    hood: PanelHudState
    trunk: PanelHudState
    door_l: PanelHudState
    door_r: PanelHudState
    body: PanelHudState
    engine: PanelHudState
  }
  drivability: {
    accelFactor: number
    maxSpeedFactor: number
    steerBias: number
    stalled: boolean
  }
  totalHits: number
  driveMode: 'ai' | 'player'
}

interface Props {
  state: DestructionHudState
  onRepair: () => void
  onDetonate: () => void
  onToggleDriveMode: () => void
}

const PANEL_LABELS: Record<keyof DestructionHudState['panels'], string> = {
  hood: 'Hood',
  trunk: 'Trunk',
  door_l: 'Door L',
  door_r: 'Door R',
  body: 'Body',
  engine: 'Engine',
}

// Aggregate HP across the panels so the collapsed chip can show one
// readable health number. We weight by max HP so the engine contributes
// proportionally to its share of the wreck's total durability.
function aggregateHp(state: DestructionHudState): number {
  let totalHp = 0
  let totalMax = 0
  for (const key of Object.keys(state.panels) as Array<
    keyof DestructionHudState['panels']
  >) {
    totalHp += state.panels[key].hp
    totalMax += state.panels[key].max
  }
  return totalMax > 0 ? totalHp / totalMax : 0
}

export function DestructionLabHud({
  state,
  onRepair,
  onDetonate,
  onToggleDriveMode,
}: Props) {
  const click = useClickSfx('confirm')
  const clickBack = useClickSfx('back')
  // Track whether the viewport is small enough that the HUD should
  // default to collapsed. We do not auto-expand on resize, so an
  // explicit open from the user persists across rotation.
  const [isSmall, setIsSmall] = useState(false)
  const [expanded, setExpanded] = useState(true)
  useEffect(() => {
    function refresh() {
      const small = window.innerWidth < 720 || window.innerHeight > window.innerWidth
      setIsSmall(small)
      // First call seeds the collapsed default on small screens.
      if (small) setExpanded((prev) => prev)
    }
    refresh()
    setExpanded(!(window.innerWidth < 720 || window.innerHeight > window.innerWidth))
    window.addEventListener('resize', refresh)
    window.addEventListener('orientationchange', refresh)
    return () => {
      window.removeEventListener('resize', refresh)
      window.removeEventListener('orientationchange', refresh)
    }
  }, [])

  const aggregate = aggregateHp(state)
  const aggregatePct = Math.round(aggregate * 100)

  return (
    <>
      <Link href="/" style={closeStyle} aria-label="Close Destruction Lab">
        CLOSE
      </Link>
      {!expanded ? (
        <button
          type="button"
          onClick={() => {
            click()
            setExpanded(true)
          }}
          style={collapsedChipStyle}
          aria-expanded={false}
          aria-label="Open Destruction Lab readout"
        >
          <span style={chipTitleStyle}>DESTRUCTION LAB</span>
          <span style={chipExpStyle}>EXPERIMENTAL</span>
          <span style={chipStatsStyle}>
            <span>HP {aggregatePct}%</span>
            <span style={{ opacity: 0.5 }}>|</span>
            <span>Hits {state.totalHits}</span>
            {state.drivability.stalled ? (
              <span style={stalledChipStyle}>STALLED</span>
            ) : null}
          </span>
        </button>
      ) : null}
      {expanded ? (
        <div
          style={isSmall ? panelBoxStyleMobile : panelBoxStyle}
          role="status"
          aria-live="polite"
        >
          <div style={titleRowStyle}>
            <div style={titleStyle}>DESTRUCTION LAB</div>
            <div style={titleRightStyle}>
              <div style={experimentalPillStyle}>EXPERIMENTAL</div>
              {isSmall ? (
                <button
                  type="button"
                  onClick={() => {
                    clickBack()
                    setExpanded(false)
                  }}
                  style={hideBtnStyle}
                  aria-label="Hide Destruction Lab readout"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>
          <div style={subtitleStyle}>
            Hits: <strong>{state.totalHits}</strong>
            {state.drivability.stalled ? (
              <span style={stalledStyle}> STALLED</span>
            ) : null}
          </div>
          <div style={partListStyle}>
            {(Object.keys(state.panels) as Array<keyof DestructionHudState['panels']>).map(
              (key) => {
                const panel = state.panels[key]
                const pct = panel.max > 0 ? panel.hp / panel.max : 0
                return (
                  <PanelBar
                    key={key}
                    label={PANEL_LABELS[key]}
                    pct={pct}
                    detached={panel.detached}
                  />
                )
              },
            )}
          </div>
          <div style={statsRowStyle}>
            <StatChip
              label="Throttle"
              value={`${Math.round(state.drivability.accelFactor * 100)}%`}
            />
            <StatChip
              label="Top speed"
              value={`${Math.round(state.drivability.maxSpeedFactor * 100)}%`}
            />
            <StatChip
              label="Steer bias"
              value={`${
                state.drivability.steerBias === 0
                  ? '0'
                  : `${state.drivability.steerBias > 0 ? '+' : ''}${state.drivability.steerBias.toFixed(2)}`
              }`}
            />
          </div>
          <div style={buttonRowStyle}>
            <button
              type="button"
              onClick={() => {
                click()
                onRepair()
              }}
              style={primaryBtnStyle}
            >
              Repair
            </button>
            <button
              type="button"
              onClick={() => {
                clickBack()
                onDetonate()
              }}
              style={dangerBtnStyle}
            >
              Detonate
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              click()
              onToggleDriveMode()
            }}
            style={toggleBtnStyle}
            aria-pressed={state.driveMode === 'player'}
          >
            {state.driveMode === 'ai' ? 'Take the Wheel' : 'Return to AI'}
          </button>
          {state.driveMode === 'player' ? (
            <div style={controlsHintStyle}>
              Drag the screen to drive on touch. Or WASD on keyboard, space handbrake.
            </div>
          ) : (
            <div style={controlsHintStyle}>
              Pinch or scroll to zoom. Two-finger drag or right-click drag to pan. Tap the car to damage it.
            </div>
          )}
        </div>
      ) : null}
    </>
  )
}

function PanelBar({
  label,
  pct,
  detached,
}: {
  label: string
  pct: number
  detached: boolean
}) {
  const clamped = Math.max(0, Math.min(1, pct))
  return (
    <div style={partRowStyle}>
      <div style={partLabelStyle}>{label}</div>
      <div style={partTrackStyle}>
        <div
          style={{
            ...partFillStyle,
            width: `${clamped * 100}%`,
            background: barColor(clamped),
          }}
        />
        {detached ? <div style={detachedTagStyle}>OFF</div> : null}
      </div>
      <div style={partHpStyle}>{Math.round(pct * 100)}%</div>
    </div>
  )
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={chipStyle}>
      <span style={chipLabelStyle}>{label}</span>
      <span style={chipValueStyle}>{value}</span>
    </div>
  )
}

function barColor(pct: number): string {
  if (pct > 0.75) return '#7be07b'
  if (pct > 0.5) return '#cae34a'
  if (pct > 0.3) return '#f0b13d'
  if (pct > 0.1) return '#e8773a'
  return '#e84a5f'
}

// Styles. Absolute positioning over the canvas; container is fixed in
// the parent so coordinates are relative to the viewport. Pointer
// events on the canvas pass through unless they hit one of these
// boxes, which is the standard HUD-over-canvas pattern.

const closeStyle: React.CSSProperties = {
  position: 'fixed',
  top: 16,
  left: 16,
  padding: '8px 14px',
  background: 'rgba(0,0,0,0.55)',
  color: 'white',
  textDecoration: 'none',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: 1,
  border: '1px solid rgba(255,255,255,0.18)',
  zIndex: 10,
}
const collapsedChipStyle: React.CSSProperties = {
  position: 'fixed',
  top: 16,
  right: 16,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 4,
  padding: '8px 12px',
  background: 'rgba(0,0,0,0.55)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 10,
  color: 'white',
  fontFamily: 'inherit',
  cursor: 'pointer',
  zIndex: 10,
}
const chipTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1.2,
}
const chipExpStyle: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: 1.5,
  padding: '1px 6px',
  borderRadius: 999,
  background: menuTheme.ctaBg,
  color: 'white',
  fontWeight: 700,
}
const chipStatsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  fontSize: 12,
  fontVariantNumeric: 'tabular-nums',
  alignItems: 'center',
}
const stalledChipStyle: React.CSSProperties = {
  color: '#ff8855',
  fontWeight: 700,
  letterSpacing: 1,
}
const panelBoxStyle: React.CSSProperties = {
  position: 'fixed',
  right: 16,
  top: 16,
  width: 280,
  padding: 14,
  background: 'rgba(0,0,0,0.55)',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.18)',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  zIndex: 10,
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
}
// Mobile expansion. Fills the bottom of the screen instead of the
// right column so the chase camera keeps the upper half of the canvas
// uncovered. The user can still close it via the hide button.
const panelBoxStyleMobile: React.CSSProperties = {
  position: 'fixed',
  left: 12,
  right: 12,
  bottom: 12,
  padding: 12,
  background: 'rgba(0,0,0,0.65)',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.18)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  zIndex: 10,
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  maxHeight: '70vh',
  overflowY: 'auto',
}
const titleRightStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}
const hideBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.22)',
  borderRadius: 6,
  color: 'white',
  fontSize: 18,
  lineHeight: 1,
  fontFamily: 'inherit',
  cursor: 'pointer',
  padding: 0,
}
const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}
const titleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: 1.2,
}
const experimentalPillStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 1.5,
  padding: '2px 6px',
  borderRadius: 999,
  background: menuTheme.ctaBg,
  color: 'white',
  fontWeight: 700,
}
const subtitleStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.85,
}
const stalledStyle: React.CSSProperties = {
  color: '#ff8855',
  marginLeft: 8,
  fontWeight: 700,
  letterSpacing: 1.2,
}
const partListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}
const partRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '64px 1fr 36px',
  alignItems: 'center',
  gap: 8,
}
const partLabelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.85,
  fontVariantNumeric: 'tabular-nums',
}
const partTrackStyle: React.CSSProperties = {
  position: 'relative',
  height: 8,
  background: 'rgba(255,255,255,0.12)',
  borderRadius: 4,
  overflow: 'hidden',
}
const partFillStyle: React.CSSProperties = {
  height: '100%',
  transition: 'width 80ms ease, background 80ms ease',
}
const detachedTagStyle: React.CSSProperties = {
  position: 'absolute',
  top: -2,
  right: -2,
  fontSize: 9,
  background: '#e84a5f',
  color: 'white',
  padding: '1px 4px',
  borderRadius: 4,
  fontWeight: 800,
  letterSpacing: 1,
}
const partHpStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.85,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
}
const statsRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}
const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  padding: '4px 8px',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6,
  minWidth: 70,
}
const chipLabelStyle: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: 1,
  opacity: 0.7,
  textTransform: 'uppercase',
}
const chipValueStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
}
const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
}
const primaryBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 12px',
  background: menuTheme.ctaBg,
  color: 'white',
  border: 'none',
  borderRadius: 8,
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: 0.5,
  cursor: 'pointer',
  boxShadow: `0 4px 0 ${menuTheme.ctaShadow}`,
}
const dangerBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.08)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: 8,
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: 0.5,
  cursor: 'pointer',
}
const toggleBtnStyle: React.CSSProperties = {
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.08)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: 8,
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: 0.5,
  cursor: 'pointer',
}
const controlsHintStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.75,
  textAlign: 'center',
}
