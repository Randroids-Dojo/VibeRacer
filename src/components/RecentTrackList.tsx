import Link from 'next/link'
import type { Piece } from '@/lib/schemas'
import { buildTrackThumbnail } from '@/lib/trackThumbnail'
import { formatLapTime } from '@/lib/share'
import type { TopTime } from '@/lib/recentTracks'
import { TrackThumbnail } from './TrackThumbnail'
import { TrackDifficultyBadge } from './TrackDifficultyBadge'

export interface RecentTrackListItem {
  slug: string
  label: string
  // Optional pieces for the slug. When present we render a small preview
  // thumbnail next to the row so the player can recognize a track from its
  // silhouette without opening it. When null, the row falls back to the
  // text-only layout used before previews shipped.
  pieces?: Piece[] | null
  // Optional top time on the latest version of this track. When present a
  // small badge with the leader's initials and lap time is shown on the
  // right of the row so a browsing player sees the record holder at a
  // glance. Null and undefined both render no badge.
  topTime?: TopTime | null
}

interface Props {
  items: RecentTrackListItem[]
}

export function RecentTrackList({ items }: Props) {
  return (
    <ul style={listStyle}>
      {items.map((item) => {
        const thumb = item.pieces ? buildTrackThumbnail(item.pieces) : null
        const top = item.topTime ?? null
        return (
          <li key={item.slug}>
            <Link href={`/${item.slug}`} style={rowStyle}>
              <span style={previewSlotStyle}>
                {thumb ? (
                  <TrackThumbnail
                    thumbnail={thumb}
                    size={48}
                    ariaLabel={`Preview of /${item.slug}`}
                  />
                ) : (
                  <span style={previewPlaceholderStyle} aria-hidden="true" />
                )}
              </span>
              <span style={textColStyle}>
                <span style={slugColStyle}>
                  <span style={slugStyle}>/{item.slug}</span>
                  {top ? (
                    <span
                      style={topTimeStyle}
                      title={`${top.initials} holds the record at ${formatLapTime(top.lapTimeMs)}`}
                      aria-label={`Track record: ${top.initials} ${formatLapTime(top.lapTimeMs)}`}
                    >
                      <span style={topTimeInitialsStyle}>{top.initials}</span>
                      <span style={topTimeValueStyle}>
                        {formatLapTime(top.lapTimeMs)}
                      </span>
                    </span>
                  ) : null}
                </span>
                <span style={metaRowStyle}>
                  <span style={labelStyle}>{item.label}</span>
                  {item.pieces ? (
                    <TrackDifficultyBadge pieces={item.pieces} size="sm" />
                  ) : null}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 6,
  maxHeight: 320,
  overflowY: 'auto',
}
const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-start',
  alignItems: 'center',
  gap: 12,
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.12)',
  borderRadius: 8,
  textDecoration: 'none',
  color: 'white',
  fontSize: 14,
}
const previewSlotStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  flex: '0 0 auto',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}
const previewPlaceholderStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 6,
  background:
    'repeating-linear-gradient(45deg, rgba(255,255,255,0.06), rgba(255,255,255,0.06) 4px, rgba(255,255,255,0.12) 4px, rgba(255,255,255,0.12) 8px)',
}
const textColStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'stretch',
  flex: 1,
  minWidth: 0,
  gap: 4,
}
const slugColStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
}
const slugStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  minWidth: 0,
}
const labelStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.6,
  fontFamily: 'monospace',
}
// Bottom meta row pairs the timestamp / sample label with the difficulty
// badge so the two pieces of secondary info share one line. Wrap allows the
// pieces to drop to a second line on a narrow card without overflowing.
const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
}
// The top-time badge sits at the right edge of the slug row. Two stacked
// monospace pieces (initials in gold, time in plain mono) so the eye can
// scan a column of badges down the list and compare times without parsing
// the slug text alongside it.
const topTimeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: 6,
  padding: '2px 8px',
  background: 'rgba(255, 215, 80, 0.14)',
  border: '1px solid rgba(255, 215, 80, 0.35)',
  borderRadius: 6,
  flex: '0 0 auto',
  fontSize: 11,
  fontFamily: 'monospace',
  letterSpacing: 0.5,
  whiteSpace: 'nowrap',
}
const topTimeInitialsStyle: React.CSSProperties = {
  color: '#ffd750',
  fontWeight: 700,
}
const topTimeValueStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.9)',
}
