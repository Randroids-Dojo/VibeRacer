'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { defaultCareer, type WorldTourCareer } from '@/game/worldTourCareer'
import {
  WORLD_TOUR_CAREER_EVENT,
  readCareer,
} from '@/lib/worldTourCareerStorage'

interface Props {
  buttonStyle: React.CSSProperties
}

export function WorldTourTile({ buttonStyle }: Props) {
  const [career, setCareer] = useState<WorldTourCareer | null>(null)
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

  return (
    <Link href="/tour" style={buttonStyle}>
      <span>World Tour</span>
      <span style={sublineStyle}>{subline}</span>
    </Link>
  )
}

const sublineStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 400,
  opacity: 0.7,
  marginTop: 2,
}
