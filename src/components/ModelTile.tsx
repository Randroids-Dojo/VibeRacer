'use client'

import { useEffect, useRef } from 'react'
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  type Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'

interface ModelTileProps {
  // Object to display. The tile parents it under an internal rotator group,
  // so the same Object3D should not be passed to two tiles simultaneously.
  object: Object3D | null
  label?: string
  size?: number
  // Rotations per second around the vertical axis. Negative spins clockwise
  // when viewed from above (the user's preference).
  rotationSpeed?: number
  // Background fill of the canvas. Defaults to a neutral mid-gray that lets
  // both light and dark cars stand out.
  background?: string
  // Optional overlay drawn over the canvas. Useful for tagging the
  // "destroyed" tile with a note like "no damage system" on non-derby cars.
  overlay?: React.ReactNode
}

export function ModelTile({
  object,
  label,
  size = 280,
  rotationSpeed = -0.8,
  background = '#2a2a32',
  overlay,
}: ModelTileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(size, size)
    container.appendChild(renderer.domElement)

    const scene = new Scene()
    scene.background = new Color(background)

    const camera = new PerspectiveCamera(35, 1, 0.05, 200)
    const ambient = new AmbientLight(0xffffff, 0.6)
    const sun = new DirectionalLight(0xffffff, 1.1)
    sun.position.set(4, 8, 6)
    scene.add(ambient, sun)

    const rotator = new Group()
    scene.add(rotator)

    // Clone the input so multiple tiles can render the same source group
    // simultaneously without fighting over .parent. The caller hands us a
    // long-lived reference; we own the in-tile copy and dispose it on
    // unmount. clone(true) deep-clones the subtree but shares geometries
    // and materials, which is exactly what we want here.
    const display = object ? object.clone(true) : null
    if (display) {
      // Center the displayed copy on the rotator so it spins around its
      // own middle rather than around an offset origin from the source
      // file. Frame the camera against the object's diagonal so a tiny
      // door panel and a full car both fill the viewport.
      const bbox = new Box3().setFromObject(display)
      const center = bbox.getCenter(new Vector3())
      const sizeVec = bbox.getSize(new Vector3())
      display.position.sub(center)
      rotator.add(display)
      const diag = Math.max(sizeVec.length(), 0.5)
      const dist = diag * 1.2
      camera.position.set(dist, dist * 0.55, dist)
      camera.lookAt(0, 0, 0)
    }

    let raf = 0
    let prev = performance.now()
    const tick = (now: number) => {
      const dt = Math.min((now - prev) / 1000, 0.1)
      prev = now
      rotator.rotation.y += rotationSpeed * dt
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      if (display && display.parent === rotator) rotator.remove(display)
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [object, size, rotationSpeed, background])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: size,
          height: size,
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 6px 14px rgba(0,0,0,0.35)',
        }}
      >
        {overlay}
      </div>
      {label && (
        <div
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.8)',
            fontWeight: 600,
            letterSpacing: 0.3,
          }}
        >
          {label}
        </div>
      )}
    </div>
  )
}
