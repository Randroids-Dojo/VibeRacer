import { z } from 'zod'
import { fnv1a32 } from './fnv1a'

export const TUNE_STEP_COUNT = 16
export const TUNE_FINISH_STINGER_STEP_COUNT = 8

export const TRACK_TUNE_SCALE_FLAVORS = [
  'minor',
  'major',
  'pentatonic',
  'dorian',
] as const
export type TrackTuneScaleFlavor = (typeof TRACK_TUNE_SCALE_FLAVORS)[number]

export const TRACK_TUNE_VOICES = ['bass', 'melody', 'counter', 'arp'] as const
export type TuneVoice = (typeof TRACK_TUNE_VOICES)[number]

export const TRACK_TUNE_WAVES = [
  'sine',
  'square',
  'sawtooth',
  'triangle',
] as const
export type TuneWave = (typeof TRACK_TUNE_WAVES)[number]

export type TuneStep = number | null
export type TuneStepPattern = TuneStep[]
export type TuneFinishStingerPattern = TuneStep[]

export interface TuneVoiceConfig {
  enabled: boolean
  wave: TuneWave
  octave: number
  volume: number
  steps: TuneStepPattern
}

export interface TuneDrumsConfig {
  kick: boolean
  snare: boolean
  hat: boolean
  density: number
}

export interface TuneAutomationConfig {
  tempoMinFactor: number
  tempoMaxFactor: number
  perLapSemitones: number
  offTrackScale: TrackTuneScaleFlavor | null
  offTrackDuck: number
  finishStinger: TuneFinishStingerPattern | null
}

export interface TrackTune {
  schemaVersion: 1
  bpm: number
  rootMidi: number
  scale: TrackTuneScaleFlavor
  voices: Record<TuneVoice, TuneVoiceConfig>
  drums: TuneDrumsConfig
  automation: TuneAutomationConfig
  name?: string
  seedWord?: string
}

// Bound step degrees so `scaleDeg` cannot push the resolved MIDI value
// far enough to overflow `midiFreq` to Infinity. Each degree adds at most
// (degree / scale.length) octaves on top of the configured root, and the
// root is already bounded by TUNE_ROOT_MIDI_*.
export const TUNE_STEP_DEGREE_MIN = -32
export const TUNE_STEP_DEGREE_MAX = 32

const TuneStepSchema = z
  .number()
  .int()
  .min(TUNE_STEP_DEGREE_MIN)
  .max(TUNE_STEP_DEGREE_MAX)
  .or(z.null())

export const TuneStepPatternSchema = z
  .array(TuneStepSchema)
  .length(TUNE_STEP_COUNT)
export const TuneFinishStingerPatternSchema = z
  .array(TuneStepSchema)
  .length(TUNE_FINISH_STINGER_STEP_COUNT)

export const TrackTuneScaleFlavorSchema = z.enum(TRACK_TUNE_SCALE_FLAVORS)
export const TuneWaveSchema = z.enum(TRACK_TUNE_WAVES)

export const TuneVoiceConfigSchema = z
  .object({
    enabled: z.boolean(),
    wave: TuneWaveSchema,
    octave: z.number().int().min(-2).max(2),
    volume: z.number().min(0).max(1),
    steps: TuneStepPatternSchema,
  })
  .strict()

export const TrackTuneSchema: z.ZodType<TrackTune> = z
  .object({
    schemaVersion: z.literal(1),
    bpm: z.number().int().min(60).max(220),
    rootMidi: z.number().int().min(36).max(84),
    scale: TrackTuneScaleFlavorSchema,
    voices: z
      .object({
        bass: TuneVoiceConfigSchema,
        melody: TuneVoiceConfigSchema,
        counter: TuneVoiceConfigSchema,
        arp: TuneVoiceConfigSchema,
      })
      .strict(),
    drums: z
      .object({
        kick: z.boolean(),
        snare: z.boolean(),
        hat: z.boolean(),
        density: z.number().min(0).max(1),
      })
      .strict(),
    automation: z
      .object({
        tempoMinFactor: z.number().min(0.25).max(2),
        tempoMaxFactor: z.number().min(0.25).max(2),
        perLapSemitones: z.number().int().min(-6).max(6),
        offTrackScale: TrackTuneScaleFlavorSchema.nullable(),
        offTrackDuck: z.number().min(0).max(1),
        finishStinger: TuneFinishStingerPatternSchema.nullable(),
      })
      .strict(),
    name: z.string().trim().min(1).max(80).optional(),
    seedWord: z.string().trim().min(1).max(80).optional(),
  })
  .strict()

const R: TuneStep = null

const DEFAULT_BASS_STEPS: TuneStepPattern = [
   0,  R,  0,  R,   4,  R,  0,  R,   3,  R,  3,  R,   4,  R,  4,  R,
]
const DEFAULT_MELODY_STEPS: TuneStepPattern = [
   R,  R,  4,  R,   3,  R,  2,  R,   4,  R,  6,  R,   4,  3,  R,  R,
]
const DEFAULT_COUNTER_STEPS: TuneStepPattern = [
   0,  R,  R,  R,   2,  R,  R,  R,   3,  R,  R,  R,   2,  R,  R,  R,
]
const DEFAULT_ARP_STEPS: TuneStepPattern = [
   0,  2,  4,  6,   2,  4,  6,  8,   4,  2,  0,  2,   4,  2,  0,  R,
]

