import Link from 'next/link'
import { loadRecentTrackPreviewsSafe } from '@/lib/recentTracks'
import { formatDate } from '@/lib/formatDate'
import {
  RecentTrackList,
  type RecentTrackListItem,
} from '@/components/RecentTrackList'
import { TitleMusic } from '@/components/TitleMusic'
import { TitleBackground } from '@/components/TitleBackground'
import { TitleGamepadNav } from '@/components/TitleGamepadNav'
import { SlugInput } from '@/components/SlugInput'
import { SettingsLauncher } from '@/components/SettingsLauncher'
import { TuningLaunchButton } from '@/components/TuningLaunchButton'
import { HowToPlayLauncher } from '@/components/HowToPlayLauncher'
import { FeatureListLauncher } from '@/components/FeatureListLauncher'
import { MyPbs } from '@/components/MyPbs'
import { MyTracks } from '@/components/MyTracks'
import { FavoriteTracks } from '@/components/FavoriteTracks'
import { LifetimeStats } from '@/components/LifetimeStats'
import { MostPlayed } from '@/components/MostPlayed'
import { MedalCabinet } from '@/components/MedalCabinet'
import { TrophyCase } from '@/components/TrophyCase'
import { DailyChallenge } from '@/components/DailyChallenge'
import { DailyStreak } from '@/components/DailyStreak'
import { RaceCalendar } from '@/components/RaceCalendar'

const SAMPLE_SLUGS = ['oval', 'sandbox'] as const
const PLAY_SLUG = 'start'

export default async function HomePage() {
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
    <main style={mainStyle}>
      <TitleBackground />
      <TitleMusic />
      <TitleGamepadNav />
      <div style={skyFadeStyle} aria-hidden="true" />
      <section style={stageStyle}>
        <header style={logoWrapStyle}>
          <h1 style={logoStyle}>VibeRacer</h1>
          <p style={tagStyle}>Every URL is a track. Pick one and drive.</p>
        </header>

        <div style={menuStyle}>
          <Link href={`/${PLAY_SLUG}`} style={primaryBtnStyle}>
            Play
          </Link>

          <DailyChallenge />

          <DailyStreak />

          <RaceCalendar />

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

          <TuningLaunchButton buttonStyle={settingsBtnStyle} />
          <SettingsLauncher buttonStyle={settingsBtnStyle} />
          <FeatureListLauncher buttonStyle={settingsBtnStyle} />
          <HowToPlayLauncher buttonStyle={settingsBtnStyle} />
        </div>
      </section>
    </main>
  )
}

const mainStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  fontFamily: 'var(--font-cartoony), system-ui, sans-serif',
  color: 'white',
  padding: 24,
  overflow: 'hidden',
  background: '#9ad8ff',
}
const skyFadeStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1,
  background:
    'radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.35) 100%)',
  pointerEvents: 'none',
}
const stageStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 2,
  width: 480,
  maxWidth: 'calc(100vw - 32px)',
  display: 'grid',
  gap: 28,
}
const logoWrapStyle: React.CSSProperties = {
  textAlign: 'center',
  textShadow: '0 4px 0 rgba(0,0,0,0.25), 0 10px 24px rgba(0,0,0,0.35)',
}
const logoStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 88,
  fontWeight: 700,
  letterSpacing: 2,
  lineHeight: 0.95,
  color: '#fff7b0',
  WebkitTextStroke: '2px #1b1b1b',
}
const tagStyle: React.CSSProperties = {
  marginTop: 8,
  marginBottom: 0,
  fontSize: 16,
  fontWeight: 500,
  opacity: 0.95,
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
const settingsBtnStyle: React.CSSProperties = {
  padding: '12px 16px',
  background: 'rgba(255,255,255,0.1)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 10,
  fontSize: 15,
  fontFamily: 'inherit',
  fontWeight: 600,
  textAlign: 'center',
  cursor: 'pointer',
}
