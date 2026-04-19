'use client'
import { useEffect, useRef } from 'react'
import { WebGLRenderer } from 'three'
import { buildTrackPath, samplePieceAt, trackCenter } from '@/game/trackPath'
import { buildScene } from '@/game/sceneBuilder'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'

const TIME_PER_PIECE_SEC = 1.4
const CAMERA_ORBIT_RAD_PER_SEC = 0.06
const CAMERA_DISTANCE = 70
const CAMERA_HEIGHT = 42

export function TitleBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const { scene, camera, car, dispose } = buildScene(path)
    const center = trackCenter(path)

    const renderer = new WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    let needsResize = true
    const onResize = () => {
      needsResize = true
    }
    window.addEventListener('resize', onResize)

    const totalTime = path.order.length * TIME_PER_PIECE_SEC
    let t0 = performance.now()
    let pausedAccum = 0
    let pauseStart: number | null = null
    let raf = 0

    const onVisibility = () => {
      if (document.hidden) {
        if (pauseStart === null) pauseStart = performance.now()
        cancelAnimationFrame(raf)
        raf = 0
      } else {
        if (pauseStart !== null) {
          pausedAccum += performance.now() - pauseStart
          pauseStart = null
        }
        if (raf === 0) raf = requestAnimationFrame(loop)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    function loop() {
      if (needsResize) {
        const w = canvas!.clientWidth || window.innerWidth
        const h = canvas!.clientHeight || window.innerHeight
        renderer.setSize(w, h, false)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        needsResize = false
      }

      const elapsed = (performance.now() - t0 - pausedAccum) / 1000
      const s = elapsed % totalTime
      const pieceIdx = Math.floor(s / TIME_PER_PIECE_SEC) % path.order.length
      const local = (s % TIME_PER_PIECE_SEC) / TIME_PER_PIECE_SEC
      const pose = samplePieceAt(path.order[pieceIdx], local)
      car.position.set(pose.position.x, 0, pose.position.z)
      car.rotation.y = pose.heading

      const orbit = elapsed * CAMERA_ORBIT_RAD_PER_SEC
      camera.position.set(
        center.x + Math.cos(orbit) * CAMERA_DISTANCE,
        CAMERA_HEIGHT,
        center.z + Math.sin(orbit) * CAMERA_DISTANCE,
      )
      camera.lookAt(center.x, 0, center.z)

      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', onResize)
      renderer.forceContextLoss()
      renderer.dispose()
      dispose()
    }
  }, [])

  return <canvas ref={canvasRef} style={canvasStyle} aria-hidden="true" />
}

const canvasStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  width: '100%',
  height: '100%',
  zIndex: 0,
  pointerEvents: 'none',
  display: 'block',
}