export const DEFAULT_TRACK_TUNE: TrackTune = {
  schemaVersion: 1,
  bpm: 140,
  rootMidi: 55,
  scale: 'minor',
  voices: {
    bass: {
      enabled: true,
      wave: 'sawtooth',
      octave: -1,
      volume: 1,
      steps: DEFAULT_BASS_STEPS,
    },
    melody: {
      enabled: true,
      wave: 'square',
      octave: 1,
      volume: 1,
      steps: DEFAULT_MELODY_STEPS,
    },
    counter: {
      enabled: true,
      wave: 'triangle',
      octave: 0,
      volume: 1,
      steps: DEFAULT_COUNTER_STEPS,
    },
    arp: {
      enabled: false,
      wave: 'triangle',
      octave: 2,
      volume: 0.5,
      steps: DEFAULT_ARP_STEPS,
    },
  },
  drums: {
    kick: true,
    snare: true,
    hat: true,
    density: 1,
  },
  automation: {
    tempoMinFactor: 0.7,
    tempoMaxFactor: 1,
    perLapSemitones: 0,
    offTrackScale: null,
    offTrackDuck: 1,
    finishStinger: null,
  },
}

const BASS_TEMPLATES: readonly TuneStepPattern[] = [
  [0, R, 0, R, 4, R, 0, R, 3, R, 3, R, 4, R, 4, R],
  [0, R, R, 0, 3, R, R, 3, 4, R, R, 4, 2, R, 4, R],
  [0, R, 2, R, 3, R, 2, R, 0, R, 4, R, 3, R, 2, R],
  [0, R, R, R, 4, R, 3, R, 2, R, R, R, 4, R, 3, R],
  [0, 0, R, R, 2, R, 4, R, 3, 3, R, R, 4, R, 2, R],
  [0, R, 0, 2, R, R, 3, R, 4, R, 4, 6, R, R, 3, R],
  [0, R, R, 2, 4, R, R, 2, 3, R, R, 0, 4, R, R, 4],
  [0, R, 4, R, 0, R, 3, R, 0, R, 2, R, 4, R, 2, R],
]

function clonePattern(pattern: readonly TuneStep[]): TuneStepPattern {
  return [...pattern]
}

export function cloneTrackTune(tune: TrackTune): TrackTune {
  return TrackTuneSchema.parse(tune)
}

function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state
  }
}

function seedBytes(seedWord: string): number[] {
  const base = fnv1a32(seedWord)
  const next = lcg(base === 0 ? 1 : base)
  return Array.from({ length: 16 }, () => (next() >>> 24) & 0xff)
}

function degreeFromByte(byte: number, span = 7): number {
  return byte % span
}

function patternedSteps(
  next: () => number,
  density: number,
  offset: number,
): TuneStepPattern {
  return Array.from({ length: TUNE_STEP_COUNT }, (_, step) => {
    const beatWeight = step % 4 === 0 ? 0.3 : 0
    const gate = ((next() >>> 24) & 0xff) / 255
    if (gate > density + beatWeight) return null
    return degreeFromByte(((next() >>> 24) & 0xff) + offset, 8)
  })
}

export function generateTuneFromSeed(seed: string): TrackTune {
  const seedWord = seed.trim() || 'viberacer'
  const hashSeed = seedWord.toLowerCase()
  const bytes = seedBytes(hashSeed)
  const next = lcg(fnv1a32(`${hashSeed}:steps`) || 1)
  const scale = TRACK_TUNE_SCALE_FLAVORS[bytes[0] % TRACK_TUNE_SCALE_FLAVORS.length]
  const rootMidi = 48 + (bytes[1] % 12) + 12 * (bytes[1] % 3)
  const bpm = 96 + (bytes[2] % 73)
  const bassTemplate = BASS_TEMPLATES[bytes[3] % BASS_TEMPLATES.length]
  const counterEnabled = (bytes[12] & 1) === 1
  const counterDensity = 0.18 + ((bytes[12] >>> 1) / 127) * 0.28
  const waveOffset = bytes[13]
  const drumMask = bytes[14]
  const tempoSpread = bytes[15] / 255

  const tune: TrackTune = {
    schemaVersion: 1,
    bpm,
    rootMidi,
    scale,
    voices: {
      bass: {
        enabled: true,
        wave: TRACK_TUNE_WAVES[waveOffset % TRACK_TUNE_WAVES.length],
        octave: -1,
        volume: 0.8,
        steps: clonePattern(bassTemplate),
      },
      melody: {
        enabled: true,
        wave: TRACK_TUNE_WAVES[(waveOffset >>> 2) % TRACK_TUNE_WAVES.length],
        octave: 1,
        volume: 0.75,
        steps: patternedSteps(next, 0.38, bytes[8] % 4),
      },
      counter: {
        enabled: counterEnabled,
        wave: TRACK_TUNE_WAVES[(waveOffset >>> 4) % TRACK_TUNE_WAVES.length],
        octave: 0,
        volume: 0.62,
        steps: patternedSteps(next, counterDensity, bytes[10] % 4),
      },
      arp: {
        enabled: bytes[12] > 190,
        wave: 'triangle',
        octave: 2,
        volume: 0.45,
        steps: patternedSteps(next, 0.55, bytes[11] % 5),
      },
    },
    drums: {
      kick: (drumMask & 1) === 0 || drumMask > 48,
      snare: (drumMask & 2) === 0 || drumMask > 80,
      hat: (drumMask & 4) === 0 || drumMask > 112,
      density: 0.35 + (drumMask / 255) * 0.65,
    },
    automation: {
      tempoMinFactor: 0.6 + tempoSpread * 0.2,
      tempoMaxFactor: 0.95 + tempoSpread * 0.15,
      perLapSemitones: 0,
      offTrackScale: null,
      offTrackDuck: 1,
      finishStinger: null,
    },
    seedWord,
  }
  return TrackTuneSchema.parse(tune)
}
