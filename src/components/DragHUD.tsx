'use client'

interface DragHUDProps {
  elapsedMs: number
  fouled: boolean
  reactionTimeMs: number | null
  splits: number[]
  gear: number
  // Total gears in the drag-mode gearbox, surfaced so the chip can show
  // "3 / 7" and the player always knows how many shifts are left.
  gearCount: number
}

function formatTime(ms: number): string {
  const seconds = ms / 1000
  return seconds.toFixed(2)
}

const overlayWrapStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  fontFamily: 'system-ui, sans-serif',
}

const heroTimerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 44,
  left: '50%',
  transform: 'translateX(-50%)',
  fontSize: 'clamp(32px, 10vw, 56px)',
  fontWeight: 800,
  letterSpacing: 1,
  textShadow: '0 2px 6px rgba(0,0,0,0.6)',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
}

const reactionRowStyle: React.CSSProperties = {
  position: 'absolute',
  top: 108,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  gap: 8,
  alignItems: 'center',
}

const fouledChipStyle: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 999,
  background: '#991b1b',
  color: '#fff',
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: 1,
  border: '1px solid #b91c1c',
}

const reactionPillStyle: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 999,
  background: '#161616cc',
  border: '1px solid #2a2a2a',
  color: 'rgba(255,255,255,0.85)',
  fontSize: 11,
  letterSpacing: 0.5,
}

const labelStyle: React.CSSProperties = {
  opacity: 0.6,
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 1.2,
}

// Bottom-left gear chip. Sits above the touch shifter on mobile so the
// player has the current gear, the upcoming shifter, and the speedometer
// arc in a single glance. Matches the dimensions of the road HUD's gear
// chip so the two modes feel like one game.
const gearChipStyle: React.CSSProperties = {
  position: 'absolute',
  left: 12,
  bottom: 'calc(140px + env(safe-area-inset-bottom, 0px))',
  padding: '6px 12px',
  background: '#161616cc',
  border: '1px solid rgba(255, 211, 107, 0.55)',
  borderRadius: 10,
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  fontFamily: 'system-ui, sans-serif',
  color: '#fff',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
}
const gearChipLabel: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 1.4,
  fontWeight: 700,
  opacity: 0.8,
}
const gearChipValue: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: 0.5,
  minWidth: '1ch',
  textAlign: 'center',
}
// Slash + total-gears suffix on the gear chip ("3/7"). Smaller and
// fainter than the live gear digit so the eye lands on the current
// gear first.
const gearChipDivider: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  opacity: 0.55,
  marginLeft: 2,
  letterSpacing: 0.2,
}
const gearChipHint: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: 1.2,
  opacity: 0.65,
}

const splitsPanelStyle: React.CSSProperties = {
  position: 'absolute',
  right: 12,
  top: 148,
  padding: '8px 12px',
  background: '#161616cc',
  border: '1px solid #2a2a2a',
  borderRadius: 8,
  fontSize: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 124,
  boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
  color: '#fff',
}

export function DragHUD({
  elapsedMs,
  fouled,
  reactionTimeMs,
  splits,
  gear,
  gearCount,
}: DragHUDProps) {
  return (
    <div style={overlayWrapStyle}>
      <div style={heroTimerStyle}>{formatTime(elapsedMs)}s</div>

      <div style={reactionRowStyle}>
        {fouled && <span style={fouledChipStyle}>JUMPED</span>}
        <span style={reactionPillStyle}>
          Reaction:{' '}
          {reactionTimeMs === null
            ? '--'
            : `${(reactionTimeMs / 1000).toFixed(2)}s`}
        </span>
      </div>

      <div style={gearChipStyle} data-testid="drag-gear-chip">
        <span style={gearChipLabel}>GEAR</span>
        <span style={gearChipValue}>
          {gear}
          <span style={gearChipDivider}>/{gearCount}</span>
        </span>
        <span style={gearChipHint}>MANUAL</span>
      </div>

      {splits.length > 0 && (
        <div style={splitsPanelStyle}>
          <div style={labelStyle}>Splits</div>
          {splits.map((tMs, i) => (
            <div
              key={i}
              style={{ display: 'flex', justifyContent: 'space-between' }}
            >
              <span style={{ opacity: 0.6 }}>cp{i + 1}</span>
              <span>{formatTime(tMs)}s</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
