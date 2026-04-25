'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Piece } from '@/lib/schemas'
import type { LapCompleteEvent } from '@/game/tick'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useControlSettings } from '@/hooks/useControlSettings'
import { useTuning } from '@/hooks/useTuning'
import { InitialsPrompt, readStoredInitials } from './InitialsPrompt'
import { Countdown } from './Countdown'
import { HUD } from './HUD'
import { PauseMenu } from './PauseMenu'
import { FeedbackFab } from './FeedbackFab'
import { TouchControls } from './TouchControls'
import { SettingsPane } from './SettingsPane'
import { TuningPanel } from './TuningPanel'
import { RaceCanvas, type RaceCanvasHud } from './RaceCanvas'
import {
  readLocalBest,
  writeLocalBest,
  readLocalBestReplay,
  writeLocalBestReplay,
} from '@/lib/localBest'
import { Leaderboard } from './Leaderboard'
import type { CarParams } from '@/game/physics'
import type { InputMode } from '@/lib/tuningSettings'
import { ReplaySchema, type Replay } from '@/lib/replay'
import {
  PAUSE_CROSSFADE_SEC,
  RACE_START_CROSSFADE_SEC,
  crossfadeTo,
} from '@/game/music'
import { TitleMusic } from './TitleMusic'

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

type PauseView = 'menu' | 'leaderboard' | 'settings' | 'tuning'

function GameSession({
  slug,
  versionHash,
  pieces,
  initials,
  initialRecord,
}: SessionProps) {
  const router = useRouter()
  const { settings, setSettings, resetSettings } = useControlSettings()
  const {
    params: tuning,
    setParams: setTuning,
    applyParams: applyTuning,
    resetParams: resetTuning,
  } = useTuning(slug)
  const keys = useKeyboard(settings.keyBindings)
  const tokenRef = useRef<string | null>(null)
  const submittingRef = useRef(false)
  const pendingRaceStartRef = useRef<number | null>(null)
  const pendingResetRef = useRef(false)
  const pausedRef = useRef(false)
  const pauseStartTsRef = useRef<number | null>(null)
  const resumeShiftRef = useRef(0)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Live tuning the rAF loop reads each frame. Updated whenever the
  // useTuning hook refreshes (player edited or migrated state).
  const paramsRef = useRef<CarParams>(tuning)
  paramsRef.current = tuning
  // Last-input-wins detector for the leaderboard input-mode badge. Defaults to
  // 'keyboard' on first paint; flips to 'touch' on the first touch pointerdown
  // and back on any keydown. Snapshot at submit time.
  const inputModeRef = useRef<InputMode>('keyboard')
  // Ghost replay being rendered alongside the player. Updated on mount from
  // local PB / leaderboard top, and after every personal-best lap. RaceCanvas
  // reads this each frame so swaps take effect on the next finish-line cross.
  const activeGhostRef = useRef<Replay | null>(null)
  // Replay buffer captured by RaceCanvas for the most recent lap, queued for
  // bundling into the next /api/race/submit POST.
  const pendingReplayForSubmitRef = useRef<Replay | null>(null)
  // Mirrors settings.showGhost into the rAF loop without re-mounting the
  // canvas every time the toggle flips.
  const showGhostRef = useRef<boolean>(settings.showGhost)
  showGhostRef.current = settings.showGhost

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

  const onCanvasHud = useCallback((next: RaceCanvasHud) => {
    setHud((prev) => ({
      ...prev,
      currentMs: next.currentMs,
      lapCount: next.lapCount,
      onTrack: next.onTrack,
      lastLapMs: next.lastLapMs ?? prev.lastLapMs,
    }))
  }, [])

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
    // Resolve the initial ghost: prefer the player's local PB replay, fall
    // back to whatever the server reports as the leaderboard's top recording
    // for this track. Once set, this ref is updated only on personal-best
    // laps (see handleLapComplete).
    let cancelled = false
    const local = readLocalBestReplay(slug, versionHash)
    if (local) {
      activeGhostRef.current = local
      return
    }
    fetch(
      `/api/replay/top?slug=${encodeURIComponent(slug)}&v=${versionHash}`,
    )
      .then(async (res) => {
        if (!res.ok) return
        const body = await res.json().catch(() => null)
        const parsed = ReplaySchema.safeParse(body)
        if (!cancelled && parsed.success) {
          activeGhostRef.current = parsed.data
        }
      })
      .catch(() => {
        // Best-effort; absent ghost is a non-fatal degradation.
      })
    return () => {
      cancelled = true
    }
  }, [slug, versionHash])

  useEffect(() => {
    function onKeyDown() {
      inputModeRef.current = 'keyboard'
    }
    function onPointer(e: PointerEvent) {
      if (e.pointerType === 'touch') {
        inputModeRef.current = 'touch'
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [])

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
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  function handleLapReplay(replay: Replay) {
    // Always queue the buffered replay for the next submit so the server can
    // store it. The PB swap happens in handleLapComplete where we know the
    // previous best from React state.
    pendingReplayForSubmitRef.current = replay
  }

  function handleLapComplete(event: LapCompleteEvent) {
    const lapMs = event.lapTimeMs
    setHud((prev) => {
      const isSessionPb = prev.bestSessionMs === null || lapMs < prev.bestSessionMs
      const isAllTimePb = prev.bestAllTimeMs === null || lapMs < prev.bestAllTimeMs
      const isNewRecord =
        prev.overallRecord === null || lapMs < prev.overallRecord.lapTimeMs
      if (isAllTimePb) {
        writeLocalBest(slug, versionHash, lapMs)
        const pending = pendingReplayForSubmitRef.current
        if (pending) {
          writeLocalBestReplay(slug, versionHash, pending)
          activeGhostRef.current = pending
        }
      }
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
    const replay = pendingReplayForSubmitRef.current
    pendingReplayForSubmitRef.current = null
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
            tuning: paramsRef.current,
            inputMode: inputModeRef.current,
            ...(replay ? { replay } : {}),
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
      <RaceCanvas
        pieces={pieces}
        paramsRef={paramsRef}
        keys={keys}
        pausedRef={pausedRef}
        resumeShiftRef={resumeShiftRef}
        pendingResetRef={pendingResetRef}
        pendingRaceStartRef={pendingRaceStartRef}
        onLapComplete={handleLapComplete}
        onHudUpdate={onCanvasHud}
        activeGhostRef={activeGhostRef}
        showGhostRef={showGhostRef}
        onLapReplay={handleLapReplay}
        style={canvasStyle}
      />
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
              onTuning={() => setPauseView('tuning')}
              onExit={exitToTitle}
            />
          ) : pauseView === 'leaderboard' ? (
            <Leaderboard
              slug={slug}
              versionHash={versionHash}
              onBack={() => setPauseView('menu')}
              onApplyTuning={(p) => {
                applyTuning(p)
                setPauseView('menu')
              }}
            />
          ) : pauseView === 'tuning' ? (
            <TuningPanel
              params={tuning}
              onChange={setTuning}
              onReset={resetTuning}
              onClose={() => setPauseView('menu')}
            />
          ) : (
            <SettingsPane
              settings={settings}
              onChange={setSettings}
              onClose={() => setPauseView('menu')}
              onReset={resetSettings}
              inRace
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
