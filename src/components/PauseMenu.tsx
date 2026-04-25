'use client'

interface PauseMenuProps {
  onResume: () => void
  onRestart: () => void
  onEditTrack: () => void
  onLeaderboards: () => void
  onSettings: () => void
  onExit: () => void
}

export function PauseMenu({
  onResume,
  onRestart,
  onEditTrack,
  onLeaderboards,
  onSettings,
  onExit,
}: PauseMenuProps) {
  return (
    <div style={overlay}>
      <div style={panel}>
        <div style={title}>PAUSED</div>
        <MenuButton label="Resume" onClick={onResume} primary />
        <MenuButton label="Restart" onClick={onRestart} />
        <MenuButton label="Edit Track" onClick={onEditTrack} />
        <MenuButton label="Leaderboards" onClick={onLeaderboards} />
        <MenuButton label="Settings" onClick={onSettings} />
        <MenuButton label="Exit to title" onClick={onExit} />
        <div style={hint}>Esc to resume</div>
      </div>
    </div>
  )
}

function MenuButton({
  label,
  onClick,
  primary,
}: {
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...btn,
        background: primary ? '#ff6b35' : '#2a2a2a',
        color: 'white',
      }}
    >
      {label}
    </button>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 100,
  fontFamily: 'system-ui, sans-serif',
}
const panel: React.CSSProperties = {
  background: '#1a1a1a',
  color: 'white',
  borderRadius: 12,
  padding: '22px 26px',
  minWidth: 260,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  border: '1px solid #333',
}
const title: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  letterSpacing: 2,
  textAlign: 'center',
  marginBottom: 6,
}
const btn: React.CSSProperties = {
  border: 'none',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const hint: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.55,
  textAlign: 'center',
  marginTop: 4,
  letterSpacing: 1.2,
}
