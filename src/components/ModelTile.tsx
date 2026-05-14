'use client'

import { useEffect, useRef } from 'react'
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  type Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three'
import { useStage } from './SharedModelStage'

interface ModelTileProps {
  // Object to display. The tile parents a deep clone under an internal
  // rotator group, so the same Object3D can be handed to multiple tiles.
  object: Object3D | null
  label?: string
  size?: number
  // Rotations per second around the vertical axis. Negative spins clockwise
  // when viewed from above (the user's preference).
  rotationSpeed?: number
  // Fill behind the model. Painted by the shared renderer via setClearColor
  // inside the tile's scissor rect, so the visible color matches a
  // dedicated canvas even though all tiles share one canvas underneath.
  background?: string
  // Optional caption rendered below the tile. (Older versions overlaid
  // text inside the canvas region; a sibling caption avoids the shared
  // canvas painting over it.)
  caption?: string
}

export function ModelTile({
  object,
  label,
  size = 280,
  rotationSpeed = -0.8,
  background = '#2a2a32',
  caption,
}: ModelTileProps) {
  const placeholderRef = useRef<HTMLDivElement | null>(null)
  const stage = useStage()

  useEffect(() => {
    const element = placeholderRef.current
    if (!element) return

    const scene = new Scene()
    const camera = new PerspectiveCamera(35, 1, 0.05, 200)
    const ambient = new AmbientLight(0xffffff, 0.6)
    const sun = new DirectionalLight(0xffffff, 1.1)
    sun.position.set(4, 8, 6)
    scene.add(ambient, sun)

    const rotator = new Group()
    scene.add(rotator)

    // Deep-clone the source so two tiles can show the same Object3D
    // simultaneously without fighting over .parent. clone(true) shares
    // geometries and materials, which is what we want for this view.
    const display = object ? object.clone(true) : null
    if (display) {
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

    const unregister = stage.register({
      element,
      scene,
      camera,
      clearColor: background,
      onTick: (dt) => {
        rotator.rotation.y += rotationSpeed * dt
      },
    })

    return () => {
      unregister()
      if (display && display.parent === rotator) rotator.remove(display)
    }
  }, [object, rotationSpeed, background, stage])

  return (
    <div
      data-testid={label ? `model-tile-${label}` : 'model-tile'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <div
        ref={placeholderRef}
        style={{
          width: size,
          height: size,
          borderRadius: 12,
          background,
          overflow: 'hidden',
          boxShadow: '0 6px 14px rgba(0,0,0,0.35)',
        }}
      />
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
      {caption && (
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {caption}
        </div>
      )}
    </div>
  )
}
