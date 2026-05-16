'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
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

// Standalone /tour page. Mirrors the Free-Race-style WorldTourLauncher
// modal so a deep link lands on the same look the title-screen launcher
// opens to.

export default function TourSelectionPage() {
  const router = useRouter()
  const championship = useMemo(() => getStandardChampionship(), [])
  const [career, setCareer] = useState<WorldTourCareer>(() => defaultCareer())

  useEffect(() => {
    setCareer(readCareer())
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<WorldTourCareer>).detail
      if (detail) setCareer(detail)
      else setCareer(readCareer())
    }
    window.addEventListener(WORLD_TOUR_CAREER_EVENT, onChange)
    return () => window.removeEventListener(WORLD_TOUR_CAREER_EVENT, onChange)
  }, [])

  const cards = championship.tours.map((t) => classifyTour(t, career))

  function enterTour(card: TourCard) {
    if (card.state === 'locked') return
    let raceIndex = 0
    if (card.state === 'in-progress' && career.activeTour) {
      raceIndex = career.activeTour.raceIndex
    } else {
      const nextCareer: WorldTourCareer = {
        ...career,
        activeTour: {
          tourId: card.tour.id,
          raceIndex: 0,
          results: [],
        },
      }
      writeCareer(nextCareer)
    }
    router.push(
      `/tour/race?tour=${encodeURIComponent(card.tour.id)}&raceIndex=${raceIndex}`,
    )
  }

  return (
    <main style={pageStyle}>
      <div style={stageStyle}>
        <header style={headerStyle}>
          <h1 style={titleStyle}>World Tour</h1>
          <Link href="/" style={closeBtnStyle} aria-label="Back to title">
            CLOSE
          </Link>
        </header>

        <div style={menuStyle}>
          <p style={tagBlurbStyle}>
            Eight tours, four races each. Place inside the gate to unlock the
            next region.
          </p>

          <section style={summaryStyle}>
            <div style={summaryRowStyle}>
              <span style={summaryLabelStyle}>Credits</span>
              <strong>{career.money.toLocaleString()}</strong>
            </div>
            <div style={summaryRowStyle}>
              <span style={summaryLabelStyle}>Active car</span>
              <strong>{career.activeCarId}</strong>
            </div>
            <div style={summaryRowStyle}>
              <span style={summaryLabelStyle}>Completed</span>
              <strong>{career.completedTourIds.length}</strong>
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
                      Top {card.tour.requiredStanding} of {card.tour.fieldSize}
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
    </main>
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

const pageStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background:
    'radial-gradient(ellipse at top, #2a1a3a 0%, #0a0a0a 60%, #050505 100%)',
  color: '#fff',
  fontFamily: 'var(--font-cartoony), system-ui, sans-serif',
  boxSizing: 'border-box',
}
const stageStyle: React.CSSProperties = {
  position: 'relative',
  width: 'min(600px, 100%)',
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
