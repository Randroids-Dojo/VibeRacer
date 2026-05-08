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

interface DragGarageProps {
  strip: DragStripConfig
  loadout: DragLoadout
  derivation: DragDerivation
  onChange: (next: DragLoadout) => void
  onConfirm: () => void
}

const COL_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const SECTION_STYLE: React.CSSProperties = {
  background: 'rgba(20,20,24,0.85)',
  borderRadius: 8,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const HEADING_STYLE: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  opacity: 0.65,
}

const BUTTON_BASE: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.18)',
  color: '#fff',
  borderRadius: 6,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  fontSize: 13,
}

function selectedStyle(active: boolean): React.CSSProperties {
  return active
    ? {
        ...BUTTON_BASE,
        background: 'rgba(154,216,255,0.2)',
        borderColor: '#9ad8ff',
      }
    : BUTTON_BASE
}

export function DragGarage({
  strip,
  loadout,
  derivation,
  onChange,
  onConfirm,
}: DragGarageProps) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        padding: 20,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          background: 'rgba(0,0,0,0.85)',
          padding: 22,
          borderRadius: 12,
          maxWidth: 980,
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
          color: '#fff',
        }}
      >
        <div style={{ gridColumn: '1 / -1' }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>Garage. {strip.displayName}</h2>
          <p style={{ marginTop: 4, opacity: 0.7, fontSize: 13 }}>{strip.blurb}</p>
        </div>

        <div style={SECTION_STYLE}>
          <div style={HEADING_STYLE}>Tires</div>
          <div style={COL_STYLE}>
            {DRAG_TIRES.map((tire) => (
              <button
                key={tire.id}
                style={selectedStyle(loadout.tire === tire.id)}
                onClick={() => onChange({ ...loadout, tire: tire.id })}
              >
                <span>{tire.label}</span>
                <span style={{ opacity: 0.6, fontSize: 11 }}>
                  weight {tire.weight}, grip {tire.baseGrip}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div style={SECTION_STYLE}>
          <div style={HEADING_STYLE}>Body</div>
          <div style={COL_STYLE}>
            {DRAG_BODIES.map((body) => (
              <button
                key={body.id}
                style={selectedStyle(loadout.body === body.id)}
                onClick={() => onChange({ ...loadout, body: body.id })}
              >
                <span>{body.label}</span>
                <span style={{ opacity: 0.6, fontSize: 11 }}>
                  weight {body.weight}, drag {body.dragCoefficient}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div style={SECTION_STYLE}>
          <div style={HEADING_STYLE}>Engine</div>
          <div style={COL_STYLE}>
            {DRAG_ENGINES.map((engine) => (
              <button
                key={engine.id}
                style={selectedStyle(loadout.engine === engine.id)}
                onClick={() => onChange({ ...loadout, engine: engine.id })}
              >
                <span>{engine.label}</span>
                <span style={{ opacity: 0.6, fontSize: 11 }}>
                  weight {engine.weight}, RPM {engine.launchRpm}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div style={SECTION_STYLE}>
          <div style={HEADING_STYLE}>Transmission</div>
          <div style={COL_STYLE}>
            {DRAG_TRANSMISSIONS.map((tr) => (
              <button
                key={tr.id}
                style={selectedStyle(loadout.transmission === tr.id)}
                onClick={() => onChange({ ...loadout, transmission: tr.id })}
              >
                <span>{tr.label}</span>
                <span style={{ opacity: 0.6, fontSize: 11 }}>
                  1st {tr.firstGearRatio}, top {tr.topGearRatio}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            ...SECTION_STYLE,
            gridColumn: '1 / -1',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
            fontSize: 12,
          }}
        >
          <Stat label="Total weight" value={derivation.totalWeight.toFixed(0)} />
          <Stat label="Accel" value={derivation.totalAccel.toFixed(2)} />
          <Stat label="Top speed" value={derivation.totalMaxSpeed.toFixed(2)} />
          <Stat
            label={`Surface (${derivation.surfaceKey})`}
            value={derivation.surfaceMul.toFixed(2)}
          />
          <Stat label="RPM factor" value={derivation.rpmFactor.toFixed(2)} />
          <Stat label="1st gear factor" value={derivation.firstGearFactor.toFixed(2)} />
          <Stat label="Top gear factor" value={derivation.topGearFactor.toFixed(2)} />
        </div>

        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onConfirm}
            style={{
              padding: '10px 22px',
              borderRadius: 6,
              border: 'none',
              background: '#22c55e',
              color: '#0a0a0a',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              letterSpacing: 1,
            }}
          >
            Race
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ ...HEADING_STYLE, fontSize: 11 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{value}</div>
    </div>
  )
}
