import Link from 'next/link'
import { menuTheme } from '@/components/MenuUI'
import { TitleMusic } from '@/components/TitleMusic'
import { TitleBackground } from '@/components/TitleBackground'
import { TitleGamepadNav } from '@/components/TitleGamepadNav'
import { SettingsLauncher } from '@/components/SettingsLauncher'
import { TuningLaunchButton } from '@/components/TuningLaunchButton'
import { HowToPlayLauncher } from '@/components/HowToPlayLauncher'
import { FeatureListLauncher } from '@/components/FeatureListLauncher'

export default function HomePage() {
  return (
    <main style={mainStyle}>
      <TitleBackground />
      <TitleMusic />
      <TitleGamepadNav />
      <div style={skyFadeStyle} aria-hidden="true" />
      <section style={stageStyle}>
        <header style={logoWrapStyle}>
          <h1 style={logoStyle}>VibeRacer</h1>
          <p style={tagStyle}>Every URL is a track. Pick one and drive.</p>
        </header>

        <div style={menuStyle}>
          <Link href="/free-race" style={primaryBtnStyle}>
            Free Race
          </Link>

          <Link href="/drag" style={primaryBtnStyle}>
            Drag Racing
          </Link>

          <Link href="/derby" style={primaryBtnStyle}>
            Derby
          </Link>

          <Link href="/tour" style={primaryBtnStyle}>
            World Tour
          </Link>

          <TuningLaunchButton buttonStyle={settingsBtnStyle} />
          <SettingsLauncher buttonStyle={settingsBtnStyle} />
          <FeatureListLauncher buttonStyle={settingsBtnStyle} />
          <HowToPlayLauncher buttonStyle={settingsBtnStyle} />
          <Link href="/model-viewer" style={{ ...settingsBtnStyle, textDecoration: 'none' }}>
            Model Viewer
          </Link>
        </div>
      </section>
    </main>
  )
}

const mainStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  fontFamily: 'var(--font-cartoony), system-ui, sans-serif',
  color: 'white',
  padding: 20,
  overflow: 'hidden',
  background: menuTheme.pageBg,
}
const skyFadeStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1,
  background:
    'radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.35) 100%)',
  pointerEvents: 'none',
}
const stageStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 2,
  // `min(480px, 100%)` keeps the column readable on desktop while letting it
  // shrink to the available width on narrow phones. Using a fixed `width`
  // here used to size the grid track to 480px, so the section overflowed
  // its parent and dragged the centered title off the right edge.
  width: 'min(480px, 100%)',
  display: 'grid',
  gap: 28,
}
const logoWrapStyle: React.CSSProperties = {
  textAlign: 'center',
  textShadow: '0 4px 0 rgba(0,0,0,0.25), 0 10px 24px rgba(0,0,0,0.35)',
}
const logoStyle: React.CSSProperties = {
  margin: 0,
  // Scale tightly with viewport so the title fits on iPhone-class widths
  // without overflowing. The lower bound covers ultra-narrow devices; the
  // upper bound matches the original desktop size.
  fontSize: 'clamp(36px, 11vw, 88px)',
  fontWeight: 700,
  letterSpacing: 1,
  lineHeight: 0.95,
  color: '#fff7b0',
  WebkitTextStroke: '2px #1b1b1b',
  // Last-resort wrap so a future longer title or zoomed-in mobile font does
  // not bleed past the column edge.
  overflowWrap: 'anywhere',
}
const tagStyle: React.CSSProperties = {
  marginTop: 8,
  marginBottom: 0,
  fontSize: 16,
  fontWeight: 500,
  opacity: 0.95,
}
const menuStyle: React.CSSProperties = {
  background: menuTheme.shellPanelBg,
  padding: 18,
  borderRadius: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  boxShadow: menuTheme.shellShadow,
  backdropFilter: menuTheme.shellBlur,
  WebkitBackdropFilter: menuTheme.shellBlur,
}
const primaryBtnStyle: React.CSSProperties = {
  display: 'block',
  padding: '14px 20px',
  background: menuTheme.ctaBg,
  color: 'white',
  textDecoration: 'none',
  borderRadius: 12,
  fontSize: 20,
  fontWeight: 700,
  letterSpacing: 0.5,
  textAlign: 'center',
  boxShadow: `0 6px 0 ${menuTheme.ctaShadow}`,
}
const settingsBtnStyle: React.CSSProperties = {
  padding: '12px 16px',
  background: 'rgba(255,255,255,0.1)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 10,
  fontSize: 15,
  fontFamily: 'inherit',
  fontWeight: 600,
  textAlign: 'center',
  cursor: 'pointer',
}
