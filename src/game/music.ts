/**
 * Procedural music via native Web Audio API.
 *
 * Scheduler pattern: each 50 ms tick looks 120 ms ahead and queues any 16th-note
 * steps that fall inside that window onto the AudioContext clock.
 */

const LOOKAHEAD_SEC = 0.12
const SCHEDULE_INTERVAL_MS = 50
const STEPS_PER_BAR = 16
const DEFAULT_FADE_IN_SEC = 1.2
const DEFAULT_FADE_OUT_SEC = 0.6
const DEFAULT_CROSSFADE_SEC = 1.0
const PRUNE_GRACE_MS = 20

export const RACE_START_CROSSFADE_SEC = 3.0
export const PAUSE_CROSSFADE_SEC = 0.8

const MASTER_GAIN = 1.0
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
  playStep: StepRenderer
  gain: GainNode
  targetGain: number
  intensity: number
  pruneHandle: ReturnType<typeof setTimeout> | null
}

interface Engine {
  ctx: AudioContext
  master: GainNode
  schedulerHandle: ReturnType<typeof setTimeout> | null
  tracks: Map<TrackName, Track>
  snareBuffer: AudioBuffer | null
  hatBuffer: AudioBuffer | null
}

let engine: Engine | null = null
let firstGestureHandler: (() => void) | null = null

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

function getEngine(): Engine | null {
  if (engine) return engine
  if (typeof window === 'undefined') return null
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!Ctor) return null
  const ctx = new Ctor()
  const master = ctx.createGain()
  master.gain.value = MASTER_GAIN
  master.connect(ctx.destination)
  engine = {
    ctx,
    master,
    schedulerHandle: null,
    tracks: new Map(),
    snareBuffer: null,
    hatBuffer: null,
  }
  return engine
}

function makeNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const size = Math.floor(ctx.sampleRate * durationSec)
  const buf = ctx.createBuffer(1, size, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1
  return buf
}

function ensureScheduler(e: Engine): void {
  if (e.schedulerHandle !== null) return
  runScheduler()
}

/**
 * Resume the AudioContext if it is suspended. If the browser rejects the
 * resume (autoplay policy), attach a one-time document-level gesture handler
 * that retries on the next pointerdown or keydown. Idempotent.
 */
function ensureAudioReady(e: Engine): void {
  if (e.ctx.state !== 'suspended') return
  void e.ctx.resume()
  if (firstGestureHandler) return
  const handler = () => {
    const cur = engine
    if (cur) void cur.ctx.resume()
    if (firstGestureHandler) {
      window.removeEventListener('pointerdown', firstGestureHandler)
      window.removeEventListener('keydown', firstGestureHandler)
      firstGestureHandler = null
    }
  }
  firstGestureHandler = handler
  window.addEventListener('pointerdown', handler)
  window.addEventListener('keydown', handler)
}

function runScheduler(): void {
  const e = engine
  if (!e) return
  if (e.tracks.size === 0) {
    e.schedulerHandle = null
    return
  }
  const horizon = e.ctx.currentTime + LOOKAHEAD_SEC
  for (const track of e.tracks.values()) {
    while (track.nextTime < horizon) {
      updateTempo(track)
      track.playStep(track, track.step, track.nextTime)
      track.step = (track.step + 1) % STEPS_PER_BAR
      track.nextTime += track.stepDur
    }
  }
  e.schedulerHandle = setTimeout(runScheduler, SCHEDULE_INTERVAL_MS)
}

function schedNote(
  track: Track,
  freq: number,
  startTime: number,
  dur: number,
  wave: OscillatorType,
  vol: number,
): void {
  const e = engine
  if (!e) return
  const osc = e.ctx.createOscillator()
  const gain = e.ctx.createGain()
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
  const e = engine
  if (!e) return
  const osc = e.ctx.createOscillator()
  const gain = e.ctx.createGain()
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
  const e = engine
  if (!e) return
  const src = e.ctx.createBufferSource()
  src.buffer = opts.buffer
  const filt = e.ctx.createBiquadFilter()
  filt.type = 'highpass'
  filt.frequency.value = opts.hpHz
  const gain = e.ctx.createGain()
  gain.gain.setValueAtTime(opts.vol, startTime)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + opts.durationSec)
  src.connect(filt)
  filt.connect(gain)
  gain.connect(track.gain)
  src.start(startTime)
  src.stop(startTime + opts.durationSec + 0.02)
}

function schedSnare(track: Track, startTime: number, vol = 0.14): void {
  const e = engine
  if (!e) return
  if (!e.snareBuffer) e.snareBuffer = makeNoiseBuffer(e.ctx, SNARE_NOISE_DURATION_SEC)
  schedNoise(track, startTime, {
    buffer: e.snareBuffer,
    durationSec: SNARE_NOISE_DURATION_SEC,
    hpHz: 1200,
    vol,
  })
}

