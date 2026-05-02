/**
 * Procedural music via native Web Audio API.
 *
 * Scheduler pattern: each 50 ms tick looks 120 ms ahead and queues any 16th-note
 * steps that fall inside that window onto the AudioContext clock.
 *
 * The AudioContext, master gain, and first-gesture resume handler live in
 * audioEngine.ts so both the music scheduler and the SFX layer share one
 * mixer.
 */

import {
  ensureAudioReady,
  getAudioEngine,
  getOrMakeNoiseBuffer,
  type AudioEngine,
} from './audioEngine'
import {
  NEUTRAL_PERSONALIZATION,
  personalizationEquals,
  type MusicPersonalization,
  type ScaleFlavor,
} from './musicPersonalization'
import {
  DEFAULT_TRACK_MUSIC,
  cloneTrackMusic,
  type TrackMusic,
  type TrackMusicScaleFlavor,
  type MusicVoice,
} from '@/lib/trackMusic'

const LOOKAHEAD_SEC = 0.12
const SCHEDULE_INTERVAL_MS = 50
const STEPS_PER_BAR = 16
const DEFAULT_FADE_IN_SEC = 1.2
const DEFAULT_FADE_OUT_SEC = 0.6
const DEFAULT_CROSSFADE_SEC = 1.0
const PRUNE_GRACE_MS = 20

export const RACE_START_CROSSFADE_SEC = 3.0
export const PAUSE_CROSSFADE_SEC = 0.8

const INTENSITY_EPSILON = 0.01
const GAME_DRUMS_INTENSITY_THRESHOLD = 0.15
const COUNTER_MELODY_INTENSITY_THRESHOLD = 0.5
// At intensity 0 the game loop plays at 70% of configured tempo; at 1.0 it
// plays at full tempo. With a 140-BPM config that ramps 98 → 140 BPM.
const GAME_MIN_TEMPO_FACTOR = 0.7

const SNARE_NOISE_DURATION_SEC = 0.12
const HAT_NOISE_DURATION_SEC = 0.05

type Step = number | null
const R: Step = null

export type TrackName = 'title' | 'game' | 'pause'
type StepRenderer = (track: Track, step: number, time: number) => void

interface Track {
  name: TrackName
  step: number
  nextTime: number
  baseStepDur: number
  stepDur: number
  rootMidi: number
  scale: readonly number[]
  volumeDuck: number
  playStep: StepRenderer
  gain: GainNode
  targetGain: number
  intensity: number
  tune: TrackMusic | null
  pruneHandle: ReturnType<typeof setTimeout> | null
}

interface MusicSystem {
  audio: AudioEngine
  schedulerHandle: ReturnType<typeof setTimeout> | null
  tracks: Map<TrackName, Track>
  // Active per-slug personalization for the game track. Only the game track
  // is personalized today; title and pause use their fixed configs.
  personalization: MusicPersonalization
  activeTune: TrackMusic | null
  lapIndex: number
  offTrack: boolean
}

let system: MusicSystem | null = null

// Map a personalization scale-flavor name to the SCALES table entry. Kept
// here rather than in `musicPersonalization.ts` so the personalization
// module stays a pure value object with no audio dependency.
function scaleForFlavor(
  flavor: ScaleFlavor | TrackMusicScaleFlavor,
): readonly number[] {
  switch (flavor) {
    case 'major':
      return SCALES.major
    case 'minor':
      return SCALES.minor
    case 'dorian':
      return SCALES.dorian
    case 'pentatonic':
      return SCALES.pentatonic
  }
}

export function midiFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/**
 * Convert a scale-degree index into a frequency. Degrees outside the scale
 * wrap chromatically and shift octave accordingly, so callers can write
 * patterns like `[0, 2, 4, 6]` without worrying about scale length.
 */
export function scaleDeg(
  rootMidi: number,
  scale: readonly number[],
  deg: number,
  octaveShift = 0,
): number {
  const len = scale.length
  const normalized = ((deg % len) + len) % len
  const octBonus = Math.floor(deg / len)
  return midiFreq(rootMidi + scale[normalized] + (octaveShift + octBonus) * 12)
}

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
} as const

