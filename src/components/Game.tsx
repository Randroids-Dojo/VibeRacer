'use client'
import { useEffect, useRef, useState } from 'react'
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
import { InitialsPrompt, readStoredInitials } from './InitialsPrompt'
import { Countdown } from './Countdown'
import { HUD } from './HUD'
import { readLocalBest, writeLocalBest } from '@/lib/localBest'

interface GameProps {
  slug: string
  versionHash: string
  pieces: Piece[]
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
  lapCount: number
  onTrack: boolean
  toast: string | null
}

const HUD_UPDATE_MS = 50 // Throttle HUD re-renders to ~20Hz; game loop still runs at 60Hz.

function GameSession({ slug, versionHash, pieces, initials }: SessionProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const keys = useKeyboard()
  const tokenRef = useRef<string | null>(null)
  const submittingRef = useRef(false)
  const pendingRaceStartRef = useRef<number | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [phase, setPhase] = useState<Phase>('countdown')
  const [hud, setHud] = useState<HudState>(() => ({
    currentMs: 0,
    lastLapMs: null,
    bestSessionMs: null,
    bestAllTimeMs: readLocalBest(slug, versionHash),
    lapCount: 0,
    onTrack: true,
    toast: null,
  }))

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
      if (isAllTimePb) writeLocalBest(slug, versionHash, lapMs)
      return {
        ...prev,
        bestSessionMs: isSessionPb ? lapMs : prev.bestSessionMs,
        bestAllTimeMs: isAllTimePb ? lapMs : prev.bestAllTimeMs,
        toast: isAllTimePb ? 'NEW PB!' : `lap ${event.lapNumber} saved`,
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
    setPhase('racing')
  }

  return (
    <div style={root}>
      <canvas ref={canvasRef} style={canvasStyle} />
      <HUD
        currentMs={hud.currentMs}
        lastLapMs={hud.lastLapMs}
        bestSessionMs={hud.bestSessionMs}
        bestAllTimeMs={hud.bestAllTimeMs}
        lapCount={hud.lapCount}
        onTrack={hud.onTrack}
        toast={hud.toast}
        initials={initials}
      />
      {phase === 'countdown' ? <Countdown onDone={beginRace} /> : null}
    </div>
  )
}

const root: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: '#9ad8ff',
  overflow: 'hidden',
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
