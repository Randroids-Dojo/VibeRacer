'use client'

import { useClickSfx, type ClickVariant } from '@/hooks/useClickSfx'

interface PauseMenuProps {
  onResume: () => void
  onRestart: () => void
  onEditTrack: () => void
  onLeaderboards: () => void
  onSettings: () => void
  onTuning: () => void
  onExit: () => void
}

export function PauseMenu({
  onResume,
  onRestart,
  onEditTrack,
  onLeaderboards,
  onSettings,
  onTuning,
  onExit,
}: PauseMenuProps) {
  return (
    <div style={overlay}>
      <div style={panel}>
        <div style={title}>PAUSED</div>
        <MenuButton label="Resume" onClick={onResume} variant="confirm" primary />
        <MenuButton label="Restart" onClick={onRestart} variant="confirm" />
        <MenuButton label="Edit Track" onClick={onEditTrack} variant="soft" />
        <MenuButton label="Leaderboards" onClick={onLeaderboards} variant="soft" />
        <MenuButton label="Setup" onClick={onTuning} variant="soft" />
        <MenuButton label="Settings" onClick={onSettings} variant="soft" />
        <MenuButton label="Exit to title" onClick={onExit} variant="back" />
        <div style={hint}>Esc to resume</div>
      </div>
    </div>
  )
}

function MenuButton({
  label,
  onClick,
  variant,
  primary,
}: {
  label: string
  onClick: () => void
  variant: ClickVariant
  primary?: boolean
}) {
  const click = useClickSfx(variant)
  return (
    <button
      onClick={() => {
        click()
        onClick()
      }}
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
