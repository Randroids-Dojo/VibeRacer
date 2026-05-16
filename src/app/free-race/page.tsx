import Link from 'next/link'
import { loadRecentTrackPreviewsSafe } from '@/lib/recentTracks'
import { formatDate } from '@/lib/formatDate'
import {
  RecentTrackList,
  type RecentTrackListItem,
} from '@/components/RecentTrackList'
import { SlugInput } from '@/components/SlugInput'
import { DailyChallenge } from '@/components/DailyChallenge'
import { DailyStreak } from '@/components/DailyStreak'
import { FavoriteTracks } from '@/components/FavoriteTracks'
import { MyTracks } from '@/components/MyTracks'
import { MyPbs } from '@/components/MyPbs'
import { MostPlayed } from '@/components/MostPlayed'
import { LifetimeStats } from '@/components/LifetimeStats'
import { MedalCabinet } from '@/components/MedalCabinet'
import { TrophyCase } from '@/components/TrophyCase'

const SAMPLE_SLUGS = ['oval', 'sandbox'] as const
const PLAY_SLUG = 'start'

// Full-screen Free Race menu. Used to be a modal launcher on the title
// screen; promoted to a standalone page so the section list has room to
// breathe and links can be shared.
export default async function FreeRacePage() {
  const recent = await loadRecentTrackPreviewsSafe()
  const hasRecent = recent.length > 0
  const items: RecentTrackListItem[] = hasRecent
    ? recent.map((r) => ({
        slug: r.slug,
        label: formatDate(r.updatedAt),
        pieces: r.pieces,
        topTime: r.topTime,
      }))
    : SAMPLE_SLUGS.map((slug) => ({ slug, label: 'sample' }))

  return (
    <main style={pageStyle}>
      <div style={stageStyle}>
        <header style={headerStyle}>
          <h1 style={titleStyle}>Free Race</h1>
          <Link href="/" style={closeBtnStyle} aria-label="Back to title">
            CLOSE
          </Link>
        </header>
        <div style={menuStyle}>
          <Link href={`/${PLAY_SLUG}`} style={primaryBtnStyle}>
            Start a new race
          </Link>

          <DailyChallenge />

          <DailyStreak />

          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>Go to any track</div>
            <SlugInput />
          </div>

          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              {hasRecent ? 'Load existing track' : 'Try a sample track'}
            </div>
            <RecentTrackList items={items} />
          </div>

          <FavoriteTracks />

          <MyTracks />

          <MyPbs />

          <MostPlayed />

          <LifetimeStats />

          <MedalCabinet />

          <TrophyCase />
        </div>
      </div>
    </main>
  )
}

const pageStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: 24,
  background: '#9ad8ff',
  color: 'white',
  fontFamily: 'var(--font-cartoony), system-ui, sans-serif',
  boxSizing: 'border-box',
}
const stageStyle: React.CSSProperties = {
  position: 'relative',
  width: 'min(480px, 100%)',
  display: 'grid',
  gap: 14,
}
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 18px',
  background: 'rgba(0,0,0,0.55)',
  borderRadius: 12,
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
}
const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 800,
  letterSpacing: 1,
}
const closeBtnStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.1)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 10,
  fontSize: 13,
  letterSpacing: 1,
  fontFamily: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
  textDecoration: 'none',
}
const menuStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.45)',
  padding: 24,
  borderRadius: 18,
  display: 'grid',
  gap: 18,
  boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
}
const primaryBtnStyle: React.CSSProperties = {
  display: 'block',
  padding: '18px 24px',
  background: '#e84a5f',
  color: 'white',
  textDecoration: 'none',
  borderRadius: 12,
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: 0.5,
  textAlign: 'center',
  boxShadow: '0 6px 0 #9c2a3c',
}
const sectionStyle: React.CSSProperties = {
  paddingTop: 8,
}
const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  opacity: 0.75,
  marginBottom: 10,
  fontWeight: 600,
}
