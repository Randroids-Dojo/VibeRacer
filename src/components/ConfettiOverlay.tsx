'use client'
/**
 * ConfettiOverlay
 *
 * Full-viewport, click-through canvas that paints a celebratory burst of
 * tumbling chips when the player posts a personal best ('pb') or beats the
 * track-wide record ('record').
 *
 * The overlay is always mounted under the HUD. Confetti is triggered by the
 * `triggerKey` prop: each time it changes (and `kind` is a celebration), a
 * fresh batch is spawned via `spawnConfettiBatch` and runs to completion.
 * Idle ticks short-circuit before any draw work so a quiet race has zero
 * canvas overhead beyond the empty mount.
 *
 * Particle sim runs in normalized 0..1 viewport coords (see `confetti.ts`),
 * which means a window resize never knocks the simulation out of sync. The
 * draw pass multiplies by the current canvas size every frame.
 */
import { useEffect, useRef } from 'react'
import {
  CONFETTI_PALETTE_PB,
  CONFETTI_PALETTE_RECORD,
  CONFETTI_PB_COUNT,
  CONFETTI_RECORD_COUNT,
  type ConfettiParticle,
  confettiAlpha,
  isBatchExpired,
  spawnConfettiBatch,
  stepConfetti,
} from '@/game/confetti'

export type ConfettiKind = 'pb' | 'record'

interface Props {
  /**
   * Celebration kind. When this is a non-null value AND `triggerKey` differs
   * from the previous render, a fresh batch is spawned. `null` means idle.
   */
  kind: ConfettiKind | null
  /**
   * Monotonic key that changes once per celebration. The component spawns a
   * new batch only on a key change so a re-render with the same key (HUD
   * state churn) does not double-fire confetti.
   */
  triggerKey: number
}

export function ConfettiOverlay({ kind, triggerKey }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const particlesRef = useRef<ConfettiParticle[]>([])
  const lastFrameRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastKeyRef = useRef<number | null>(null)
  // Per-spawn seed bumps with each trigger so deterministic-but-varied bursts
  // stack visually rather than landing on top of one another.
  const spawnCounterRef = useRef(0)

  // Mount once: size the canvas to the device pixel ratio and keep it in
  // sync with viewport resizes. The simulation lives in 0..1 coords so a
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

  // Spawn a fresh batch whenever the trigger key advances and `kind` is set.
  useEffect(() => {
    if (kind === null) return
    if (lastKeyRef.current === triggerKey) return
    lastKeyRef.current = triggerKey
    spawnCounterRef.current += 1
    const seed = (triggerKey * 1009 + spawnCounterRef.current * 31) >>> 0
    const opts = optsFor(kind, seed)
    const fresh = spawnConfettiBatch(opts)
    // Append rather than replace so a 'record' burst right after a 'pb' does
    // not snap the existing chips out of the air.
    particlesRef.current.push(...fresh)
    ensureRafRunning()
    // ensureRafRunning is stable (closes only over refs) so leaving it out of
    // the deps array is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, triggerKey])

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

      const ps = particlesRef.current
      stepConfetti(ps, dtSec, dtMs)

      // Draw pass.
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const W = canvas.width
      const H = canvas.height
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]!
        const a = confettiAlpha(p.ageMs)
        if (a <= 0) continue
        // Cull off-screen particles below the viewport (gravity guarantees
        // they keep falling).
        if (p.y > 1.2) continue
        const px = p.x * W
        const py = p.y * H
        const half = (p.size * Math.min(W, H)) / 2
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(p.rot)
        ctx.globalAlpha = a
        ctx.fillStyle = p.color
        // Rectangular chip (paper flake). 1.6:1 aspect reads as confetti
        // rather than dust at small sizes.
        ctx.fillRect(-half, -half * 0.6, half * 2, half * 1.2)
        ctx.restore()
      }

      // Drop fully expired particles. We compact in place so the simulation
      // and draw cost both stay proportional to live particle count.
      if (ps.length > 0 && (isBatchExpired(ps) || ps.length > 600)) {
        const live: ConfettiParticle[] = []
        for (let i = 0; i < ps.length; i++) {
          const p = ps[i]!
          if (confettiAlpha(p.ageMs) > 0 && p.y <= 1.2) live.push(p)
        }
        particlesRef.current = live
      }

      if (particlesRef.current.length === 0) {
        rafRef.current = null
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  // Cancel any in-flight rAF on unmount so we do not leak across page nav.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      particlesRef.current = []
    }
  }, [])

  return <canvas ref={canvasRef} style={canvasStyle} aria-hidden />
}

function optsFor(kind: ConfettiKind, seed: number) {
  if (kind === 'record') {
    return {
      count: CONFETTI_RECORD_COUNT,
      palette: CONFETTI_PALETTE_RECORD,
      seed,
      origin: { x: 0.5, y: 0.42 },
      speedMin: 0.55,
      speedMax: 1.4,
      sizeMin: 0.008,
      sizeMax: 0.018,
    }
  }
  return {
    count: CONFETTI_PB_COUNT,
    palette: CONFETTI_PALETTE_PB,
    seed,
    origin: { x: 0.5, y: 0.45 },
    speedMin: 0.45,
    speedMax: 1.1,
    sizeMin: 0.006,
    sizeMax: 0.014,
  }
}

const canvasStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  // Sit above the HUD's burst so confetti reads as the dominant celebration
  // layer. HUD wrap is z-index 10; bumping to 12 keeps it under the pause
  // overlay (which uses higher z) so a paused player does not get covered.
  zIndex: 12,
}
