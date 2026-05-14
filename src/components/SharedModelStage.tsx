'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import {
  Color,
  type PerspectiveCamera,
  type Scene,
  WebGLRenderer,
} from 'three'

// Each ModelTile previously owned its own WebGLRenderer. With ~15 tiles on
// the page, mobile Chrome (which caps WebGL contexts around 8) silently
// evicted the oldest contexts and the hero tiles rendered as blank canvases.
// One shared renderer drawing into a single full-viewport canvas, with each
// tile claiming a scissor rect, sidesteps the limit entirely.
export interface TileRegistration {
  element: HTMLElement
  scene: Scene
  camera: PerspectiveCamera
  clearColor: string
  // Called once per frame before render. `dt` is seconds since last frame.
  onTick: (dt: number) => void
}

interface StageCtxValue {
  register: (tile: TileRegistration) => () => void
}

const StageCtx = createContext<StageCtxValue | null>(null)

export function useStage(): StageCtxValue {
  const ctx = useContext(StageCtx)
  if (!ctx) {
    throw new Error('ModelTile must be rendered inside <SharedModelStage>')
  }
  return ctx
}

export function SharedModelStage({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const tilesRef = useRef<TileRegistration[]>([])

  const ctxValue = useMemo<StageCtxValue>(
    () => ({
      register(tile) {
        tilesRef.current = [...tilesRef.current, tile]
        return () => {
          tilesRef.current = tilesRef.current.filter((t) => t !== tile)
        }
      },
    }),
    [],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setScissorTest(true)

    const tmpColor = new Color()
    let raf = 0
    let prev = performance.now()

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min((now - prev) / 1000, 0.1)
      prev = now

      const w = window.innerWidth
      const h = window.innerHeight
      renderer.setSize(w, h, false)

      // Clear everything once with full transparency before any scissor is
      // applied. Tiles below paint their own backgrounds via clearColor.
      renderer.setScissorTest(false)
      renderer.setClearColor(0x000000, 0)
      renderer.clear()
      renderer.setScissorTest(true)

      for (const tile of tilesRef.current) {
        const rect = tile.element.getBoundingClientRect()
        if (
          rect.bottom < 0 ||
          rect.top > h ||
          rect.right < 0 ||
          rect.left > w ||
          rect.width <= 0 ||
          rect.height <= 0
        ) {
          // Still tick so rotation accumulates while offscreen. Otherwise
          // scrolling back snaps a quarter-rotation in.
          tile.onTick(dt)
          continue
        }

        const yUp = h - rect.bottom
        renderer.setScissor(rect.left, yUp, rect.width, rect.height)
        renderer.setViewport(rect.left, yUp, rect.width, rect.height)
        tmpColor.set(tile.clearColor)
        renderer.setClearColor(tmpColor, 1)
        renderer.clear()

        tile.camera.aspect = rect.width / rect.height
        tile.camera.updateProjectionMatrix()

        tile.onTick(dt)
        renderer.render(tile.scene, tile.camera)
      }
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      renderer.dispose()
    }
  }, [])

  return (
    <StageCtx.Provider value={ctxValue}>
      {children}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
          zIndex: 5,
        }}
      />
    </StageCtx.Provider>
  )
}
