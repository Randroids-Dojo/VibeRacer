'use client'

import { type CSSProperties } from 'react'

// Derby HUD overlay. Top-left: place + score chip. Top-right: cars-left
// chip. Bottom-right: vertical health bar. Damage popups are managed
// here too as a fixed-size pool of absolute-positioned divs that fade
// out over a short window.

export interface DamagePopup {
  id: number
  amount: number
  // Screen-space pixel coordinates relative to the HUD container.
  screenX: number
  screenY: number
  // Wall-clock ms when the popup was created. Caller advances the time
  // and removes popups older than POPUP_LIFETIME_MS.
  createdAtMs: number
}

export const POPUP_LIFETIME_MS = 700

export interface DerbyHudState {
  place: number
  totalCars: number
  carsLeft: number
  scorePoints: number
  health: number
  maxHealth: number
  popups: DamagePopup[]
  nowMs: number
}

export function DerbyHUD({ state }: { state: DerbyHudState }) {
  const healthFraction = Math.max(
    0,
    Math.min(1, state.health / Math.max(1, state.maxHealth)),
  )
  return (
    <div style={hudRoot} aria-label="Derby HUD">
      <div style={topLeftChip} data-derby-place-chip="true">
        <div style={chipLabel}>PLACE</div>
        <div style={chipValueLg}>
          {state.place}/{state.totalCars}
        </div>
        <div style={chipLabel}>SCORE</div>
        <div style={chipValueSm}>{state.scorePoints}</div>
      </div>
      <div style={topRightChip} data-derby-cars-left-chip="true">
        <div style={chipLabel}>CARS LEFT</div>
        <div style={chipValueLg}>{state.carsLeft}</div>
      </div>
      <div style={healthBarRail} data-derby-health-bar="true">
        <div
          style={{
            ...healthBarFill,
            height: `${healthFraction * 100}%`,
            background: healthBarColor(healthFraction),
          }}
        />
      </div>
      <div style={popupLayer} aria-hidden="true">
        {state.popups.map((p) => {
          const age = Math.max(0, state.nowMs - p.createdAtMs)
          const alpha = Math.max(0, 1 - age / POPUP_LIFETIME_MS)
          return (
            <div
              key={p.id}
              style={{
                ...popupStyle,
                left: p.screenX,
                top: p.screenY - age * 0.06,
                opacity: alpha,
              }}
            >
              -{Math.max(1, Math.floor(p.amount))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function healthBarColor(frac: number): string {
  if (frac > 0.6) return '#3ddc84'
  if (frac > 0.3) return '#f5c518'
  if (frac > 0.1) return '#f29423'
  return '#e84a5f'
}

const hudRoot: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  fontFamily: 'system-ui, sans-serif',
  color: '#fff',
}

const baseChip: CSSProperties = {
  position: 'absolute',
  padding: '8px 12px',
  background: 'rgba(0,0,0,0.55)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  textAlign: 'left',
  boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
  fontVariantNumeric: 'tabular-nums',
}
const topLeftChip: CSSProperties = {
  ...baseChip,
  top: 16,
  left: 16,
}
const topRightChip: CSSProperties = {
  ...baseChip,
  top: 16,
  right: 16,
  textAlign: 'right',
  alignItems: 'flex-end',
}
const chipLabel: CSSProperties = {
  fontSize: 10,
  letterSpacing: 1.5,
  opacity: 0.65,
  textTransform: 'uppercase',
  fontWeight: 700,
}
const chipValueLg: CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  lineHeight: 1,
}
const chipValueSm: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1.1,
}
const healthBarRail: CSSProperties = {
  position: 'absolute',
  bottom: 24,
  right: 24,
  width: 16,
  height: 120,
  background: 'rgba(0,0,0,0.55)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 6,
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'flex-end',
  boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
}
const healthBarFill: CSSProperties = {
  width: '100%',
  transition: 'height 80ms linear, background 200ms linear',
}
const popupLayer: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
}
const popupStyle: CSSProperties = {
  position: 'absolute',
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: 0.5,
  color: '#ff6b35',
  textShadow: '0 2px 6px rgba(0,0,0,0.85)',
  transform: 'translate(-50%, -100%)',
  fontVariantNumeric: 'tabular-nums',
}
