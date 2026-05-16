import Link from 'next/link'
import { DerbyArenaCards } from '@/components/DerbyArenaCards'

// Standalone /derby page. Mirrors the Free-Race-style launcher modal so a
// deep link lands on the same look the title-screen DerbyLauncher opens to.

export default async function DerbyHubPage() {
  return (
    <main style={pageStyle}>
      <div style={stageStyle}>
        <header style={headerStyle}>
          <h1 style={titleStyle}>Derby</h1>
          <Link href="/" style={closeBtnStyle} aria-label="Back to title">
            CLOSE
          </Link>
        </header>
        <div style={menuStyle}>
          <p style={tagStyle}>
            Pick an arena. Pick a vehicle. Last car standing.
          </p>
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>Arenas</div>
            <DerbyArenaCards />
          </div>
        </div>
      </div>
    </main>
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
  width: 'min(560px, 100%)',
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
  paddingTop: 8,
}
const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  opacity: 0.75,
  marginBottom: 10,
  fontWeight: 600,
}
