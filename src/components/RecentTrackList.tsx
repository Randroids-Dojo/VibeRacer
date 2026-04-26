import Link from 'next/link'
import type { Piece } from '@/lib/schemas'
import { buildTrackThumbnail } from '@/lib/trackThumbnail'
import { TrackThumbnail } from './TrackThumbnail'

export interface RecentTrackListItem {
  slug: string
  label: string
  // Optional pieces for the slug. When present we render a small preview
  // thumbnail next to the row so the player can recognize a track from its
  // silhouette without opening it. When null, the row falls back to the
  // text-only layout used before previews shipped.
  pieces?: Piece[] | null
}

interface Props {
  items: RecentTrackListItem[]
}

export function RecentTrackList({ items }: Props) {
  return (
    <ul style={listStyle}>
      {items.map((item) => {
        const thumb = item.pieces ? buildTrackThumbnail(item.pieces) : null
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
                <span style={slugStyle}>/{item.slug}</span>
                <span style={labelStyle}>{item.label}</span>
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
  justifyContent: 'space-between',
  alignItems: 'center',
  flex: 1,
  minWidth: 0,
  gap: 12,
}
const slugStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  fontFamily: 'monospace',
  flex: '0 0 auto',
}
