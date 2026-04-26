'use client'
import { formatSplitDelta, type LapPrediction } from '@/game/splits'
import { formatDriftScore } from '@/game/drift'
import {
  MEDAL_COLORS,
  MEDAL_GLYPH,
  MEDAL_LABELS,
  formatNextMedalLabel,
  medalForTime,
  nextMedalGap,
  type MedalTier,
} from '@/game/medals'
import { formatStreakLabel } from '@/game/pbStreak'
import { formatGhostGap } from '@/game/ghostGap'

function formatLapTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '--:--.---'
  const total = Math.max(0, Math.round(ms))
  const minutes = Math.floor(total / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const millis = total % 1000
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  const mmm = String(millis).padStart(3, '0')
  return `${mm}:${ss}.${mmm}`
}

interface HudProps {
  currentMs: number
  lastLapMs: number | null
  bestSessionMs: number | null
  bestAllTimeMs: number | null
  // Theoretical-best lap time: sum of the player's best ever per-sector
  // durations on this slug + version. null when not all sectors have been
  // covered yet so the HUD can render a "WORK IN PROGRESS" placeholder
  // instead of a misleading sub-PB number.
  optimalLapMs: number | null
  // True once every sector on the current track has at least one recorded
  // best. Drives the OPTIMAL block's tinting (gold + "ideal" subtitle when
  // complete, dim "build it" subtitle while still missing a sector).
  optimalLapComplete: boolean
  overallRecord: { initials: string; lapTimeMs: number } | null
  lapCount: number
  onTrack: boolean
  // True when the debounced wrong-way detector is engaged. Renders a bold
  // flashing warning banner so the player understands why the lap timer
  // keeps resetting instead of completing.
  wrongWay: boolean
  toast: string | null
  toastKind: 'lap' | 'pb' | 'record' | null
  initials: string | null
  // Live split delta vs the player's local PB at the most recently crossed
  // checkpoint. Negative = ahead of PB (good, shown green); positive = behind
  // (slow, shown red). null hides the tile.
  splitDeltaMs: number | null
  // The cpId the delta was generated at. Used as a React key so each fresh
  // checkpoint cross retriggers the pop-in animation.
  splitCpId: number | null
  // Projected final lap time for the lap currently in progress, derived from
  // PB splits + latest checkpoint hit. Updates only at checkpoint crosses so
  // it does not jitter mid-sector. null hides the PROJECTED block (no PB on
  // file or no checkpoints crossed yet this lap).
  prediction: LapPrediction | null
  // Drift score readouts. `driftActive` toggles a glow on the live block so
  // the player gets immediate feedback when scoring. `driftLapBest` is the
  // best single-session score during the current lap; `driftAllTimeBest` is
  // the local-PB equivalent (loaded from localStorage). null hides the
  // entire drift HUD section (Settings toggle off).
  driftActive: boolean
  driftScore: number
  driftMultiplier: number
  driftLapBest: number | null
  driftAllTimeBest: number | null
  showDrift: boolean
  // Per-sector PB celebration. Populated by Game when the just-completed
  // sector beats the player's prior best for that cpId (or sets the first-
  // ever best). The HUD pops in a small "S<n> PB" badge that fades after
  // SECTOR_PB_DISPLAY_MS. null hides it.
  sectorPb: { cpId: number; durationMs: number; generatedAtMs: number } | null
  // Live count of consecutive PB laps in the current session. The HUD shows
  // a small gold chip below the BEST tile when this reaches 2 or more so a
  // player chaining personal bests gets a visible reward beyond the existing
  // toast / fanfare / confetti. Below the threshold the chip slot collapses.
  pbStreak: number
  // Friend-challenge banner. Populated when the page was opened with a
  // ?challenge=<nonce>&from=<INI>&time=<MS> query. The HUD pins a banner at
  // the top of the screen naming the sender and target lap time so the
  // recipient knows what they are racing for. null hides the banner.
  challenge: { from: string; targetMs: number } | null
  // Rival-chase banner. Populated when the player picked a leaderboard entry
  // to chase via the per-row Chase button. The HUD pins this banner just
  // below the friend-challenge slot so both can coexist if the player opens
  // a challenge URL and then picks a different rival to chase mid-session.
  // The string is pre-formatted by `formatRivalBannerLabel` upstream so the
  // HUD does not have to know the rival shape. null hides the banner.
  rivalLabel?: string | null
  // Live ghost gap in milliseconds: positive = behind the ghost, negative =
  // ahead. null hides the chip (no ghost on screen, no replay loaded, the
  // player has drifted off the recorded line, or the chip toggle is off).
  ghostGapMs?: number | null
}

