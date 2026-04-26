import type { CheckpointHit } from '@/lib/schemas'

// Per-sector durations for a single lap. Index `i` holds the time spent
// driving from the previous checkpoint trigger to checkpoint `i`. The very
// first entry covers the start line to the first checkpoint and is keyed by
// the cpId of that first checkpoint.
//
// The on-disk shape mirrors the existing PB-splits storage: an array of
// `{cpId, durationMs}` so the lookup stays cpId-keyed (a track edit that
// removes an interior checkpoint never silently consumes a stale duration
// from a different sector).
export interface SectorDuration {
  // The cpId at the END of the sector. Sector 0 = start to cp0, sector 1 =
  // cp0 to cp1, etc.
  cpId: number
  // Sector length in ms. Always positive (anything else is rejected upstream).
  durationMs: number
}

// Convert an in-order CheckpointHit array to per-sector durations. Each
// hit's `tMs` is measured from the start of the lap (lap timer zero), so the
// per-sector durations are simple consecutive differences.
//
// Returns an empty array on empty input. Skips any hit whose computed
// duration is non-finite, zero, or negative (defensive against a glitched
// hit ordering or a clock anomaly), so the merge step never poisons a
// stored best with garbage.
export function computeSectorDurations(
  hits: readonly CheckpointHit[],
): SectorDuration[] {
  if (!hits || hits.length === 0) return []
  const out: SectorDuration[] = []
  let prev = 0
  for (const hit of hits) {
    const dur = hit.tMs - prev
    if (Number.isFinite(dur) && dur > 0) {
      out.push({ cpId: hit.cpId, durationMs: dur })
    }
    prev = hit.tMs
  }
  return out
}

// Merge a fresh lap's per-sector durations into the running best-sector map.
// Returns a new array (never mutates `prev`) keyed by cpId, taking the min
// duration for any cpId that appears in both. New cpIds from `next` are added.
// cpIds present only in `prev` are preserved unchanged.
//
// Order is stable: entries from `prev` keep their position, then any
// cpId from `next` not already in prev is appended in `next` order.
export function mergeBestSectors(
  prev: readonly SectorDuration[] | null,
  next: readonly SectorDuration[],
): SectorDuration[] {
  const byId = new Map<number, SectorDuration>()
  if (prev) {
    for (const s of prev) {
      if (!Number.isFinite(s.durationMs) || s.durationMs <= 0) continue
      // Last write wins for duplicate cpIds within `prev` (legacy data
      // shouldn't have any, but be defensive).
      byId.set(s.cpId, { cpId: s.cpId, durationMs: s.durationMs })
    }
  }
  for (const s of next) {
    if (!Number.isFinite(s.durationMs) || s.durationMs <= 0) continue
    const existing = byId.get(s.cpId)
    if (!existing || s.durationMs < existing.durationMs) {
      byId.set(s.cpId, { cpId: s.cpId, durationMs: s.durationMs })
    }
  }
  // Preserve `prev` order, then append any new cpIds from `next` in order.
  const out: SectorDuration[] = []
  const seen = new Set<number>()
  if (prev) {
    for (const s of prev) {
      const merged = byId.get(s.cpId)
      if (merged && !seen.has(s.cpId)) {
        out.push(merged)
        seen.add(s.cpId)
      }
    }
  }
  for (const s of next) {
    if (seen.has(s.cpId)) continue
    const merged = byId.get(s.cpId)
    if (merged) {
      out.push(merged)
      seen.add(s.cpId)
    }
  }
  return out
}

// Sum every sector duration to get the theoretical-best lap. Returns null
// when the input is empty so the HUD can hide the OPTIMAL block cleanly
// instead of rendering "0".
export function optimalLapTime(
  sectors: readonly SectorDuration[] | null,
): number | null {
  if (!sectors || sectors.length === 0) return null
  let total = 0
  for (const s of sectors) {
    if (!Number.isFinite(s.durationMs) || s.durationMs <= 0) return null
    total += s.durationMs
  }
  return Math.round(total)
}

