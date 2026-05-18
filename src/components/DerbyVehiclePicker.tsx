'use client'

import { useState } from 'react'
import {
  ALL_DERBY_VEHICLES,
  type DerbyVehicleConfig,
} from '@/lib/derbyVehicles'
import { DERBY_ARENAS } from '@/lib/derbyArenas'
import type { DerbyArenaSlug, DerbyVehicleType } from '@/lib/schemas'
import { MenuPageShell, menuStyles } from './MenuPageShell'
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
    <MenuPageShell
      title={arena.displayName}
      blurb={arena.blurb}
      closeHref="/derby"
      width="wide"
    >
      <div style={menuStyles.section}>
        <div style={menuStyles.sectionHeader}>Pick your vehicle</div>
        <div style={menuStyles.cardGrid}>
          {ALL_DERBY_VEHICLES.map((v) => (
            <VehicleCard
              key={v.type}
              vehicle={v}
              onSelect={() => setChosen(v.type)}
            />
          ))}
        </div>
      </div>
    </MenuPageShell>
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
    <button type="button" onClick={onSelect} style={menuStyles.card}>
      <div style={menuStyles.cardTitle}>{vehicle.displayName}</div>
      <div style={menuStyles.cardBlurb}>{vehicle.blurb}</div>
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

const statRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 6,
  marginTop: 4,
}
const statBlock: React.CSSProperties = {
  background: 'rgba(0,0,0,0.06)',
  border: '1px solid rgba(0,0,0,0.15)',
  borderRadius: 8,
  padding: '6px 8px',
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
}
const statLabel: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 1,
  color: 'rgba(0,0,0,0.55)',
}
const statValue: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
}
