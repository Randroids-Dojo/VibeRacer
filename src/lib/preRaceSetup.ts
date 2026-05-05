import type { CarParams } from '@/game/physics'
import { TUNING_KEYS, cloneDefaultParams } from './tuningSettings'
import type { SavedTuning } from './tuningLab'

// Option as rendered in the pre-race setup picker. Keeping this in pure
// land (no React deps) means the option-assembly + dedupe logic can be
// covered by Vitest without spinning up a DOM.

export interface PreRaceSetupOption {
  id: string
  // Short headline for the row. Names take precedence so the player sees
  // exactly what they are about to race with.
  label: string
  // Optional one-liner under the headline ("Last raced here", "Carryover
  // from your last race", "1:23.456 by ABC", etc.).
  sublabel?: string
  params: CarParams
}

export interface PreRaceTopEntry {
  initials: string
  lapTimeMs: number
  params: CarParams
}

export interface BuildPreRaceOptionsArgs {
  perTrack: CarParams | null
  lastLoaded: CarParams | null
  creatorTuning: CarParams | null
  topEntry: PreRaceTopEntry | null
  savedList: readonly SavedTuning[]
}

// Pure assembly helper. Walks the resolution sources in user-priority
// order and dedupes by parameter equality so the player never sees the
// same setup listed twice (e.g. when the per-track save is also the
// global carryover, only one row appears). The Default car always
// appears last as an anytime-available fallback, even when an earlier
// source happens to carry stock params.
export function buildPreRaceOptions({
  perTrack,
  lastLoaded,
  creatorTuning,
  topEntry,
  savedList,
}: BuildPreRaceOptionsArgs): PreRaceSetupOption[] {
  const out: PreRaceSetupOption[] = []
  const seen: CarParams[] = []

  function pushUnique(option: PreRaceSetupOption): void {
    for (const prior of seen) {
      if (sameParams(prior, option.params)) return
    }
    seen.push(option.params)
    out.push(option)
  }

  if (perTrack) {
    const matched = matchSavedName(perTrack, savedList)
    pushUnique({
      id: 'perTrack',
      label: matched ?? 'Last setup you raced here',
      sublabel: matched ? 'Last setup you raced here' : undefined,
      params: perTrack,
    })
  }
  if (lastLoaded) {
    const matched = matchSavedName(lastLoaded, savedList)
    pushUnique({
      id: 'lastLoaded',
      label: matched ?? 'Carryover from your last race',
      sublabel: matched ? 'Carryover from your last race' : undefined,
      params: lastLoaded,
    })
  }
  if (creatorTuning) {
    const matched = matchSavedName(creatorTuning, savedList)
    pushUnique({
      id: 'creator',
      label: matched ?? "Track creator's setup",
      sublabel: matched
        ? "Track creator's setup"
        : 'What the track author was driving when they saved it',
      params: creatorTuning,
    })
  }
  if (topEntry) {
    pushUnique({
      id: 'topLeader',
      label: `Top leaderboard setup (${topEntry.initials})`,
      sublabel: `Lap ${formatLapMs(topEntry.lapTimeMs)} by ${topEntry.initials}`,
      params: topEntry.params,
    })
  }
  for (const t of savedList) {
    pushUnique({
      id: `saved:${t.id}`,
      label: t.name,
      sublabel: 'From your Tuning Lab library',
      params: t.params,
    })
  }
  // Default is appended unconditionally so the explicit "I want stock"
  // affordance is always present. If an earlier source happened to carry
  // stock params, both rows show; their labels disambiguate intent.
  out.push({
    id: 'default',
    label: 'Default car (Stock)',
    sublabel: 'The factory tune. Always available.',
    params: cloneDefaultParams(),
  })
  return out
}

// Iterates the canonical key list rather than `Object.keys(a)` so a
// malformed input (e.g. a stored CarParams missing fields after a
// schema migration, or a hand-edited localStorage blob) cannot slip
// through the comparison via NaN propagation. Both sides must carry a
// finite number on every key for the params to count as equal.
export function sameParams(a: CarParams, b: CarParams): boolean {
  for (const k of TUNING_KEYS) {
    const av = a[k]
    const bv = b[k]
    if (!Number.isFinite(av) || !Number.isFinite(bv)) return false
    if (Math.abs(av - bv) > 1e-9) return false
  }
  return true
}

export function matchSavedName(
  params: CarParams,
  saved: readonly SavedTuning[],
): string | null {
  for (const t of saved) {
    if (sameParams(t.params, params)) return t.name
  }
  return null
}

// "M:SS.mmm" lap-time formatter. Forgiving on garbage input: a NaN or
// negative duration falls through to placeholder dashes so a corrupt
// leaderboard entry never crashes the picker.
export function formatLapMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '--:--.---'
  const totalMs = Math.round(ms)
  const minutes = Math.floor(totalMs / 60_000)
  const seconds = Math.floor((totalMs % 60_000) / 1000)
  const millis = totalMs % 1000
  const ss = seconds.toString().padStart(2, '0')
  const sss = millis.toString().padStart(3, '0')
  return `${minutes}:${ss}.${sss}`
}