const HUD_ANIMATIONS_CSS = `
@keyframes viberacer-fade { 0% { opacity: 1 } 100% { opacity: 0 } }
@keyframes viberacer-burst {
  0% { transform: translate(-50%, -50%) scale(0); opacity: 0.95 }
  60% { opacity: 0.6 }
  100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0 }
}
@keyframes viberacer-edgeflash {
  0% { opacity: 0.0 }
  20% { opacity: 1 }
  100% { opacity: 0 }
}
@keyframes viberacer-split-pop {
  0% { transform: translate(-50%, 0) scale(0.85); opacity: 0 }
  15% { transform: translate(-50%, 0) scale(1.05); opacity: 1 }
  80% { transform: translate(-50%, 0) scale(1); opacity: 1 }
  100% { transform: translate(-50%, 0) scale(1); opacity: 0 }
}
@keyframes viberacer-wrongway-pulse {
  0%, 100% { transform: translateX(-50%) scale(1); opacity: 1 }
  50% { transform: translateX(-50%) scale(1.04); opacity: 0.85 }
}
@keyframes viberacer-wrongway-arrow {
  0%, 100% { transform: translateX(0) }
  50% { transform: translateX(-8px) }
}
@keyframes viberacer-drift-pulse {
  0%, 100% { box-shadow: 0 0 14px rgba(255, 138, 60, 0.55), 0 4px 12px rgba(0, 0, 0, 0.4) }
  50% { box-shadow: 0 0 28px rgba(255, 200, 80, 0.85), 0 4px 12px rgba(0, 0, 0, 0.4) }
}
@keyframes viberacer-sector-pb-pop {
  0% { transform: translate(-50%, -8px) scale(0.6); opacity: 0 }
  20% { transform: translate(-50%, 0) scale(1.12); opacity: 1 }
  60% { transform: translate(-50%, 0) scale(1); opacity: 1 }
  100% { transform: translate(-50%, -2px) scale(1); opacity: 0 }
}
`

// Format a sub-lap sector duration as S.mmm (e.g. "1.421"). Sectors that
// stretch past 60 s fall back to the same mm:ss.mmm format the lap timer
// uses so the badge never overflows its slot or reads as a tiny number.
function formatSectorDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0.000'
  const total = Math.max(0, Math.round(ms))
  if (total >= 60000) return formatLapTime(total)
  const seconds = Math.floor(total / 1000)
  const millis = total % 1000
  return `${seconds}.${String(millis).padStart(3, '0')}`
}

function SectorPbBadge({
  sectorPb,
}: {
  sectorPb: { cpId: number; durationMs: number; generatedAtMs: number }
}) {
  // Display sector number 1-based for readability (cpId 0 is the first sector).
  const sectorLabel = `S${sectorPb.cpId + 1}`
  return (
    <div
      key={`sector-pb-${sectorPb.cpId}-${sectorPb.generatedAtMs}`}
      style={sectorPbBadge}
      role="status"
      aria-live="polite"
    >
      <span style={sectorPbStar} aria-hidden>
        {'★'}
      </span>
      <span style={sectorPbLabel}>SECTOR PB</span>
      <span style={sectorPbSector}>{sectorLabel}</span>
      <span style={sectorPbTime}>{formatSectorDuration(sectorPb.durationMs)}</span>
    </div>
  )
}

function StatBlock({
  label,
  value,
  big,
  alignRight,
}: {
  label: string
  value: string | number
  big?: boolean
  alignRight?: boolean
}) {
  return (
    <div style={{ ...block, ...(alignRight ? alignRightStyle : null) }}>
      <div style={labelStyle}>{label}</div>
      <div style={big ? timeBig : timeSm}>{value}</div>
    </div>
  )
}

// Compact prediction block. Shares the StatBlock layout but tints the
// lap-time numerals green when the player is ahead of PB and red when
// behind, with a subtle delta line below the time so the prediction reads
// at a glance without consuming a full extra row of HUD real estate. When a
// track-wide record is on file the block also renders a second smaller line
// "vs REC" so competitive players can see how much time they need to find
// against the leaderboard #1 in addition to their own PB.
function PredictionBlock({ prediction }: { prediction: LapPrediction }) {
  const ahead = prediction.deltaMs < 0
  const tone = prediction.deltaMs === 0
    ? predictionNeutral
    : ahead
      ? predictionAhead
      : predictionBehind
  const recDelta = prediction.deltaVsRecordMs
  const recAhead = recDelta !== null && recDelta < 0
  const recTone =
    recDelta === null || recDelta === 0
      ? predictionNeutral
      : recAhead
        ? predictionAhead
        : predictionBehind
  return (
    <div
      key={`pred-${prediction.cpId}`}
      style={{ ...block, ...predictionBlock }}
      aria-live="polite"
    >
      <div style={labelStyle}>PROJECTED</div>
      <div style={{ ...timeSm, ...tone }}>{formatLapTime(prediction.predictedMs)}</div>
      <div style={{ ...predictionDelta, ...tone }}>
        <span style={predictionDeltaCaption}>vs PB </span>
        {formatSplitDelta(prediction.deltaMs)}
      </div>
      {recDelta !== null ? (
        <div style={{ ...predictionRecDelta, ...recTone }}>
          <span style={predictionDeltaCaption}>vs REC </span>
          {formatSplitDelta(recDelta)}
        </div>
      ) : null}
    </div>
  )
}

