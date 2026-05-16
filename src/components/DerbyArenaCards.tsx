import Link from 'next/link'
import {
  ALL_DERBY_ARENAS,
  type DerbyArenaConfig,
} from '@/lib/derbyArenas'
import { hasKvConfigured } from '@/lib/kv'

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
          console.error('[derby/cards] top-time read failed', { arena: arena.slug, err })
          return { arena, topTimeMs: null, topInitials: null, topVehicle: null }
        }
      }),
    )
  } catch (err) {
    console.error('[derby/cards] kv import failed', err)
    return emptyPreviews()
  }
}

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`
}

// Server component shared by the title-screen DerbyLauncher modal and the
// standalone /derby page. Renders the arena cards (with KV-loaded top
// times) inside a Free-Race-style section. The wrapping panel/header is
// supplied by the caller so this fits cleanly into both layouts.
export async function DerbyArenaCards() {
  const previews = await loadTopTimes()
  return (
    <div style={cardGridStyle}>
      {previews.map(({ arena, topTimeMs, topInitials, topVehicle }) => (
        <Link
          key={arena.slug}
          href={`/derby/${arena.slug}`}
          style={cardStyle}
        >
          <div style={cardTitleStyle}>{arena.displayName}</div>
          <div style={cardBlurbStyle}>{arena.blurb}</div>
          <div style={pillRowStyle}>
            <Pill>{arena.biome}</Pill>
            <Pill>{arena.weather}</Pill>
            <Pill>{arena.timeOfDay}</Pill>
            <Pill>{arena.surface}</Pill>
            <Pill>{arena.cpuCount + 1} cars</Pill>
            <Pill>{Math.round(arena.roundDurationMs / 1000)}s limit</Pill>
          </div>
          <div style={cardTopTimeStyle}>
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
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span style={pillStyle}>{children}</span>
}

const cardGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
}
const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 16,
  background: '#161616',
  border: '1px solid #2a2a2a',
  borderRadius: 12,
  color: '#fff',
  textDecoration: 'none',
  boxShadow: '0 6px 0 rgba(0,0,0,0.55)',
  transition: 'transform 80ms ease',
}
const cardTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: 0.5,
}
const cardBlurbStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'rgba(255,255,255,0.7)',
  lineHeight: 1.4,
}
const pillRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
  fontSize: 11,
}
const pillStyle: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.08)',
  textTransform: 'capitalize',
  letterSpacing: 0.3,
}
const cardTopTimeStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: 'rgba(255,255,255,0.85)',
  fontVariantNumeric: 'tabular-nums',
}
