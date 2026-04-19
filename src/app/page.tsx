import Link from 'next/link'
import { loadRecentTracksSafe } from '@/lib/recentTracks'
import { formatDate } from '@/lib/formatDate'
import {
  RecentTrackList,
  type RecentTrackListItem,
} from '@/components/RecentTrackList'
import { TitleMusic } from '@/components/TitleMusic'

const SAMPLE_SLUGS = ['oval', 'sandbox'] as const

export default async function HomePage() {
  const recent = await loadRecentTracksSafe()
  const hasRecent = recent.length > 0
  const items: RecentTrackListItem[] = hasRecent
    ? recent.map((r) => ({ slug: r.slug, label: formatDate(r.updatedAt) }))
    : SAMPLE_SLUGS.map((slug) => ({ slug, label: 'sample' }))

  return (
    <main style={mainStyle}>
      <TitleMusic />
      <div style={cardStyle}>
        <h1 style={titleStyle}>VibeRacer</h1>
        <p style={subStyle}>Every URL is a track. Pick one and drive.</p>

        <Link href="/start" style={primaryStyle}>
          Play at /start
        </Link>

        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>{hasRecent ? 'RECENT' : 'TRY'}</div>
          <RecentTrackList items={items} />
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
const hintStyle: React.CSSProperties = {
  marginTop: 20,
  fontSize: 13,
  opacity: 0.7,
  textAlign: 'center',
}
