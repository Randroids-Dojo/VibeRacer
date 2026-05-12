'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getStandardChampionship,
  STANDARD_CHAMPIONSHIP,
} from '@/data/worldTourChampionship'
import { findTour, tourDrivers, type Tour } from '@/lib/worldTourChampionship'
import {
  COUNTDOWN_SECONDS_DEFAULT,
  createRaceSession,
  stepRaceSession,
  type RaceSessionState,
} from '@/game/worldTourRaceSession'
import type { AiTrackView } from '@/game/worldTourAi'
import { DEFAULT_CAR_PARAMS } from '@/game/physics'
import { buildRaceResult } from '@/game/worldTourRaceResult'
import { applyRaceResult } from '@/game/worldTourProgress'
import {
  readCareer,
  writeCareer,
} from '@/lib/worldTourCareerStorage'
import { defaultCareer, getActiveCar } from '@/game/worldTourCareer'
import { WORLD_TOUR_LAST_RESULT_KEY } from '@/lib/worldTourLastResult'

const FLAT_TRACK: AiTrackView = {
  centerXAt: () => 0,
  curveAt: () => 0,
}

const TOTAL_LAPS = 2
const LAP_DISTANCE_METERS = 300
const INTRO_DURATION_MS = 2000

interface KeyState {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  handbrake: boolean
  paused: boolean
}

function createKeyState(): KeyState {
  return {
    forward: false,
    backward: false,
    left: false,
    right: false,
    handbrake: false,
    paused: false,
  }
}

export default function TourRacePage() {
  return (
    <Suspense fallback={<main style={pageStyle} />}>
      <TourRacePageInner />
    </Suspense>
  )
}

function TourRacePageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const championship = useMemo(() => getStandardChampionship(), [])
  const tourId = params.get('tour') ?? ''
  const raceIndex = Number(params.get('raceIndex') ?? '0')
  const tour = useMemo<Tour | null>(
    () => findTour(championship, tourId),
    [championship, tourId],
  )
  const drivers = useMemo(
    () => (tour ? tourDrivers(championship, tour) : null),
    [championship, tour],
  )

  const sessionRef = useRef<RaceSessionState | null>(null)
  const keyRef = useRef<KeyState>(createKeyState())
  const rafRef = useRef<number | null>(null)
  const lastFrameRef = useRef<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const submittedRef = useRef(false)
  const [hudPhase, setHudPhase] = useState<RaceSessionState['phase']>('countdown')
  const [hudCountdown, setHudCountdown] = useState(COUNTDOWN_SECONDS_DEFAULT)
  const [hudLap, setHudLap] = useState(0)
  // Brief intro card before the countdown starts. Dismisses on the
  // first input or after `INTRO_DURATION_MS`.
  const [showIntro, setShowIntro] = useState(true)

  // Reset the run when the route params change.
  useEffect(() => {
    submittedRef.current = false
    if (!tour || !drivers) return
    const career =
      typeof window !== 'undefined' ? readCareer() : defaultCareer()
    const activeCar = getActiveCar(career)
    // Two-lane grid for the 4-car MVP; three-lane grid (3 x 4 = 12)
    // once a tour scales to the full field.
    const laneCount = tour.fieldSize <= 4 ? 2 : 3
    sessionRef.current = createRaceSession({
      slotCount: tour.fieldSize,
      laneCount,
      aiDrivers: drivers.map((d) => ({ id: d.id })),
      seed: hashSeed(tour.id, raceIndex),
      totalLaps: TOTAL_LAPS,
      lapDistanceMeters: LAP_DISTANCE_METERS,
      playerCarId: career.activeCarId,
      playerInitialDamage: activeCar.damage,
      playerUpgrades: activeCar.upgrades,
    })
    setHudPhase('countdown')
    setHudCountdown(COUNTDOWN_SECONDS_DEFAULT)
    setHudLap(0)
    setShowIntro(true)
  }, [tour, drivers, raceIndex])

  // Auto-dismiss the intro card after the documented duration.
  useEffect(() => {
    if (!showIntro) return
    const timer = window.setTimeout(() => setShowIntro(false), INTRO_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [showIntro])

  // Keyboard handling.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = keyRef.current
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          k.forward = true
          break
        case 'KeyS':
        case 'ArrowDown':
          k.backward = true
          break
        case 'KeyA':
        case 'ArrowLeft':
          k.left = true
          break
        case 'KeyD':
        case 'ArrowRight':
          k.right = true
          break
        case 'Space':
          k.handbrake = true
          break
        case 'Escape':
          k.paused = !k.paused
          break
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const k = keyRef.current
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          k.forward = false
          break
        case 'KeyS':
        case 'ArrowDown':
          k.backward = false
          break
        case 'KeyA':
        case 'ArrowLeft':
          k.left = false
          break
        case 'KeyD':
        case 'ArrowRight':
          k.right = false
          break
        case 'Space':
          k.handbrake = false
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const submitResult = useCallback(() => {
    if (submittedRef.current) return
    const state = sessionRef.current
    if (!state || !tour) return
    submittedRef.current = true
    const career = readCareer()
    const raceResult = buildRaceResult({
      finalState: state,
      career,
      championship: STANDARD_CHAMPIONSHIP,
      tourId: tour.id,
      trackIndex: raceIndex,
      playerCarId: 'starter',
    })
    const applied = applyRaceResult({
      career,
      raceResult,
      championship: STANDARD_CHAMPIONSHIP,
    })
    writeCareer(applied.career)
    try {
      window.sessionStorage.setItem(
        WORLD_TOUR_LAST_RESULT_KEY,
        JSON.stringify(raceResult),
      )
    } catch {
      // best effort
    }
    router.push('/tour/results')
  }, [router, tour, raceIndex])

  // Game loop.
  useEffect(() => {
    if (!tour) return
    const loop = (timestamp: number) => {
      const prev = lastFrameRef.current
      const dt = prev === null ? 1 / 60 : Math.min(1 / 30, (timestamp - prev) / 1000)
      lastFrameRef.current = timestamp
      const k = keyRef.current
      // Hold the simulation while the intro card is on screen so the
      // countdown does not burn down behind it.
      if (!k.paused && !showIntro && sessionRef.current) {
        const playerInput = {
          throttle: (k.forward ? 1 : 0) + (k.backward ? -1 : 0),
          steer: (k.left ? 1 : 0) + (k.right ? -1 : 0),
          handbrake: k.handbrake,
        }
        sessionRef.current = stepRaceSession(
          sessionRef.current,
          {
            playerInput,
            dt,
            track: FLAT_TRACK,
            aiStats: { topSpeed: DEFAULT_CAR_PARAMS.maxSpeed },
          },
          { totalLaps: TOTAL_LAPS, lapDistanceMeters: LAP_DISTANCE_METERS },
        )
        const s = sessionRef.current
        setHudPhase(s.phase)
        setHudCountdown(Math.ceil(s.countdownRemainingSec))
        setHudLap(s.cars[0]?.lap ?? 0)
        if (s.phase === 'finished') {
          submitResult()
          return
        }
      }
      const canvas = canvasRef.current
      if (canvas && sessionRef.current) {
        drawScene(canvas, sessionRef.current)
      }
      rafRef.current = window.requestAnimationFrame(loop)
    }
    rafRef.current = window.requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
      lastFrameRef.current = null
    }
  }, [tour, submitResult, showIntro])

  if (!tour) {
    return (
      <main style={pageStyle}>
        <div style={stageStyle}>
          <h1>Unknown tour</h1>
          <Link href="/tour" style={backLinkStyle}>Back to tours</Link>
        </div>
      </main>
    )
  }

  return (
    <main style={pageStyle}>
      <div style={stageStyle}>
        <header style={headerStyle}>
          <div>
            <h1 style={titleStyle}>{tour.name}</h1>
            <p style={tagStyle}>
              Race {raceIndex + 1} of {tour.trackIds.length} | Lap {hudLap + 1}/{TOTAL_LAPS}
            </p>
          </div>
          <div style={hudStyle}>
            {hudPhase === 'countdown' ? (
              <strong style={countdownStyle}>{hudCountdown}</strong>
            ) : hudPhase === 'racing' ? (
              <span>GO</span>
            ) : (
              <span>Finishing...</span>
            )}
          </div>
        </header>

        <div style={{ position: 'relative' }}>
          <canvas
            ref={canvasRef}
            width={720}
            height={420}
            style={canvasStyle}
          />
          {showIntro ? (
            <div
              style={{
                ...introOverlayStyle,
                background: `linear-gradient(135deg, ${tour.theme.secondary}cc 0%, ${tour.theme.primary}99 100%)`,
              }}
              onClick={() => setShowIntro(false)}
              role="button"
              tabIndex={0}
            >
              <div style={introTitleStyle}>{tour.name}</div>
              <div style={introMetaStyle}>
                {tour.region} | Race {raceIndex + 1} of {tour.trackIds.length}
                {' '}| {tour.weather}
              </div>
              <div style={introMetaStyle}>
                Top {tour.requiredStanding} of {tour.fieldSize} to clear
              </div>
            </div>
          ) : null}
        </div>

        <footer style={footerStyle}>
          <span>WASD / Arrows: drive | Space: handbrake | Esc: pause</span>
          <Link href="/tour" style={backLinkStyle}>Quit race</Link>
        </footer>
      </div>
    </main>
  )
}

