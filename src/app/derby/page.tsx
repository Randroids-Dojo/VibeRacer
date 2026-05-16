import Link from 'next/link'
import {
  ALL_DERBY_ARENAS,
  type DerbyArenaConfig,
} from '@/lib/derbyArenas'
import { hasKvConfigured } from '@/lib/kv'
import { MenuPageShell, menuStyles } from '@/components/MenuPageShell'

interface ArenaPreview {
  arena: DerbyArenaConfig
  topTimeMs: number | null
  topInitials: string | null
  topVehicle: string | null
}

function emptyPreviews(): ArenaPreview[] {
  return ALL_DERBY_ARENAS.map((arena) => ({
    arena,
    topTimeMs: null,
    topInitials: null,
    topVehicle: null,
  }))
}

async function loadTopTimes(): Promise<ArenaPreview[]> {
  if (!hasKvConfigured()) return emptyPreviews()
  try {
    const { getKv } = await import('@/lib/kv')
    const { readDerbyTopEntry } = await import('@/lib/derbyLeaderboard')
    const { DERBY_VEHICLES } = await import('@/lib/derbyVehicles')
    const kv = getKv()
    return await Promise.all(
      ALL_DERBY_ARENAS.map(async (arena) => {
        try {
          const top = await readDerbyTopEntry(kv, arena.slug)
          return {
            arena,
            topTimeMs: top?.roundTimeMs ?? null,
            topInitials: top?.initials ?? null,
            topVehicle: top
              ? DERBY_VEHICLES[top.vehicle].displayName
              : null,
          }
        } catch (err) {
          console.error('[derby/hub] top-time read failed', { arena: arena.slug, err })
          return { arena, topTimeMs: null, topInitials: null, topVehicle: null }
        }
      }),
    )
  } catch (err) {
    console.error('[derby/hub] kv import failed', err)
    return emptyPreviews()
  }
}

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`
}

export default async function DerbyHubPage() {
  const previews = await loadTopTimes()
  return (
    <MenuPageShell
      title="Derby"
      blurb="Pick an arena. Pick a vehicle. Last car standing."
      width="wide"
    >
      <div style={menuStyles.section}>
        <div style={menuStyles.sectionHeader}>Arenas</div>
        <div style={menuStyles.cardGrid}>
          {previews.map(({ arena, topTimeMs, topInitials, topVehicle }) => (
            <Link
              key={arena.slug}
              href={`/derby/${arena.slug}`}
              style={menuStyles.card}
            >
              <div style={menuStyles.cardTitle}>{arena.displayName}</div>
              <div style={menuStyles.cardBlurb}>{arena.blurb}</div>
              <div style={menuStyles.pillRow}>
                <Pill>{arena.biome}</Pill>
                <Pill>{arena.weather}</Pill>
                <Pill>{arena.timeOfDay}</Pill>
                <Pill>{arena.surface}</Pill>
                <Pill>{arena.cpuCount + 1} cars</Pill>
                <Pill>{Math.round(arena.roundDurationMs / 1000)}s limit</Pill>
              </div>
              <div style={menuStyles.cardFooter}>
                Fastest win:{' '}
                {topTimeMs !== null ? (
                  <>
                    <strong>{formatTime(topTimeMs)}</strong>
                    {topInitials ? (
                      <span style={{ opacity: 0.6 }}>
                        {' '}
                        ({topInitials}
                        {topVehicle ? `, ${topVehicle}` : ''})
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span style={{ opacity: 0.6 }}>No times yet</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </MenuPageShell>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span style={menuStyles.pill}>{children}</span>
}
