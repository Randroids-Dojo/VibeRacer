import type { CheckpointHit } from '@/lib/schemas'

// How long a freshly-computed split delta stays on the HUD before it fades.
// Each new checkpoint cross overwrites this with a fresh expiry; lap boundaries
// clear it.
export const SPLIT_DISPLAY_MS = 3500

export interface SplitDelta {
  // Signed milliseconds. Negative means the player is ahead of their PB at
  // this checkpoint (good); positive means behind (slower).
  deltaMs: number
  // The cpId the comparison was made at. The HUD uses this to dedupe
  // re-renders when the same hit fires multiple times within a frame budget.
  cpId: number
  // Wall-clock timestamp when the delta was generated. The HUD fades the tile
  // out `SPLIT_DISPLAY_MS` after this.
  generatedAtMs: number
}

// Compute the delta vs PB at the most recently crossed checkpoint. Returns
// null when the PB has no matching cpId (track shape changed, PB recorded
// before this run, etc).
export function computeSplitDeltaForLastHit(
  currentHits: CheckpointHit[],
  pbHits: CheckpointHit[] | null,
): { deltaMs: number; cpId: number } | null {
  if (!pbHits || pbHits.length === 0) return null
  if (currentHits.length === 0) return null
  const last = currentHits[currentHits.length - 1]
  const pb = pbHits.find((h) => h.cpId === last.cpId)
  if (!pb) return null
  return { deltaMs: last.tMs - pb.tMs, cpId: last.cpId }
}

// Format a signed ms delta as a HUD-ready string. Always shows sign + 3
// decimal seconds (e.g. "+0.421", "-1.034"). 0 reads as "+0.000" so the tile
// is never just a sign-less number.
export function formatSplitDelta(deltaMs: number): string {
  if (!Number.isFinite(deltaMs)) return '+0.000'
  const sign = deltaMs > 0 ? '+' : deltaMs < 0 ? '-' : '+'
  const abs = Math.abs(deltaMs)
  const seconds = Math.floor(abs / 1000)
  const millis = Math.round(abs % 1000)
  // Guard the millis rounding case where 999.5 ms rounds to 1000.
  const adjSeconds = millis === 1000 ? seconds + 1 : seconds
  const adjMillis = millis === 1000 ? 0 : millis
  return `${sign}${adjSeconds}.${String(adjMillis).padStart(3, '0')}`
}

// Has the freshly-computed split aged past its display window?
export function isSplitExpired(
  split: SplitDelta | null,
  nowMs: number,
  windowMs: number = SPLIT_DISPLAY_MS,
): boolean {
  if (!split) return true
  return nowMs - split.generatedAtMs >= windowMs
}

// Live projection of the final lap time, computed at each checkpoint hit.
// The HUD shows this as a "PROJECTED" stat block alongside CURRENT so the
// player can see whether their pace is on track to beat their PB before the
// finish line crosses. The projection updates only when a checkpoint fires
// (so it does not drift mid-sector); between checkpoints the previous value
// stays on screen.
export interface LapPrediction {
  // Projected total lap time in ms, derived from PB lap time plus the latest
  // delta vs PB at the most recently crossed checkpoint.
  predictedMs: number
  // Signed delta vs PB lap time. Negative = ahead, positive = behind. Same
  // value as the latest split delta but kept here so the HUD can render it
  // without re-deriving from PB.
  deltaMs: number
  // The cpId the projection was derived from. Used as a React key so a fresh
  // checkpoint cross retriggers a subtle pop animation.
  cpId: number
}

// Project the final lap time using the most recent checkpoint hit and the
// stored PB splits + PB lap time. Returns null when any required input is
// missing (no PB recorded yet, no current hits, last cpId not in PB), so the
// HUD can hide the tile cleanly until the first matching checkpoint of the
// next attempt.
export function predictLapTimeFromHits(
  currentHits: CheckpointHit[],
  pbHits: CheckpointHit[] | null,
  pbLapMs: number | null,
): LapPrediction | null {
  if (!pbHits || pbHits.length === 0) return null
  if (pbLapMs === null || !Number.isFinite(pbLapMs) || pbLapMs <= 0) return null
  if (currentHits.length === 0) return null
  const last = currentHits[currentHits.length - 1]
  const pb = pbHits.find((h) => h.cpId === last.cpId)
  if (!pb) return null
  const deltaMs = last.tMs - pb.tMs
  const predictedMs = Math.max(0, Math.round(pbLapMs + deltaMs))
  return { predictedMs, deltaMs, cpId: last.cpId }
}