function getSystem(): MusicSystem | null {
  if (system) return system
  const audio = getAudioEngine()
  if (!audio) return null
  system = {
    audio,
    schedulerHandle: null,
    tracks: new Map(),
    personalization: { ...NEUTRAL_PERSONALIZATION },
    activeTune: null,
    lapIndex: 0,
    offTrack: false,
  }
  return system
}

function ensureScheduler(s: MusicSystem): void {
  if (s.schedulerHandle !== null) return
  runScheduler()
}

function runScheduler(): void {
  const s = system
  if (!s) return
  if (s.tracks.size === 0) {
    s.schedulerHandle = null
    return
  }
  const horizon = s.audio.ctx.currentTime + LOOKAHEAD_SEC
  for (const track of s.tracks.values()) {
    while (track.nextTime < horizon) {
      updateTempo(track)
      track.playStep(track, track.step, track.nextTime)
      track.step = (track.step + 1) % STEPS_PER_BAR
      track.nextTime += track.stepDur
    }
  }
  s.schedulerHandle = setTimeout(runScheduler, SCHEDULE_INTERVAL_MS)
}

function schedNote(
  track: Track,
  freq: number,
  startTime: number,
  dur: number,
  wave: OscillatorType,
  vol: number,
): void {
  const s = system
  if (!s) return
  const osc = s.audio.ctx.createOscillator()
  const gain = s.audio.ctx.createGain()
  osc.type = wave
  osc.frequency.value = freq
  gain.gain.setValueAtTime(vol, startTime)
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    startTime + Math.max(dur * 0.88, 0.015),
  )
  osc.connect(gain)
  gain.connect(track.gain)
  osc.start(startTime)
  osc.stop(startTime + dur + 0.02)
}

function schedKick(track: Track, startTime: number, vol = 0.18): void {
  const s = system
  if (!s) return
  const osc = s.audio.ctx.createOscillator()
  const gain = s.audio.ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(160, startTime)
  osc.frequency.exponentialRampToValueAtTime(40, startTime + 0.1)
  gain.gain.setValueAtTime(vol, startTime)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18)
  osc.connect(gain)
  gain.connect(track.gain)
  osc.start(startTime)
  osc.stop(startTime + 0.25)
}

interface NoiseOpts {
  buffer: AudioBuffer
  durationSec: number
  hpHz: number
  vol: number
}

function schedNoise(track: Track, startTime: number, opts: NoiseOpts): void {
  const s = system
  if (!s) return
  const src = s.audio.ctx.createBufferSource()
  src.buffer = opts.buffer
  const filt = s.audio.ctx.createBiquadFilter()
  filt.type = 'highpass'
  filt.frequency.value = opts.hpHz
  const gain = s.audio.ctx.createGain()
  gain.gain.setValueAtTime(opts.vol, startTime)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + opts.durationSec)
  src.connect(filt)
  filt.connect(gain)
  gain.connect(track.gain)
  src.start(startTime)
  src.stop(startTime + opts.durationSec + 0.02)
}

function schedSnare(track: Track, startTime: number, vol = 0.14): void {
  const s = system
  if (!s) return
  const buffer = getOrMakeNoiseBuffer(s.audio, 'snare', SNARE_NOISE_DURATION_SEC)
  schedNoise(track, startTime, {
    buffer,
    durationSec: SNARE_NOISE_DURATION_SEC,
    hpHz: 1200,
    vol,
  })
}

function schedHat(track: Track, startTime: number, vol = 0.05): void {
  const s = system
  if (!s) return
  const buffer = getOrMakeNoiseBuffer(s.audio, 'hat', HAT_NOISE_DURATION_SEC)
  schedNoise(track, startTime, {
    buffer,
    durationSec: HAT_NOISE_DURATION_SEC,
    hpHz: 6000,
    vol,
  })
}

// Title: cartoony, bouncy, pentatonic.
const TITLE_BASS: Step[] = [
   0,  R,  R,  R,   2,  R,  R,  R,   3,  R,  R,  R,   2,  R,  0,  R,
]
const TITLE_MELODY: Step[] = [
   4,  R,  2,  R,   6,  R,  4,  R,   3,  R,  4,  R,   2,  R,  R,  R,
]
const TITLE_ARP: Step[] = [
   0,  2,  4,  6,   2,  4,  6,  8,   4,  2,  0,  2,   4,  2,  0,  R,
]
const TITLE_KICK_STEPS = new Set([0, 4, 8, 12])
const TITLE_HAT_STEPS = new Set([2, 6, 10, 14])

