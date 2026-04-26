'use client'
/**
 * SpeedLinesOverlay
 *
 * Full-viewport, click-through canvas that paints thin streaks radiating
 * outward from the screen center while the player is going fast. Inspired by
 * anime racing titles and the rush moments in Forza Horizon: a cosmetic
 * visual layer that sells velocity without affecting gameplay.
 *
 * The overlay is mounted alongside the HUD during the racing phase and reads
 * the player's live speed plus current `maxSpeed` tuning through refs so the
 * 60 Hz update never sends React re-renders into the rest of the HUD tree.
 *
 * Idle ticks (speed below threshold AND no live streaks) cancel the rAF loop
 * outright so a parked car does not pay any per-frame cost. The loop reignites
 * the moment the speed crosses threshold again.
 */
import { useEffect, useRef, type MutableRefObject } from 'react'
import { speedFraction } from '@/lib/speedometer'
import {
  SPEED_LINES_COLOR_HEX,
  SPEED_LINES_POOL_MAX,
  type SpeedLineParticle,
  isStreakExpired,
  makeSpeedLinesRng,
  spawnSpeedLine,
  speedLineSpawnCount,
  speedLinesIntensity,
  stepSpeedLines,
  streakAlpha,
} from '@/game/speedLines'

interface Props {
  /** Live signed speed in world units / second. */
  speedRef: MutableRefObject<number>
  /** Live tuning's `maxSpeed` for the threshold check. */
  maxSpeedRef: MutableRefObject<number>
}

export function SpeedLinesOverlay({ speedRef, maxSpeedRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const particlesRef = useRef<SpeedLineParticle[]>([])
  const rafRef = useRef<number | null>(null)
  const lastFrameRef = useRef<number | null>(null)
  const carryRef = useRef<number>(0)
  const rngRef = useRef<(() => number) | null>(null)

  // Mount once: size the canvas to the device pixel ratio and keep it in sync
  // with viewport resizes. The simulation lives in 0..1 normalized coords so a
  // resize is purely a draw concern.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    function fit() {
      if (!canvas) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  // Drive the rAF loop. Polls the speed ref each frame; if the player is below
  // the threshold AND the pool is empty, the loop self-cancels and only
  // restarts when a polling interval (below) catches the next speed-up.
  useEffect(() => {
    if (!rngRef.current) {
      // Seed once per mount so two consecutive races do not run on identical
      // streak patterns. Using performance.now() avoids importing crypto for
      // a purely cosmetic seed.
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      rngRef.current = makeSpeedLinesRng(Math.floor(now) >>> 0)
    }
    const rng = rngRef.current

    function ensureRafRunning() {
      if (rafRef.current !== null) return
      lastFrameRef.current = null
      const tick = (now: number) => {
        const canvas = canvasRef.current
        if (!canvas) {
          rafRef.current = null
          return
        }
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          rafRef.current = null
          return
        }
        const last = lastFrameRef.current
        lastFrameRef.current = now
        const dtMs = last === null ? 16 : Math.min(64, now - last)
        const dtSec = dtMs / 1000

        const raw = speedRef.current
        const max = maxSpeedRef.current
        const fraction = speedFraction(raw, max)
        const intensity = speedLinesIntensity(fraction)

        // Spawn fresh streaks when the player is past threshold.
        if (intensity > 0) {
          const { spawn, nextCarry } = speedLineSpawnCount(
            fraction,
            dtSec,
            carryRef.current,
          )
          carryRef.current = nextCarry
          for (let i = 0; i < spawn; i++) {
            // Soft-cap the live pool: drop the oldest when we run past the
            // ceiling so a long top-speed straight does not run away on the
            // garbage collector.
            if (particlesRef.current.length >= SPEED_LINES_POOL_MAX) {
              particlesRef.current.shift()
            }
            particlesRef.current.push(spawnSpeedLine(rng, intensity))
          }
        } else {
          carryRef.current = 0
        }

        // Step every live streak forward.
        stepSpeedLines(particlesRef.current, dtMs)

        // Compact expired streaks out of the array.
        if (particlesRef.current.length > 0) {
          const live: SpeedLineParticle[] = []
          for (let i = 0; i < particlesRef.current.length; i++) {
            const p = particlesRef.current[i]!
            if (!isStreakExpired(p)) live.push(p)
          }
          particlesRef.current = live
        }

        // Draw pass. Clear, then stroke each streak as a thin line from its
        // inner endpoint outward along its angle.
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        const W = canvas.width
        const H = canvas.height
        const cx = W / 2
        const cy = H / 2
        const minDim = Math.min(W, H)
        ctx.strokeStyle = SPEED_LINES_COLOR_HEX
        // Streak thickness scales with screen size so a large monitor does not
        // get hair-thin lines and a phone does not get a thick smear.
        ctx.lineWidth = Math.max(1, Math.round(minDim * 0.0025))
        ctx.lineCap = 'round'
        const ps = particlesRef.current
        for (let i = 0; i < ps.length; i++) {
          const p = ps[i]!
          const a = streakAlpha(p.ageMs, p.peakAlpha)
          if (a <= 0) continue
          const cosA = Math.cos(p.angle)
          const sinA = Math.sin(p.angle)
          const x0 = cx + cosA * p.startRadius * minDim
          const y0 = cy + sinA * p.startRadius * minDim
          const x1 = cx + cosA * (p.startRadius + p.length) * minDim
          const y1 = cy + sinA * (p.startRadius + p.length) * minDim
          ctx.globalAlpha = a
          ctx.beginPath()
          ctx.moveTo(x0, y0)
          ctx.lineTo(x1, y1)
          ctx.stroke()
        }
        ctx.globalAlpha = 1

        // Self-cancel when the player drops below threshold AND the pool has
        // fully drained. The polling effect below will re-arm the loop on the
        // next speed-up.
        if (intensity <= 0 && particlesRef.current.length === 0) {
          rafRef.current = null
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          return
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    // Poll the speed ref a few times per second to re-arm the rAF loop when
    // the player accelerates past threshold from a parked / slow state. The
    // interval is cheap (one ref read + one comparison per tick) and avoids
    // running a 60 Hz loop while the car is stationary.
    const pollId = window.setInterval(() => {
      if (rafRef.current !== null) return
      const fraction = speedFraction(speedRef.current, maxSpeedRef.current)
      if (speedLinesIntensity(fraction) > 0) {
        ensureRafRunning()
      }
    }, 200)

    // Kick off immediately in case the player is already above threshold on
    // mount (e.g. mid-race re-mount after an unrelated remount).
    ensureRafRunning()

    return () => {
      window.clearInterval(pollId)
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      particlesRef.current = []
    }
  }, [speedRef, maxSpeedRef])

  return <canvas ref={canvasRef} style={canvasStyle} aria-hidden />
}

const canvasStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  // Sit just under the confetti and HUD so a celebration burst draws on top
  // of the speed streaks rather than competing with them.
  zIndex: 11,
}
