'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  ALL_DERBY_VEHICLES,
  type DerbyVehicleConfig,
} from '@/lib/derbyVehicles'
import { DERBY_ARENAS } from '@/lib/derbyArenas'
import type { DerbyArenaSlug, DerbyVehicleType } from '@/lib/schemas'
import { DerbyRound } from './DerbyRound'

// Derby per-arena landing screen. Picks a vehicle and starts the round in
// a single click. The picker stays mounted under the round so a "Run it
// back" from the results panel can flip `chosen` back to null without
// re-fetching the arena.

export function DerbyVehiclePicker({
  arenaSlug,
}: {
  arenaSlug: DerbyArenaSlug
}) {
  const arena = DERBY_ARENAS[arenaSlug]
  const [chosen, setChosen] = useState<DerbyVehicleType | null>(null)

  if (chosen) {
    return (
      <DerbyRound
        arenaSlug={arenaSlug}
        vehicle={chosen}
        onRetry={() => setChosen(null)}
      />
    )
  }

  return (
    <main style={pageStyle}>
      <div style={stageStyle}>
        <header style={headerStyle}>
          <h1 style={titleStyle}>{arena.displayName}</h1>
          <Link href="/derby" style={closeBtnStyle} aria-label="Back to derby">
            CLOSE
          </Link>
        </header>

        <div style={menuStyle}>
          <p style={tagStyle}>{arena.blurb}</p>
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>Pick your vehicle</div>
            <div style={cardGridStyle}>
              {ALL_DERBY_VEHICLES.map((v) => (
                <VehicleCard
                  key={v.type}
                  vehicle={v}
                  onSelect={() => setChosen(v.type)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

function VehicleCard({
  vehicle,
  onSelect,
}: {
  vehicle: DerbyVehicleConfig
  onSelect: () => void
}) {
  return (
    <button type="button" onClick={onSelect} style={cardStyle}>
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
  fontFamily: 'var(--font-cartoony), system-ui, sans-serif',
  boxSizing: 'border-box',
}
const stageStyle: React.CSSProperties = {
  position: 'relative',
  width: 'min(600px, 100%)',
  display: 'grid',
  gap: 14,
}
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 18px',
  background: 'rgba(0,0,0,0.55)',
  borderRadius: 12,
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
}
const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 800,
  letterSpacing: 1,
}
const closeBtnStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.1)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 10,
  fontSize: 13,
  letterSpacing: 1,
  fontFamily: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
  textDecoration: 'none',
}
const menuStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.45)',
  padding: 24,
  borderRadius: 18,
  display: 'grid',
  gap: 18,
  boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
}
const tagStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  opacity: 0.85,
  lineHeight: 1.4,
}
const sectionStyle: React.CSSProperties = {
  paddingTop: 4,
}
const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  opacity: 0.75,
  marginBottom: 10,
  fontWeight: 600,
}
const cardGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
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
  boxShadow: '0 6px 0 rgba(0,0,0,0.55)',
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