function playTitleStep(track: Track, step: number, time: number): void {
  const { rootMidi, scale, stepDur } = track
  const qn = stepDur * 4

  const bd = TITLE_BASS[step]
  if (bd !== null) {
    schedNote(track, scaleDeg(rootMidi, scale, bd, -1), time, qn * 0.75, 'triangle', 0.14)
  }

  const md = TITLE_MELODY[step]
  if (md !== null) {
    schedNote(track, scaleDeg(rootMidi, scale, md, 1), time, stepDur * 1.7, 'square', 0.08)
  }

  const ad = TITLE_ARP[step]
  if (ad !== null) {
    schedNote(track, scaleDeg(rootMidi, scale, ad, 2), time, stepDur * 0.6, 'triangle', 0.04)
  }

  if (TITLE_KICK_STEPS.has(step)) schedKick(track, time, 0.12)
  if (TITLE_HAT_STEPS.has(step)) schedHat(track, time, 0.05)
}

// Pause: slow, chill, sustained sine pad chords.
const PAUSE_PAD_STEPS = new Set([0, 8])
const PAUSE_MELODY: Step[] = [
    R,  R,  R,  R,   4,  R,  R,  R,   R,  R,  R,  R,   2,  R,  R,  R,
]

function playPauseStep(track: Track, step: number, time: number): void {
  const { rootMidi, scale, stepDur } = track
  const barDur = stepDur * 16

  if (PAUSE_PAD_STEPS.has(step)) {
    for (const deg of [0, 2, 4]) {
      schedNote(track, scaleDeg(rootMidi, scale, deg, -1), time, barDur * 0.92, 'sine', 0.03)
    }
  }

  const md = PAUSE_MELODY[step]
  if (md !== null) {
    schedNote(track, scaleDeg(rootMidi, scale, md, 0), time, stepDur * 8, 'sine', 0.022)
  }
}

// Game: driving, upbeat, minor. Counter-melody fades in with intensity.
const GAME_KICK_STEPS = new Set([0, 4, 8, 12])
const GAME_SNARE_STEPS = new Set([4, 12])
const GAME_HAT_STEPS = new Set([2, 6, 10, 14])

export type GameStepEvent =
  | {
      kind: 'note'
      voice: MusicVoice
      degree: number
      octave: number
      wave: OscillatorType
      volume: number
      durationBeats: number
    }
  | {
      kind: 'kick' | 'snare' | 'hat'
      volume: number
    }

function voiceVolume(
  voice: MusicVoice,
  intensity: number,
  multiplier: number,
): number {
  switch (voice) {
    case 'bass':
      return (0.09 + intensity * 0.08) * multiplier
    case 'melody':
      return (0.04 + intensity * 0.12) * multiplier
    case 'counter':
      return (0.05 + intensity * 0.09) * multiplier
    case 'arp':
      return (0.03 + intensity * 0.06) * multiplier
  }
}

function voiceDurationBeats(voice: MusicVoice): number {
  switch (voice) {
    case 'bass':
      return 2.6
    case 'melody':
      return 1.7
    case 'counter':
      return 3.6
    case 'arp':
      return 0.6
  }
}

function counterVoiceIsAllowed(voice: MusicVoice, intensity: number): boolean {
  return voice !== 'counter' || intensity > COUNTER_MELODY_INTENSITY_THRESHOLD
}

