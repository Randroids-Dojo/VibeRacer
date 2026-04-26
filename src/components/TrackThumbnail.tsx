// Small SVG preview of a track's road layout. Used by the home-page recent
// list and the fresh-slug landing page so a player can recognize a track
// from its silhouette without having to load the full 3D scene.

import type { TrackThumbnail as ThumbnailGeometry } from '@/lib/trackThumbnail'

interface Props {
  thumbnail: ThumbnailGeometry
  // Square pixel size for the rendered SVG. Defaults to the thumbnail's
  // viewBox edge length so the preview renders crisply at 1:1; pass a smaller
  // number if the surrounding layout demands it.
  size?: number
  // Optional alt text for screen readers. Defaults to a generic label so the
  // images do not narrate as a meaningless `image` to assistive tech.
  ariaLabel?: string
}

const ROAD_FILL = 'rgba(0, 0, 0, 0.55)'
const ROAD_STROKE = '#ffe079'
const SPAWN_FILL = '#79f0a8'
const BACKGROUND_FILL = 'rgba(255, 255, 255, 0.08)'

export function TrackThumbnail({ thumbnail, size, ariaLabel }: Props) {
  const view = thumbnail.viewSize
  const stroke = thumbnail.roadStrokeWidth
  const spawnRadius = Math.max(stroke * 0.45, 1.4)
  return (
    <svg
      width={size ?? view}
      height={size ?? view}
      viewBox={`0 0 ${view} ${view}`}
      style={{ display: 'block', borderRadius: 6, background: BACKGROUND_FILL }}
      role="img"
      aria-label={ariaLabel ?? 'Track preview'}
    >
      {/* Dark road band. We draw two passes per piece: a thicker dark stroke
          for the asphalt body and a thin yellow center line so corners read
          as a road silhouette rather than a wireframe. */}
      <g
        fill="none"
        stroke={ROAD_FILL}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {thumbnail.pieces.map((d, i) => (
          <path key={`road-${i}`} d={d} />
        ))}
      </g>
      <g
        fill="none"
        stroke={ROAD_STROKE}
        strokeWidth={Math.max(stroke * 0.12, 0.6)}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
        strokeDasharray={`${stroke * 0.6} ${stroke * 0.4}`}
      >
        {thumbnail.pieces.map((d, i) => (
          <path key={`center-${i}`} d={d} />
        ))}
      </g>
      <circle
        cx={thumbnail.spawn.x}
        cy={thumbnail.spawn.y}
        r={spawnRadius}
        fill={SPAWN_FILL}
        stroke="#0e2a17"
        strokeWidth={Math.max(stroke * 0.06, 0.4)}
      />
    </svg>
  )
}
