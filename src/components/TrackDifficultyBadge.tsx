import {
  analyzeTrack,
  colorForTier,
  labelForTier,
  TRACK_DIFFICULTY_DESCRIPTIONS,
  type TrackDifficultyInfo,
} from '@/game/trackDifficulty'
import type { Piece } from '@/lib/schemas'

/**
 * Compact pill that surfaces a track's difficulty rating computed from its
 * piece array. The badge tints to the tier color (green easy, blue moderate,
 * amber hard, red expert) so the player can scan a list of tracks and pick
 * one that matches their mood. Uses no client-only APIs so it can render
 * inside server components on the home page alongside `RecentTrackList`.
 */
export interface TrackDifficultyBadgeProps {
  // Pass either a precomputed analysis (when the caller already had pieces
  // handy and wants to avoid recomputing) or the raw pieces array. When both
  // are present, `info` wins.
  info?: TrackDifficultyInfo | null
  pieces?: Piece[] | null
  size?: 'sm' | 'md'
}

export function TrackDifficultyBadge({
  info,
  pieces,
  size = 'sm',
}: TrackDifficultyBadgeProps) {
  const resolved = info ?? analyzeTrack(pieces ?? null)
  if (!resolved || resolved.breakdown.pieceCount === 0) return null
  const color = colorForTier(resolved.tier)
  const label = labelForTier(resolved.tier)
  const description = TRACK_DIFFICULTY_DESCRIPTIONS[resolved.tier]
  const tooltip = `Difficulty: ${label} (${resolved.score}/100). ${description}`
  const dim = size === 'sm' ? smStyle : mdStyle
  const dotDim = size === 'sm' ? dotSm : dotMd
  return (
    <span
      style={{
        ...baseStyle,
        ...dim,
        background: hexWithAlpha(color, 0.16),
        borderColor: hexWithAlpha(color, 0.4),
        color: hexLightenForText(color),
      }}
      title={tooltip}
      aria-label={tooltip}
    >
      <span
        style={{
          ...dotStyle,
          ...dotDim,
          background: color,
          boxShadow: `0 0 0 1px rgba(0,0,0,0.35)`,
        }}
        aria-hidden="true"
      />
      <span>{label}</span>
    </span>
  )
}

// Convert "#rrggbb" to "rgba(r,g,b,a)" so the badge background can be
// translucent without depending on the consumer to predefine an alpha hex.
function hexWithAlpha(hex: string, alpha: number): string {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return `rgba(255,255,255,${alpha})`
  }
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// Lift the text color off the saturated tier hex so it stays readable on a
// translucent dark background. Mixes the tier color toward white by 35%.
function hexLightenForText(hex: string): string {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return '#ffffff'
  }
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const mix = 0.35
  const lr = Math.round(r + (255 - r) * mix)
  const lg = Math.round(g + (255 - g) * mix)
  const lb = Math.round(b + (255 - b) * mix)
  return `rgb(${lr},${lg},${lb})`
}

const baseStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 6,
  fontFamily: 'monospace',
  fontWeight: 700,
  letterSpacing: 0.5,
  whiteSpace: 'nowrap',
  flex: '0 0 auto',
}
const smStyle: React.CSSProperties = {
  fontSize: 10,
  padding: '2px 6px',
}
const mdStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '4px 9px',
}
const dotStyle: React.CSSProperties = {
  display: 'inline-block',
  borderRadius: '50%',
  flex: '0 0 auto',
}
const dotSm: React.CSSProperties = {
  width: 6,
  height: 6,
}
const dotMd: React.CSSProperties = {
  width: 8,
  height: 8,
}
