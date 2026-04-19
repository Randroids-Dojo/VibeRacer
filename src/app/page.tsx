import Link from 'next/link'
import {
  readRecentTracks,
  RECENT_TRACKS_DEFAULT_LIMIT,
  type RecentTrack,
} from '@/lib/recentTracks'

const SAMPLE_SLUGS = ['oval', 'sandbox'] as const

async function loadRecent(): Promise<RecentTrack[]> {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return []
  }
  try {
    const { getKv } = await import('@/lib/kv')
    return await readRecentTracks(getKv(), RECENT_TRACKS_DEFAULT_LIMIT)
  } catch {
    return []
  }
}

function formatDate(ms: number): string {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default async function HomePage() {
  const recent = await loadRecent()
  return (
    <main style={mainStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>VibeRacer</h1>
        <p style={subStyle}>Every URL is a track. Pick one and drive.</p>

        <Link href="/start" style={primaryStyle}>
          Play at /start
        </Link>

        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            {recent.length > 0 ? 'RECENT' : 'TRY'}
          </div>
          {recent.length > 0 ? (
            <ul style={listStyle}>
              {recent.map((r) => (
                <li key={r.slug}>
                  <Link href={`/${r.slug}`} style={rowStyle}>
                    <span style={slugStyle}>/{r.slug}</span>
                    <span style={dateStyle}>{formatDate(r.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <ul style={listStyle}>
              {SAMPLE_SLUGS.map((s) => (
                <li key={s}>
                  <Link href={`/${s}`} style={rowStyle}>
                    <span style={slugStyle}>/{s}</span>
                    <span style={dateStyle}>sample</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p style={hintStyle}>
          Or type any path into the URL bar. Every slug is its own track.
        </p>
      </div>
    </main>
  )
}

const mainStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(180deg, #9ad8ff 0%, #5fa3ce 100%)',
  fontFamily: 'system-ui, sans-serif',
  color: 'white',
  padding: 24,
}
const cardStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.35)',
  padding: 32,
  borderRadius: 16,
  textAlign: 'center',
  width: 460,
  maxWidth: 'calc(100vw - 32px)',
}
const titleStyle: React.CSSProperties = {
  fontSize: 52,
  margin: 0,
  letterSpacing: 1,
}
const subStyle: React.CSSProperties = {
  marginTop: 4,
  marginBottom: 24,
  opacity: 0.85,
}
const primaryStyle: React.CSSProperties = {
  display: 'block',
  padding: '14px 24px',
  background: '#e84a5f',
  color: 'white',
  textDecoration: 'none',
  borderRadius: 10,
  fontSize: 18,
  fontWeight: 700,
  letterSpacing: 0.3,
}
const sectionStyle: React.CSSProperties = {
  marginTop: 24,
  paddingTop: 18,
  borderTop: '1px solid rgba(255,255,255,0.2)',
  textAlign: 'left',
}
const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.5,
  opacity: 0.7,
  marginBottom: 10,
}
const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 6,
  maxHeight: 240,
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
const dateStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  fontFamily: 'monospace',
}
const hintStyle: React.CSSProperties = {
  marginTop: 20,
  fontSize: 13,
  opacity: 0.7,
  textAlign: 'center',
}