function schedHat(track: Track, startTime: number, vol = 0.05): void {
  const e = engine
  if (!e) return
  if (!e.hatBuffer) e.hatBuffer = makeNoiseBuffer(e.ctx, HAT_NOISE_DURATION_SEC)
  schedNoise(track, startTime, {
    buffer: e.hatBuffer,
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
const GAME_BASS: Step[] = [
   0,  R,  0,  R,   4,  R,  0,  R,   3,  R,  3,  R,   4,  R,  4,  R,
]
const GAME_MELODY: Step[] = [
   R,  R,  4,  R,   3,  R,  2,  R,   4,  R,  6,  R,   4,  3,  R,  R,
]
const GAME_COUNTER: Step[] = [
   0,  R,  R,  R,   2,  R,  R,  R,   3,  R,  R,  R,   2,  R,  R,  R,
]
const GAME_KICK_STEPS = new Set([0, 4, 8, 12])
const GAME_SNARE_STEPS = new Set([4, 12])
const GAME_HAT_STEPS = new Set([2, 6, 10, 14])

function playGameStep(track: Track, step: number, time: number): void {
  const { rootMidi, scale, stepDur, intensity } = track
  const qn = stepDur * 4

  const bd = GAME_BASS[step]
  if (bd !== null) {
    const bassVol = 0.09 + intensity * 0.08
    schedNote(track, scaleDeg(rootMidi, scale, bd, -1), time, qn * 0.65, 'sawtooth', bassVol)
  }

  const md = GAME_MELODY[step]
  if (md !== null) {
    const melodyVol = 0.04 + intensity * 0.12
    schedNote(track, scaleDeg(rootMidi, scale, md, 1), time, stepDur * 1.7, 'square', melodyVol)
  }

  if (GAME_KICK_STEPS.has(step)) schedKick(track, time, 0.1 + intensity * 0.1)

  if (intensity > GAME_DRUMS_INTENSITY_THRESHOLD) {
    if (GAME_SNARE_STEPS.has(step)) schedSnare(track, time, 0.04 + intensity * 0.1)
    if (GAME_HAT_STEPS.has(step)) schedHat(track, time, 0.02 + intensity * 0.09)
  }

  if (intensity > COUNTER_MELODY_INTENSITY_THRESHOLD) {
    const cd = GAME_COUNTER[step]
    if (cd !== null) {
      const counterVol = 0.05 + intensity * 0.09
      schedNote(track, scaleDeg(rootMidi, scale, cd, 0), time, qn * 0.9, 'triangle', counterVol)
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

function makeTrack(e: Engine, name: TrackName): Track {
  const cfg = TRACK_CONFIG[name]
  const gain = e.ctx.createGain()
  gain.gain.value = 0
  gain.connect(e.master)
  const stepDur = 60 / cfg.bpm / 4
  return {
    name,
    step: 0,
    nextTime: e.ctx.currentTime + 0.05,
    baseStepDur: stepDur,
    stepDur,
    rootMidi: cfg.rootMidi,
    scale: cfg.scale,
    playStep: cfg.playStep,
    gain,
    targetGain: cfg.targetGain,
    intensity: 0,
    pruneHandle: null,
  }
}

function updateTempo(track: Track): void {
  if (track.name !== 'game') return
  const factor = GAME_MIN_TEMPO_FACTOR + track.intensity * (1 - GAME_MIN_TEMPO_FACTOR)
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
    const e = engine
    if (!e) return
    // Guard against a newer track replacing this one under the same name.
    if (e.tracks.get(track.name) !== track) return
    track.gain.disconnect()
    e.tracks.delete(track.name)
    track.pruneHandle = null
  }, Math.ceil(afterSec * 1000) + PRUNE_GRACE_MS)
}

function fadeTrackTo(track: Track, value: number, fadeSec: number): void {
  const e = engine
  if (!e) return
  const now = e.ctx.currentTime
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

function upsertTrack(e: Engine, name: TrackName): Track {
  let track = e.tracks.get(name)
  if (!track) {
    track = makeTrack(e, name)
    e.tracks.set(name, track)
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
  const e = getEngine()
  if (!e) return
  ensureAudioReady(e)

  for (const track of e.tracks.values()) {
    if (track.name !== target) fadeTrackTo(track, 0, fadeSec)
  }

  const targetTrack = upsertTrack(e, target)
  fadeTrackTo(targetTrack, targetTrack.targetGain, fadeSec)
  ensureScheduler(e)
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
  const e = engine
  if (!e) return
  const track = e.tracks.get('game')
  if (!track) return
  const clamped = Math.max(0, Math.min(1, intensity))
  if (Math.abs(clamped - track.intensity) < INTENSITY_EPSILON) return
  track.intensity = clamped
}

/** Fade out all tracks. Each track auto-prunes after its fade completes. */
export function stopMusic(fadeSec = DEFAULT_FADE_OUT_SEC): void {
  const e = engine
  if (!e) return
  const fade = Math.max(fadeSec, 0.05)
  for (const track of e.tracks.values()) {
    fadeTrackTo(track, 0, fade)
  }
}

const COUNTDOWN_BEEP_MIDI_LOW = 69  // A4, counting steps
const COUNTDOWN_BEEP_MIDI_HIGH = 81 // A5, GO
const COUNTDOWN_BEEP_DUR_SEC = 0.18
const COUNTDOWN_GO_DUR_SEC = 0.34
const COUNTDOWN_BEEP_VOL = 0.28

/**
 * One-shot countdown beep. Plays a short tone through the shared AudioContext,
 * bypassing the music tracks so it is audible over any active music. Pitched
 * higher on GO to signal the start.
 */
export function playCountdownBeep(isGo: boolean): void {
  const e = getEngine()
  if (!e) return
  ensureAudioReady(e)
  const start = Math.max(e.ctx.currentTime, e.ctx.currentTime + 0.005)
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
  gain.connect(e.master)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}
