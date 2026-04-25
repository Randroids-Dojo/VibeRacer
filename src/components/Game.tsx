'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WebGLRenderer } from 'three'
import type { Piece } from '@/lib/schemas'
import { buildTrackPath } from '@/game/trackPath'
import {
  buildScene,
  initCameraRig,
  updateCameraRig,
  type CameraRigState,
} from '@/game/sceneBuilder'
import {
  initGameState,
  startRace,
  tick,
  type LapCompleteEvent,
} from '@/game/tick'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useControlSettings } from '@/hooks/useControlSettings'
import { InitialsPrompt, readStoredInitials } from './InitialsPrompt'
import { Countdown } from './Countdown'
import { HUD } from './HUD'
import { PauseMenu } from './PauseMenu'
import { FeedbackFab } from './FeedbackFab'
import { TouchControls } from './TouchControls'
import { SettingsPane } from './SettingsPane'
import { readLocalBest, writeLocalBest } from '@/lib/localBest'
import { Leaderboard } from './Leaderboard'
import {
  PAUSE_CROSSFADE_SEC,
  RACE_START_CROSSFADE_SEC,
  crossfadeTo,
  setGameIntensity,
} from '@/game/music'
import { TitleMusic } from './TitleMusic'
import { DEFAULT_CAR_PARAMS } from '@/game/physics'

export interface OverallRecord {
  initials: string
  lapTimeMs: number
}

interface GameProps {
  slug: string
  versionHash: string
  pieces: Piece[]
  initialRecord: OverallRecord | null
}

export function Game(props: GameProps) {
  const [initials, setInitials] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    setInitials(readStoredInitials())
  }, [])

  if (initials === undefined) {
    return <div style={loading}>Loading...</div>
  }

  if (initials === null) {
    return <InitialsPrompt onDone={(v) => setInitials(v)} />
  }

  return <GameSession {...props} initials={initials} />
}

type Phase = 'countdown' | 'racing'

interface SessionProps extends GameProps {
  initials: string
}

interface HudState {
  currentMs: number
  lastLapMs: number | null
  bestSessionMs: number | null
  bestAllTimeMs: number | null
  overallRecord: OverallRecord | null
  lapCount: number
  onTrack: boolean
  toast: string | null
}

type PauseView = 'menu' | 'leaderboard' | 'settings'

const HUD_UPDATE_MS = 50 // Throttle HUD re-renders to ~20Hz; game loop still runs at 60Hz.

