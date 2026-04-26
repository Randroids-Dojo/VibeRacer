'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Piece } from '@/lib/schemas'
import type { LapCompleteEvent } from '@/game/tick'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useGamepad } from '@/hooks/useGamepad'
import { useControlSettings } from '@/hooks/useControlSettings'
import { cameraLerpsFor } from '@/lib/controlSettings'
import type { CameraRigParams } from '@/game/sceneBuilder'
import { useTuning } from '@/hooks/useTuning'
import { InitialsPrompt } from './InitialsPrompt'
import {
  INITIALS_EVENT,
  INITIALS_STORAGE_KEY,
  readStoredInitials,
} from '@/lib/initials'
import { Countdown } from './Countdown'
import { HUD } from './HUD'
import { PauseMenu } from './PauseMenu'
import { FeedbackFab } from './FeedbackFab'
import { TouchControls } from './TouchControls'
import { SettingsPane } from './SettingsPane'
import { TuningPanel } from './TuningPanel'
import { Minimap, type MinimapPose } from './Minimap'
import { RaceCanvas, type RaceCanvasHud } from './RaceCanvas'
import { Speedometer } from './Speedometer'
import {
  readLocalBest,
  writeLocalBest,
  readLocalBestReplay,
  writeLocalBestReplay,
  readLocalBestSplits,
  writeLocalBestSplits,
} from '@/lib/localBest'
import type { CheckpointHit } from '@/lib/schemas'
import {
  SPLIT_DISPLAY_MS,
  computeSplitDeltaForLastHit,
  type SplitDelta,
} from '@/game/splits'
import { Leaderboard } from './Leaderboard'
import type { CarParams } from '@/game/physics'
import type { InputMode } from '@/lib/tuningSettings'
import { ReplaySchema, type Replay } from '@/lib/replay'
import {
  PAUSE_CROSSFADE_SEC,
  RACE_START_CROSSFADE_SEC,
  crossfadeTo,
} from '@/game/music'
import {
  playLapStinger,
  playPbFanfare,
  silenceAllSfx,
} from '@/game/audio'
import { TitleMusic } from './TitleMusic'
import { buildSharePayload, shareOrCopy } from '@/lib/share'

export type ToastKind = 'lap' | 'pb' | 'record'

export interface OverallRecord {
  initials: string
  lapTimeMs: number
}

interface GameProps {
  slug: string
  versionHash: string
  pieces: Piece[]
  checkpointCount?: number
  initialRecord: OverallRecord | null
}

export function Game(props: GameProps) {
  const [initials, setInitials] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    setInitials(readStoredInitials())
  }, [])

  // Mirror the InitialsPrompt module's INITIALS_EVENT and the browser's
  // `storage` event so editing initials in Settings (or in another tab)
  // updates the HUD live without restarting the race.
  useEffect(() => {
    function onCustom(e: Event) {
      const detail = (e as CustomEvent<string>).detail
      if (typeof detail === 'string') setInitials(detail)
      else setInitials(readStoredInitials())
    }
    function onStorage(e: StorageEvent) {
      if (e.key !== INITIALS_STORAGE_KEY) return
      setInitials(readStoredInitials())
    }
    window.addEventListener(INITIALS_EVENT, onCustom)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(INITIALS_EVENT, onCustom)
      window.removeEventListener('storage', onStorage)
    }
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
  toastKind: ToastKind | null
  splitDelta: SplitDelta | null
}

type PauseView = 'menu' | 'leaderboard' | 'settings' | 'tuning'

