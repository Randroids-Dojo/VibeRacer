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
import { useKeyboard, type KeyInput } from '@/hooks/useKeyboard'
import { useControlSettings } from '@/hooks/useControlSettings'
import {
  readCareer,
  writeCareer,
} from '@/lib/worldTourCareerStorage'
import { defaultCareer, getActiveCar } from '@/game/worldTourCareer'
import { WORLD_TOUR_LAST_RESULT_KEY } from '@/lib/worldTourLastResult'
import { TouchControls } from '@/components/TouchControls'

const FLAT_TRACK: AiTrackView = {
  centerXAt: () => 0,
  curveAt: () => 0,
}

const TOTAL_LAPS = 2
const LAP_DISTANCE_METERS = 300
const INTRO_DURATION_MS = 2000

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
  const rawRaceIndex = params.get('raceIndex')
  const tour = useMemo<Tour | null>(
    () => findTour(championship, tourId),
    [championship, tourId],
  )
  const drivers = useMemo(
    () => (tour ? tourDrivers(championship, tour) : null),
    [championship, tour],
  )
  const raceIndex = clampRaceIndex(rawRaceIndex, tour?.trackIds.length ?? 1)
  const { settings } = useControlSettings()
  const keys = useKeyboard(settings.keyBindings)

  const sessionRef = useRef<RaceSessionState | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastFrameRef = useRef<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const submittedRef = useRef(false)
  const [hudPhase, setHudPhase] = useState<RaceSessionState['phase']>('countdown')
  const [hudCountdown, setHudCountdown] = useState(COUNTDOWN_SECONDS_DEFAULT)
  const [hudLap, setHudLap] = useState(0)
  const [paused, setPaused] = useState(false)
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
    setPaused(false)
    setShowIntro(true)
  }, [tour, drivers, raceIndex])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
    }
    resize()
    window.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('resize', resize)
    }
  }, [tour])

  // Auto-dismiss the intro card after the documented duration.
  useEffect(() => {
    if (!showIntro) return
    const timer = window.setTimeout(() => setShowIntro(false), INTRO_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [showIntro])

  // Route-level controls that are not part of the shared driving key map.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
        case 'KeyS':
        case 'ArrowDown':
        case 'KeyA':
        case 'ArrowLeft':
        case 'KeyD':
        case 'ArrowRight':
        case 'Space':
          setShowIntro(false)
          break
        case 'Escape':
          setShowIntro(false)
          setPaused((v) => !v)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
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
      playerCarId: career.activeCarId,
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
      // Hold the simulation while the intro card is on screen so the
      // countdown does not burn down behind it.
      if (!paused && !showIntro && sessionRef.current) {
        const playerInput = inputFromKeys(keys.current)
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
        drawScene(canvas, sessionRef.current, settings.camera)
      }
      rafRef.current = window.requestAnimationFrame(loop)
    }
    rafRef.current = window.requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
      lastFrameRef.current = null
    }
  }, [tour, submitResult, showIntro, paused, keys, settings.camera])

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
    <main style={pageStyle} data-testid="world-tour-race-page">
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
              <span>{paused ? 'PAUSED' : 'GO'}</span>
            ) : (
              <span>Finishing...</span>
            )}
          </div>
        </header>

        <div style={canvasWrapStyle}>
          <canvas
            ref={canvasRef}
            style={canvasStyle}
            data-testid="world-tour-race-canvas"
          />
          {showIntro ? (
            <button
              type="button"
              style={{
                ...introOverlayStyle,
                background: `linear-gradient(135deg, ${tour.theme.secondary}cc 0%, ${tour.theme.primary}99 100%)`,
              }}
              onClick={() => setShowIntro(false)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                e.stopPropagation()
                setShowIntro(false)
              }}
            >
              <div style={introTitleStyle}>{tour.name}</div>
              <div style={introMetaStyle}>
                {tour.region} | Race {raceIndex + 1} of {tour.trackIds.length}
                {' '}| {tour.weather}
              </div>
              <div style={introMetaStyle}>
                Top {tour.requiredStanding} of {tour.fieldSize} to clear
              </div>
            </button>
          ) : null}
        </div>

        <footer style={footerStyle}>
          <span>Drive with keyboard, touch, or mapped controls</span>
          <Link href="/tour" style={backLinkStyle}>Quit race</Link>
        </footer>
        <TouchControls
          keys={keys}
          enabled={!showIntro && !paused && hudPhase !== 'finished'}
          mode={settings.touchMode}
        />
        {!showIntro && hudPhase !== 'finished' ? (
          <button
            type="button"
            onClick={() => setPaused((v) => !v)}
            aria-label={paused ? 'Resume World Tour race' : 'Pause World Tour race'}
            style={pauseButtonStyle}
          >
            {paused ? 'GO' : 'II'}
          </button>
        ) : null}
      </div>
    </main>
  )
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function inputFromKeys(k: KeyInput) {
  const throttle =
    k.axes?.throttle ?? (k.forward ? 1 : 0) + (k.backward ? -1 : 0)
  const steer = k.axes?.steer ?? (k.left ? 1 : 0) + (k.right ? -1 : 0)
  return {
    throttle,
    steer,
    handbrake: k.handbrake,
  }
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

function clampRaceIndex(raw: string | null, trackCount: number): number {
  const parsed = Number(raw ?? '0')
  if (!Number.isFinite(parsed)) return 0
  const max = Math.max(0, Math.floor(trackCount) - 1)
  return Math.min(max, Math.max(0, Math.floor(parsed)))
}

function drawScene(
  canvas: HTMLCanvasElement,
  state: RaceSessionState,
  camera: { distance: number; lookAhead: number; fov: number },
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.fillStyle = '#0c0a14'
  ctx.fillRect(0, 0, w, h)

  // Camera follows the player car.
  const player = state.cars[0]
  const camZ = player ? player.physics.z : 0
  const fovScale = 70 / Math.max(50, Math.min(110, camera.fov))
  const distanceScale = 14 / Math.max(6, Math.min(28, camera.distance))
  const baseZoom = Math.min(w / 120, h / 150)
  const zoom = Math.max(2.4, Math.min(8, baseZoom * 1.7 * fovScale * distanceScale))
  const cx = w / 2
  const cy = h * 0.64
  const lookAhead = Math.max(0, Math.min(12, camera.lookAhead)) * 2.5

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
    const y = cy + (z - camZ + lookAhead) * zoom
    ctx.beginPath()
    ctx.moveTo(cx - halfWidth * zoom, y)
    ctx.lineTo(cx + halfWidth * zoom, y)
    ctx.stroke()
  }

  // Cars.
  for (const car of state.cars) {
    const dx = car.physics.x * zoom
    const dy = (car.physics.z - camZ + lookAhead) * zoom
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
  position: 'fixed',
  inset: 0,
  minHeight: '100dvh',
  overflow: 'hidden',
  padding: 0,
  background: '#080612',
  color: '#fff',
  fontFamily: 'system-ui, sans-serif',
  touchAction: 'none',
  WebkitUserSelect: 'none',
  userSelect: 'none',
  WebkitTouchCallout: 'none',
}
const stageStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
}
const headerStyle: React.CSSProperties = {
  position: 'fixed',
  top: 12,
  left: 12,
  right: 12,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  zIndex: 10,
  pointerEvents: 'none',
}
const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'clamp(16px, 4vw, 22px)',
  fontWeight: 700,
  textShadow: '0 2px 10px rgba(0,0,0,0.7)',
}
const tagStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 'clamp(11px, 3vw, 13px)',
  opacity: 0.85,
  textShadow: '0 2px 10px rgba(0,0,0,0.7)',
}
const hudStyle: React.CSSProperties = {
  minWidth: 74,
  padding: '8px 10px',
  borderRadius: 8,
  background: 'rgba(0,0,0,0.5)',
  border: '1px solid rgba(255,255,255,0.18)',
  fontSize: 14,
  fontWeight: 700,
  textAlign: 'center',
}
const countdownStyle: React.CSSProperties = {
  fontSize: 34,
}
const canvasWrapStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1,
}
const canvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  background: '#0c0a14',
}
const footerStyle: React.CSSProperties = {
  position: 'fixed',
  left: 12,
  right: 12,
  bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  fontSize: 12,
  opacity: 0.85,
  zIndex: 10,
  pointerEvents: 'none',
}
const backLinkStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.65)',
  textDecoration: 'none',
  pointerEvents: 'auto',
}
const introOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  width: '100%',
  height: '100%',
  border: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  borderRadius: 8,
  cursor: 'pointer',
  textAlign: 'center',
  color: '#fff',
  font: 'inherit',
  padding: 24,
  zIndex: 30,
  touchAction: 'manipulation',
}
const introTitleStyle: React.CSSProperties = {
  fontSize: 'clamp(28px, 10vw, 54px)',
  fontWeight: 800,
  letterSpacing: 1,
}
const introMetaStyle: React.CSSProperties = {
  fontSize: 'clamp(13px, 4vw, 16px)',
  opacity: 0.9,
}
const pauseButtonStyle: React.CSSProperties = {
  position: 'fixed',
  left: 20,
  bottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
  width: 64,
  height: 64,
  borderRadius: '50%',
  border: '2px solid rgba(255,255,255,0.25)',
  background: 'rgba(0,0,0,0.6)',
  color: '#fff',
  display: 'grid',
  placeItems: 'center',
  fontSize: 24,
  fontWeight: 900,
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
  zIndex: 20,
  touchAction: 'manipulation',
}
