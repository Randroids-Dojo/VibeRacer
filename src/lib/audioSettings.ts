import { z } from 'zod'

// User-tunable audio settings. Persisted to localStorage so the choice
// follows the player across sessions and slugs without server state.
//
// `*Volume` values are 0..1 multipliers applied to per-channel gain buses
// in the audio engine. The `*Enabled` toggles are convenience switches:
// when disabled, the channel bus is set to 0 regardless of the volume.

export interface AudioSettings {
  musicEnabled: boolean
  sfxEnabled: boolean
  musicVolume: number
  sfxVolume: number
  // Per-track music personalization. When true, the in-game music's root
  // key, scale flavor, and tempo are nudged from a stable hash of the
  // current slug so each track has its own musical identity. When false,
  // every track plays the same legacy game loop (G minor, 140 BPM).
  musicPerTrack: boolean
  // Folds the player's initials into the per-track music seed so two players
  // on the same slug hear distinct flavors. Only consulted when
  // `musicPerTrack` is also true; otherwise the loop stays at the legacy
  // baseline. Default `false` so the audible behavior on upgrade matches the
  // existing slug-only personalization exactly.
  musicMixInitials: boolean
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  musicEnabled: true,
  sfxEnabled: true,
  musicVolume: 0.7,
  sfxVolume: 0.8,
  musicPerTrack: true,
  musicMixInitials: false,
}

export const AUDIO_SETTINGS_STORAGE_KEY = 'viberacer.audio'
// Custom event used to broadcast in-tab changes between hook instances. The
// `storage` event covers cross-tab sync but does not fire in the originating
// tab, which is why we add a custom event on top.
export const AUDIO_SETTINGS_EVENT = 'viberacer:audio-settings-changed'

const VolumeSchema = z.number().min(0).max(1)

const AudioSettingsSchema = z.object({
  musicEnabled: z.boolean(),
  sfxEnabled: z.boolean(),
  musicVolume: VolumeSchema,
  sfxVolume: VolumeSchema,
  // musicPerTrack landed after the original audio settings shape. Default
  // true so legacy stored payloads opt in to the per-track flavor on their
  // next race without losing any other choices; players who hated it can
  // flip it off once.
  musicPerTrack: z.boolean().default(true),
  // musicMixInitials landed after musicPerTrack. Default false so legacy
  // stored payloads keep playing the existing per-track flavor unchanged on
  // upgrade; players who want their initials to influence the loop opt in
  // once and the choice persists.
  musicMixInitials: z.boolean().default(false),
})

export function cloneDefaultAudioSettings(): AudioSettings {
  return { ...DEFAULT_AUDIO_SETTINGS }
}

function clamp01(x: number): number {
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 0
  return clamp01(v)
}

// Combined gain applied to the music bus. Toggling `musicEnabled` off
// short-circuits the volume slider so the player does not lose their volume
// preference when temporarily muting.
export function effectiveMusicGain(s: AudioSettings): number {
  return s.musicEnabled ? clamp01(s.musicVolume) : 0
}

export function effectiveSfxGain(s: AudioSettings): number {
  return s.sfxEnabled ? clamp01(s.sfxVolume) : 0
}

export function readStoredAudioSettings(): AudioSettings {
  if (typeof window === 'undefined') return cloneDefaultAudioSettings()
  try {
    const raw = window.localStorage?.getItem(AUDIO_SETTINGS_STORAGE_KEY)
    if (!raw) return cloneDefaultAudioSettings()
    const parsed = AudioSettingsSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return cloneDefaultAudioSettings()
    return parsed.data
  } catch {
    return cloneDefaultAudioSettings()
  }
}

export function writeStoredAudioSettings(settings: AudioSettings): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage?.setItem(
      AUDIO_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    )
  } catch {
    // localStorage may be unavailable (private mode, quota). Fail silently.
  }
}
