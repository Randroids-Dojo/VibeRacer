'use client'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Link from 'next/link'
import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  WebGLRenderer,
  type BufferGeometry,
  type Group,
  type Scene,
} from 'three'
import { interpolateGhostPose, type Replay } from '@/lib/replay'
import { useKeyboard } from '@/hooks/useKeyboard'
import {
  buildScene,
  profiledTerrainSkirtGeometry,
  profiledTrackSurfaceGeometry,
  type SceneBundle,
} from '@/game/sceneBuilder'
import { buildTrackPath } from '@/game/trackPath'
import {
  DRAG_STRIPS,
  dragStripCheckpoints,
  dragStripPieces,
  dragStripVersionHash,
  type DragStripConfig,
  type DragStripSlug,
} from '@/lib/dragStrips'
import {
  DEFAULT_DRAG_LOADOUT,
  type DragLoadout,
} from '@/lib/dragParts'
import {
  readDragLoadout,
  writeDragLoadout,
} from '@/lib/dragLoadoutStorage'
import { deriveDragCarParams } from '@/game/dragTuning'
import {
  dragTick,
  handlePreCountdownInput,
  initDragGameState,
  startDragRace,
  type DragGameState,
  type DragLapCompleteEvent,
  type DragTickConfig,
} from '@/game/dragTick'
import {
  heightAt,
  slopeAt,
} from '@/game/dragVerticalProfile'
import type { LeaderboardEntry } from '@/lib/leaderboard'
import { selectDragGhost } from '@/lib/dragGhost'
import { DragGarage } from './DragGarage'
import { DragHUD } from './DragHUD'
import { DragSessionSummary } from './DragSessionSummary'
import {
  DRAG_COUNTDOWN_TOTAL_MS,
  DragChristmasTree,
} from './DragChristmasTree'
import { getTrackBiomePreset } from '@/lib/biomes'

type Phase = 'garage' | 'staging' | 'countdown' | 'racing' | 'finished'

interface DragRaceProps {
  slug: DragStripSlug
}

function projectArcLength(
  car: { x: number; z: number },
  spawn: { x: number; z: number; heading: number },
): number {
  const dx = car.x - spawn.x
  const dz = car.z - spawn.z
  const tx = Math.cos(spawn.heading)
  const tz = -Math.sin(spawn.heading)
  return Math.max(0, dx * tx + dz * tz)
}

