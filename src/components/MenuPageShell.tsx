import type { ReactNode } from 'react'
import { MenuShellStage } from './MenuUI'
import { menuTheme } from './menuTheme'

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
// World Tour, Drag, the Derby vehicle picker, and Settings all read as
// the same family. The two-piece header + body panel is delegated to
// MenuShellStage so the same primitive is reused by PreRaceSetup and
// DragGarage's full-page modals.
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
      <MenuShellStage
        title={title}
        closeHref={closeHref}
        closeLabel={closeLabel}
        width={width}
      >
        {blurb ? <p style={blurbStyle}>{blurb}</p> : null}
        {children}
      </MenuShellStage>
    </main>
  )
}

const pageStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: 20,
  background: menuTheme.pageBg,
  color: 'white',
  fontFamily: 'var(--font-cartoony), system-ui, sans-serif',
  boxSizing: 'border-box',
}
const blurbStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
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
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
  } satisfies React.CSSProperties,
  section: {
    paddingTop: 6,
  } satisfies React.CSSProperties,
  sectionHeader: {
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    opacity: 0.75,
    marginBottom: 8,
    fontWeight: 600,
  } satisfies React.CSSProperties,
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 10,
  } satisfies React.CSSProperties,
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 14,
    background: menuTheme.cardBg,
    border: `2px solid ${menuTheme.cardBorder}`,
    borderRadius: 12,
    color: menuTheme.cardText,
    textDecoration: 'none',
    fontFamily: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    boxShadow: menuTheme.cardShadow,
    transition: 'transform 80ms ease, border-color 80ms ease',
    minWidth: 0,
  } satisfies React.CSSProperties,
  cardTitle: {
    fontSize: 17,
    fontWeight: 800,
    letterSpacing: 0.5,
  } satisfies React.CSSProperties,
  cardBlurb: {
    fontSize: 12,
    color: menuTheme.cardMutedText,
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
    background: 'rgba(0,0,0,0.08)',
    border: '1px solid rgba(0,0,0,0.18)',
    textTransform: 'capitalize',
    letterSpacing: 0.3,
  } satisfies React.CSSProperties,
  cardFooter: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(0,0,0,0.85)',
    fontVariantNumeric: 'tabular-nums',
  } satisfies React.CSSProperties,
}