function timeOrDash(ms: number | null): string {
  return ms !== null ? formatLapTime(ms) : '--'
}

// Medal chip pinned next to BEST (ALL TIME). The tier is computed from the
// player's PB versus the route's leaderboard #1 lap time. The tier color
// reads as the metal at a glance and the label says the name in plain text
// so emoji-free fonts and screen readers both surface the right meaning.
function MedalBadge({ tier }: { tier: MedalTier }) {
  const color = MEDAL_COLORS[tier]
  const label = MEDAL_LABELS[tier]
  return (
    <span
      style={{
        ...medalBadgeStyle,
        color,
        borderColor: hexWithAlpha(color, 0.55),
        boxShadow: `0 0 8px ${hexWithAlpha(color, 0.35)}`,
      }}
      title={`${label} medal: PB within tier vs leaderboard #1`}
      aria-label={`${label} medal`}
    >
      <span style={medalGlyphStyle} aria-hidden>
        {MEDAL_GLYPH}
      </span>
      <span style={medalLabelStyle}>{label.toUpperCase()}</span>
    </span>
  )
}

// Next-medal upgrade chip. Pinned alongside the MedalBadge so the player
// sees their current tier and the time gap to the next tier in one glance.
// The chip uses the upgrade-target tier's accent color so the visual
// language reads as "this is the metal you are chasing". Hidden when the
// player is already at platinum (no higher tier) or the upgrade gap is
// unavailable, so the slot collapses cleanly in those cases.
function NextMedalChip({
  tier,
  label,
}: {
  tier: MedalTier
  label: string
}) {
  const color = MEDAL_COLORS[tier]
  return (
    <span
      style={{
        ...nextMedalChipStyle,
        color,
        borderColor: hexWithAlpha(color, 0.5),
        boxShadow: `0 0 8px ${hexWithAlpha(color, 0.3)}`,
      }}
      title={`Shave this much off your PB to upgrade to ${MEDAL_LABELS[tier]}.`}
      aria-label={`Time to next medal: ${label}`}
    >
      <span style={nextMedalArrowStyle} aria-hidden>
        {'▲'}
      </span>
      <span style={nextMedalLabelStyle}>{label}</span>
    </span>
  )
}

// PB streak chip. Pinned under the BEST (ALL TIME) tile alongside the medal
// badge so the streak reads as another property OF the player's PB lane.
// Gold palette mirrors the OPTIMAL block, the sector-PB badge, and the
// lap-history PB chip so the visual language for "personal best" stays
// consistent across the HUD. The label string is built upstream so the
// badge stays a pure presentational shell.
function StreakBadge({ label }: { label: string }) {
  return (
    <span
      style={streakBadgeStyle}
      title="Consecutive PB laps in this session"
      aria-label={label}
    >
      <span style={streakFlameStyle} aria-hidden>
        {'>>'}
      </span>
      <span style={streakLabelStyle}>{label}</span>
    </span>
  )
}

// Append an alpha component to a "#rrggbb" color. Returns rgba(r,g,b,a).
// Returns the original color unchanged when the input is not a 7-char hex.
function hexWithAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Theoretical-best lap block. Sums the player's best ever per-sector
// durations so the HUD can show "what you could do if you nailed every
// corner". Tints gold when the optimal lap is complete (all sectors have a
// best on file), dims the value when the player is still building a full
// reference set (so it never feels like a stale lie).
function OptimalBlock({
  optimalLapMs,
  complete,
}: {
  optimalLapMs: number | null
  complete: boolean
}) {
  const valueText = optimalLapMs !== null && complete ? formatLapTime(optimalLapMs) : '--'
  return (
    <div style={block} aria-live="polite">
      <div style={labelStyle}>OPTIMAL</div>
      <div style={complete ? optimalValueComplete : optimalValuePending}>
        {valueText}
      </div>
    </div>
  )
}

