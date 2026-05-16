import Link from 'next/link'
import {
  ALL_DRAG_STRIPS,
  dragStripVersionHash,
  type DragStripConfig,
} from '@/lib/dragStrips'
import { hasKvConfigured } from '@/lib/kv'
import { MenuPageShell, menuStyles } from '@/components/MenuPageShell'

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
    <MenuPageShell
      title="Drag Racing"
      blurb="Four strips, parts garage, no lap repeats."
      width="wide"
    >
      <div style={menuStyles.section}>
        <div style={menuStyles.sectionHeader}>Strips</div>
        <div style={menuStyles.cardGrid}>
          {previews.map(({ strip, topTimeMs, topInitials }) => (
            <Link
              key={strip.slug}
              href={`/drag/${strip.slug}`}
              style={menuStyles.card}
            >
              <div style={menuStyles.cardTitle}>{strip.displayName}</div>
              <div style={menuStyles.cardBlurb}>{strip.blurb}</div>
              <div style={menuStyles.pillRow}>
                <Pill>{strip.biome}</Pill>
                <Pill>{strip.weather}</Pill>
                <Pill>{strip.timeOfDay}</Pill>
                <Pill>{strip.lengthCells * 20}m</Pill>
                <Pill>{profileLabel(strip)}</Pill>
              </div>
              <div style={menuStyles.cardFooter}>
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
      </div>
    </MenuPageShell>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span style={menuStyles.pill}>{children}</span>
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
