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
        <header style={headerStyle}>
          <h1 style={titleStyle}>Derby</h1>
          <Link href="/" style={closeBtnStyle} aria-label="Back to title">
            CLOSE
          </Link>
        </header>
        <div style={menuStyle}>
          <p style={tagStyle}>
            Pick an arena. Pick a vehicle. Last car standing.
          </p>
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>Arenas</div>
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
          </div>
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
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: 24,
  background:
    'radial-gradient(ellipse at top, #2a1a14 0%, #0a0a0a 60%, #050505 100%)',
  color: '#fff',
  fontFamily: 'var(--font-cartoony), system-ui, sans-serif',
  boxSizing: 'border-box',
}
const stageStyle: React.CSSProperties = {
  position: 'relative',
  width: 'min(560px, 100%)',
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
const tagStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  opacity: 0.85,
  lineHeight: 1.4,
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
