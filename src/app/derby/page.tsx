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
    <main style={pageStyle}>
      <div style={stageStyle}>
        <header style={logoWrapStyle}>
          <h1 style={logoStyle}>Derby</h1>
          <p style={tagStyle}>Pick an arena. Pick a vehicle. Last car standing.</p>
        </header>

        <div style={menuStyle}>
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

          <Link href="/" style={backLinkStyle}>
            {'‹'} back to title
          </Link>
        </div>
      </div>
    </main>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span style={pillStyle}>{children}</span>
}

const pageStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background:
    'radial-gradient(ellipse at top, #2a1a14 0%, #0a0a0a 60%, #050505 100%)',
  color: '#fff',
  fontFamily: 'system-ui, sans-serif',
  boxSizing: 'border-box',
}
const stageStyle: React.CSSProperties = {
  position: 'relative',
  width: 'min(720px, 100%)',
  display: 'grid',
  gap: 28,
}
const logoWrapStyle: React.CSSProperties = {
  textAlign: 'center',
  textShadow: '0 4px 0 rgba(0,0,0,0.25), 0 10px 24px rgba(0,0,0,0.35)',
}
const logoStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'clamp(40px, 9vw, 64px)',
  fontWeight: 800,
  color: '#fff',
  letterSpacing: 1,
}
const tagStyle: React.CSSProperties = {
  fontSize: 16,
  color: 'rgba(255,255,255,0.8)',
  margin: '8px 0 0',
}
const menuStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.45)',
  padding: 20,
  borderRadius: 18,
  display: 'grid',
  gap: 16,
  boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
}
const cardGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 14,
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
const backLinkStyle: React.CSSProperties = {
  color: '#ff6b35',
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: 0.5,
  textAlign: 'center',
  padding: 4,
}
