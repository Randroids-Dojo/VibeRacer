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
  MenuSection,
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

// Reusable card style for each part option. Mirrors PreRaceSetup's setup
// picker: cream cards with a thick dark outline when unselected, solid
// accent fill when selected so the active row pops against the dark
// translucent panel underneath.
function partRowStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    width: '100%',
    textAlign: 'left',
    padding: '10px 12px',
    background: active ? menuTheme.accentBg : '#fff8d6',
    border: `2px solid ${active ? menuTheme.accentBg : 'rgba(0,0,0,0.75)'}`,
    color: active ? menuTheme.accentText : '#1b1b1b',
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

// Sub-line under each row label. Lives inside the cream card, so the muted
// color is a translucent black rather than the panel-default gray.
function subTextStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    color: active ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.6)',
    letterSpacing: 0.3,
  }
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

// Garage now mounts as a full-screen page on the shared blue backdrop
// (variant='page' on MenuOverlay) instead of a black modal. The header
// strip and body panel mirror MenuPageShell so the picker sits inside
// the same two-piece dark-translucent stack the rest of the menu family
// uses, and the Race CTA matches the menu shell's red-pink primary.
const garageStageStyle: React.CSSProperties = {
  width: 'min(640px, 100%)',
  display: 'grid',
  gap: 14,
}

const garageHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '12px 18px',
  background: 'rgba(0,0,0,0.55)',
  borderRadius: 12,
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
}

const garageTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 800,
  letterSpacing: 1,
  color: '#fff',
}

const garagePanelStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.45)',
  padding: 24,
  borderRadius: 18,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
}

const garageStartBtnStyle: React.CSSProperties = {
  padding: '18px 24px',
  background: '#e84a5f',
  color: 'white',
  borderRadius: 12,
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: 0.5,
  boxShadow: '0 6px 0 #9c2a3c',
  border: 'none',
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
    <MenuOverlay zIndex={100} onBack={onBack} variant="page">
      <div style={garageStageStyle}>
        <header style={garageHeaderStyle}>
          <h1 style={garageTitleStyle}>GARAGE</h1>
        </header>
        <div style={garagePanelStyle}>
        <div style={{ textAlign: 'center', fontSize: 14, opacity: 0.85 }}>
          {strip.displayName}
        </div>
        <div style={blurbStyle}>{strip.blurb}</div>

        <MenuSection title="Tires">
          <div style={partListStyle} role="radiogroup" aria-label="Tires">
            {DRAG_TIRES.map((tire) => {
              const active = loadout.tire === tire.id
              return (
                <button
                  type="button"
                  key={tire.id}
                  role="radio"
                  aria-checked={active}
                  style={partRowStyle(active)}
                  onClick={() => onChange({ ...loadout, tire: tire.id })}
                >
                  <span>{tire.label}</span>
                  <span style={subTextStyle(active)}>
                    weight {tire.weight}, grip {tire.baseGrip}
                  </span>
                </button>
              )
            })}
          </div>
        </MenuSection>

        <MenuSection title="Body">
          <div style={partListStyle} role="radiogroup" aria-label="Body">
            {DRAG_BODIES.map((body) => {
              const active = loadout.body === body.id
              return (
                <button
                  type="button"
                  key={body.id}
                  role="radio"
                  aria-checked={active}
                  style={partRowStyle(active)}
                  onClick={() => onChange({ ...loadout, body: body.id })}
                >
                  <span>{body.label}</span>
                  <span style={subTextStyle(active)}>
                    weight {body.weight}, drag {body.dragCoefficient}
                  </span>
                </button>
              )
            })}
          </div>
        </MenuSection>

        <MenuSection title="Engine">
          <div style={partListStyle} role="radiogroup" aria-label="Engine">
            {DRAG_ENGINES.map((engine) => {
              const active = loadout.engine === engine.id
              return (
                <button
                  type="button"
                  key={engine.id}
                  role="radio"
                  aria-checked={active}
                  style={partRowStyle(active)}
                  onClick={() => onChange({ ...loadout, engine: engine.id })}
                >
                  <span>{engine.label}</span>
                  <span style={subTextStyle(active)}>
                    weight {engine.weight}, RPM {engine.launchRpm}
                  </span>
                </button>
              )
            })}
          </div>
        </MenuSection>

        <MenuSection title="Transmission">
          <div
            style={partListStyle}
            role="radiogroup"
            aria-label="Transmission"
          >
            {DRAG_TRANSMISSIONS.map((tr) => {
              const active = loadout.transmission === tr.id
              return (
                <button
                  type="button"
                  key={tr.id}
                  role="radio"
                  aria-checked={active}
                  style={partRowStyle(active)}
                  onClick={() =>
                    onChange({ ...loadout, transmission: tr.id })
                  }
                >
                  <span>{tr.label}</span>
                  <span style={subTextStyle(active)}>
                    1st {tr.firstGearRatio}, top {tr.topGearRatio}
                  </span>
                </button>
              )
            })}
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
          <MenuButton
            variant="primary"
            click="confirm"
            onClick={onConfirm}
            style={garageStartBtnStyle}
          >
            Race
          </MenuButton>
        </div>
        </div>
      </div>
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