function DriftPanel({
  active,
  score,
  multiplier,
  lapBest,
  allTimeBest,
}: {
  active: boolean
  score: number
  multiplier: number
  lapBest: number | null
  allTimeBest: number | null
}) {
  const showLive = active || score > 0
  const liveStyle = active ? driftLiveActive : driftLiveInactive
  return (
    <div style={driftPanel} aria-live="polite">
      <div style={liveStyle}>
        <div style={driftLabel}>
          DRIFT{active ? ` x${multiplier.toFixed(1)}` : ''}
        </div>
        <div style={driftScoreValue}>
          {showLive ? formatDriftScore(score) : '--'}
        </div>
      </div>
      <div style={driftSubRow}>
        <div style={driftSubBlock}>
          <div style={driftSubLabel}>BEST (LAP)</div>
          <div style={driftSubValue}>
            {lapBest !== null && lapBest > 0 ? formatDriftScore(lapBest) : '--'}
          </div>
        </div>
        <div style={driftSubBlock}>
          <div style={driftSubLabel}>BEST (ALL)</div>
          <div style={driftSubValue}>
            {allTimeBest !== null && allTimeBest > 0
              ? formatDriftScore(allTimeBest)
              : '--'}
          </div>
        </div>
      </div>
    </div>
  )
}

export function HUD(props: HudProps) {
  const recordValue = props.overallRecord
    ? `${props.overallRecord.initials} ${formatLapTime(props.overallRecord.lapTimeMs)}`
    : '--'
  const celebrate = props.toastKind === 'pb' || props.toastKind === 'record'
  const isRecord = props.toastKind === 'record'
  const showSplit = props.splitDeltaMs !== null
  const splitAhead = showSplit && (props.splitDeltaMs ?? 0) < 0
  // Medal tier earned by the player's all-time PB versus the leaderboard #1
  // for this version. Stays null when either is missing or the PB is slower
  // than the bronze cutoff so the badge slot collapses cleanly.
  const recordTimeForMedal = props.overallRecord
    ? props.overallRecord.lapTimeMs
    : null
  const medalTier = medalForTime(props.bestAllTimeMs, recordTimeForMedal)
  // Distance to the next medal tier the player can chase. Returns null when
  // no medal is currently earned (the slot collapses next to the missing
  // medal badge), when the player is already at platinum (no upgrade), or
  // when either input is missing / corrupt. The chip reuses the same accent
  // color as the upgrade-target medal so the player sees the metal they are
  // chasing in addition to the time gap.
  const nextMedal = nextMedalGap(props.bestAllTimeMs, recordTimeForMedal)
  const nextMedalLabel = formatNextMedalLabel(nextMedal)
  // PB streak chip. Returns null when the live count is below the HUD
  // threshold (formatStreakLabel handles the cutoff) so the slot collapses
  // cleanly and a single first-PB does not double up the existing toast.
  const streakLabel = formatStreakLabel(props.pbStreak)
  // Live ghost-gap chip. The formatter handles non-finite / null inputs and
  // returns null in those cases so the chip slot collapses cleanly. A
  // negative gap means the player is AHEAD of the ghost (good, green); a
  // positive gap means BEHIND (red). Zero reads as ahead so a tied moment
  // pops in the celebratory color rather than the alarm color.
  const ghostGapMsValue = props.ghostGapMs ?? null
  const ghostGapLabel = formatGhostGap(ghostGapMsValue)
  const ghostGapAhead = ghostGapMsValue !== null && ghostGapMsValue <= 0
  return (
    <div style={wrap}>
      <style>{HUD_ANIMATIONS_CSS}</style>
      <div style={topRow}>
        <StatBlock label="CURRENT" value={formatLapTime(props.currentMs)} big />
        {props.prediction ? <PredictionBlock prediction={props.prediction} /> : null}
        <StatBlock label="LAST LAP" value={timeOrDash(props.lastLapMs)} />
        <StatBlock label="BEST (SESSION)" value={timeOrDash(props.bestSessionMs)} />
        <div style={bestBlockGroup}>
          <StatBlock
            label="BEST (ALL TIME)"
            value={timeOrDash(props.bestAllTimeMs)}
          />
          {medalTier ? <MedalBadge tier={medalTier} /> : null}
          {nextMedal && nextMedalLabel ? (
            <NextMedalChip tier={nextMedal.tier} label={nextMedalLabel} />
          ) : null}
          {streakLabel ? <StreakBadge label={streakLabel} /> : null}
        </div>
        <OptimalBlock
          optimalLapMs={props.optimalLapMs}
          complete={props.optimalLapComplete}
        />
        <StatBlock label="RECORD" value={recordValue} />
        <StatBlock label="LAP" value={props.lapCount} />
        <StatBlock label="RACER" value={props.initials ?? '---'} alignRight />
      </div>
      {props.showDrift ? (
        <DriftPanel
          active={props.driftActive}
          score={props.driftScore}
          multiplier={props.driftMultiplier}
          lapBest={props.driftLapBest}
          allTimeBest={props.driftAllTimeBest}
        />
      ) : null}
      {props.challenge ? (
        <div style={challengeBanner} role="status">
          <span>Challenge from</span>
          <span style={challengeBannerInitials}>{props.challenge.from}</span>
          <span>beat</span>
          <span style={challengeBannerTime}>
            {formatLapTime(props.challenge.targetMs)}
          </span>
        </div>
      ) : null}
      {props.rivalLabel ? (
        <div
          style={{
            ...rivalBanner,
            top: props.challenge ? 132 : 92,
          }}
          role="status"
          aria-live="polite"
        >
          {props.rivalLabel}
        </div>
      ) : null}
      {props.wrongWay ? (
        <div style={wrongWayBanner} role="alert" aria-live="assertive">
          <span style={wrongWayArrow} aria-hidden>
            {'<<'}
          </span>
          <span>WRONG WAY</span>
          <span style={wrongWayArrow} aria-hidden>
            {'<<'}
          </span>
        </div>
      ) : null}
      {!props.onTrack && !props.wrongWay ? (
        <div style={offTrack}>OFF TRACK</div>
      ) : null}
      {celebrate ? (
        <>
          <div
            key={`burst-${isRecord ? 'r' : 'p'}-${props.toast}`}
            style={isRecord ? burstRecord : burstPb}
            aria-hidden
          />
          <div
            key={`flash-${isRecord ? 'r' : 'p'}-${props.toast}`}
            style={isRecord ? edgeFlashRecord : edgeFlashPb}
            aria-hidden
          />
        </>
      ) : null}
      {showSplit ? (
        <div
          key={`split-${props.splitCpId}`}
          style={splitAhead ? splitTileAhead : splitTileBehind}
          aria-live="polite"
        >
          <div style={splitLabel}>vs PB</div>
          <div style={splitValue}>
            {formatSplitDelta(props.splitDeltaMs as number)}
          </div>
        </div>
      ) : null}
      {ghostGapLabel !== null ? (
        <div
          style={ghostGapAhead ? ghostGapChipAhead : ghostGapChipBehind}
          aria-live="off"
          title="Live gap to the ghost car at your current position"
        >
          <span style={ghostGapChipLabelStyle}>vs GHOST</span>
          <span style={ghostGapChipValueStyle}>{ghostGapLabel}</span>
        </div>
      ) : null}
      {props.sectorPb ? <SectorPbBadge sectorPb={props.sectorPb} /> : null}
      {props.toast ? <div style={toastStyle}>{props.toast}</div> : null}
    </div>
  )
}

