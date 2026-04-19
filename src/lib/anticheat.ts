import { verifyRaceToken } from './signToken'
import type { CheckpointHit, RaceTokenPayload } from './schemas'

export const ANTICHEAT_DEFAULTS = {
  tokenMaxAgeMs: 15 * 60 * 1000,
  minSegmentMs: 200,
  lapTimeToleranceMs: 50,
  minCheckpoints: 1,
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

  if (input.checkpoints.length < cfg.minCheckpoints) {
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
