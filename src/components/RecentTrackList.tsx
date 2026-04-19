import Link from 'next/link'

export interface RecentTrackListItem {
  slug: string
  label: string
}

interface Props {
  items: RecentTrackListItem[]
}

export function RecentTrackList({ items }: Props) {
  return (
    <ul style={listStyle}>
      {items.map((item) => (
        <li key={item.slug}>
          <Link href={`/${item.slug}`} style={rowStyle}>
            <span style={slugStyle}>/{item.slug}</span>
            <span style={labelStyle}>{item.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 6,
  maxHeight: 260,
  overflowY: 'auto',
}
const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.12)',
  borderRadius: 8,
  textDecoration: 'none',
  color: 'white',
  fontSize: 14,
}
const slugStyle: React.CSSProperties = {
  fontFamily: 'monospace',
}
const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  fontFamily: 'monospace',
}
