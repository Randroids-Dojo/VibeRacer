'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  ALL_DERBY_VEHICLES,
  DERBY_VEHICLES,
  type DerbyVehicleConfig,
} from '@/lib/derbyVehicles'
import { DERBY_ARENAS } from '@/lib/derbyArenas'
import type { DerbyArenaSlug, DerbyVehicleType } from '@/lib/schemas'
import { DerbyRound } from './DerbyRound'

// Derby per-arena landing screen. Picks a vehicle and starts a round.
// Pressing the start button mounts <DerbyRound /> behind the `started`
// gate; the picker stays mounted under the round so a "Run it back" from
// the results panel can flip `started` back without re-fetching the arena.

export function DerbyVehiclePicker({
  arenaSlug,
}: {
  arenaSlug: DerbyArenaSlug
}) {
  const arena = DERBY_ARENAS[arenaSlug]
  const [chosen, setChosen] = useState<DerbyVehicleType>('car')
  const [started, setStarted] = useState(false)

  if (started) {
    return (
      <DerbyRound
        arenaSlug={arenaSlug}
        vehicle={chosen}
        onRetry={() => setStarted(false)}
      />
    )
  }

  return (
    <main style={pageStyle}>
      <div style={stageStyle}>
        <header style={logoWrapStyle}>
          <h1 style={logoStyle}>{arena.displayName}</h1>
          <p style={tagStyle}>{arena.blurb}</p>
        </header>

        <div style={menuStyle}>
          <div style={sectionHeader}>Pick your vehicle</div>
          <div style={cardGridStyle}>
            {ALL_DERBY_VEHICLES.map((v) => (
              <VehicleCard
                key={v.type}
                vehicle={v}
                selected={v.type === chosen}
                onSelect={() => setChosen(v.type)}
              />
            ))}
          </div>

          <button
            type="button"
            style={primaryBtnStyle}
            data-testid="derby-start-button"
            onClick={() => setStarted(true)}
          >
            Start round with {DERBY_VEHICLES[chosen].displayName}
          </button>

          <Link href="/derby" style={backLinkStyle}>
            {'‹'} back to derby hub
          </Link>
        </div>
      </div>
    </main>
  )
}

function VehicleCard({
  vehicle,
  selected,
  onSelect,
}: {
  vehicle: DerbyVehicleConfig
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        ...cardStyle,
        borderColor: selected ? '#ff6b35' : '#2a2a2a',
        boxShadow: selected
          ? '0 6px 0 rgba(255,107,53,0.55)'
          : '0 6px 0 rgba(0,0,0,0.55)',
      }}
    >
      <div style={cardTitleStyle}>{vehicle.displayName}</div>
      <div style={cardBlurbStyle}>{vehicle.blurb}</div>
      <div style={statRowStyle}>
        <Stat label="HP" value={vehicle.health} />
        <Stat label="DMG" value={vehicle.baseDamage} />
        <Stat label="MASS" value={vehicle.mass} />
        <Stat label="TOP" value={vehicle.carParams.maxSpeed} />
      </div>
    </button>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={statBlock}>
      <div style={statLabel}>{label}</div>
      <div style={statValue}>{value}</div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background:
    'radial-gradient(ellipse at top, #2a1a14 0%, #0a0a0a 60%, #050505 100%)',
  color: '#fff',
  fontFamily: 'system-ui, sans-serif',
  boxSizing: 'border-box',
}
const stageStyle: React.CSSProperties = {
  position: 'relative',
  width: 'min(720px, 100%)',
  display: 'grid',
  gap: 28,
}
const logoWrapStyle: React.CSSProperties = {
  textAlign: 'center',
  textShadow: '0 4px 0 rgba(0,0,0,0.25), 0 10px 24px rgba(0,0,0,0.35)',
}
const logoStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'clamp(36px, 8vw, 56px)',
  fontWeight: 800,
  color: '#fff',
  letterSpacing: 1,
}
const tagStyle: React.CSSProperties = {
  fontSize: 16,
  color: 'rgba(255,255,255,0.8)',
  margin: '8px 0 0',
}
const menuStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.45)',
  padding: 20,
  borderRadius: 18,
  display: 'grid',
  gap: 16,
  boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
}
const sectionHeader: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  opacity: 0.75,
  fontWeight: 600,
}
const cardGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 14,
}
const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 16,
  background: '#161616',
  border: '1px solid #2a2a2a',
  borderRadius: 12,
  color: '#fff',
  textDecoration: 'none',
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'transform 80ms ease, border-color 80ms ease',
}
const cardTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: 0.5,
}
const cardBlurbStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'rgba(255,255,255,0.7)',
  lineHeight: 1.4,
}
const statRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 6,
  marginTop: 4,
}
const statBlock: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 8,
  padding: '6px 8px',
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
}
const statLabel: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 1,
  color: 'rgba(255,255,255,0.5)',
}
const statValue: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
}
const primaryBtnStyle: React.CSSProperties = {
  padding: '14px 18px',
  background: '#e84a5f',
  color: 'white',
  border: 0,
  borderRadius: 12,
  fontSize: 18,
  fontFamily: 'inherit',
  fontWeight: 700,
  letterSpacing: 0.5,
  textAlign: 'center',
  cursor: 'pointer',
  boxShadow: '0 6px 0 #9c2a3c',
}
const backLinkStyle: React.CSSProperties = {
  color: '#ff6b35',
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: 0.5,
  textAlign: 'center',
  padding: 4,
}
