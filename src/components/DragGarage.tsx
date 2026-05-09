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
  MenuButton,
  MenuOverlay,
  MenuPanel,
  MenuSection,
  MenuTitle,
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

// Reusable card style for each part option. Borrowed directly from the
// project's MenuRadioRow look so the garage feels like part of the same
// app instead of a third-party widget.
function partRowStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    width: '100%',
    textAlign: 'left',
    padding: '10px 12px',
    background: active ? 'rgba(255,107,53,0.16)' : menuTheme.rowBg,
    border: `1px solid ${active ? menuTheme.accent : menuTheme.panelBorder}`,
    color: menuTheme.textPrimary,
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontFamily: 'inherit',
  }
}

const partListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const subTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: menuTheme.textMuted,
  letterSpacing: 0.3,
}

const blurbStyle: React.CSSProperties = {
  marginTop: -4,
  fontSize: 13,
  color: menuTheme.textHint,
}

const derivationGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 10,
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

const ctaRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  marginTop: 4,
}

export function DragGarage({
  strip,
  loadout,
  derivation,
  onChange,
  onConfirm,
  onBack,
}: DragGarageProps) {
  return (
    <MenuOverlay zIndex={100} onBack={onBack}>
      <MenuPanel width="wide">
        <MenuTitle>GARAGE</MenuTitle>
        <div style={{ textAlign: 'center', fontSize: 14, opacity: 0.85 }}>
          {strip.displayName}
        </div>
        <div style={blurbStyle}>{strip.blurb}</div>

        <MenuSection title="Tires">
          <div style={partListStyle}>
            {DRAG_TIRES.map((tire) => (
              <button
                type="button"
                key={tire.id}
                style={partRowStyle(loadout.tire === tire.id)}
                onClick={() => onChange({ ...loadout, tire: tire.id })}
              >
                <span>{tire.label}</span>
                <span style={subTextStyle}>
                  weight {tire.weight}, grip {tire.baseGrip}
                </span>
              </button>
            ))}
          </div>
        </MenuSection>

        <MenuSection title="Body">
          <div style={partListStyle}>
            {DRAG_BODIES.map((body) => (
              <button
                type="button"
                key={body.id}
                style={partRowStyle(loadout.body === body.id)}
                onClick={() => onChange({ ...loadout, body: body.id })}
              >
                <span>{body.label}</span>
                <span style={subTextStyle}>
                  weight {body.weight}, drag {body.dragCoefficient}
                </span>
              </button>
            ))}
          </div>
        </MenuSection>

        <MenuSection title="Engine">
          <div style={partListStyle}>
            {DRAG_ENGINES.map((engine) => (
              <button
                type="button"
                key={engine.id}
                style={partRowStyle(loadout.engine === engine.id)}
                onClick={() => onChange({ ...loadout, engine: engine.id })}
              >
                <span>{engine.label}</span>
                <span style={subTextStyle}>
                  weight {engine.weight}, RPM {engine.launchRpm}
                </span>
              </button>
            ))}
          </div>
        </MenuSection>

        <MenuSection title="Transmission">
          <div style={partListStyle}>
            {DRAG_TRANSMISSIONS.map((tr) => (
              <button
                type="button"
                key={tr.id}
                style={partRowStyle(loadout.transmission === tr.id)}
                onClick={() => onChange({ ...loadout, transmission: tr.id })}
              >
                <span>{tr.label}</span>
                <span style={subTextStyle}>
                  1st {tr.firstGearRatio}, top {tr.topGearRatio}
                </span>
              </button>
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

        <div style={ctaRowStyle}>
          <MenuButton variant="primary" click="confirm" onClick={onConfirm}>
            Race
          </MenuButton>
        </div>
      </MenuPanel>
    </MenuOverlay>
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