export function gameStepEventsForTune(
  tune: TrackMusic,
  step: number,
  intensity: number,
): GameStepEvent[] {
  const events: GameStepEvent[] = []
  const normalizedStep = ((step % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR
  for (const voiceName of ['bass', 'melody', 'counter', 'arp'] as const) {
    const voice = tune.voices[voiceName]
    if (!voice.enabled || !counterVoiceIsAllowed(voiceName, intensity)) continue
    const degree = voice.steps[normalizedStep]
    if (degree === null || degree === undefined) continue
    events.push({
      kind: 'note',
      voice: voiceName,
      degree,
      octave: voice.octave,
      wave: voice.wave,
      volume: voiceVolume(voiceName, intensity, voice.volume),
      durationBeats: voiceDurationBeats(voiceName),
    })
  }

  const drumDensity = tune.drums.density
  const drumThreshold =
    drumDensity <= 0
      ? Number.POSITIVE_INFINITY
      : GAME_DRUMS_INTENSITY_THRESHOLD / drumDensity
  if (tune.drums.kick && GAME_KICK_STEPS.has(normalizedStep)) {
    events.push({
      kind: 'kick',
      volume: (0.1 + intensity * 0.1) * drumDensity,
    })
  }
  if (intensity > drumThreshold) {
    if (tune.drums.snare && GAME_SNARE_STEPS.has(normalizedStep)) {
      events.push({
        kind: 'snare',
        volume: (0.04 + intensity * 0.1) * drumDensity,
      })
    }
    if (tune.drums.hat && GAME_HAT_STEPS.has(normalizedStep)) {
      events.push({
        kind: 'hat',
        volume: (0.02 + intensity * 0.09) * drumDensity,
      })
    }
  }
  return events
}

export interface MusicAutomationState {
  lapIndex: number
  offTrack: boolean
}

export interface ResolvedTuneAutomation {
  rootMidi: number
  scaleFlavor: TrackMusicScaleFlavor
  scale: readonly number[]
  volumeDuck: number
}

export function resolveTuneAutomation(
  tune: TrackMusic,
  state: MusicAutomationState,
): ResolvedTuneAutomation {
  const lapIndex = Number.isFinite(state.lapIndex)
    ? Math.max(0, Math.floor(state.lapIndex))
    : 0
  const rootMidi = tune.rootMidi + tune.automation.perLapSemitones * lapIndex
  const scaleFlavor =
    state.offTrack && tune.automation.offTrackScale
      ? tune.automation.offTrackScale
      : tune.scale
  return {
    rootMidi,
    scaleFlavor,
    scale: scaleForFlavor(scaleFlavor),
    volumeDuck: state.offTrack ? tune.automation.offTrackDuck : 1,
  }
}

export interface FinishStingerEvent {
  step: number
  degree: number
  octave: number
  wave: OscillatorType
  volume: number
  durationBeats: number
}

export function finishStingerEventsForTune(tune: TrackMusic): FinishStingerEvent[] {
  const steps = tune.automation.finishStinger
  if (!steps) return []
  return steps.flatMap((degree, step): FinishStingerEvent[] => {
    if (degree === null) return []
    return [
      {
        step,
        degree,
        octave: 1,
        wave: 'triangle',
        volume: 0.11,
        durationBeats: 1.25,
      },
    ]
  })
}

function playGameStep(track: Track, step: number, time: number): void {
  const { rootMidi, scale, stepDur, intensity } = track
  const tune = track.tune ?? DEFAULT_TRACK_MUSIC
  for (const event of gameStepEventsForTune(tune, step, intensity)) {
    const volume = event.volume * track.volumeDuck
    switch (event.kind) {
      case 'note':
        schedNote(
          track,
          scaleDeg(rootMidi, scale, event.degree, event.octave),
          time,
          stepDur * event.durationBeats,
          event.wave,
          volume,
        )
        break
      case 'kick':
        schedKick(track, time, volume)
        break
      case 'snare':
        schedSnare(track, time, volume)
        break
      case 'hat':
        schedHat(track, time, volume)
        break
    }
  }
}

interface TrackConfig {
  bpm: number
  rootMidi: number
  scale: readonly number[]
  playStep: StepRenderer
  targetGain: number
}

const TRACK_CONFIG: Record<TrackName, TrackConfig> = {
  title: {
    bpm: 128,
    rootMidi: 60, // C4
    scale: SCALES.pentatonic,
    playStep: playTitleStep,
    targetGain: 0.18,
  },
  game: {
    bpm: 140,
    rootMidi: 55, // G3
    scale: SCALES.minor,
    playStep: playGameStep,
    targetGain: 0.22,
  },
  pause: {
    bpm: 68,
    rootMidi: 60, // C4
    scale: SCALES.major,
    playStep: playPauseStep,
    targetGain: 0.06,
  },
}

function makeTrack(s: MusicSystem, name: TrackName): Track {
  const cfg = TRACK_CONFIG[name]
  const gain = s.audio.ctx.createGain()
  gain.gain.value = 0
  gain.connect(s.audio.musicBus)
  const personalized =
    name === 'game'
      ? resolveGameTrackParams(s)
      : { rootMidi: cfg.rootMidi, scale: cfg.scale, bpm: cfg.bpm, volumeDuck: 1 }
  const stepDur = 60 / personalized.bpm / 4
  return {
    name,
    step: 0,
    nextTime: s.audio.ctx.currentTime + 0.05,
    baseStepDur: stepDur,
    stepDur,
    rootMidi: personalized.rootMidi,
    scale: personalized.scale,
    volumeDuck: personalized.volumeDuck,
    playStep: cfg.playStep,
    gain,
    targetGain: cfg.targetGain,
    intensity: 0,
    tune: name === 'game' ? s.activeTune ?? DEFAULT_TRACK_MUSIC : null,
    pruneHandle: null,
  }
}

interface ResolvedTrackParams {
  rootMidi: number
  scale: readonly number[]
  bpm: number
  volumeDuck: number
}

function applyPersonalizationToConfig(
  cfg: TrackConfig,
  p: MusicPersonalization,
): ResolvedTrackParams {
  return {
    rootMidi: cfg.rootMidi + p.rootMidiOffset,
    scale: scaleForFlavor(p.scaleFlavor),
    // Keep the resulting BPM positive even if a hand-rolled personalization
    // hands in a wild offset; the floor matches the lowest a 70%-tempo
    // intensity ramp would push the slowest BPM in BPM_OFFSETS to.
    bpm: Math.max(40, cfg.bpm + p.bpmOffset),
    volumeDuck: 1,
  }
}

function paramsFromTune(
  tune: TrackMusic,
  state: MusicAutomationState,
): ResolvedTrackParams {
  const automation = resolveTuneAutomation(tune, state)
  return {
    rootMidi: automation.rootMidi,
    scale: automation.scale,
    bpm: tune.bpm,
    volumeDuck: automation.volumeDuck,
  }
}

function resolveGameTrackParams(s: MusicSystem): ResolvedTrackParams {
  if (s.activeTune) {
    return paramsFromTune(s.activeTune, {
      lapIndex: s.lapIndex,
      offTrack: s.offTrack,
    })
  }
  return applyPersonalizationToConfig(TRACK_CONFIG.game, s.personalization)
}

function applyResolvedParamsToTrack(
  track: Track,
  resolved: ResolvedTrackParams,
): void {
  track.rootMidi = resolved.rootMidi
  track.scale = resolved.scale
  track.volumeDuck = resolved.volumeDuck
  track.baseStepDur = 60 / resolved.bpm / 4
  updateTempo(track)
}

function updateTempo(track: Track): void {
  if (track.name !== 'game') return
  const tune = track.tune ?? DEFAULT_TRACK_MUSIC
  const minFactor = tune.automation.tempoMinFactor
  const maxFactor = tune.automation.tempoMaxFactor
  const factor = minFactor + track.intensity * (maxFactor - minFactor)
  track.stepDur = track.baseStepDur / factor
}

function cancelPrune(track: Track): void {
  if (track.pruneHandle !== null) {
    clearTimeout(track.pruneHandle)
    track.pruneHandle = null
  }
}

function schedulePrune(track: Track, afterSec: number): void {
  cancelPrune(track)
  track.pruneHandle = setTimeout(() => {
    const s = system
    if (!s) return
    // Guard against a newer track replacing this one under the same name.
    if (s.tracks.get(track.name) !== track) return
    track.gain.disconnect()
    s.tracks.delete(track.name)
    track.pruneHandle = null
  }, Math.ceil(afterSec * 1000) + PRUNE_GRACE_MS)
}

function fadeTrackTo(track: Track, value: number, fadeSec: number): void {
  const s = system
  if (!s) return
  const now = s.audio.ctx.currentTime
  const g = track.gain.gain
  if (typeof g.cancelAndHoldAtTime === 'function') {
    g.cancelAndHoldAtTime(now)
  } else {
    g.cancelScheduledValues(now)
    g.setValueAtTime(g.value, now)
  }
  const duration = Math.max(fadeSec, 0.02)
  g.linearRampToValueAtTime(value, now + duration)
  if (value === 0) schedulePrune(track, duration)
  else cancelPrune(track)
}

function upsertTrack(s: MusicSystem, name: TrackName): Track {
  let track = s.tracks.get(name)
  if (!track) {
    track = makeTrack(s, name)
    s.tracks.set(name, track)
  }
  return track
}

/**
 * Crossfade to a named track, fading all other active tracks down over the
 * same duration. Creates the target track if it is not already active.
 */
export function crossfadeTo(
  target: TrackName,
  fadeSec = DEFAULT_CROSSFADE_SEC,
): void {
  const s = getSystem()
  if (!s) return
  ensureAudioReady(s.audio)

  for (const track of s.tracks.values()) {
    if (track.name !== target) fadeTrackTo(track, 0, fadeSec)
  }

  const targetTrack = upsertTrack(s, target)
  fadeTrackTo(targetTrack, targetTrack.targetGain, fadeSec)
  ensureScheduler(s)
}

/**
 * Start the title loop, fading in over `fadeSec`. Thin wrapper around
 * `crossfadeTo('title')` kept for caller readability and the fade-in default.
 */
export function startTitleMusic(fadeSec = DEFAULT_FADE_IN_SEC): void {
  crossfadeTo('title', fadeSec)
}

/**
 * Set the in-game music intensity (0..1). Affects voice volumes and enables
 * the counter-melody at higher values. No-op when the game track is not
 * active or the value is within INTENSITY_EPSILON of the current one, so
 * safe to call every frame.
 */
export function setGameIntensity(intensity: number): void {
  const s = system
  if (!s) return
  const track = s.tracks.get('game')
  if (!track) return
  const clamped = Math.max(0, Math.min(1, intensity))
  if (Math.abs(clamped - track.intensity) < INTENSITY_EPSILON) return
  track.intensity = clamped
}

/**
 * Apply a per-slug music personalization to the game track. Idempotent;
 * a no-op when the new value matches the active one. When the game track is
 * already live, mutates rootMidi / scale / baseStepDur in place so the next
 * scheduled step uses the new flavor without rebuilding the gain node or
 * interrupting the crossfade. Title and pause tracks are unaffected.
 *
 * Pass null (or omit) to fall back to the neutral personalization.
 */
export function setMusicPersonalization(
  next: MusicPersonalization | null,
): void {
  const s = getSystem()
  if (!s) return
  const target = next ?? { ...NEUTRAL_PERSONALIZATION }
  if (personalizationEquals(s.personalization, target)) return
  s.personalization = target
  const live = s.tracks.get('game')
  if (!live) return
  if (s.activeTune) return
  applyResolvedParamsToTrack(live, resolveGameTrackParams(s))
}

/**
 * Apply a concrete authored tune to the game track. Passing null clears the
 * tune and restores the legacy default loop with the active per-slug
 * personalization layered on top. Title and pause tracks are unaffected.
 */
export function setActiveMusic(tune: TrackMusic | null): void {
  const s = getSystem()
  if (!s) return
  s.activeTune = tune ? cloneTrackMusic(tune) : null
  const live = s.tracks.get('game')
  if (!live) return
  live.tune = s.activeTune ?? DEFAULT_TRACK_MUSIC
  applyResolvedParamsToTrack(live, resolveGameTrackParams(s))
}

export function setMusicLapIndex(lapIndex: number): void {
  const s = system
  if (!s) return
  const next = Number.isFinite(lapIndex) ? Math.max(0, Math.floor(lapIndex)) : 0
  if (s.lapIndex === next) return
  s.lapIndex = next
  const live = s.tracks.get('game')
  if (!live) return
  applyResolvedParamsToTrack(live, resolveGameTrackParams(s))
}

export function setMusicOffTrack(offTrack: boolean): void {
  const s = system
  if (!s) return
  if (s.offTrack === offTrack) return
  s.offTrack = offTrack
  const live = s.tracks.get('game')
  if (!live) return
  applyResolvedParamsToTrack(live, resolveGameTrackParams(s))
}

export function playFinishStinger(): void {
  const s = system
  if (!s || !s.activeTune) return
  const track = s.tracks.get('game')
  if (!track) return
  const events = finishStingerEventsForTune(s.activeTune)
  if (events.length === 0) return
  const start = s.audio.ctx.currentTime + 0.005
  const stepDur = track.stepDur || track.baseStepDur
  events.forEach((event) => {
    const time = start + event.step * stepDur
    schedNote(
      track,
      scaleDeg(track.rootMidi, track.scale, event.degree, event.octave),
      time,
      stepDur * event.durationBeats,
      event.wave,
      event.volume * track.volumeDuck,
    )
  })
}

/** Fade out all tracks. Each track auto-prunes after its fade completes. */
export function stopMusic(fadeSec = DEFAULT_FADE_OUT_SEC): void {
  const s = system
  if (!s) return
  const fade = Math.max(fadeSec, 0.05)
  for (const track of s.tracks.values()) {
    fadeTrackTo(track, 0, fade)
  }
}

/**
 * Index of the step the game track is currently scheduling, in `[0, 16)`.
 * Returns null when the engine has not been started yet or the game track is
 * not active. Polled by the music editor transport so the playhead lines up
 * with audible playback rather than a wall-clock estimate that drifts when
 * intensity scales the tempo.
 */
export function getActiveMusicStep(): number | null {
  const s = system
  if (!s) return null
  const track = s.tracks.get('game')
  if (!track) return null
  return track.step
}

const AUDITION_DUR_SEC = 0.35

/**
 * Play a single short note routed through the music bus. Used by the editor's
 * voice audition buttons so users can hear a degree without committing it to
 * a step. Uses the engine's gain bus so the audition follows the music
 * volume slider rather than the SFX one.
 */
export function auditionMusicNote(opts: {
  degree: number
  octave: number
  wave: OscillatorType
  rootMidi?: number
  scale?: TrackMusicScaleFlavor
}): void {
  const e = getAudioEngine()
  if (!e) return
  ensureAudioReady(e)
  const tune = system?.activeTune ?? DEFAULT_TRACK_MUSIC
  const rootMidi = opts.rootMidi ?? tune.rootMidi
  const scale = scaleForFlavor(opts.scale ?? tune.scale)
  const start = e.ctx.currentTime + 0.005
  const osc = e.ctx.createOscillator()
  const gain = e.ctx.createGain()
  osc.type = opts.wave
  osc.frequency.value = scaleDeg(rootMidi, scale, opts.degree, opts.octave)
  gain.gain.setValueAtTime(0.18, start)
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    start + AUDITION_DUR_SEC * 0.9,
  )
  osc.connect(gain)
  gain.connect(e.musicBus)
  osc.start(start)
  osc.stop(start + AUDITION_DUR_SEC + 0.05)
}

const COUNTDOWN_BEEP_MIDI_LOW = 69
const COUNTDOWN_BEEP_MIDI_HIGH = 81
const COUNTDOWN_BEEP_DUR_SEC = 0.18
const COUNTDOWN_GO_DUR_SEC = 0.34
const COUNTDOWN_BEEP_VOL = 0.28
const COUNTDOWN_SCHEDULE_OFFSET_SEC = 0.005

/**
 * One-shot countdown beep. Routes through the SFX bus (not the music
 * tracks) so it follows SFX volume and stays audible over any active
 * music. Higher pitch on GO.
 */
export function playCountdownBeep(isGo: boolean): void {
  const e = getAudioEngine()
  if (!e) return
  ensureAudioReady(e)
  const start = e.ctx.currentTime + COUNTDOWN_SCHEDULE_OFFSET_SEC
  const midi = isGo ? COUNTDOWN_BEEP_MIDI_HIGH : COUNTDOWN_BEEP_MIDI_LOW
  const dur = isGo ? COUNTDOWN_GO_DUR_SEC : COUNTDOWN_BEEP_DUR_SEC
  const osc = e.ctx.createOscillator()
  const gain = e.ctx.createGain()
  osc.type = isGo ? 'triangle' : 'square'
  osc.frequency.value = midiFreq(midi)
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(COUNTDOWN_BEEP_VOL, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
  osc.connect(gain)
  gain.connect(e.sfxBus)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}
