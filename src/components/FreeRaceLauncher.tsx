'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { SlugInput } from './SlugInput'
import { DailyStreak } from './DailyStreak'
import { FavoriteTracks } from './FavoriteTracks'
import { MyTracks } from './MyTracks'
import { MyPbs } from './MyPbs'
import { MostPlayed } from './MostPlayed'
import { LifetimeStats } from './LifetimeStats'
import { MedalCabinet } from './MedalCabinet'
import { TrophyCase } from './TrophyCase'

interface Props {
  playSlug: string
  hasRecent: boolean
  // Pre-rendered server components passed through the server/client boundary
  // so the launcher can stay a client component without dragging the daily
  // challenge or recent-tracks data-loading code (which uses node:crypto)
  // into the browser bundle.
  dailyChallengeSlot: ReactNode
  recentTracksSlot: ReactNode
}

// Launcher that opens the Free Race submenu. The trigger is styled like the
// other primary CTAs on the home page so it still reads as the main entry
// point. The submenu mirrors the home page panel's visual language so the
// dialog feels like an extension of the menu, not a foreign dialog.
export function FreeRaceLauncher({
  playSlug,
  hasRecent,
  dailyChallengeSlot,
  recentTracksSlot,
}: Props) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // While the submenu is open, mark <main> inert so the TitleGamepadNav
  // focus walker (and assistive tech) skip the underlying home page
  // controls. Wire Esc to close. On close, return focus to the trigger.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    const main = document.querySelector('main')
    if (main) main.setAttribute('inert', '')
    return () => {
      document.removeEventListener('keydown', onKey)
      if (main) main.removeAttribute('inert')
      triggerRef.current?.focus()
    }
  }, [open])

  const modal =
    open && mounted
      ? createPortal(
          <div
            style={backdropStyle}
            onClick={() => setOpen(false)}
            role="presentation"
          >
            <div
              style={panelOuterStyle}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Free Race"
            >
              <header style={headerStyle}>
                <h2 style={titleStyle}>Free Race</h2>
                <button
                  type="button"
                  style={closeBtnStyle}
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  CLOSE
                </button>
              </header>
              <div style={menuStyle}>
                <Link
                  href={`/${playSlug}`}
                  style={primaryBtnStyle}
                  onClick={() => setOpen(false)}
                >
                  Start a new race
                </Link>

                {dailyChallengeSlot}

                <DailyStreak />

                <div style={sectionStyle}>
                  <div style={sectionHeaderStyle}>Go to any track</div>
                  <SlugInput />
                </div>

                <div style={sectionStyle}>
                  <div style={sectionHeaderStyle}>
                    {hasRecent ? 'Load existing track' : 'Try a sample track'}
                  </div>
                  {recentTracksSlot}
                </div>

                <FavoriteTracks />

                <MyTracks />

                <MyPbs />

                <MostPlayed />

                <LifetimeStats />

                <MedalCabinet />

                <TrophyCase />
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        style={launchBtnStyle}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Free Race
      </button>
      {modal}
    </>
  )
}

const primaryBtnStyle: React.CSSProperties = {
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
}
const launchBtnStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  width: '100%',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 120,
  padding: 16,
  boxSizing: 'border-box',
  overflowY: 'auto',
  fontFamily: 'var(--font-cartoony), system-ui, sans-serif',
  color: 'white',
}
const panelOuterStyle: React.CSSProperties = {
  width: 'min(480px, 100%)',
  display: 'grid',
  gap: 14,
  maxHeight: 'calc(100vh - 32px)',
  overflowY: 'auto',
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
