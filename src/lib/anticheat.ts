import { verifyRaceToken } from './signToken'
import type { CheckpointHit, RaceMode, RaceTokenPayload } from './schemas'

export const ANTICHEAT_DEFAULTS = {
  tokenMaxAgeMs: 15 * 60 * 1000,
  minSegmentMs: 200,
  lapTimeToleranceMs: 50,
  minCheckpoints: 1,
  // Drag-specific. Anticheat enforces an exact checkpoint count for drag
  // submissions because every drag strip ships with a fixed three-checkpoint
  // layout (60 ft, midpoint, finish). A drag run that submits a different
  // count is either misconfigured or tampered.
  dragCheckpoints: 3,
  // World-unit-per-second ceiling for any single drag submission. Picked as
  // 2.5x the closed-loop default top speed; even the fastest drag loadout
  // tops out well below this. Anything above is bug or tamper.
  dragTopSpeedCeiling: 26 * 2.5,
}

const PROFANITY = new Set([
  'ASS',
  'FUK',
  'FUC',
  'SHT',
  'CUM',
  'CUN',
  'NIG',
  'FAG',
  'TIT',
  'DIK',
  'DIC',
  'COC',
])

export function isProfane(initials: string): boolean {
  return PROFANITY.has(initials.toUpperCase())
}

export interface LapInput {
  token: string
  slug: string
  versionHash: string
  checkpoints: CheckpointHit[]
  lapTimeMs: number
  initials: string
  // When 'drag', validateLap enforces drag-specific bounds (exact checkpoint
  // count, top-speed ceiling). Defaults to 'loop' when omitted so existing
  // closed-loop callers see byte-identical behavior.
  mode?: RaceMode
  topSpeed?: number
}

export interface LapValidation {
  ok: boolean
  payload?: RaceTokenPayload
  reason?: string
}

export function validateLap(
  input: LapInput,
  racerIdFromCookie: string,
  now: number,
  opts: Partial<typeof ANTICHEAT_DEFAULTS> = {},
): LapValidation {
  const cfg = { ...ANTICHEAT_DEFAULTS, ...opts }
  const mode: RaceMode = input.mode ?? 'loop'

  const payload = verifyRaceToken(input.token)
  if (!payload) return { ok: false, reason: 'bad_signature' }

  if (now - payload.issuedAt > cfg.tokenMaxAgeMs) {
    return { ok: false, reason: 'token_expired', payload }
  }

  if (payload.racerId !== racerIdFromCookie) {
    return { ok: false, reason: 'racer_mismatch', payload }
  }

  if (payload.slug !== input.slug || payload.versionHash !== input.versionHash) {
    return { ok: false, reason: 'target_mismatch', payload }
  }

  if (mode === 'drag') {
    if (input.checkpoints.length !== cfg.dragCheckpoints) {
      return { ok: false, reason: 'drag_checkpoint_count', payload }
    }
    if (
      typeof input.topSpeed === 'number' &&
      input.topSpeed > cfg.dragTopSpeedCeiling
    ) {
      return { ok: false, reason: 'drag_top_speed_ceiling', payload }
    }
  } else if (input.checkpoints.length < cfg.minCheckpoints) {
    return { ok: false, reason: 'too_few_checkpoints', payload }
  }

  // Checkpoints must be in ascending cpId order starting at 0 and contiguous.
  for (let i = 0; i < input.checkpoints.length; i++) {
    if (input.checkpoints[i].cpId !== i) {
      return { ok: false, reason: 'checkpoint_order', payload }
    }
  }

  // Segment times must meet the floor.
  let prevT = 0
  let sum = 0
  for (const cp of input.checkpoints) {
    const segment = cp.tMs - prevT
    if (segment < cfg.minSegmentMs) {
      return { ok: false, reason: 'segment_too_fast', payload }
    }
    sum += segment
    prevT = cp.tMs
  }

  if (Math.abs(sum - input.lapTimeMs) > cfg.lapTimeToleranceMs) {
    return { ok: false, reason: 'lap_time_mismatch', payload }
  }

  const initials = input.initials.toUpperCase()
  if (!/^[A-Z]{3}$/.test(initials)) {
    return { ok: false, reason: 'bad_initials', payload }
  }
  if (isProfane(initials)) {
    return { ok: false, reason: 'profane_initials', payload }
  }

  return { ok: true, payload }
}
