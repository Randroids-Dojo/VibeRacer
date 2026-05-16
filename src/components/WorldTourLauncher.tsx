'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  getStandardChampionship,
} from '@/data/worldTourChampionship'
import type { Tour } from '@/lib/worldTourChampionship'
import { defaultCareer, type WorldTourCareer } from '@/game/worldTourCareer'
import {
  WORLD_TOUR_CAREER_EVENT,
  readCareer,
  writeCareer,
} from '@/lib/worldTourCareerStorage'

type TourCardState = 'available' | 'in-progress' | 'completed' | 'locked'

interface TourCard {
  tour: Tour
  state: TourCardState
  raceIndex: number | null
}

function classifyTour(tour: Tour, career: WorldTourCareer): TourCard {
  if (career.activeTour?.tourId === tour.id) {
    return { tour, state: 'in-progress', raceIndex: career.activeTour.raceIndex }
  }
  if (career.completedTourIds.includes(tour.id)) {
    return { tour, state: 'completed', raceIndex: null }
  }
  if (career.unlockedTourIds.includes(tour.id)) {
    return { tour, state: 'available', raceIndex: null }
  }
  return { tour, state: 'locked', raceIndex: null }
}

export function WorldTourLauncher() {
  const router = useRouter()
  const championship = useMemo(() => getStandardChampionship(), [])
  const [career, setCareer] = useState<WorldTourCareer | null>(null)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    setMounted(true)
    setCareer(readCareer())
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<WorldTourCareer>).detail
      if (detail) setCareer(detail)
      else setCareer(readCareer())
    }
    window.addEventListener(WORLD_TOUR_CAREER_EVENT, onChange)
    return () => window.removeEventListener(WORLD_TOUR_CAREER_EVENT, onChange)
  }, [])

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

  const activeCareer = career ?? defaultCareer()
  const cards = championship.tours.map((t) => classifyTour(t, activeCareer))

  const isFresh =
    career === null ||
    (career.activeTour === null &&
      career.completedTourIds.length === 0 &&
      career.money === defaultCareer().money)
  const subline = isFresh
    ? 'Start your career'
    : career && career.activeTour
      ? `Resume: ${career.activeTour.tourId} (race ${career.activeTour.raceIndex + 1} of 4)`
      : `${career?.completedTourIds.length ?? 0} tours complete | ${career?.money ?? 0}c`

  function enterTour(card: TourCard) {
    if (card.state === 'locked') return
    let raceIndex = 0
    if (card.state === 'in-progress' && activeCareer.activeTour) {
      raceIndex = activeCareer.activeTour.raceIndex
    } else {
      const nextCareer: WorldTourCareer = {
        ...activeCareer,
        activeTour: {
          tourId: card.tour.id,
          raceIndex: 0,
          results: [],
        },
      }
      writeCareer(nextCareer)
    }
    setOpen(false)
    router.push(
      `/tour/race?tour=${encodeURIComponent(card.tour.id)}&raceIndex=${raceIndex}`,
    )
  }

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
              aria-label="World Tour"
            >
              <header style={headerStyle}>
                <h2 style={titleStyle}>World Tour</h2>
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
                <p style={tagBlurbStyle}>
                  Eight tours, four races each. Place inside the gate to
                  unlock the next region.
                </p>

                <section style={summaryStyle}>
                  <div style={summaryRowStyle}>
                    <span style={summaryLabelStyle}>Credits</span>
                    <strong>{activeCareer.money.toLocaleString()}</strong>
                  </div>
                  <div style={summaryRowStyle}>
                    <span style={summaryLabelStyle}>Active car</span>
                    <strong>{activeCareer.activeCarId}</strong>
                  </div>
                  <div style={summaryRowStyle}>
                    <span style={summaryLabelStyle}>Completed</span>
                    <strong>{activeCareer.completedTourIds.length}</strong>
                  </div>
                </section>

                <div style={sectionStyle}>
                  <div style={sectionHeaderStyle}>Tours</div>
                  <div style={cardGridStyle}>
                    {cards.map((card) => (
                      <button
                        key={card.tour.id}
                        type="button"
                        disabled={card.state === 'locked'}
                        onClick={() => enterTour(card)}
                        style={{
                          ...cardStyle,
                          background:
                            card.state === 'locked'
                              ? cardStyle.background
                              : `linear-gradient(135deg, ${card.tour.theme.secondary}66 0%, ${card.tour.theme.primary}33 100%)`,
                          borderColor: card.tour.theme.accent + '55',
                          opacity: card.state === 'locked' ? 0.45 : 1,
                          cursor:
                            card.state === 'locked' ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <div
                          style={{
                            ...cardTitleStyle,
                            color: card.tour.theme.accent,
                          }}
                        >
                          {card.tour.name}
                        </div>
                        <div style={cardBlurbStyle}>
                          {card.tour.region} | {card.tour.trackIds.length} races
                        </div>
                        <div style={pillRowStyle}>
                          <Pill>
                            Top {card.tour.requiredStanding} of{' '}
                            {card.tour.fieldSize}
                          </Pill>
                          <Pill>{weatherLabel(card.tour.weather)}</Pill>
                          <Pill>{stateLabel(card)}</Pill>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
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
        <span>World Tour</span>
        <span style={sublineStyle}>{subline}</span>
      </button>
      {modal}
    </>
  )
}

function weatherLabel(w: string): string {
  switch (w) {
    case 'clear':
      return 'Clear'
    case 'cloudy':
      return 'Cloudy'
    case 'rainy':
      return 'Rain'
    case 'snow':
      return 'Snow'
    default:
      return w
  }
}

function stateLabel(card: TourCard): string {
  if (card.state === 'locked') return 'Locked'
  if (card.state === 'completed') return 'Completed'
  if (card.state === 'in-progress' && card.raceIndex !== null) {
    return `Race ${card.raceIndex + 1} of 4`
  }
  return 'Available'
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span style={pillStyle}>{children}</span>
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
const sublineStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 400,
  opacity: 0.7,
  marginTop: 2,
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
  width: 'min(600px, 100%)',
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
const tagBlurbStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  opacity: 0.85,
  lineHeight: 1.4,
}
const summaryStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.35)',
  padding: '12px 16px',
  borderRadius: 12,
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 12,
  border: '1px solid rgba(255,255,255,0.08)',
}
const summaryRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  fontSize: 14,
}
const summaryLabelStyle: React.CSSProperties = {
  opacity: 0.6,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
}
const sectionStyle: React.CSSProperties = {
  paddingTop: 4,
}
const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  opacity: 0.75,
  marginBottom: 10,
  fontWeight: 600,
}
const cardGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
}
const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: 'inherit',
  textAlign: 'left',
  padding: 14,
  borderRadius: 10,
  display: 'grid',
  gap: 6,
  fontFamily: 'inherit',
}
const cardTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
}
const cardBlurbStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
}
const pillRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}
const pillStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  borderRadius: 999,
  fontSize: 11,
  padding: '2px 8px',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
}
