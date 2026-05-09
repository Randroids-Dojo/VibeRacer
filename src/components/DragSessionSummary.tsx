'use client'
import Link from 'next/link'
import type { DragLapCompleteEvent } from '@/game/dragTick'
import type { DragStripConfig } from '@/lib/dragStrips'
import type { LeaderboardEntry } from '@/lib/leaderboard'
import type { DragGhostSource } from '@/lib/dragGhost'
import {
  MenuButton,
  MenuOverlay,
  MenuPanel,
  MenuSection,
  MenuTitle,
  menuTheme,
} from './MenuUI'
import { formatDragTime as formatTime } from '@/lib/timeFormat'

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

const heroBigTimeStyle: React.CSSProperties = {
  fontSize: 56,
  fontWeight: 800,
  letterSpacing: 1,
  lineHeight: 1,
  textAlign: 'center',
}

const heroLabelStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  color: menuTheme.textMuted,
  textAlign: 'center',
}

const fouledBannerStyle: React.CSSProperties = {
  marginTop: 4,
  background: 'rgba(220,38,38,0.16)',
  color: '#fda4a4',
  border: '1px solid rgba(220,38,38,0.45)',
  fontSize: 11,
  fontWeight: 700,
  padding: '6px 10px',
  borderRadius: 6,
  textAlign: 'center',
  letterSpacing: 1,
}

const statsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 10,
}

const statLabelStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  color: menuTheme.textMuted,
}

const statValueStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
}

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(36px, auto) minmax(48px, auto) 1fr minmax(74px, auto)',
  gap: 8,
  padding: '6px 8px',
  borderRadius: 6,
  alignItems: 'center',
  fontSize: 13,
}

const meRowStyle: React.CSSProperties = {
  ...rowStyle,
  background: 'rgba(255,107,53,0.14)',
  border: `1px solid ${menuTheme.accent}55`,
}

const chipsCellStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
  minWidth: 0,
  fontSize: 12,
  color: menuTheme.textHint,
}

const ctaRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  marginTop: 6,
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
    ? myEntries.reduce(
        (best, e) => Math.min(best, e.lapTimeMs),
        Number.POSITIVE_INFINITY,
      )
    : null

  return (
    <MenuOverlay zIndex={100} onBack={onChangeParts}>
      <MenuPanel width="wide">
        <MenuTitle>FINISH</MenuTitle>
        <div style={heroLabelStyle}>{strip.displayName}</div>
        <div style={heroBigTimeStyle}>{formatTime(finishEvent.finishTimeMs)}s</div>
        {finishEvent.fouled && (
          <div style={fouledBannerStyle}>
            FOULED. Acceleration was dampened off the line.
          </div>
        )}

        <MenuSection>
          <div style={statsGridStyle}>
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
        </MenuSection>

        {leaderboard.length > 0 && (
          <MenuSection title="Top times">
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
            >
              {leaderboard.slice(0, 5).map((e) => (
                <div
                  key={`${e.rank}-${e.nonce ?? 'na'}`}
                  style={e.isMe ? meRowStyle : rowStyle}
                >
                  <span style={{ color: menuTheme.textMuted }}>#{e.rank}</span>
                  <span style={{ fontFamily: 'monospace' }}>{e.initials}</span>
                  <span style={chipsCellStyle}>
                    {e.loadout && (
                      <span style={{ color: menuTheme.textMuted }}>
                        {e.loadout.tire} / {e.loadout.engine}
                      </span>
                    )}
                    {ghostNonce !== null && e.nonce === ghostNonce && (
                      <GhostChip />
                    )}
                    {e.fouled === true && <FoulChip />}
                    {typeof e.topSpeed === 'number' && (
                      <Chip title="Trap speed" label={`${e.topSpeed.toFixed(1)}`} />
                    )}
                    {typeof e.reactionTimeMs === 'number' && (
                      <Chip
                        title="Reaction"
                        label={`${(e.reactionTimeMs / 1000).toFixed(2)}s`}
                      />
                    )}
                  </span>
                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatTime(e.lapTimeMs)}s
                  </span>
                </div>
              ))}
            </div>
          </MenuSection>
        )}

        <div style={ctaRowStyle}>
          <Link
            href="/drag"
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 8,
              border: `1px solid ${menuTheme.ghostBorder}`,
              background: 'transparent',
              color: '#cfcfcf',
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
              textAlign: 'center',
              fontFamily: 'inherit',
            }}
          >
            Change strip
          </Link>
          <MenuButton onClick={onChangeParts}>Change parts</MenuButton>
          <MenuButton variant="primary" click="confirm" onClick={onRaceAgain}>
            Race again
          </MenuButton>
        </div>
      </MenuPanel>
    </MenuOverlay>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={statLabelStyle}>{label}</div>
      <div style={statValueStyle}>{value}</div>
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
        background: 'rgba(255,255,255,0.08)',
        border: `1px solid ${menuTheme.ghostBorder}`,
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
