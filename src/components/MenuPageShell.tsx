import Link from 'next/link'
import type { ReactNode } from 'react'

interface Props {
  title: string
  // Optional intro line shown above the main panel content. Mirrors the
  // little "Pick an arena..." style blurbs the prior menus had.
  blurb?: string
  // Optional href for the CLOSE pill. Defaults to the title screen so a
  // top-level menu (Free Race, Derby, Tour, Drag) returns home; nested
  // menus (Derby vehicle picker) can override to the parent hub.
  closeHref?: string
  closeLabel?: string
  // 'narrow' matches the Free Race column (~480px). 'wide' is used by
  // menus that show a grid of cards (Derby, Tour, Drag).
  width?: 'narrow' | 'wide'
  children: ReactNode
}

// Shared chrome for every game-mode menu page so Free Race, Derby,
// World Tour, Drag, and the Derby vehicle picker all read as the same
// family. Sky-blue background, dark translucent header bar with CLOSE
// pill, and a dark translucent main panel wrapping the page content.
export function MenuPageShell({
  title,
  blurb,
  closeHref = '/',
  closeLabel = 'CLOSE',
  width = 'narrow',
  children,
}: Props) {
  return (
    <main style={pageStyle}>
      <div style={width === 'wide' ? stageStyleWide : stageStyleNarrow}>
        <header style={headerStyle}>
          <h1 style={titleStyle}>{title}</h1>
          <Link href={closeHref} style={closeBtnStyle} aria-label={closeLabel}>
            {closeLabel}
          </Link>
        </header>
        <div style={menuStyle}>
          {blurb ? <p style={blurbStyle}>{blurb}</p> : null}
          {children}
        </div>
      </div>
    </main>
  )
}

const pageStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: 24,
  background: '#9ad8ff',
  color: 'white',
  fontFamily: 'var(--font-cartoony), system-ui, sans-serif',
  boxSizing: 'border-box',
}
const stageStyleNarrow: React.CSSProperties = {
  position: 'relative',
  width: 'min(480px, 100%)',
  display: 'grid',
  gap: 14,
}
const stageStyleWide: React.CSSProperties = {
  ...stageStyleNarrow,
  width: 'min(640px, 100%)',
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
const blurbStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  opacity: 0.85,
  lineHeight: 1.4,
}

// Shared design tokens for menu page content (sections, cards, pills,
// primary CTA). Importable by the per-menu pages so the visual language
// stays in lockstep across Free Race, Derby, Tour, Drag, and the Derby
// vehicle picker.

export const menuStyles = {
  primaryBtn: {
    display: 'block',
    padding: '18px 24px',
    background: '#e84a5f',
    color: 'white',
    textDecoration: 'none',
    borderRadius: 12,
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: 0.5,
    textAlign: 'center',
    boxShadow: '0 6px 0 #9c2a3c',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
  } satisfies React.CSSProperties,
  section: {
    paddingTop: 8,
  } satisfies React.CSSProperties,
  sectionHeader: {
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    opacity: 0.75,
    marginBottom: 10,
    fontWeight: 600,
  } satisfies React.CSSProperties,
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  } satisfies React.CSSProperties,
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 16,
    background: '#161616',
    border: '1px solid #2a2a2a',
    borderRadius: 12,
    color: '#fff',
    textDecoration: 'none',
    fontFamily: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    boxShadow: '0 6px 0 rgba(0,0,0,0.55)',
    transition: 'transform 80ms ease, border-color 80ms ease',
  } satisfies React.CSSProperties,
  cardTitle: {
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: 0.5,
  } satisfies React.CSSProperties,
  cardBlurb: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 1.4,
  } satisfies React.CSSProperties,
  pillRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    fontSize: 11,
  } satisfies React.CSSProperties,
  pill: {
    padding: '2px 8px',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.08)',
    textTransform: 'capitalize',
    letterSpacing: 0.3,
  } satisfies React.CSSProperties,
  cardFooter: {
    marginTop: 4,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    fontVariantNumeric: 'tabular-nums',
  } satisfies React.CSSProperties,
}