function hashSeed(tourId: string, raceIndex: number): number {
  let h = 0x811c9dc5
  const s = `${tourId}:${raceIndex}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function drawScene(canvas: HTMLCanvasElement, state: RaceSessionState) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.fillStyle = '#0c0a14'
  ctx.fillRect(0, 0, w, h)

  // Camera follows the player car.
  const player = state.cars[0]
  const camZ = player ? player.physics.z : 0
  const zoom = 6
  const cx = w / 2
  const cy = h / 2

  // Track rails.
  const halfWidth = 4
  ctx.strokeStyle = '#3a2858'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx - halfWidth * zoom, 0)
  ctx.lineTo(cx - halfWidth * zoom, h)
  ctx.moveTo(cx + halfWidth * zoom, 0)
  ctx.lineTo(cx + halfWidth * zoom, h)
  ctx.stroke()

  // Lap markers (one every 50 m).
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  for (let i = -10; i <= 10; i++) {
    const z = Math.round((camZ - i * 50) / 50) * 50
    const y = cy + (z - camZ) * zoom
    ctx.beginPath()
    ctx.moveTo(cx - halfWidth * zoom, y)
    ctx.lineTo(cx + halfWidth * zoom, y)
    ctx.stroke()
  }

  // Cars.
  for (const car of state.cars) {
    const dx = car.physics.x * zoom
    const dy = (car.physics.z - camZ) * zoom
    const x = cx + dx
    const y = cy + dy
    if (y < -20 || y > h + 20) continue
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(car.physics.heading)
    ctx.fillStyle = car.isPlayer
      ? '#fff1c4'
      : car.status === 'dnf'
        ? '#3a2858'
        : '#ff5470'
    ctx.fillRect(-4, -8, 8, 16)
    ctx.restore()
  }

  // HUD: speed for the player.
  if (player) {
    ctx.fillStyle = '#fff'
    ctx.font = '14px system-ui'
    const kmh = Math.round(Math.abs(player.physics.speed) * 3.6)
    ctx.fillText(`${kmh} km/h`, 12, h - 12)
  }
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  background: '#080612',
  color: '#fff',
  fontFamily: 'system-ui, sans-serif',
}
const stageStyle: React.CSSProperties = {
  width: 'min(760px, 100%)',
  display: 'grid',
  gap: 12,
}
const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
}
const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
}
const tagStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 13,
  opacity: 0.75,
}
const hudStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
}
const countdownStyle: React.CSSProperties = {
  fontSize: 40,
}
const canvasStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 720,
  height: 'auto',
  borderRadius: 8,
  background: '#0c0a14',
}
const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 12,
  opacity: 0.75,
}
const backLinkStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.65)',
  textDecoration: 'none',
}
const introOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  borderRadius: 8,
  cursor: 'pointer',
  textAlign: 'center',
}
const introTitleStyle: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 800,
  letterSpacing: 1,
}
const introMetaStyle: React.CSSProperties = {
  fontSize: 14,
  opacity: 0.9,
}