const wrap: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  color: 'white',
  fontFamily: 'system-ui, sans-serif',
  textShadow: '0 1px 4px rgba(0,0,0,0.6)',
  zIndex: 10,
}
const topRow: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 8,
  right: 8,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  rowGap: 6,
  alignItems: 'flex-start',
}
const block: React.CSSProperties = {
  background: 'rgba(0,0,0,0.35)',
  padding: '4px 8px',
  borderRadius: 6,
  minWidth: 64,
}
const alignRightStyle: React.CSSProperties = { marginLeft: 'auto' }
const labelStyle: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.75,
  letterSpacing: 1.5,
}
const timeBig: React.CSSProperties = {
  fontSize: 'clamp(18px, 5vw, 28px)',
  fontFamily: 'monospace',
  fontWeight: 700,
  lineHeight: 1.1,
}
const timeSm: React.CSSProperties = {
  fontSize: 'clamp(13px, 3.5vw, 18px)',
  fontFamily: 'monospace',
  lineHeight: 1.1,
}
const offTrack: React.CSSProperties = {
  position: 'absolute',
  top: '18%',
  left: 0,
  right: 0,
  textAlign: 'center',
  fontSize: 32,
  fontWeight: 800,
  color: '#ffb34d',
}
// WRONG WAY warning. Sits at the same vertical band as OFF TRACK so the two
// alerts never visually compete (the JSX picks one or the other). Brighter
// red plus a gentle pulse animation pulls the eye away from the cars and
// onto the "you need to U-turn" signal.
const wrongWayBanner: React.CSSProperties = {
  position: 'absolute',
  top: '18%',
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '6px 18px',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  borderRadius: 10,
  background: 'rgba(180, 30, 30, 0.85)',
  border: '2px solid rgba(255, 240, 180, 0.85)',
  boxShadow: '0 6px 16px rgba(0, 0, 0, 0.4), 0 0 24px rgba(255, 80, 60, 0.45)',
  color: '#fff5d6',
  fontSize: 30,
  fontWeight: 900,
  letterSpacing: 2,
  pointerEvents: 'none',
  animation: 'viberacer-wrongway-pulse 0.6s ease-in-out infinite',
}
const wrongWayArrow: React.CSSProperties = {
  display: 'inline-block',
  fontFamily: 'monospace',
  fontSize: 28,
  color: '#ffe892',
  animation: 'viberacer-wrongway-arrow 0.6s ease-in-out infinite',
}
// Friend-challenge banner. Anchored just below the rear-view mirror inset so
// it does not collide with the top stat row or the wrong-way alert. Cyan
// accent matches the ghost car's color so the player intuitively links the
// two: "the cyan ghost is the challenge target".
const challengeBanner: React.CSSProperties = {
  position: 'absolute',
  top: 92,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '6px 16px',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  borderRadius: 999,
  background: 'rgba(8, 32, 48, 0.78)',
  border: '1.5px solid rgba(120, 220, 255, 0.6)',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
  color: '#cdf2ff',
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: 1.4,
  pointerEvents: 'none',
  textTransform: 'uppercase',
}
const challengeBannerInitials: React.CSSProperties = {
  color: '#fff',
  fontWeight: 900,
  letterSpacing: 2,
}
const challengeBannerTime: React.CSSProperties = {
  color: '#7fe6ff',
  fontFamily: 'monospace',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: 0,
}
// Rival banner. Same cyan color family as the friend-challenge banner so the
// player understands "the cyan ghost is the picked rival", but slightly
// brighter and with a tabular-numerals time so the rank + initials + lap
// time read as a single compact row.
const rivalBanner: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '6px 16px',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  borderRadius: 999,
  background: 'rgba(8, 32, 48, 0.78)',
  border: '1.5px solid rgba(120, 220, 255, 0.7)',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
  color: '#cdf2ff',
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 1.4,
  pointerEvents: 'none',
  textTransform: 'uppercase',
  fontFamily: 'monospace',
  fontVariantNumeric: 'tabular-nums',
}
const toastStyle: React.CSSProperties = {
  position: 'absolute',
  top: '30%',
  left: 0,
  right: 0,
  textAlign: 'center',
  fontSize: 28,
  fontWeight: 700,
  color: '#5fe08a',
  animation: 'viberacer-fade 1.6s linear',
}
const burstBase: React.CSSProperties = {
  position: 'absolute',
  top: '36%',
  left: '50%',
  width: 240,
  height: 240,
  borderRadius: '50%',
  pointerEvents: 'none',
  transform: 'translate(-50%, -50%) scale(0)',
  animation: 'viberacer-burst 1s ease-out forwards',
}
const burstPb: React.CSSProperties = {
  ...burstBase,
  background:
    'radial-gradient(circle, rgba(95,224,138,0.85) 0%, rgba(95,224,138,0.35) 45%, rgba(95,224,138,0) 70%)',
}
const burstRecord: React.CSSProperties = {
  ...burstBase,
  background:
    'radial-gradient(circle, rgba(255,210,90,0.9) 0%, rgba(255,170,60,0.4) 45%, rgba(255,140,40,0) 70%)',
}
const edgeFlashBase: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  opacity: 0,
  animation: 'viberacer-edgeflash 0.7s ease-out forwards',
}
const edgeFlashPb: React.CSSProperties = {
  ...edgeFlashBase,
  boxShadow: 'inset 0 0 80px rgba(95,224,138,0.7)',
}
const edgeFlashRecord: React.CSSProperties = {
  ...edgeFlashBase,
  boxShadow: 'inset 0 0 90px rgba(255,200,80,0.85)',
}
// Live "delta vs PB" tile. Sits below the top row of stats, centered, so it
// reads at a glance without competing with the OFF TRACK warning (further
// down the screen). Pop-in animation runs per cpId via the React key on the
// container element.
const splitTileBase: React.CSSProperties = {
  position: 'absolute',
  top: 88,
  left: '50%',
  transform: 'translate(-50%, 0)',
  padding: '6px 14px',
  borderRadius: 8,
  background: 'rgba(0, 0, 0, 0.55)',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
  textAlign: 'center',
  pointerEvents: 'none',
  animation: 'viberacer-split-pop 3.5s ease-out forwards',
  minWidth: 110,
}
const splitTileAhead: React.CSSProperties = {
  ...splitTileBase,
  color: '#5fe08a',
  borderColor: 'rgba(95, 224, 138, 0.5)',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35), 0 0 12px rgba(95, 224, 138, 0.35)',
}
const splitTileBehind: React.CSSProperties = {
  ...splitTileBase,
  color: '#ff7b6e',
  borderColor: 'rgba(255, 123, 110, 0.5)',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35), 0 0 12px rgba(255, 123, 110, 0.35)',
}
const splitLabel: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 1.5,
  opacity: 0.85,
  textTransform: 'uppercase',
}
const splitValue: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 'clamp(16px, 4vw, 22px)',
  fontWeight: 700,
  lineHeight: 1.1,
}
// Live ghost-gap chip. Sits just below the live "vs PB" split tile so the
// two read as a stacked pair (PB delta on top, GHOST delta below). The chip
// updates every HUD tick (~20 Hz) so the value is always live, unlike the
// split tile which pops per checkpoint and fades. No animation: a constant
// readout reads as a steady speedometer-style instrument rather than the
// celebratory pop of a fresh PB split.
const ghostGapChipBase: React.CSSProperties = {
  position: 'absolute',
  top: 132,
  left: '50%',
  transform: 'translate(-50%, 0)',
  padding: '3px 10px',
  borderRadius: 999,
  background: 'rgba(8, 32, 48, 0.78)',
  border: '1px solid rgba(120, 220, 255, 0.4)',
  boxShadow: '0 3px 10px rgba(0, 0, 0, 0.35)',
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  pointerEvents: 'none',
  fontFamily: 'monospace',
  fontVariantNumeric: 'tabular-nums',
  minWidth: 110,
  justifyContent: 'center',
}
const ghostGapChipAhead: React.CSSProperties = {
  ...ghostGapChipBase,
  color: '#5fe08a',
  borderColor: 'rgba(95, 224, 138, 0.5)',
  boxShadow: '0 3px 10px rgba(0, 0, 0, 0.35), 0 0 8px rgba(95, 224, 138, 0.3)',
}
const ghostGapChipBehind: React.CSSProperties = {
  ...ghostGapChipBase,
  color: '#ff7b6e',
  borderColor: 'rgba(255, 123, 110, 0.5)',
  boxShadow: '0 3px 10px rgba(0, 0, 0, 0.35), 0 0 8px rgba(255, 123, 110, 0.3)',
}
const ghostGapChipLabelStyle: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  opacity: 0.85,
  fontFamily: 'system-ui, sans-serif',
}
const ghostGapChipValueStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1,
}
// Predicted lap-time block. Slots into the top stat row beside CURRENT so the
// player can glance at "where this lap is heading" without taking eyes off
// the road. The lap-time numerals tint to match ahead/behind so even a quick
// glance reads as good or bad.
const predictionBlock: React.CSSProperties = {
  // Slightly wider than a standard StatBlock to fit the delta line.
  minWidth: 96,
}
const predictionDelta: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  lineHeight: 1.1,
  marginTop: 1,
  opacity: 0.95,
}
// Smaller "vs REC" line under the existing "vs PB" line. Same color tones
// (green ahead / red behind / gold tied) so the visual language matches the
// PB delta, but rendered at a slightly smaller size and dimmer opacity so
// the PB delta still reads as the primary number.
const predictionRecDelta: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.5,
  lineHeight: 1.1,
  marginTop: 0,
  opacity: 0.85,
}
// Tiny caption (vs PB / vs REC) prefixing each delta line. Lower opacity so
// the numeric delta keeps visual weight while still reading as a labeled
// comparison. Inline-block so the caption sits flush with the value.
const predictionDeltaCaption: React.CSSProperties = {
  display: 'inline-block',
  marginRight: 2,
  fontSize: 9,
  letterSpacing: 0.8,
  opacity: 0.75,
  textTransform: 'uppercase',
}
const predictionAhead: React.CSSProperties = { color: '#5fe08a' }
const predictionBehind: React.CSSProperties = { color: '#ff7b6e' }
const predictionNeutral: React.CSSProperties = { color: '#f4d774' }
// OPTIMAL block. Gold reads as aspirational but achievable; the dim style
// for an in-progress reference set keeps the slot non-shouty until the
// player has driven every sector at least once.
const optimalValueComplete: React.CSSProperties = {
  ...timeSm,
  color: '#f4d774',
  textShadow: '0 1px 4px rgba(0,0,0,0.6), 0 0 6px rgba(244, 215, 116, 0.35)',
}
const optimalValuePending: React.CSSProperties = {
  ...timeSm,
  color: 'rgba(244, 215, 116, 0.45)',
}
// Drift score panel. Sits on the left edge below the top stat row so it
// reads at a glance without competing with the centered split delta tile or
// the OFF TRACK / WRONG WAY warnings (further down the screen). Uses a
// vertical stack so the live score and the lap / all-time bests are visible
// in one scan.
const driftPanel: React.CSSProperties = {
  position: 'absolute',
  top: 90,
  left: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  pointerEvents: 'none',
  minWidth: 124,
}
const driftLiveBase: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.5)',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  borderRadius: 8,
  padding: '5px 10px',
  textAlign: 'center',
  transition: 'background 0.18s ease-out, border-color 0.18s ease-out',
}
const driftLiveActive: React.CSSProperties = {
  ...driftLiveBase,
  background: 'rgba(60, 30, 0, 0.65)',
  borderColor: 'rgba(255, 200, 80, 0.7)',
  color: '#ffd56b',
  animation: 'viberacer-drift-pulse 0.9s ease-in-out infinite',
}
const driftLiveInactive: React.CSSProperties = {
  ...driftLiveBase,
  color: '#cfd5dc',
}
const driftLabel: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 1.5,
  opacity: 0.85,
  textTransform: 'uppercase',
}
const driftScoreValue: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 'clamp(16px, 4vw, 22px)',
  fontWeight: 800,
  lineHeight: 1.1,
}
const driftSubRow: React.CSSProperties = {
  display: 'flex',
  gap: 4,
}
const driftSubBlock: React.CSSProperties = {
  flex: 1,
  background: 'rgba(0, 0, 0, 0.4)',
  borderRadius: 6,
  padding: '3px 6px',
  textAlign: 'center',
}
const driftSubLabel: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: 1.2,
  opacity: 0.7,
  textTransform: 'uppercase',
}
const driftSubValue: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 13,
  fontWeight: 700,
  color: '#f4d774',
  lineHeight: 1.1,
}
// SECTOR PB badge. Sits a touch below the split tile so the two read as a
// stacked pair when both fire on the same checkpoint cross (split tile shows
// "vs PB", sector tile celebrates the underlying sector improvement). Gold
// palette mirrors the OPTIMAL block and the lap-history PB chip so the visual
// language for "personal best" stays consistent across the HUD. Pop-in
// animation runs per cpId via the React key on the container element so a
// string of sector PBs through a fast section feels punchy.
const sectorPbBadge: React.CSSProperties = {
  position: 'absolute',
  top: 134,
  left: '50%',
  transform: 'translate(-50%, 0)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 12px',
  borderRadius: 999,
  background: 'linear-gradient(180deg, rgba(60, 40, 0, 0.85), rgba(40, 24, 0, 0.85))',
  border: '1px solid rgba(244, 215, 116, 0.65)',
  boxShadow:
    '0 4px 12px rgba(0, 0, 0, 0.45), 0 0 18px rgba(244, 215, 116, 0.45)',
  color: '#f4d774',
  pointerEvents: 'none',
  animation: 'viberacer-sector-pb-pop 2.2s ease-out forwards',
}
const sectorPbStar: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1,
  color: '#ffe892',
  textShadow: '0 0 6px rgba(255, 232, 146, 0.8)',
}
const sectorPbLabel: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 1.5,
  fontWeight: 800,
  textTransform: 'uppercase',
  opacity: 0.95,
}
const sectorPbSector: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 13,
  fontWeight: 700,
  background: 'rgba(244, 215, 116, 0.18)',
  borderRadius: 4,
  padding: '0 6px',
  color: '#fff5d6',
}
const sectorPbTime: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: 0.5,
  color: '#fff5d6',
}
// Medal badge container. Sits flush to the BEST (ALL TIME) tile so the medal
// reads as a property OF that lap time. Uses a column flex so the badge can
// drop to a second row on narrow viewports if the row would otherwise wrap.
const bestBlockGroup: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 4,
}
const medalBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '1px 7px',
  borderRadius: 999,
  background: 'rgba(0, 0, 0, 0.45)',
  border: '1px solid rgba(255, 255, 255, 0.25)',
  fontWeight: 800,
  fontSize: 10,
  letterSpacing: 1.2,
  lineHeight: 1.2,
}
const medalGlyphStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1,
  textShadow: '0 0 5px currentColor',
}
const medalLabelStyle: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
}
// Next-medal upgrade chip. Same compact pill shape as the medal badge so the
// two read as siblings hanging off the BEST tile. The accent color is set
// inline from the upgrade-target tier so the chip matches the metal the
// player is chasing (silver / gold / platinum). The slight darker background
// distinguishes the upgrade chip from the earned-medal badge so the player
// reads them as "have" + "chasing" at a glance.
const nextMedalChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '1px 7px',
  borderRadius: 999,
  background: 'rgba(0, 0, 0, 0.55)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: 1.1,
  lineHeight: 1.2,
}
const nextMedalArrowStyle: React.CSSProperties = {
  fontSize: 9,
  lineHeight: 1,
  textShadow: '0 0 5px currentColor',
}
const nextMedalLabelStyle: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
}
// PB streak chip. Same compact pill shape as the medal badge so the two read
// as siblings hanging off the BEST tile. Gold accent keeps the visual
// language for "personal best" consistent with the OPTIMAL block, the lap-
// history PB chip, and the sector-PB badge.
const streakBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '1px 7px',
  borderRadius: 999,
  background: 'linear-gradient(180deg, rgba(60, 40, 0, 0.7), rgba(40, 24, 0, 0.7))',
  border: '1px solid rgba(244, 215, 116, 0.65)',
  boxShadow: '0 0 8px rgba(244, 215, 116, 0.35)',
  color: '#f4d774',
  fontWeight: 800,
  fontSize: 10,
  letterSpacing: 1.2,
  lineHeight: 1.2,
}
const streakFlameStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 10,
  lineHeight: 1,
  color: '#ffe892',
  textShadow: '0 0 5px currentColor',
}
const streakLabelStyle: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
}
