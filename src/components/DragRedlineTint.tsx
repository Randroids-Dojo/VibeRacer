'use client'
import { useEffect, useRef, type CSSProperties, type MutableRefObject } from 'react'

interface DragRedlineTintProps {
  // Parent-owned intensity ref in [0, 1]. The overlay reads it from a
  // self-owned rAF loop so the redline pulse updates at 60 Hz without
  // sending React re-renders into the rest of the HUD tree. 0 hides the
  // tint entirely; 1 is full bleed.
  intensityRef: MutableRefObject<number>
}

// Full-screen vignette that bleeds inward from the edges when the player
// holds peak speed inside a gear. The radial gradient's inner-stop
// position is computed from the intensity (0 -> gradient sits entirely
// outside the visible area; 1 -> bleeds well past the corners), and the
// overlay's overall opacity scales too so the effect fades in / out
// smoothly instead of snapping when the player drops out of redline.
export function DragRedlineTint({ intensityRef }: DragRedlineTintProps) {
  const divRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let raf = 0
    let prev = -1
    function frame() {
      const raw = intensityRef.current
      const intensity = clamp01(Number.isFinite(raw) ? raw : 0)
      if (Math.abs(intensity - prev) > 0.005 && divRef.current) {
        // Inner stop shrinks the transparent core as intensity grows:
        //   0   -> transparent out to 95% (red barely visible)
        //   1   -> transparent only out to 35% (red bleeds well in)
        const innerStop = (95 - intensity * 60).toFixed(1)
        // Edge opacity ramps with intensity so the gradient feels
        // present, not just the center.
        const edgeAlpha = (0.45 + intensity * 0.45).toFixed(3)
        divRef.current.style.background =
          `radial-gradient(ellipse 100% 100% at center, ` +
          `rgba(255, 36, 36, 0) ${innerStop}%, ` +
          `rgba(255, 36, 36, ${edgeAlpha}) 100%)`
        divRef.current.style.opacity = intensity < 0.03 ? '0' : '1'
        prev = intensity
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [intensityRef])

  return <div ref={divRef} style={overlay} aria-hidden />
}

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

const overlay: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  opacity: 0,
  transition: 'opacity 0.18s linear',
  zIndex: 11,
  mixBlendMode: 'screen',
}