function GameSession({
  slug,
  versionHash,
  pieces,
  checkpointCount,
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
  // Mirrors the player's camera tunables into the rAF loop the same way.
  // Recomputed every render from `settings.camera` so a slider tweak in
  // SettingsPane takes effect on the next frame.
  const cameraRigRef = useRef<CameraRigParams | null>(null)
  {
    const lerps = cameraLerpsFor(settings.camera.followSpeed)
    cameraRigRef.current = {
      height: settings.camera.height,
      distance: settings.camera.distance,
      lookAhead: settings.camera.lookAhead,
      positionLerp: lerps.positionLerp,
      targetLerp: lerps.targetLerp,
    }
  }
  // Mirrors the player's chosen paint into the rAF loop. Same pattern as
  // showGhostRef: RaceCanvas polls this each frame and reapplies on change.
  const carPaintRef = useRef<string | null>(settings.carPaint)
  carPaintRef.current = settings.carPaint
  // Mirrors settings.showSkidMarks into the rAF loop without remounting the
  // canvas. Existing marks keep fading even after a flip-off so the toggle
  // does not snap a visible streak away mid-corner.
  const showSkidMarksRef = useRef<boolean>(settings.showSkidMarks)
  showSkidMarksRef.current = settings.showSkidMarks
  // Live pose channel for the minimap. RaceCanvas writes to these refs every
  // frame; the Minimap component reads them in its own rAF loop without going
  // through React state. Keeping the refs alive here means a Settings toggle
  // that mounts / unmounts the Minimap does not lose the live position.
  const minimapCarPoseRef = useRef<MinimapPose | null>(null)
  const minimapGhostPoseRef = useRef<MinimapPose | null>(null)
  // Live signed speed (world units / s). Speedometer overlay reads it from
  // its own rAF loop so the readout updates at 60 Hz without sending React
  // re-renders into the rest of the HUD tree.
  const speedRef = useRef<number>(0)
  // Mirrors the live tuning's maxSpeed for the gauge needle. Updated each
  // render from `tuning` so a slider tweak in TuningPanel reshapes the dial
  // immediately.
  const maxSpeedRef = useRef<number>(tuning.maxSpeed)
  maxSpeedRef.current = tuning.maxSpeed
  // PB checkpoint splits. Loaded once on mount and overwritten each time the
  // player posts a new all-time PB so the live "delta vs PB" tile always
  // compares against the freshest reference. A ref (not state) so updates do
  // not re-render the canvas.
  const pbSplitsRef = useRef<CheckpointHit[] | null>(null)
  const splitClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    toastKind: null,
    splitDelta: null,
  }))

  // Hydrate the PB-splits ref on mount / slug change. Stored alongside the
  // local PB lap time so a fresh page load shows a delta tile from the very
  // first checkpoint of the new race.
  useEffect(() => {
    pbSplitsRef.current = readLocalBestSplits(slug, versionHash)
  }, [slug, versionHash])

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
    keys.current.axes = null
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
    if (splitClearTimerRef.current) {
      clearTimeout(splitClearTimerRef.current)
      splitClearTimerRef.current = null
    }
    crossfadeTo('title', PAUSE_CROSSFADE_SEC)
    silenceAllSfx(0.05)
    setPaused(false)
    setHud((prev) => ({
      ...prev,
      currentMs: 0,
      lastLapMs: null,
      bestSessionMs: null,
      lapCount: 0,
      onTrack: true,
      toast: null,
      toastKind: null,
      splitDelta: null,
    }))
    setPhase('countdown')
  }, [])

  const exitToTitle = useCallback(() => {
    router.push('/')
  }, [router])

  const editTrack = useCallback(() => {
    router.push(`/${slug}/edit`)
  }, [router, slug])

  // Pause-menu Share button. Wraps `shareOrCopy` and surfaces the result as a
  // transient label on the button itself (the HUD's toast lane is reserved for
  // celebratory PB feedback).
  const [shareLabel, setShareLabel] = useState<string | null>(null)
  const shareLabelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleShare = useCallback(async () => {
    if (typeof window === 'undefined') return
    const payload = buildSharePayload({
      origin: window.location.origin,
      slug,
      versionHash,
      bestMs: hud.bestAllTimeMs,
      record: hud.overallRecord,
      initials,
    })
    const outcome = await shareOrCopy(payload)
    const next =
      outcome === 'shared'
        ? 'Shared!'
        : outcome === 'copied'
          ? 'Link copied!'
          : outcome === 'cancelled'
            ? null
            : 'Could not share'
    if (next === null) return
    setShareLabel(next)
    if (shareLabelTimerRef.current) clearTimeout(shareLabelTimerRef.current)
    shareLabelTimerRef.current = setTimeout(() => {
      setShareLabel(null)
      shareLabelTimerRef.current = null
    }, 1600)
  }, [slug, versionHash, hud.bestAllTimeMs, hud.overallRecord, initials])

  useEffect(() => {
    return () => {
      if (shareLabelTimerRef.current) clearTimeout(shareLabelTimerRef.current)
    }
  }, [])

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

  // Gamepad: routes Start to pause / resume and flags inputMode -> 'gamepad'
  // any time analog axes are populated. Last-input-wins is shared with the
  // keyboard / touch listeners above.
  const handlePadPause = useCallback(() => {
    if (phase !== 'racing') return
    if (pausedRef.current) resume()
    else pause()
  }, [phase, pause, resume])
  useGamepad(keys, handlePadPause)
  useEffect(() => {
    let raf = 0
    function check() {
      if (keys.current.axes !== null) {
        inputModeRef.current = 'gamepad'
      }
      raf = requestAnimationFrame(check)
    }
    raf = requestAnimationFrame(check)
    return () => cancelAnimationFrame(raf)
  }, [keys])

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
      if (splitClearTimerRef.current) clearTimeout(splitClearTimerRef.current)
      silenceAllSfx(0.05)
    }
  }, [])

  function handleLapReplay(replay: Replay) {
    // Always queue the buffered replay for the next submit so the server can
    // store it. The PB swap happens in handleLapComplete where we know the
    // previous best from React state.
    pendingReplayForSubmitRef.current = replay
  }

  // Per-checkpoint live split tile. Re-computed each time the player crosses
  // an in-lap checkpoint by comparing their just-recorded hit against the PB
  // splits stored from their last all-time PB. The tile auto-clears after
  // SPLIT_DISPLAY_MS and resets between laps (handleLapComplete clears it).
  function handleCheckpointHit(hit: CheckpointHit) {
    const pb = pbSplitsRef.current
    if (!pb || pb.length === 0) return
    const out = computeSplitDeltaForLastHit([hit], pb)
    if (!out) return
    const generatedAtMs = performance.now()
    setHud((prev) => ({
      ...prev,
      splitDelta: { deltaMs: out.deltaMs, cpId: out.cpId, generatedAtMs },
    }))
    if (splitClearTimerRef.current) clearTimeout(splitClearTimerRef.current)
    splitClearTimerRef.current = setTimeout(() => {
      setHud((prev) => ({ ...prev, splitDelta: null }))
      splitClearTimerRef.current = null
    }, SPLIT_DISPLAY_MS)
  }

  function handleLapComplete(event: LapCompleteEvent) {
    const lapMs = event.lapTimeMs
    const outcomeRef: { current: ToastKind } = { current: 'lap' }
    setHud((prev) => {
      const isSessionPb = prev.bestSessionMs === null || lapMs < prev.bestSessionMs
      const isAllTimePb = prev.bestAllTimeMs === null || lapMs < prev.bestAllTimeMs
      const isNewRecord =
        prev.overallRecord === null || lapMs < prev.overallRecord.lapTimeMs
      if (isAllTimePb) {
        writeLocalBest(slug, versionHash, lapMs)
        // Capture the lap's checkpoint splits so the next lap's live delta
        // tile compares against this fresh reference. The hits array carries
        // {cpId, tMs} pairs in lap order, exactly what the splits helper
        // expects.
        writeLocalBestSplits(slug, versionHash, event.hits)
        pbSplitsRef.current = event.hits
        const pending = pendingReplayForSubmitRef.current
        if (pending) {
          writeLocalBestReplay(slug, versionHash, pending)
          activeGhostRef.current = pending
        }
      }
      const toastKind: ToastKind = isNewRecord
        ? 'record'
        : isAllTimePb
          ? 'pb'
          : 'lap'
      outcomeRef.current = toastKind
      const toast =
        toastKind === 'record'
          ? 'NEW RECORD!'
          : toastKind === 'pb'
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
        toastKind,
        // Reset the per-checkpoint delta tile so the next lap starts clean
        // rather than freezing on the final checkpoint's value. The first
        // checkpoint of the new lap will populate it again.
        splitDelta: null,
      }
    })
    if (splitClearTimerRef.current) {
      clearTimeout(splitClearTimerRef.current)
      splitClearTimerRef.current = null
    }
    const outcome = outcomeRef.current
    if (outcome === 'record') playPbFanfare('record')
    else if (outcome === 'pb') playPbFanfare('pb')
    else playLapStinger()
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setHud((prev) => ({ ...prev, toast: null, toastKind: null }))
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
        checkpointCount={checkpointCount}
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
        cameraRigRef={cameraRigRef}
        carPaintRef={carPaintRef}
        showSkidMarksRef={showSkidMarksRef}
        carPoseOutRef={minimapCarPoseRef}
        ghostPoseOutRef={minimapGhostPoseRef}
        speedOutRef={speedRef}
        onLapReplay={handleLapReplay}
        onCheckpointHit={handleCheckpointHit}
        style={canvasStyle}
      />
      {settings.showMinimap ? (
        <Minimap
          pieces={pieces}
          checkpointCount={checkpointCount}
          carPoseRef={minimapCarPoseRef}
          ghostPoseRef={settings.showGhost ? minimapGhostPoseRef : undefined}
        />
      ) : null}
      {settings.showSpeedometer && phase === 'racing' && !paused ? (
        <Speedometer
          speedRef={speedRef}
          maxSpeedRef={maxSpeedRef}
          unit={settings.speedUnit}
        />
      ) : null}
      <HUD
        currentMs={hud.currentMs}
        lastLapMs={hud.lastLapMs}
        bestSessionMs={hud.bestSessionMs}
        bestAllTimeMs={hud.bestAllTimeMs}
        overallRecord={hud.overallRecord}
        lapCount={hud.lapCount}
        onTrack={hud.onTrack}
        toast={hud.toast}
        toastKind={hud.toastKind}
        initials={initials}
        splitDeltaMs={hud.splitDelta?.deltaMs ?? null}
        splitCpId={hud.splitDelta?.cpId ?? null}
      />
      {phase === 'countdown' ? <Countdown onDone={beginRace} /> : null}
      <TouchControls
        keys={keys}
        enabled={phase === 'racing' && !paused}
        mode={settings.touchMode}
      />
      {phase === 'racing' && !paused ? (
        <>
          <style>{PAUSE_BUTTON_CSS}</style>
          <button
            onClick={pause}
            aria-label="Pause"
            className="viberacer-pause-btn"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          </button>
        </>
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
              onShare={() => {
                void handleShare()
              }}
              shareLabel={shareLabel ?? undefined}
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
// Pause button. Always visible during the racing phase (per Section 9 of the
// GDD). Sizing is responsive to pointer kind: a fine pointer (mouse) gets a
// compact 48x48 hit target, while a coarse pointer (touch) gets a larger 64x64
// target with extra inset so a one-thumb reach lands cleanly without fighting
// the iOS home indicator or the Android nav bar (env safe-area-inset-bottom).
const PAUSE_BUTTON_CSS = `
.viberacer-pause-btn {
  position: fixed;
  left: 16px;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(0, 0, 0, 0.55);
  color: white;
  cursor: pointer;
  display: grid;
  place-items: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  z-index: 20;
  padding: 0;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.viberacer-pause-btn:focus-visible {
  outline: 2px solid #5fe08a;
  outline-offset: 2px;
}
.viberacer-pause-btn svg {
  width: 22px;
  height: 22px;
}
@media (any-pointer: coarse) {
  .viberacer-pause-btn {
    left: 20px;
    bottom: calc(28px + env(safe-area-inset-bottom, 0px));
    width: 64px;
    height: 64px;
    border-width: 2px;
    background: rgba(0, 0, 0, 0.6);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  }
  .viberacer-pause-btn svg {
    width: 30px;
    height: 30px;
  }
}
`
