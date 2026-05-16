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
import { MenuPageShell, menuStyles } from '@/components/MenuPageShell'

const SAMPLE_SLUGS = ['oval', 'sandbox'] as const
const PLAY_SLUG = 'start'

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
    <MenuPageShell title="Free Race">
      <Link href={`/${PLAY_SLUG}`} style={menuStyles.primaryBtn}>
        Start a new race
      </Link>

      <DailyChallenge />

      <DailyStreak />

      <div style={menuStyles.section}>
        <div style={menuStyles.sectionHeader}>Go to any track</div>
        <SlugInput />
      </div>

      <div style={menuStyles.section}>
        <div style={menuStyles.sectionHeader}>
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
    </MenuPageShell>
  )
}
