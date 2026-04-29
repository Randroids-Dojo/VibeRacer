'use client'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import type { Piece, TrackCheckpoint } from '@/lib/schemas'
import { buildTrackPath } from '@/game/trackPath'
import { buildMinimapGeometry } from '@/game/minimap'

// Live pose published by RaceCanvas every frame. Shared via a ref so the
// minimap can update via direct DOM mutation instead of triggering React
// re-renders 60 times a second.
export interface MinimapPose {
  x: number
  z: number
  heading: number
}

interface MinimapProps {
  pieces: Piece[]
  // Optional override; mainly here for the (currently identical) test layout.
  // Not expected to differ from `pieces.length` in production.
  checkpointCount?: number
  checkpoints?: TrackCheckpoint[]
  carPoseRef: MutableRefObject<MinimapPose | null>
  // Optional ghost overlay. When the ref is null or its current is null we
  // simply hide the marker.
  ghostPoseRef?: MutableRefObject<MinimapPose | null>
  compact?: boolean
  placement?: 'bottomRight' | 'topRight'
}

// Compact top-down minimap. Renders a static SVG outline of the track with
// two animated markers (player + ghost). The outline is computed once when
// the pieces change; the markers update via direct DOM mutation in a small
// rAF loop so dragging the camera or driving fast does not pile per-frame
// React work into the HUD update lane.
export function Minimap({
  pieces,
  checkpointCount,
  checkpoints,
  carPoseRef,
  ghostPoseRef,
  compact = false,
  placement = 'bottomRight',
}: MinimapProps) {
  const geom = useMemo(() => {
    const path = buildTrackPath(pieces, checkpointCount, checkpoints)
    return buildMinimapGeometry(path)
  }, [pieces, checkpointCount, checkpoints])

  const carDotRef = useRef<SVGGElement | null>(null)
  const ghostDotRef = useRef<SVGGElement | null>(null)

  useEffect(() => {
    let raf = 0
    let running = true
    function frame() {
      if (!running) return
      const car = carPoseRef.current
      if (carDotRef.current) {
        if (car) {
          const v = geom.worldToView(car.x, car.z)
          // Heading 0 = +X (east). The arrow glyph below points toward +X
          // before any rotation, so a positive heading rotates it CCW. SVG
          // transforms use CW degrees, so we negate. Z flips on top of that
          // (SVG Y grows downward) so the rotation also flips sign.
          const deg = -car.heading * (180 / Math.PI)
          carDotRef.current.setAttribute(
            'transform',
            `translate(${v.x.toFixed(2)} ${v.y.toFixed(2)}) rotate(${deg.toFixed(1)})`,
          )
          carDotRef.current.style.opacity = '1'
        } else {
          carDotRef.current.style.opacity = '0'
        }
      }
      const ghost = ghostPoseRef?.current ?? null
      if (ghostDotRef.current) {
        if (ghost) {
          const v = geom.worldToView(ghost.x, ghost.z)
          const deg = -ghost.heading * (180 / Math.PI)
          ghostDotRef.current.setAttribute(
            'transform',
            `translate(${v.x.toFixed(2)} ${v.y.toFixed(2)}) rotate(${deg.toFixed(1)})`,
          )
          ghostDotRef.current.style.opacity = '0.7'
        } else {
          ghostDotRef.current.style.opacity = '0'
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      running = false
      cancelAnimationFrame(raf)
    }
  }, [geom, carPoseRef, ghostPoseRef])

  // Project the start piece's spawn point to mark it on the map. Players read
  // a small green pill as "you start here" without us having to draw a giant
  // label inside the card.
  const startMarker = useMemo(() => {
    const path = buildTrackPath(pieces, checkpointCount, checkpoints)
    return geom.worldToView(path.spawn.position.x, path.spawn.position.z)
  }, [geom, pieces, checkpointCount, checkpoints])

  const checkpointMarkers = useMemo(() => {
    const path = buildTrackPath(pieces, checkpointCount, checkpoints)
    return path.checkpointMarkers.map((marker) =>
      geom.worldToView(marker.position.x, marker.position.z),
    )
  }, [geom, pieces, checkpointCount, checkpoints])

  return (
    <div
      style={{
        ...cardStyle,
        ...(compact ? compactCardStyle : null),
        ...(placement === 'topRight' ? topRightCardStyle : null),
        ...(placement === 'topRight' && compact ? compactTopRightCardStyle : null),
      }}
      aria-hidden
    >
      <svg
        viewBox={`0 0 ${geom.viewSize} ${geom.viewSize}`}
        width="100%"
        height="100%"
        style={svgStyle}
      >
        <rect
          x={0}
          y={0}
          width={geom.viewSize}
          height={geom.viewSize}
          fill="rgba(0,0,0,0.0)"
        />
        {/* Track outline. Drawn as one stroke per piece so heavy curves do
            not pixelate against straight neighbors. */}
        {geom.pieces.map((d, i) => (
          <path
            key={i}
            d={d}
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={3.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
        {geom.pieces.map((d, i) => (
          <path
            key={`c${i}`}
            d={d}
            stroke="#5fe08a"
            strokeWidth={0.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="2 2"
            fill="none"
            opacity={0.6}
          />
        ))}
        {/* Start dot. Small enough to live alongside the markers without
            getting in the way. */}
        <circle
          cx={startMarker.x}
          cy={startMarker.y}
          r={2.6}
          fill="#5fe08a"
          stroke="rgba(0,0,0,0.4)"
          strokeWidth={0.4}
        />
        {checkpointMarkers.map((marker, i) => (
          <circle
            key={`cp-${i}`}
            cx={marker.x}
            cy={marker.y}
            r={2.2}
            fill="#ffb347"
            stroke="rgba(0,0,0,0.5)"
            strokeWidth={0.4}
          />
        ))}
        {/* Ghost marker rendered before the player so the player sits on top
            in case of overlap. */}
        {ghostPoseRef ? (
          <g ref={ghostDotRef} style={{ opacity: 0 }}>
            <circle r={2.4} fill="rgba(64,224,208,0.85)" />
          </g>
        ) : null}
        <g ref={carDotRef} style={{ opacity: 0 }}>
          <polygon
            points="3.6,0 -2.4,-2.4 -1,0 -2.4,2.4"
            fill="#ffd24a"
            stroke="rgba(0,0,0,0.55)"
            strokeWidth={0.4}
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  position: 'fixed',
  right: 12,
  bottom: 12,
  width: 132,
  height: 132,
  background: 'rgba(0,0,0,0.45)',
  borderRadius: 12,
  padding: 6,
  pointerEvents: 'none',
  boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
  zIndex: 10,
}
const topRightCardStyle: React.CSSProperties = {
  top: 112,
  bottom: 'auto',
}
const compactTopRightCardStyle: React.CSSProperties = {
  top: 106,
}
const compactCardStyle: React.CSSProperties = {
  width: 88,
  height: 88,
  borderRadius: 8,
  padding: 4,
}
const svgStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
}
