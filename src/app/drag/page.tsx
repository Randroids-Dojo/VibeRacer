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

async function loadTopTimes(): Promise<StripPreview[]> {
  if (!hasKvConfigured()) {
    return ALL_DRAG_STRIPS.map((strip) => ({
      strip,
      topTimeMs: null,
      topInitials: null,
    }))
  }
  const { getKv } = await import('@/lib/kv')
  const { readLeaderboard } = await import('@/lib/leaderboard')
  const kv = getKv()
  return Promise.all(
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
}

function formatTime(ms: number | null): string {
  if (ms === null) return 'No times yet'
  return `${(ms / 1000).toFixed(2)}s`
}

export default async function DragHubPage() {
  const previews = await loadTopTimes()
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#fff',
        padding: 32,
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Drag Racing</h1>
            <p style={{ marginTop: 4, opacity: 0.7 }}>
              Four strips, parts garage, no lap repeats.
            </p>
          </div>
          <Link
            href="/"
            style={{
              color: '#9ad8ff',
              textDecoration: 'none',
              fontSize: 14,
            }}
          >
            back to title
          </Link>
        </header>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          {previews.map(({ strip, topTimeMs, topInitials }) => (
            <Link
              key={strip.slug}
              href={`/drag/${strip.slug}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 16,
                background: 'rgba(20,20,24,0.85)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                color: '#fff',
                textDecoration: 'none',
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {strip.displayName}
              </div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>{strip.blurb}</div>
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  flexWrap: 'wrap',
                  fontSize: 11,
                  opacity: 0.85,
                }}
              >
                <Pill>{strip.biome}</Pill>
                <Pill>{strip.weather}</Pill>
                <Pill>{strip.timeOfDay}</Pill>
                <Pill>{strip.lengthCells * 20}m</Pill>
                <Pill>{profileLabel(strip)}</Pill>
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  opacity: 0.85,
                }}
              >
                Top time:{' '}
                {topTimeMs !== null ? (
                  <>
                    <strong>{formatTime(topTimeMs)}</strong>
                    {topInitials ? <span style={{ opacity: 0.6 }}> ({topInitials})</span> : null}
                  </>
                ) : (
                  <span style={{ opacity: 0.6 }}>No times yet</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.08)',
      }}
    >
      {children}
    </span>
  )
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