function GameSession({
  slug,
  versionHash,
  pieces,
  initials,
  initialRecord,
}: SessionProps) {
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { settings, setSettings, resetSettings } = useControlSettings()
  const keys = useKeyboard(settings.keyBindings)
  const tokenRef = useRef<string | null>(null)
  const submittingRef = useRef(false)
  const pendingRaceStartRef = useRef<number | null>(null)
  const pendingResetRef = useRef(false)
  const pausedRef = useRef(false)
  const pauseStartTsRef = useRef<number | null>(null)
  const resumeShiftRef = useRef(0)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [phase, setPhase] = useState<Phase>('countdown')
  const [paused, setPaused] = useState(false)
  const [pauseView, setPauseView] = useState<PauseView>('menu')
  const [hud, setHud] = useState<HudState>(() => ({
    currentMs: 0,
    lastLapMs: null,
    bestSessionMs: null,
    bestAllTimeMs: readLocalBest(slug, versionHash),
    overallRecord: initialRecord,
    lapCount: 0,
    onTrack: true,
    toast: null,
  }))

  const pause = useCallback(() => {
    if (pausedRef.current) return
    pausedRef.current = true
    pauseStartTsRef.current = performance.now()
    crossfadeTo('pause', PAUSE_CROSSFADE_SEC)
    setPauseView('menu')
    setPaused(true)
  }, [])

  const resume = useCallback(() => {
    if (!pausedRef.current) return
    if (pauseStartTsRef.current !== null) {
      resumeShiftRef.current += performance.now() - pauseStartTsRef.current
      pauseStartTsRef.current = null
    }
    pausedRef.current = false
    crossfadeTo('game', PAUSE_CROSSFADE_SEC)
    // Drop keyboard focus so driving keys land on document.body, not a lingering
    // input/button from the pause UI. Also clear any held-key state that may
    // have been mid-press when focus shifted into an input while paused.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    keys.current.forward = false
    keys.current.backward = false
    keys.current.left = false
    keys.current.right = false
    keys.current.handbrake = false
    setPaused(false)
  }, [keys])

  const restart = useCallback(() => {
    pausedRef.current = false
    pauseStartTsRef.current = null
    resumeShiftRef.current = 0
    pendingResetRef.current = true
    tokenRef.current = null
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    crossfadeTo('title', PAUSE_CROSSFADE_SEC)
    setPaused(false)
    setHud((prev) => ({
      ...prev,
      currentMs: 0,
      lastLapMs: null,
      bestSessionMs: null,
      lapCount: 0,
      onTrack: true,
      toast: null,
    }))
    setPhase('countdown')
  }, [])

  const exitToTitle = useCallback(() => {
    router.push('/')
  }, [router])

  const editTrack = useCallback(() => {
    router.push(`/${slug}/edit`)
  }, [router, slug])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (phase !== 'racing') return
      e.preventDefault()
      if (pausedRef.current) resume()
      else pause()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, pause, resume])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const path = buildTrackPath(pieces)
    const bundle = buildScene(path)
    const renderer = new WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    function resize() {
      const el = canvasRef.current
      if (!el) return
      renderer.setSize(el.clientWidth, el.clientHeight, false)
      bundle.camera.aspect = el.clientWidth / el.clientHeight
      bundle.camera.updateProjectionMatrix()
    }
    resize()
    window.addEventListener('resize', resize)

    let state = initGameState(path)
    const rig: CameraRigState = initCameraRig(state.x, state.z, state.heading)

    function resetRigFromState() {
      Object.assign(rig, initCameraRig(state.x, state.z, state.heading))
    }

    bundle.car.position.set(state.x, 0, state.z)
    bundle.car.rotation.y = state.heading
    bundle.camera.position.set(rig.position.x, rig.position.y, rig.position.z)
    bundle.camera.lookAt(rig.target.x, rig.target.y, rig.target.z)
    renderer.render(bundle.scene, bundle.camera)

    let raf = 0
    let lastTs = performance.now()
    let lastHudTs = 0
    let running = true

    function loop(ts: number) {
      if (!running) return

      if (pendingResetRef.current) {
        state = initGameState(path)
        resetRigFromState()
        bundle.car.position.set(state.x, 0, state.z)
        bundle.car.rotation.y = state.heading
        bundle.camera.position.set(rig.position.x, rig.position.y, rig.position.z)
        bundle.camera.lookAt(rig.target.x, rig.target.y, rig.target.z)
        renderer.render(bundle.scene, bundle.camera)
        pendingResetRef.current = false
        pendingRaceStartRef.current = null
        lastTs = ts
        raf = requestAnimationFrame(loop)
        return
      }

      if (pausedRef.current) {
        lastTs = ts
        raf = requestAnimationFrame(loop)
        return
      }

      if (resumeShiftRef.current > 0) {
        if (state.raceStartMs !== null) {
          state = {
            ...state,
            raceStartMs: state.raceStartMs + resumeShiftRef.current,
          }
        }
        resumeShiftRef.current = 0
        lastTs = ts
      }

      const dtMs = Math.min(50, ts - lastTs)
      lastTs = ts

      if (pendingRaceStartRef.current !== null) {
        state = startRace(state, pendingRaceStartRef.current)
        pendingRaceStartRef.current = null
      }

      const k = keys.current
      const result = tick(
        state,
        {
          throttle: (k.forward ? 1 : 0) + (k.backward ? -1 : 0),
          steer: (k.left ? 1 : 0) + (k.right ? -1 : 0),
          handbrake: k.handbrake,
        },
        dtMs,
        ts,
        path,
      )
      state = result.state

      bundle.car.position.set(state.x, 0, state.z)
      bundle.car.rotation.y = state.heading
      updateCameraRig(rig, state.x, state.z, state.heading)
      bundle.camera.position.set(rig.position.x, rig.position.y, rig.position.z)
      bundle.camera.lookAt(rig.target.x, rig.target.y, rig.target.z)
      renderer.render(bundle.scene, bundle.camera)

      setGameIntensity(Math.abs(state.speed) / DEFAULT_CAR_PARAMS.maxSpeed)

      if (result.lapComplete) handleLapComplete(result.lapComplete)

      if (ts - lastHudTs >= HUD_UPDATE_MS) {
        lastHudTs = ts
        const currentMs =
          state.raceStartMs !== null ? Math.round(ts - state.raceStartMs) : 0
        const lapCount = state.lapCount
        const onTrack = state.onTrack
        const lastLapMs = state.lastLapTimeMs
        setHud((prev) => {
          if (
            prev.currentMs === currentMs &&
            prev.lapCount === lapCount &&
            prev.onTrack === onTrack &&
            prev.lastLapMs === lastLapMs
          ) {
            return prev
          }
          return { ...prev, currentMs, lapCount, onTrack, lastLapMs: lastLapMs ?? prev.lastLapMs }
        })
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      bundle.dispose()
      renderer.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces])

  function handleLapComplete(event: LapCompleteEvent) {
    const lapMs = event.lapTimeMs
    setHud((prev) => {
      const isSessionPb = prev.bestSessionMs === null || lapMs < prev.bestSessionMs
      const isAllTimePb = prev.bestAllTimeMs === null || lapMs < prev.bestAllTimeMs
      const isNewRecord =
        prev.overallRecord === null || lapMs < prev.overallRecord.lapTimeMs
      if (isAllTimePb) writeLocalBest(slug, versionHash, lapMs)
      const toast = isNewRecord
        ? 'NEW RECORD!'
        : isAllTimePb
          ? 'NEW PB!'
          : `lap ${event.lapNumber} saved`
      return {
        ...prev,
        bestSessionMs: isSessionPb ? lapMs : prev.bestSessionMs,
        bestAllTimeMs: isAllTimePb ? lapMs : prev.bestAllTimeMs,
        overallRecord: isNewRecord
          ? { initials, lapTimeMs: lapMs }
          : prev.overallRecord,
        toast,
      }
    })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setHud((prev) => ({ ...prev, toast: null }))
      toastTimerRef.current = null
    }, 1800)

    void submitLap(event)
  }

  async function startRaceServerSide() {
    try {
      const res = await fetch(
        `/api/race/start?slug=${encodeURIComponent(slug)}&v=${versionHash}`,
        { method: 'POST' },
      )
      if (!res.ok) throw new Error('race start failed')
      const body = (await res.json()) as { token: string }
      tokenRef.current = body.token
    } catch {
      tokenRef.current = null
    }
  }

  async function submitLap(event: LapCompleteEvent) {
    if (submittingRef.current) return
    const token = tokenRef.current
    if (!token) return
    submittingRef.current = true
    try {
      const res = await fetch(
        `/api/race/submit?slug=${encodeURIComponent(slug)}&v=${versionHash}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token,
            checkpoints: event.hits,
            lapTimeMs: event.lapTimeMs,
            initials,
          }),
        },
      )
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        nextToken?: string
      }
      if (body.ok && body.nextToken) tokenRef.current = body.nextToken
    } catch {
      // Local PB tracking already handled the lap.
    } finally {
      submittingRef.current = false
    }
  }

  function beginRace() {
    void startRaceServerSide()
    pendingRaceStartRef.current = performance.now()
    crossfadeTo('game', RACE_START_CROSSFADE_SEC)
    setPhase('racing')
  }

  return (
    <div style={root}>
      <TitleMusic />
      <canvas ref={canvasRef} style={canvasStyle} />
      <HUD
        currentMs={hud.currentMs}
        lastLapMs={hud.lastLapMs}
        bestSessionMs={hud.bestSessionMs}
        bestAllTimeMs={hud.bestAllTimeMs}
        overallRecord={hud.overallRecord}
        lapCount={hud.lapCount}
        onTrack={hud.onTrack}
        toast={hud.toast}
        initials={initials}
      />
      {phase === 'countdown' ? <Countdown onDone={beginRace} /> : null}
      <TouchControls
        keys={keys}
        enabled={phase === 'racing' && !paused}
        mode={settings.touchMode}
      />
      {phase === 'racing' && !paused ? (
        <button
          onClick={pause}
          aria-label="Pause"
          style={pauseButton}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        </button>
      ) : null}
      {paused ? (
        <>
          {pauseView === 'menu' ? (
            <PauseMenu
              onResume={resume}
              onRestart={restart}
              onEditTrack={editTrack}
              onLeaderboards={() => setPauseView('leaderboard')}
              onSettings={() => setPauseView('settings')}
              onExit={exitToTitle}
            />
          ) : pauseView === 'leaderboard' ? (
            <Leaderboard
              slug={slug}
              versionHash={versionHash}
              onBack={() => setPauseView('menu')}
            />
          ) : (
            <SettingsPane
              settings={settings}
              onChange={setSettings}
              onClose={() => setPauseView('menu')}
              onReset={resetSettings}
            />
          )}
          <FeedbackFab />
        </>
      ) : null}
    </div>
  )
}

const root: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: '#9ad8ff',
  overflow: 'hidden',
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
}
const canvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
}
const loading: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  color: 'white',
  fontFamily: 'system-ui, sans-serif',
}
const pauseButton: React.CSSProperties = {
  position: 'fixed',
  left: 16,
  bottom: 20,
  width: 48,
  height: 48,
  borderRadius: '50%',
  border: 'none',
  background: 'rgba(0,0,0,0.55)',
  color: 'white',
  cursor: 'pointer',
  display: 'grid',
  placeItems: 'center',
  boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
  zIndex: 20,
}
