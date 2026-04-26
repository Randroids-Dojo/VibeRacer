/**
 * Pure helpers for the per-track-author "mood": which time-of-day and weather
 * preset a track ships with, and how to fold that against the player's own
 * Settings choices to produce the active scene skin.
 *
 * The track author bakes a mood into the saved track version (editor's
 * Advanced panel). Every player who races that version sees the author's
 * intended look, unless they turn off the "Respect track mood" Settings
 * toggle. The mood is NOT included in the version hash so adding or changing
 * it does not invalidate any prior leaderboard entry; it is purely cosmetic.
 *
 * Both fields are optional in the stored mood: an author can pick just a
 * time-of-day, just a weather, both, or neither. Whichever fields are unset
 * fall back to the player's own picks, so a track that only sets weather =
 * foggy still composes with whatever time-of-day the player likes (and vice
 * versa).
 */
import type { TimeOfDay } from '@/lib/lighting'
import type { Weather } from '@/lib/weather'
import type { TrackMood } from '@/lib/schemas'
import { isTimeOfDay } from '@/lib/lighting'
import { isWeather } from '@/lib/weather'

export interface ActiveMood {
  timeOfDay: TimeOfDay
  weather: Weather
}

export interface ResolveMoodOptions {
  // The track author's preferred mood, baked into the saved track version.
  // Either field may be undefined or absent; null is also accepted so callers
  // can pass through "no mood loaded yet" without conditionally splatting.
  trackMood: TrackMood | null | undefined
  // The player's own picks from Settings. Always required: these are the
  // baseline the resolver falls back to when a field is unset on the track or
  // when the player has turned off the respect toggle.
  playerTimeOfDay: TimeOfDay
  playerWeather: Weather
  // When false, ignore trackMood entirely and use the player's picks for
  // every field. When true, the author's mood (if set) takes precedence.
  respectTrackMood: boolean
}

// Resolve the active scene skin for the current race. Returns a fresh
// ActiveMood object so callers never alias a shared reference. Defensive
// against malformed mood payloads (a stored value that fails the type guard
// is treated as "field not set" instead of poisoning the scene).
export function resolveActiveMood(opts: ResolveMoodOptions): ActiveMood {
  const { trackMood, playerTimeOfDay, playerWeather, respectTrackMood } = opts
  const useTrack = respectTrackMood && trackMood !== null && trackMood !== undefined
  const trackTime =
    useTrack && isTimeOfDay(trackMood?.timeOfDay) ? trackMood!.timeOfDay! : null
  const trackWeather =
    useTrack && isWeather(trackMood?.weather) ? trackMood!.weather! : null
  return {
    timeOfDay: trackTime ?? playerTimeOfDay,
    weather: trackWeather ?? playerWeather,
  }
}

// True when the track author has actually picked at least one mood field.
// Used by the HUD / pause UI to decide whether to surface the "track mood"
// indicator (no point showing it when the track does not override anything).
export function trackHasMood(trackMood: TrackMood | null | undefined): boolean {
  if (trackMood === null || trackMood === undefined) return false
  if (isTimeOfDay(trackMood.timeOfDay)) return true
  if (isWeather(trackMood.weather)) return true
  return false
}

// Strip a mood payload down to only the fields with valid values. Returns null
// when the result has no valid fields so the API layer never persists an empty
// `{}` into KV. Used by the editor before posting to PUT /api/track/<slug>.
export function sanitizeTrackMood(
  mood: TrackMood | null | undefined,
): TrackMood | null {
  if (mood === null || mood === undefined) return null
  const out: TrackMood = {}
  if (isTimeOfDay(mood.timeOfDay)) out.timeOfDay = mood.timeOfDay
  if (isWeather(mood.weather)) out.weather = mood.weather
  if (out.timeOfDay === undefined && out.weather === undefined) return null
  return out
}
