'use client'
import {
  DRAG_BODIES,
  DRAG_ENGINES,
  DRAG_TIRES,
  DRAG_TRANSMISSIONS,
  type DragLoadout,
} from '@/lib/dragParts'
import type { DragStripConfig } from '@/lib/dragStrips'
import type { DragDerivation } from '@/game/dragTuning'
import {
  MenuPickRow,
  MenuSection,
  MenuStageOverlay,
  MenuStartButton,
  menuTheme,
} from './MenuUI'

interface DragGarageProps {
  strip: DragStripConfig
  loadout: DragLoadout
  derivation: DragDerivation
  onChange: (next: DragLoadout) => void
  onConfirm: () => void
  onBack?: () => void
}

// The Drag Garage shares the same menu-shell shape as PreRaceSetup, the
// Free Race / Derby / Drag / Tour hubs, and the Settings page: a sky-blue
// page backdrop, dark-translucent header strip, dark-translucent body
// panel, cream pick-rows, and a red-pink primary CTA. All of that comes
// from the MenuStageOverlay / MenuPickRow / MenuStartButton primitives;
// only the per-part list and the derived-stats grid are local.
export function DragGarage({
  strip,
  loadout,
  derivation,
  onChange,
  onConfirm,
  onBack,
}: DragGarageProps) {
  return (
    <MenuStageOverlay
      title="GARAGE"
      zIndex={100}
      onBack={onBack}
      width="wide"
    >
      <div style={subtitleStyle}>{strip.displayName}</div>
      <div style={blurbStyle}>{strip.blurb}</div>

      <MenuSection title="Tires">
        <div style={partListStyle} role="radiogroup" aria-label="Tires">
          {DRAG_TIRES.map((tire) => (
            <MenuPickRow
              key={tire.id}
              label={tire.label}
              sublabel={`weight ${tire.weight}, grip ${tire.baseGrip}`}
              selected={loadout.tire === tire.id}
              onPick={() => onChange({ ...loadout, tire: tire.id })}
              ariaLabel={`Tires: ${tire.label}`}
            />
          ))}
        </div>
      </MenuSection>

      <MenuSection title="Body">
        <div style={partListStyle} role="radiogroup" aria-label="Body">
          {DRAG_BODIES.map((body) => (
            <MenuPickRow
              key={body.id}
              label={body.label}
              sublabel={`weight ${body.weight}, drag ${body.dragCoefficient}`}
              selected={loadout.body === body.id}
              onPick={() => onChange({ ...loadout, body: body.id })}
              ariaLabel={`Body: ${body.label}`}
            />
          ))}
        </div>
      </MenuSection>

      <MenuSection title="Engine">
        <div style={partListStyle} role="radiogroup" aria-label="Engine">
          {DRAG_ENGINES.map((engine) => (
            <MenuPickRow
              key={engine.id}
              label={engine.label}
              sublabel={`weight ${engine.weight}, RPM ${engine.launchRpm}`}
              selected={loadout.engine === engine.id}
              onPick={() => onChange({ ...loadout, engine: engine.id })}
              ariaLabel={`Engine: ${engine.label}`}
            />
          ))}
        </div>
      </MenuSection>

      <MenuSection title="Transmission">
        <div
          style={partListStyle}
          role="radiogroup"
          aria-label="Transmission"
        >
          {DRAG_TRANSMISSIONS.map((tr) => (
            <MenuPickRow
              key={tr.id}
              label={tr.label}
              sublabel={`1st ${tr.firstGearRatio}, top ${tr.topGearRatio}`}
              selected={loadout.transmission === tr.id}
              onPick={() => onChange({ ...loadout, transmission: tr.id })}
              ariaLabel={`Transmission: ${tr.label}`}
            />
          ))}
        </div>
      </MenuSection>

      <MenuSection title="Derived">
        <div style={derivationGridStyle}>
          <Stat label="Total weight" value={derivation.totalWeight.toFixed(0)} />
          <Stat label="Accel" value={derivation.totalAccel.toFixed(2)} />
          <Stat label="Top speed" value={derivation.totalMaxSpeed.toFixed(2)} />
          <Stat
            label={`Surface (${derivation.surfaceKey})`}
            value={derivation.surfaceMul.toFixed(2)}
          />
          <Stat label="RPM factor" value={derivation.rpmFactor.toFixed(2)} />
          <Stat label="1st gear" value={derivation.firstGearFactor.toFixed(2)} />
          <Stat label="Top gear" value={derivation.topGearFactor.toFixed(2)} />
        </div>
      </MenuSection>

      <MenuStartButton onClick={onConfirm}>Race</MenuStartButton>
    </MenuStageOverlay>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={statLabelStyle}>{label}</div>
      <div style={statValueStyle}>{value}</div>
    </div>
  )
}

const subtitleStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: 14,
  fontWeight: 700,
  opacity: 0.95,
}

const blurbStyle: React.CSSProperties = {
  marginTop: -4,
  fontSize: 12,
  color: menuTheme.textHint,
  textAlign: 'center',
}

const partListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
}

const derivationGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 8,
}

const statLabelStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  color: menuTheme.textMuted,
}

const statValueStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
}
