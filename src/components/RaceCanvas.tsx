'use client'
import { useEffect, useRef, type CSSProperties, type MutableRefObject } from 'react'
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
import type { CarParams } from '@/game/physics'
import type { useKeyboard } from '@/hooks/useKeyboard'
import { setGameIntensity } from '@/game/music'
import {
  startEngineDrone,
  startSkid,
  stopEngineDrone,
  stopSkid,
  updateDriveSfx,
} from '@/game/audio'

export interface RaceCanvasHud {
  currentMs: number
  lapCount: number
  onTrack: boolean
  lastLapMs: number | null
}

const HUD_UPDATE_MS = 50

export interface RaceCanvasProps {
  pieces: Piece[]
  paramsRef: MutableRefObject<CarParams>
  keys: ReturnType<typeof useKeyboard>
  pausedRef: MutableRefObject<boolean>
  resumeShiftRef: MutableRefObject<number>
  pendingResetRef: MutableRefObject<boolean>
  pendingRaceStartRef: MutableRefObject<number | null>
  onLapComplete: (event: LapCompleteEvent) => void
  onHudUpdate: (hud: RaceCanvasHud) => void
  disableMusicIntensity?: boolean
  className?: string
  style?: CSSProperties
}

// Owns the WebGL renderer, scene, camera rig, and the rAF loop. The parent
// keeps owning all the pause / reset / countdown state via refs so this
// component stays a pure rendering primitive shared by the race flow and the
// tuning lab. Behavior is identical to the original inline effect.
export function RaceCanvas({
  pieces,
  paramsRef,
  keys,
  pausedRef,
  resumeShiftRef,
  pendingResetRef,
  pendingRaceStartRef,
  onLapComplete,
  onHudUpdate,
  disableMusicIntensity,
  className,
  style,
}: RaceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const onLapCompleteRef = useRef(onLapComplete)
  const onHudUpdateRef = useRef(onHudUpdate)
  const disableMusicRef = useRef(!!disableMusicIntensity)
  onLapCompleteRef.current = onLapComplete
  onHudUpdateRef.current = onHudUpdate
  disableMusicRef.current = !!disableMusicIntensity

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
    let prevHud: RaceCanvasHud | null = null
    let prevOnTrack = true
    let droneStarted = false

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
        prevHud = null
        prevOnTrack = true
        raf = requestAnimationFrame(loop)
        return
      }

      if (pausedRef.current) {
        // Duck the continuous voices while paused so they don't bleed under
        // the pause music. One call per frame is cheap; setTargetAtTime keeps
        // the ramp smooth.
        if (!disableMusicRef.current) {
          updateDriveSfx({
            speedAbs: 0,
            maxSpeed: paramsRef.current.maxSpeed,
            throttle: 0,
            steerAbs: 0,
            onTrack: true,
            prevOnTrack: true,
            racing: false,
          })
        }
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
        paramsRef.current,
      )
      state = result.state

      bundle.car.position.set(state.x, 0, state.z)
      bundle.car.rotation.y = state.heading
      updateCameraRig(rig, state.x, state.z, state.heading)
      bundle.camera.position.set(rig.position.x, rig.position.y, rig.position.z)
      bundle.camera.lookAt(rig.target.x, rig.target.y, rig.target.z)
      renderer.render(bundle.scene, bundle.camera)

      if (!disableMusicRef.current) {
        setGameIntensity(Math.abs(state.speed) / paramsRef.current.maxSpeed)
        const racing = state.raceStartMs !== null
        if (racing && !droneStarted) {
          startEngineDrone()
          startSkid()
          droneStarted = true
        }
        const steerAbs = Math.abs((k.left ? 1 : 0) - (k.right ? 1 : 0))
        const throttle = (k.forward ? 1 : 0) - (k.backward ? 1 : 0)
        updateDriveSfx({
          speedAbs: Math.abs(state.speed),
          maxSpeed: paramsRef.current.maxSpeed,
          throttle,
          steerAbs,
          onTrack: state.onTrack,
          prevOnTrack,
          racing,
        })
        prevOnTrack = state.onTrack
      }

      if (result.lapComplete) onLapCompleteRef.current(result.lapComplete)

      if (ts - lastHudTs >= HUD_UPDATE_MS) {
        lastHudTs = ts
        const currentMs =
          state.raceStartMs !== null ? Math.round(ts - state.raceStartMs) : 0
        const next: RaceCanvasHud = {
          currentMs,
          lapCount: state.lapCount,
          onTrack: state.onTrack,
          lastLapMs: state.lastLapTimeMs,
        }
        if (
          prevHud === null ||
          prevHud.currentMs !== next.currentMs ||
          prevHud.lapCount !== next.lapCount ||
          prevHud.onTrack !== next.onTrack ||
          prevHud.lastLapMs !== next.lastLapMs
        ) {
          prevHud = next
          onHudUpdateRef.current(next)
        }
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      if (!disableMusicRef.current) {
        stopEngineDrone(0.1)
        stopSkid(0.1)
      }
      bundle.dispose()
      renderer.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces])

  return <canvas ref={canvasRef} className={className} style={style} />
}