// How long the per-sector PB celebration badge stays on the HUD before it
// fades. Each fresh checkpoint cross overwrites the previous expiry; lap
// boundaries clear it. A bit shorter than SPLIT_DISPLAY_MS so a string of
// PBs through a fast section still feels punchy rather than sticky.
export const SECTOR_PB_DISPLAY_MS = 2200

// Per-sector PB result for a single just-completed sector. Returned by
// `compareSectorToBest` so the HUD can flash a celebratory "S<n> PB" badge the
// moment the player nails a corner faster than ever before. Mirrors the same
// "compare against the running best" rule the lap-completion merge uses, but
// runs once per checkpoint instead of once per lap so the player gets feedback
// while the lap is still in flight.
export interface SectorPbResult {
  // The cpId at the END of the sector that just completed.
  cpId: number
  // The just-measured sector duration in ms. Always > 0 (negative / zero
  // computations short-circuit to a null result so the HUD never flashes
  // garbage).
  durationMs: number
  // Prior best for this cpId before this sector ran, or null when the player
  // has never recorded a best for this cpId yet (so the celebration reads as
  // a "first-time lap" sector PB instead of comparing to an absent prior).
  priorBestMs: number | null
  // True when this sector beats the prior best (or no prior best existed).
  // Drives the HUD celebration; false results mean the player ran the sector
  // but did not improve.
  isPb: boolean
}

// Compare a single just-completed sector against the running best-sector map.
// Returns null when the inputs are nonsensical (non-finite or non-positive
// duration, missing previous tMs reference); otherwise returns a result whose
// `isPb` is true when this sector beats the prior best for its cpId, OR when
// no prior best for that cpId exists yet.
//
// The duration is computed as `currentHit.tMs - prevHitTMs`. Pass
// `prevHitTMs = 0` for the first checkpoint of a lap so the start-line-to-cp0
// segment compares correctly.
export function compareSectorToBest(
  currentHit: { cpId: number; tMs: number },
  prevHitTMs: number,
  bestSectors: readonly SectorDuration[] | null,
): SectorPbResult | null {
  if (!currentHit) return null
  if (!Number.isFinite(currentHit.tMs)) return null
  if (!Number.isFinite(prevHitTMs)) return null
  const durationMs = currentHit.tMs - prevHitTMs
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null
  let priorBestMs: number | null = null
  if (bestSectors) {
    for (const s of bestSectors) {
      if (s.cpId !== currentHit.cpId) continue
      if (!Number.isFinite(s.durationMs) || s.durationMs <= 0) continue
      priorBestMs = s.durationMs
      break
    }
  }
  const isPb = priorBestMs === null || durationMs < priorBestMs
  return {
    cpId: currentHit.cpId,
    durationMs: Math.round(durationMs),
    priorBestMs: priorBestMs === null ? null : Math.round(priorBestMs),
    isPb,
  }
}

// True when the stored best-sectors cover every sector of the current track
// (one entry per expected cpId, with positive durations). Used by the HUD to
// decide whether to render the OPTIMAL block as a real time vs a placeholder.
//
// The expected sector count for a track equals its checkpoint count (every
// checkpoint, including the lap-completing one at the start, terminates a
// sector). Pass `expectedSectorCount` from `path.checkpointCount` so a track
// with a custom (non-default) checkpoint count is judged correctly.
export function hasCompleteOptimalLap(
  sectors: readonly SectorDuration[] | null,
  expectedSectorCount: number,
): boolean {
  if (!sectors || expectedSectorCount <= 0) return false
  if (sectors.length < expectedSectorCount) return false
  // All durations positive (the merge filter already enforces this on writes,
  // but read-side data could be hand-edited; keep the guard).
  for (const s of sectors) {
    if (!Number.isFinite(s.durationMs) || s.durationMs <= 0) return false
  }
  // Distinct cpIds covering at least the expected count. The merge writer
  // dedupes by cpId, so a length check after dedup is enough.
  const ids = new Set<number>()
  for (const s of sectors) ids.add(s.cpId)
  return ids.size >= expectedSectorCount
}
