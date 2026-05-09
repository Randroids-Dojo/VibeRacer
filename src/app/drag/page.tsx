import Link from 'next/link'
import {
  ALL_DRAG_STRIPS,
  dragStripVersionHash,
  type DragStripConfig,
} from '@/lib/dragStrips'
import { hasKvConfigured } from '@/lib/kv'

interface StripPreview {
  strip: DragStripConfig
  topTimeMs: number | null
  topInitials: string | null
}

function emptyPreviews(): StripPreview[] {
  return ALL_DRAG_STRIPS.map((strip) => ({
    strip,
    topTimeMs: null,
    topInitials: null,
  }))
}

async function loadTopTimes(): Promise<StripPreview[]> {
  if (!hasKvConfigured()) return emptyPreviews()
  // Wrap the dynamic import + getKv in a try block so a transient KV
  // outage or a misconfigured environment falls back to the "No times
  // yet" hub instead of 500-ing the page. The per-strip catch below
  // already handles individual read failures.
  try {
    const { getKv } = await import('@/lib/kv')
    const { readLeaderboard } = await import('@/lib/leaderboard')
    const kv = getKv()
    return await Promise.all(
      ALL_DRAG_STRIPS.map(async (strip) => {
        try {
          const versionHash = dragStripVersionHash(strip)
          const { entries } = await readLeaderboard(
            kv,
            strip.slug,
            versionHash,
            1,
            0,
            null,
          )
          const top = entries[0] ?? null
          return {
            strip,
            topTimeMs: top ? top.lapTimeMs : null,
            topInitials: top ? top.initials : null,
          }
        } catch {
          return { strip, topTimeMs: null, topInitials: null }
        }
      }),
    )
  } catch {
    return emptyPreviews()
  }
}

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`
}

export default async function DragHubPage() {
  const previews = await loadTopTimes()
  return (
    <main style={pageStyle}>
      <div style={stageStyle}>
        <header style={logoWrapStyle}>
          <h1 style={logoStyle}>Drag Racing</h1>
          <p style={tagStyle}>Four strips, parts garage, no lap repeats.</p>
        </header>

        <div style={menuStyle}>
          <div style={cardGridStyle}>
            {previews.map(({ strip, topTimeMs, topInitials }) => (
              <Link
                key={strip.slug}
                href={`/drag/${strip.slug}`}
                style={cardStyle}
              >
                <div style={cardTitleStyle}>{strip.displayName}</div>
                <div style={cardBlurbStyle}>{strip.blurb}</div>
                <div style={pillRowStyle}>
                  <Pill>{strip.biome}</Pill>
                  <Pill>{strip.weather}</Pill>
                  <Pill>{strip.timeOfDay}</Pill>
                  <Pill>{strip.lengthCells * 20}m</Pill>
                  <Pill>{profileLabel(strip)}</Pill>
                </div>
                <div style={cardTopTimeStyle}>
                  Top time:{' '}
                  {topTimeMs !== null ? (
                    <>
                      <strong>{formatTime(topTimeMs)}</strong>
                      {topInitials ? (
                        <span style={{ opacity: 0.6 }}> ({topInitials})</span>
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
            ‹ back to title
          </Link>
        </div>
      </div>
    </main>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span style={pillStyle}>{children}</span>
}

function profileLabel(strip: DragStripConfig): string {
  const heights = strip.verticalProfile.map((k) => k.height)
  const min = Math.min(...heights)
  const max = Math.max(...heights)
  const range = max - min
  if (range < 0.001) return 'flat'
  if (max > 0 && min >= -0.001) return 'uphill'
  if (min < 0 && max <= 0.001) return 'downhill'
  return 'rolling'
}

const pageStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background:
    'radial-gradient(ellipse at top, #1a2436 0%, #0a0a0a 60%, #050505 100%)',
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
