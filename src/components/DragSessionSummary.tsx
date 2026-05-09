'use client'
import Link from 'next/link'
import type { DragLapCompleteEvent } from '@/game/dragTick'
import type { DragStripConfig } from '@/lib/dragStrips'
import type { LeaderboardEntry } from '@/lib/leaderboard'
import type { DragGhostSource } from '@/lib/dragGhost'

interface DragSessionSummaryProps {
  strip: DragStripConfig
  finishEvent: DragLapCompleteEvent
  leaderboard: readonly LeaderboardEntry[]
  ghostSource: DragGhostSource
  // Nonce of the row the player just raced against. Drives the small
  // GHOST chip in the leaderboard list so the player can see exactly
  // which time they were chasing. null when no ghost was active
  // (empty board).
  ghostNonce: string | null
  onRaceAgain: () => void
  onChangeParts: () => void
}

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(2)
}

export function DragSessionSummary({
  strip,
  finishEvent,
  leaderboard,
  ghostSource,
  ghostNonce,
  onRaceAgain,
  onChangeParts,
}: DragSessionSummaryProps) {
  const myEntries = leaderboard.filter((e) => e.isMe)
  const myBest = myEntries.length
    ? myEntries.reduce((best, e) => Math.min(best, e.lapTimeMs), Number.POSITIVE_INFINITY)
    : null

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: 'rgba(20,20,24,0.95)',
          borderRadius: 12,
          padding: 24,
          maxWidth: 720,
          width: '100%',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>{strip.displayName}</div>
          <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: 1 }}>
            {formatTime(finishEvent.finishTimeMs)}s
          </div>
          {finishEvent.fouled && (
            <div
              style={{
                marginTop: 4,
                background: '#991b1b',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                padding: '4px 8px',
                borderRadius: 4,
                display: 'inline-block',
              }}
            >
              FOULED. Acceleration was dampened off the line.
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <Stat
            label="Reaction"
            value={
              finishEvent.reactionTimeMs === null
                ? '--'
                : `${(finishEvent.reactionTimeMs / 1000).toFixed(2)}s`
            }
          />
          <Stat label="Top speed" value={finishEvent.topSpeed.toFixed(1)} />
          <Stat
            label="Personal best"
            value={myBest === null ? '--' : `${formatTime(myBest)}s`}
          />
          <Stat label="Ghost" value={ghostSource} />
        </div>

        {leaderboard.length > 0 && (
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
              Top times
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              {leaderboard.slice(0, 5).map((e) => (
                <div
                  key={`${e.rank}-${e.nonce ?? 'na'}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '40px 60px 1fr 100px',
                    gap: 6,
                    padding: '4px 6px',
                    background: e.isMe ? 'rgba(154,216,255,0.12)' : 'transparent',
                    borderRadius: 4,
                    alignItems: 'center',
                  }}
                >
                  <span style={{ opacity: 0.6 }}>#{e.rank}</span>
                  <span style={{ fontFamily: 'monospace' }}>{e.initials}</span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      flexWrap: 'wrap',
                      opacity: 0.85,
                      fontSize: 12,
                      // Without an explicit min-width: 0 the grid track
                      // grows to fit the wrapping chips and pushes the
                      // lap-time column off the right edge on narrow
                      // viewports. Capping here keeps the row aligned.
                      minWidth: 0,
                    }}
                  >
                    {e.loadout && (
                      <span style={{ opacity: 0.6 }}>
                        {e.loadout.tire} / {e.loadout.engine}
                      </span>
                    )}
                    {ghostNonce !== null && e.nonce === ghostNonce && (
                      <GhostChip />
                    )}
                    {e.fouled === true && <FoulChip />}
                    {typeof e.topSpeed === 'number' && (
                      <Chip
                        title="Trap speed"
                        label={`${e.topSpeed.toFixed(1)}`}
                      />
                    )}
                    {typeof e.reactionTimeMs === 'number' && (
                      <Chip
                        title="Reaction"
                        label={`${(e.reactionTimeMs / 1000).toFixed(2)}s`}
                      />
                    )}
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    {formatTime(e.lapTimeMs)}s
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Link
            href="/drag"
            style={{
              padding: '10px 18px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff',
              textDecoration: 'none',
              fontSize: 13,
            }}
          >
            Change strip
          </Link>
          <button
            onClick={onChangeParts}
            style={{
              padding: '10px 18px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'transparent',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Change parts
          </button>
          <button
            onClick={onRaceAgain}
            style={{
              padding: '10px 18px',
              borderRadius: 6,
              border: 'none',
              background: '#22c55e',
              color: '#0a0a0a',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Race again
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ opacity: 0.6, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  )
}

// Compact monochrome chip for the leaderboard row's drag-mode meta.
// `title` becomes the native tooltip so a hover still tells the player
// what the value means without bloating the row visually.
function Chip({ title, label }: { title: string; label: string }) {
  return (
    <span
      title={title}
      style={{
        padding: '1px 6px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.1)',
        fontSize: 10,
        letterSpacing: 0.5,
      }}
    >
      {label}
    </span>
  )
}

// Cyan tag pinned to the row the player was chasing during the run that
// just finished. Color matches the in-scene ghost mesh's translucent
// cyan box so the player can connect "the cyan car next to me" with the
// row on the summary screen.
function GhostChip() {
  return (
    <span
      title="The time you were chasing this run."
      style={{
        padding: '1px 6px',
        borderRadius: 999,
        background: '#0e7490',
        color: '#fff',
        fontSize: 10,
        letterSpacing: 1,
        fontWeight: 700,
      }}
    >
      GHOST
    </span>
  )
}

// Red "F" pill for fouled runs. Rendered next to the loadout summary so
// a fouled time is recognizable at a glance.
function FoulChip() {
  return (
    <span
      title="Jump-start. Acceleration was dampened off the line."
      style={{
        padding: '1px 6px',
        borderRadius: 999,
        background: '#991b1b',
        color: '#fff',
        fontSize: 10,
        letterSpacing: 1,
        fontWeight: 700,
      }}
    >
      F
    </span>
  )
}
