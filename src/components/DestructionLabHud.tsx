'use client'

import Link from 'next/link'
import { useClickSfx } from '@/hooks/useClickSfx'
import { menuTheme } from './menuTheme'

// Pure presentation. The lab feeds a snapshot of the per-panel HP and
// the current drivability scalars on every HUD push (every hit + every
// ~100ms). The HUD has no scene knowledge; it just renders bars +
// stats and surfaces three buttons (Repair, Detonate, Take the Wheel)
// the parent wires to refs.

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

export function DestructionLabHud({
  state,
  onRepair,
  onDetonate,
  onToggleDriveMode,
}: Props) {
  const click = useClickSfx('confirm')
  const clickBack = useClickSfx('back')
  return (
    <>
      <Link href="/" style={closeStyle} aria-label="Close Destruction Lab">
        CLOSE
      </Link>
      <div style={hintStyle} role="note">
        Tap or click the car to apply localized damage. Drag to orbit.
        Scroll or pinch to zoom.
      </div>
      <div style={panelBoxStyle} role="status" aria-live="polite">
        <div style={titleRowStyle}>
          <div style={titleStyle}>DESTRUCTION LAB</div>
          <div style={experimentalPillStyle}>EXPERIMENTAL</div>
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
            W / S throttle. A / D steer. Space handbrake.
          </div>
        ) : null}
      </div>
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
const hintStyle: React.CSSProperties = {
  position: 'fixed',
  top: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '8px 14px',
  background: 'rgba(0,0,0,0.5)',
  borderRadius: 8,
  fontSize: 12,
  color: 'rgba(255,255,255,0.92)',
  maxWidth: 360,
  textAlign: 'center',
  zIndex: 9,
  pointerEvents: 'none',
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
