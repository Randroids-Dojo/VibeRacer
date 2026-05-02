import type {
  MusicWave,
  TrackMusic,
  TrackMusicScaleFlavor,
} from './trackMusic'

export interface VibePadPosition {
  energy: number
  mood: number
}

export const NEUTRAL_VIBE: VibePadPosition = { energy: 0.5, mood: 0.5 }

const SCALE_BY_MOOD: readonly TrackMusicScaleFlavor[] = [
  'minor',
  'dorian',
  'pentatonic',
  'major',
] as const

const VIBE_BPM_MIN = 96
const VIBE_BPM_MAX = 168
const VIBE_DENSITY_MIN = 0.35
const VIBE_DENSITY_MAX = 1
const VIBE_BASS_VOL_MIN = 0.55
const VIBE_BASS_VOL_MAX = 1
const VIBE_MELODY_VOL_MIN = 0.45
const VIBE_MELODY_VOL_MAX = 1
const VIBE_TEMPO_MIN_AT_LOW = 0.55
const VIBE_TEMPO_MIN_AT_HIGH = 0.85
const VIBE_TEMPO_MAX_AT_LOW = 0.9
const VIBE_TEMPO_MAX_AT_HIGH = 1.2
const VIBE_COUNTER_THRESHOLD = 0.4

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t)
}

function bassWaveFor(energy: number): MusicWave {
  if (energy >= 0.66) return 'sawtooth'
  if (energy >= 0.33) return 'square'
  return 'triangle'
}

function melodyWaveFor(mood: number): MusicWave {
  if (mood >= 0.66) return 'square'
  if (mood >= 0.33) return 'triangle'
  return 'sine'
}

function scaleForMood(mood: number): TrackMusicScaleFlavor {
  const m = clamp01(mood)
  const index = Math.min(
    SCALE_BY_MOOD.length - 1,
    Math.floor(m * SCALE_BY_MOOD.length),
  )
  return SCALE_BY_MOOD[index]
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * Apply a Vibe Pad position to a base TrackMusic, returning a fresh tune with
 * the pad-driven dimensions overwritten. Step patterns and automation
 * (per-lap, off-track, finish stinger) are preserved so a Roll or seed can
 * still own the rhythm while the pad shapes the energy and mood.
 */
export function applyVibePad(
  base: TrackMusic,
  vibe: VibePadPosition,
): TrackMusic {
  const energy = clamp01(vibe.energy)
  const mood = clamp01(vibe.mood)
  const bpm = Math.round(lerp(VIBE_BPM_MIN, VIBE_BPM_MAX, energy))
  const scale = scaleForMood(mood)
  const drumDensity = round2(lerp(VIBE_DENSITY_MIN, VIBE_DENSITY_MAX, energy))
  const tempoMinFactor = round2(
    lerp(VIBE_TEMPO_MIN_AT_LOW, VIBE_TEMPO_MIN_AT_HIGH, energy),
  )
  const tempoMaxFactor = round2(
    lerp(VIBE_TEMPO_MAX_AT_LOW, VIBE_TEMPO_MAX_AT_HIGH, energy),
  )
  const bassVolume = round2(
    lerp(VIBE_BASS_VOL_MIN, VIBE_BASS_VOL_MAX, energy),
  )
  const melodyVolume = round2(
    lerp(VIBE_MELODY_VOL_MIN, VIBE_MELODY_VOL_MAX, mood),
  )
  const melodyOctave = Math.round(lerp(-1, 1, mood))
  return {
    ...base,
    bpm,
    scale,
    voices: {
      ...base.voices,
      bass: {
        ...base.voices.bass,
        wave: bassWaveFor(energy),
        volume: bassVolume,
      },
      melody: {
        ...base.voices.melody,
        wave: melodyWaveFor(mood),
        octave: melodyOctave,
        volume: melodyVolume,
      },
      counter: {
        ...base.voices.counter,
        enabled: energy > VIBE_COUNTER_THRESHOLD,
      },
    },
    drums: {
      ...base.drums,
      density: drumDensity,
    },
    automation: {
      ...base.automation,
      tempoMinFactor,
      tempoMaxFactor,
    },
  }
}

/**
 * Approximate the inverse of `applyVibePad`. Used to position the puck when
 * loading an existing tune so the editor opens with a sensible starting
 * position rather than the centre.
 */
export function vibeFromMusic(music: TrackMusic): VibePadPosition {
  const energy = clamp01((music.bpm - VIBE_BPM_MIN) / (VIBE_BPM_MAX - VIBE_BPM_MIN))
  const scaleIndex = SCALE_BY_MOOD.indexOf(music.scale)
  const mood =
    scaleIndex >= 0
      ? (scaleIndex + 0.5) / SCALE_BY_MOOD.length
      : 0.5
  return { energy, mood }
}

const VIBE_LABELS: Array<{
  energyMin: number
  energyMax: number
  moodMin: number
  moodMax: number
  label: string
}> = [
  { energyMin: 0, energyMax: 0.5, moodMin: 0.5, moodMax: 1, label: 'sunlit drift' },
  { energyMin: 0.5, energyMax: 1, moodMin: 0.5, moodMax: 1, label: 'neon rush' },
  { energyMin: 0, energyMax: 0.5, moodMin: 0, moodMax: 0.5, label: 'moody cruise' },
  { energyMin: 0.5, energyMax: 1, moodMin: 0, moodMax: 0.5, label: 'gritty thrash' },
]

/** Friendly two-word vibe label for the current pad position. */
export function vibeLabel(vibe: VibePadPosition): string {
  for (const region of VIBE_LABELS) {
    if (
      vibe.energy >= region.energyMin &&
      vibe.energy <= region.energyMax &&
      vibe.mood >= region.moodMin &&
      vibe.mood <= region.moodMax
    ) {
      return region.label
    }
  }
  return 'free style'
}

/**
 * Exposed scale order so the editor and tests share the same axis without
 * duplicating the constant.
 */
export function scaleByMood(): readonly TrackMusicScaleFlavor[] {
  return SCALE_BY_MOOD
}