export function DragRace({ slug }: DragRaceProps) {
  const strip: DragStripConfig = DRAG_STRIPS[slug]
  const versionHash = useMemo(() => dragStripVersionHash(strip), [strip])

  const path = useMemo(
    () => buildTrackPath(dragStripPieces(strip), undefined, dragStripCheckpoints(strip)),
    [strip],
  )

  const [phase, setPhase] = useState<Phase>('garage')
  const [loadout, setLoadout] = useState<DragLoadout>(DEFAULT_DRAG_LOADOUT)
  const [hydratedLoadout, setHydratedLoadout] = useState(false)
  const [hud, setHud] = useState<{
    elapsedMs: number
    speed: number
    fouled: boolean
    reactionTimeMs: number | null
    splits: number[]
    topSpeed: number
  }>({ elapsedMs: 0, speed: 0, fouled: false, reactionTimeMs: null, splits: [], topSpeed: 0 })
  const [finishEvent, setFinishEvent] =
    useState<DragLapCompleteEvent | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  // Captured once when startCountdown fires so a parent re-render during the
  // countdown phase does not reset the elapsed lamp animation. Cleared back
  // to null when we leave countdown.
  const [countdownStartedAt, setCountdownStartedAt] = useState<number | null>(
    null,
  )
  // Mirrors stateRef.current.fouled into React state at low frequency so the
  // CountdownTree overlay can show "JUMP-START" the moment a pre-GO throttle
  // press flips the foul flag. The rAF loop owns the canonical value; this
  // state just lets the overlay react to it.
  const [countdownFouled, setCountdownFouled] = useState(false)

  // Hydrate loadout from storage on mount.
  useEffect(() => {
    setLoadout(readDragLoadout(slug))
    setHydratedLoadout(true)
  }, [slug])

  // Fetch leaderboard for the strip on mount and after every finish.
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(
          `/api/leaderboard?slug=${encodeURIComponent(slug)}&v=${versionHash}&limit=25`,
        )
        if (!res.ok) return
        const data = (await res.json()) as { entries?: LeaderboardEntry[] }
        if (!cancelled && Array.isArray(data.entries)) {
          setLeaderboard(data.entries)
        }
      } catch {
        // best effort
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [slug, versionHash, finishEvent])

  // Derived params recomputed when the loadout changes; the rAF loop reads
  // from a ref so we never restart the renderer on a part swap.
  const derived = useMemo(
    () => deriveDragCarParams(loadout, strip),
    [loadout, strip],
  )

  const stateRef = useRef<DragGameState>(initDragGameState(path))
  const phaseRef = useRef<Phase>(phase)
  const configRef = useRef<DragTickConfig>({
    totalWeight: derived.derivation.totalWeight,
    launch: derived.launch,
    verticalProfile: strip.verticalProfile,
  })
  const paramsRef = useRef(derived.params)
  const goAtMsRef = useRef<number | null>(null)
  const finishedRef = useRef(false)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  // While the countdown overlay is up, mirror stateRef.current.fouled into
  // React state at 50ms cadence so the JUMP-START label appears within a
  // frame or two of the foul instead of waiting for the racing phase. The
  // rAF loop owns the actual flag; we just sample it here.
  useEffect(() => {
    if (phase !== 'countdown') return undefined
    const id = window.setInterval(() => {
      if (stateRef.current.fouled !== countdownFouled) {
        setCountdownFouled(stateRef.current.fouled)
      }
    }, 50)
    return () => window.clearInterval(id)
  }, [phase, countdownFouled])

  useEffect(() => {
    paramsRef.current = derived.params
    configRef.current = {
      totalWeight: derived.derivation.totalWeight,
      launch: derived.launch,
      verticalProfile: strip.verticalProfile,
    }
  }, [derived, strip])

  const keys = useKeyboard()

  // Renderer / scene refs
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<WebGLRenderer | null>(null)
  const sceneBundleRef = useRef<SceneBundle | null>(null)
  const cameraRef = useRef<PerspectiveCamera | null>(null)
  const carGroupRef = useRef<Group | null>(null)
  const sceneRef = useRef<Scene | null>(null)
  // Ghost replay state. The active replay drives a small marker mesh that
  // follows the leaderboard's chosen rival (top, next-faster, or own PB,
  // selected by `selectDragGhost`). Read on every frame; null hides the
  // ghost mesh.
  const ghostReplayRef = useRef<Replay | null>(null)
  const ghostMeshRef = useRef<Mesh | null>(null)

  // Set up Three.js renderer + scene exactly once for the strip lifetime.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const bundle = buildScene(path, { biome: strip.biome })
    bundle.setTimeOfDay(strip.timeOfDay)
    bundle.setWeather(strip.weather)
    sceneBundleRef.current = bundle
    sceneRef.current = bundle.scene
    cameraRef.current = bundle.camera
    carGroupRef.current = bundle.car

    // Swap the flat road for a profile-baked ribbon and lay a matching
    // terrain skirt under it so the strip has visible hills instead of a
    // floating noodle on a flat plane. Both meshes are owned by the bundle
    // (skirt added to bundle.scene; new road geometry replaces the existing
    // mesh's geometry so material, position, and lifecycle stay shared).
    const profile = strip.verticalProfile
    const oldRoadGeom = bundle.trackMesh.geometry as BufferGeometry
    const profiledRoadGeom = profiledTrackSurfaceGeometry(path, profile)
    bundle.trackMesh.geometry = profiledRoadGeom
    oldRoadGeom.dispose()

    const skirtGeom = profiledTerrainSkirtGeometry(path, profile, 24)
    // Skirt color follows the strip's biome so an Alpine snow strip does
    // not bleed olive grass under its road and a Harbor city strip does
    // not look like a grassy field. The biome's `groundColor` is the same
    // hex the surrounding terrain plane already uses, which keeps the
    // seam visually quiet.
    const skirtMat = new MeshStandardMaterial({
      color: getTrackBiomePreset(strip.biome).groundColor,
      roughness: 1,
    })
    const skirtMesh = new Mesh(skirtGeom, skirtMat)
    bundle.scene.add(skirtMesh)
    const disposeSkirt = () => {
      bundle.scene.remove(skirtMesh)
      skirtGeom.dispose()
      skirtMat.dispose()
    }

    // Ghost car. Simple translucent cyan box; cheap to render and reads as
    // "another car" without needing a second GLB load. Hidden by default;
    // the rAF loop flips visibility on when a replay is loaded and we are
    // in the racing phase.
    const ghostGeom = new BoxGeometry(2.2, 1.2, 4.2)
    const ghostMat = new MeshBasicMaterial({
      color: 0x80e8ff,
      transparent: true,
      opacity: 0.55,
    })
    const ghostMesh = new Mesh(ghostGeom, ghostMat)
    ghostMesh.visible = false
    bundle.scene.add(ghostMesh)
    ghostMeshRef.current = ghostMesh
    const disposeGhost = () => {
      bundle.scene.remove(ghostMesh)
      ghostGeom.dispose()
      ghostMat.dispose()
      ghostMeshRef.current = null
    }

    const renderer = new WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    function onResize() {
      if (!container) return
      const w = container.clientWidth
      const h = container.clientHeight
      renderer.setSize(w, h)
      if (cameraRef.current) {
        cameraRef.current.aspect = w / Math.max(1, h)
        cameraRef.current.updateProjectionMatrix()
      }
    }
    window.addEventListener('resize', onResize)
    onResize()

    // Position the car at the spawn.
    const spawn = path.spawn
    bundle.car.position.set(spawn.position.x, 0, spawn.position.z)
    bundle.car.rotation.y = spawn.heading

    let raf = 0
    let lastNow = performance.now()
    const tickLoop = (now: number) => {
      const dtMs = Math.max(0, Math.min(50, now - lastNow))
      lastNow = now

      const k = keys.current
      const throttle = k.axes ? k.axes.throttle : k.forward ? 1 : k.backward ? -1 : 0
      const steer = k.axes ? k.axes.steer : (k.right ? 1 : 0) - (k.left ? 1 : 0)
      const input = { throttle, steer, handbrake: k.handbrake }

      let state = stateRef.current
      const ph = phaseRef.current

      if (ph === 'countdown') {
        state = handlePreCountdownInput(state, input, configRef.current)
      } else if (ph === 'racing' && goAtMsRef.current !== null) {
        const result = dragTick(
          state,
          input,
          dtMs,
          performance.now(),
          path,
          paramsRef.current,
          configRef.current,
        )
        state = result.state
        if (result.finished && !finishedRef.current) {
          finishedRef.current = true
          setFinishEvent(result.finished)
          setPhase('finished')
        }
      }

      stateRef.current = state

      // Sync car group position / rotation. Apply hill height + pitch.
      const car = carGroupRef.current
      if (car) {
        const arcLength =
          ph === 'racing' || ph === 'finished'
            ? state.arcLengthS
            : projectArcLength({ x: state.x, z: state.z }, {
                x: spawn.position.x,
                z: spawn.position.z,
                heading: spawn.heading,
              })
        const y = heightAt(strip.verticalProfile, arcLength)
        const pitch = slopeAt(strip.verticalProfile, arcLength)
        car.position.set(state.x, y, state.z)
        car.rotation.set(-pitch, state.heading, 0)
      }

      // Ghost mesh follow. During the racing phase the rival's replay is
      // sampled by elapsed-since-GO and the ghost is placed on the strip;
      // y is taken from the strip's profile so it follows the same hills
      // the player drives over. Visibility extends through the 'finished'
      // phase so the rival freezes at its finish-line pose
      // (interpolateGhostPose clamps past maxT) instead of vanishing the
      // moment the player crosses the line. Hidden in garage/staging so
      // the pre-race overlays never show a stale ghost.
      const ghostNode = ghostMeshRef.current
      const ghostReplay = ghostReplayRef.current
      const ghostActive =
        (ph === 'racing' || ph === 'finished') &&
        ghostReplay !== null &&
        state.raceStartMs !== null
      if (ghostNode) {
        if (ghostActive && ghostReplay && state.raceStartMs !== null) {
          const ghostT = Math.max(0, performance.now() - state.raceStartMs)
          const pose = interpolateGhostPose(ghostReplay, ghostT)
          if (pose) {
            const ghostArc =
              (pose.x - spawn.position.x) * Math.cos(spawn.heading) +
              (pose.z - spawn.position.z) * -Math.sin(spawn.heading)
            const gy = heightAt(strip.verticalProfile, Math.max(0, ghostArc))
            const gpitch = slopeAt(
              strip.verticalProfile,
              Math.max(0, ghostArc),
            )
            ghostNode.position.set(pose.x, gy + 0.6, pose.z)
            ghostNode.rotation.set(-gpitch, pose.heading, 0)
            ghostNode.visible = true
          } else {
            ghostNode.visible = false
          }
        } else {
          ghostNode.visible = false
        }
      }

      // Camera follow: simple chase. Behind the car along its heading,
      // raised, looking ahead.
      if (cameraRef.current && car) {
        const camDist = 12
        const camHeight = 5
        const camLookAhead = 8
        const hx = Math.cos(state.heading)
        const hz = -Math.sin(state.heading)
        cameraRef.current.position.set(
          car.position.x - hx * camDist,
          car.position.y + camHeight,
          car.position.z - hz * camDist,
        )
        cameraRef.current.lookAt(
          car.position.x + hx * camLookAhead,
          car.position.y + 1,
          car.position.z + hz * camLookAhead,
        )
      }

      // HUD update at frame rate.
      if (ph === 'racing' && goAtMsRef.current !== null) {
        const elapsed = performance.now() - goAtMsRef.current
        setHud({
          elapsedMs: Math.max(0, Math.round(elapsed)),
          speed: Math.abs(state.speed),
          fouled: state.fouled,
          reactionTimeMs: state.reactionTimeMs,
          splits: state.hits.map((h) => h.tMs),
          topSpeed: state.topSpeed,
        })
      } else if (ph === 'finished' && finishEvent) {
        setHud((h) => ({
          ...h,
          elapsedMs: finishEvent.finishTimeMs,
          fouled: finishEvent.fouled,
          reactionTimeMs: finishEvent.reactionTimeMs,
          splits: finishEvent.hits.map((cp) => cp.tMs),
          topSpeed: finishEvent.topSpeed,
        }))
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current)
      }

      raf = requestAnimationFrame(tickLoop)
    }
    raf = requestAnimationFrame(tickLoop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
      disposeSkirt()
      disposeGhost()
      bundle.dispose()
      renderer.dispose()
      rendererRef.current = null
      sceneBundleRef.current = null
      cameraRef.current = null
      carGroupRef.current = null
      sceneRef.current = null
    }
    // path/strip/keys are stable for the strip lifetime; rebuilding a strip
    // change happens at the route level by remounting this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, strip])

  // Run the countdown lights, then start the race.
  const startCountdown = useCallback(() => {
    setPhase('countdown')
    finishedRef.current = false
    setFinishEvent(null)
    // Reset the game state to spawn.
    const fresh = initDragGameState(path)
    stateRef.current = fresh
    goAtMsRef.current = null
    setCountdownStartedAt(performance.now())
    setCountdownFouled(false)
    setHud({
      elapsedMs: 0,
      speed: 0,
      fouled: false,
      reactionTimeMs: null,
      splits: [],
      topSpeed: 0,
    })
    // Three "ready/set/go" beats at 800ms each. After GO we transition to
    // 'racing' and seed the race start time. Foul detection runs across the
    // whole window via the rAF loop.
    // Pinned to DRAG_COUNTDOWN_TOTAL_MS so the green lamp in the
    // christmas tree component lights at the same moment we flip phase
    // to 'racing'. A drift between the two would let a fast reaction at
    // green still register as a foul.
    setTimeout(() => {
      const now = performance.now()
      goAtMsRef.current = now
      stateRef.current = startDragRace(stateRef.current, now)
      setPhase('racing')
    }, DRAG_COUNTDOWN_TOTAL_MS)
  }, [path])

  const onChooseLoadout = useCallback(
    (next: DragLoadout) => {
      setLoadout(next)
      writeDragLoadout(slug, next)
    },
    [slug],
  )

  const onConfirmLoadout = useCallback(() => {
    setPhase('staging')
    // Auto-roll into the countdown after a brief stage moment.
    window.setTimeout(() => startCountdown(), 350)
  }, [startCountdown])

  const onRaceAgain = useCallback(() => {
    startCountdown()
  }, [startCountdown])

  const onChangeParts = useCallback(() => {
    setPhase('garage')
  }, [])

  // Submit the lap to the leaderboard once we have a finish event.
  // The submission flow follows /api/race/start to mint a token, then POSTs
  // to /api/race/submit. Best-effort: failure does not block the UI.
  const submittedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!finishEvent) return
    const key = `${slug}:${finishEvent.finishTimeMs}:${finishEvent.hits.length}`
    if (submittedRef.current === key) return
    submittedRef.current = key
    void submitDragRun({
      slug,
      versionHash,
      finishEvent,
      loadout,
    })
      .then(() => {
        // Refresh leaderboard after submit. Bumping finishEvent to itself by
        // setting a fresh state would trigger refetch; instead fetch directly.
        return fetch(
          `/api/leaderboard?slug=${encodeURIComponent(slug)}&v=${versionHash}&limit=25`,
        )
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (
              data &&
              typeof data === 'object' &&
              Array.isArray((data as { entries?: unknown }).entries)
            ) {
              setLeaderboard(
                (data as { entries: LeaderboardEntry[] }).entries,
              )
            }
          })
      })
      .catch(() => {
        // ignore; user can retry by racing again.
      })
  }, [finishEvent, slug, versionHash, loadout])

  // Pick the player's PB for this strip from the leaderboard (server marks
  // with isMe). selectDragGhost handles the rotation rules.
  const playerPbMs = useMemo(() => {
    const mine = leaderboard.filter((e) => e.isMe)
    if (mine.length === 0) return null
    return mine.reduce((best, e) => Math.min(best, e.lapTimeMs), Number.POSITIVE_INFINITY) || null
  }, [leaderboard])
  const ghost = useMemo(
    () => selectDragGhost(leaderboard, playerPbMs),
    [leaderboard, playerPbMs],
  )

  // Load the ghost's replay whenever the selected nonce changes. Best
  // effort: a 404 (legacy entry without a stored replay) just leaves
  // ghostReplayRef null so the rAF loop hides the ghost mesh.
  useEffect(() => {
    if (!ghost.nonce) {
      ghostReplayRef.current = null
      return undefined
    }
    let cancelled = false
    void fetch(
      `/api/replay/byNonce?slug=${encodeURIComponent(slug)}&v=${versionHash}&nonce=${ghost.nonce}`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        if (!data || typeof data !== 'object') {
          ghostReplayRef.current = null
          return
        }
        // Trust the API: it already validated through ReplaySchema before
        // returning. Storing the raw object keeps the per-frame lookup a
        // simple array index without re-parsing.
        ghostReplayRef.current = data as Replay
      })
      .catch(() => {
        if (!cancelled) ghostReplayRef.current = null
      })
    return () => {
      cancelled = true
    }
  }, [ghost.nonce, slug, versionHash])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', color: '#fff' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Strip name + back link */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          padding: '6px 10px',
          background: 'rgba(0,0,0,0.55)',
          borderRadius: 6,
          fontSize: 14,
          pointerEvents: 'auto',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <Link href="/drag" style={{ color: '#9ad8ff', textDecoration: 'none' }}>
          back
        </Link>
        <strong>{strip.displayName}</strong>
        <span style={{ opacity: 0.6 }}>{strip.biome} {strip.weather}</span>
      </div>

      {phase === 'garage' && hydratedLoadout && (
        <DragGarage
          strip={strip}
          loadout={loadout}
          derivation={derived.derivation}
          onChange={onChooseLoadout}
          onConfirm={onConfirmLoadout}
        />
      )}

      {phase === 'staging' && (
        <CenterMessage title="STAGE" body="Pull up to the line." />
      )}

      {phase === 'countdown' && countdownStartedAt !== null && (
        <DragChristmasTree
          startedAt={countdownStartedAt}
          fouled={countdownFouled}
        />
      )}

      {phase === 'racing' && (
        <DragHUD
          elapsedMs={hud.elapsedMs}
          speed={hud.speed}
          fouled={hud.fouled}
          reactionTimeMs={hud.reactionTimeMs}
          splits={hud.splits}
          topSpeed={hud.topSpeed}
        />
      )}

      {phase === 'finished' && finishEvent && (
        <DragSessionSummary
          strip={strip}
          finishEvent={finishEvent}
          leaderboard={leaderboard}
          ghostSource={ghost.source}
          onRaceAgain={onRaceAgain}
          onChangeParts={onChangeParts}
        />
      )}
    </div>
  )
}

