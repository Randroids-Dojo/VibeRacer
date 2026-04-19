import Link from 'next/link'
import type { RecentTrack } from '@/lib/recentTracks'

interface Props {
  slug: string
  recent: RecentTrack[]
}

function formatDate(ms: number): string {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function SlugLanding({ slug, recent }: Props) {
  return (
    <main style={rootStyle}>
      <div style={cardStyle}>
        <div style={eyebrowStyle}>/{slug}</div>
        <h1 style={titleStyle}>No track here yet.</h1>
        <p style={subStyle}>
          This URL is an empty canvas. Build a track on it, or race somewhere
          that already has one.
        </p>

        <Link href={`/${slug}/edit`} style={primaryBtnStyle}>
          Create new track
        </Link>

        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>LOAD EXISTING</div>
          {recent.length === 0 ? (
            <p style={emptyStyle}>
              Nothing built yet. You can be the first.
            </p>
          ) : (
            <ul style={listStyle}>
              {recent.map((r) => (
                <li key={r.slug}>
                  <Link href={`/${r.slug}`} style={recentItemStyle}>
                    <span style={recentSlugStyle}>/{r.slug}</span>
                    <span style={recentDateStyle}>{formatDate(r.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Link href="/" style={backLinkStyle}>
          back to home
        </Link>
      </div>
    </main>
  )
}

const rootStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(180deg, #9ad8ff 0%, #5fa3ce 100%)',
  fontFamily: 'system-ui, sans-serif',
  color: 'white',
  padding: 24,
}
const cardStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.4)',
  padding: 32,
  borderRadius: 16,
  width: 480,
  maxWidth: 'calc(100vw - 32px)',
  boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
}
const eyebrowStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 14,
  opacity: 0.75,
  marginBottom: 4,
  letterSpacing: 0.5,
}
const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 32,
  letterSpacing: 0.5,
}
const subStyle: React.CSSProperties = {
  margin: '12px 0 24px',
  opacity: 0.85,
  lineHeight: 1.5,
}
const primaryBtnStyle: React.CSSProperties = {
  display: 'block',
  padding: '14px 24px',
  background: '#e84a5f',
  color: 'white',
  textDecoration: 'none',
  borderRadius: 10,
  fontSize: 18,
  fontWeight: 700,
  textAlign: 'center',
  letterSpacing: 0.3,
}
const sectionStyle: React.CSSProperties = {
  marginTop: 28,
  paddingTop: 20,
  borderTop: '1px solid rgba(255,255,255,0.2)',
}
const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.5,
  opacity: 0.7,
  marginBottom: 10,
}
const emptyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  opacity: 0.7,
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
const recentItemStyle: React.CSSProperties = {
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
const recentSlugStyle: React.CSSProperties = {
  fontFamily: 'monospace',
}
const recentDateStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  fontFamily: 'monospace',
}
const backLinkStyle: React.CSSProperties = {
  display: 'block',
  textAlign: 'center',
  marginTop: 20,
  fontSize: 13,
  opacity: 0.7,
  color: 'white',
  textDecoration: 'underline',
}
