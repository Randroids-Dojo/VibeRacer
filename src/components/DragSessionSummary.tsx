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
                  }}
                >
                  <span style={{ opacity: 0.6 }}>#{e.rank}</span>
                  <span style={{ fontFamily: 'monospace' }}>{e.initials}</span>
                  <span style={{ opacity: 0.6 }}>
                    {e.loadout
                      ? `${e.loadout.tire} / ${e.loadout.engine}`
                      : ''}
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