function CenterMessage({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: 2 }}>{title}</div>
      <div style={{ opacity: 0.85 }}>{body}</div>
    </div>
  )
}


interface SubmitArgs {
  slug: DragStripSlug
  versionHash: string
  finishEvent: DragLapCompleteEvent
  loadout: DragLoadout
}

async function submitDragRun(args: SubmitArgs): Promise<void> {
  const { slug, versionHash, finishEvent, loadout } = args
  // Mint a fresh token via /api/race/start.
  const startRes = await fetch(
    `/api/race/start?slug=${encodeURIComponent(slug)}&v=${versionHash}`,
    { method: 'POST' },
  )
  if (!startRes.ok) return
  const startData = (await startRes.json()) as {
    token?: string
  }
  const token = typeof startData.token === 'string' ? startData.token : null
  if (!token) return

  let initials = 'YOU'
  try {
    const stored = window.localStorage.getItem('viberacer.initials')
    if (stored && /^[A-Z]{3}$/.test(stored.toUpperCase())) {
      initials = stored.toUpperCase()
    }
  } catch {
    // ignore
  }

  const body = {
    token,
    checkpoints: finishEvent.hits,
    lapTimeMs: finishEvent.finishTimeMs,
    initials,
    mode: 'drag' as const,
    loadout,
    topSpeed: finishEvent.topSpeed,
    fouled: finishEvent.fouled,
    reactionTimeMs: finishEvent.reactionTimeMs ?? undefined,
  }
  await fetch(
    `/api/race/submit?slug=${encodeURIComponent(slug)}&v=${versionHash}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}
