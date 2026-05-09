'use client'

interface DragHUDProps {
  elapsedMs: number
  speed: number
  fouled: boolean
  reactionTimeMs: number | null
  splits: number[]
  topSpeed: number
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
  top: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  fontSize: 56,
  fontWeight: 800,
  letterSpacing: 2,
  textShadow: '0 2px 6px rgba(0,0,0,0.6)',
  fontVariantNumeric: 'tabular-nums',
}

const reactionRowStyle: React.CSSProperties = {
  position: 'absolute',
  top: 78,
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

const speedPanelStyle: React.CSSProperties = {
  position: 'absolute',
  right: 12,
  top: 56,
  padding: '8px 12px',
  background: '#161616cc',
  border: '1px solid #2a2a2a',
  borderRadius: 8,
  minWidth: 124,
  boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
  color: '#fff',
}

const labelStyle: React.CSSProperties = {
  opacity: 0.6,
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 1.2,
}

const valueLgStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  fontVariantNumeric: 'tabular-nums',
}

const valueMdStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
}

const splitsPanelStyle: React.CSSProperties = {
  position: 'absolute',
  right: 12,
  top: 162,
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
  speed,
  fouled,
  reactionTimeMs,
  splits,
  topSpeed,
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

      <div style={speedPanelStyle}>
        <div style={labelStyle}>Speed</div>
        <div style={valueLgStyle}>{speed.toFixed(1)}</div>
        <div style={{ ...labelStyle, marginTop: 6 }}>Top speed</div>
        <div style={valueMdStyle}>{topSpeed.toFixed(1)}</div>
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
