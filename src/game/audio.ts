/**
 * Sound effects layer. All SFX share the AudioContext and master GainNode
 * with the music scheduler via audioEngine.ts. Pure helpers (no Web Audio
 * dependency) live alongside the scheduling functions for unit testing.
 *
 * Continuous voices:
 *  - Engine drone: one persistent oscillator + lowpass + gain. updateEngine
 *    is safe to call every rAF frame; it smooths target values via
 *    setTargetAtTime so per-frame writes never click.
 *  - Tire skid: one looping noise buffer + lowpass + gain.
 *
 * One-shots: lap stinger, PB fanfare (pb / record), UI click variants, and
 * the off-track rumble. Each schedules a few oscillator/noise nodes against
 * master and self-terminates within ~1.1 s.
 */

import {
  ensureAudioReady,
  getAudioEngine,
  getOrMakeNoiseBuffer,
  type AudioEngine,
} from './audioEngine'
import { midiFreq } from './music'

const DRONE_BASE_HZ = 60
const DRONE_RANGE_HZ = 220
const DRONE_FILTER_BASE_HZ = 600
const DRONE_FILTER_RANGE_HZ = 4000
const DRONE_BASE_VOL = 0.18
const DRONE_VOL_FLOOR_FRAC = 0.4
const DRONE_VOL_SLOPE_FRAC = 0.6
const DRONE_SMOOTH_TC = 0.06
const DRONE_OFFTRACK_DUCK = 0.55

const SKID_NOISE_DUR_SEC = 0.4
const SKID_FILTER_BASE_HZ = 700
const SKID_FILTER_RANGE_HZ = 2400
const SKID_MAX_VOL = 0.16
const SKID_SMOOTH_TC = 0.05
const SKID_HEURISTIC_GAIN = 1.4
const SKID_OFFTRACK_BASELINE = 0.4

const STINGER_NOTE_DUR = 0.16
const STINGER_GAP = 0.09
const FANFARE_NOTE_DUR_PB = 0.18
const FANFARE_NOTE_DUR_RECORD = 0.22
const RUMBLE_DUR_SEC = 0.5

interface DroneVoice {
  osc: OscillatorNode
  filter: BiquadFilterNode
  gain: GainNode
  started: boolean
}

interface SkidVoice {
  src: AudioBufferSourceNode
  filter: BiquadFilterNode
  gain: GainNode
  started: boolean
}

let droneVoice: DroneVoice | null = null
let skidVoice: SkidVoice | null = null

// ---------------------------------------------------------------------------
// Pure helpers (no Web Audio access). Unit tests target these directly.
// ---------------------------------------------------------------------------

function clamp01(x: number): number {
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

export function droneFreqHz(speedAbs: number, maxSpeed: number): number {
  if (maxSpeed <= 0) return DRONE_BASE_HZ
  const ratio = clamp01(speedAbs / maxSpeed)
  return DRONE_BASE_HZ + DRONE_RANGE_HZ * ratio
}

export function droneFilterHz(speedAbs: number, maxSpeed: number): number {
  if (maxSpeed <= 0) return DRONE_FILTER_BASE_HZ
  const ratio = clamp01(speedAbs / maxSpeed)
  return DRONE_FILTER_BASE_HZ + DRONE_FILTER_RANGE_HZ * ratio
}

export function droneVolume(
  speedAbs: number,
  maxSpeed: number,
  onTrack: boolean,
): number {
  if (maxSpeed <= 0) return 0
  const ratio = clamp01(speedAbs / maxSpeed)
  const base = DRONE_BASE_VOL * (DRONE_VOL_FLOOR_FRAC + DRONE_VOL_SLOPE_FRAC * ratio)
  return onTrack ? base : base * DRONE_OFFTRACK_DUCK
}

export function skidIntensity(
  speedAbs: number,
  maxSpeed: number,
  steerAbs: number,
  onTrack: boolean,
): number {
  if (maxSpeed <= 0) return 0
  const speedRatio = clamp01(speedAbs / maxSpeed)
  const steer = clamp01(steerAbs)
  const base = steer * speedRatio * SKID_HEURISTIC_GAIN
  const offtrack = onTrack ? 0 : SKID_OFFTRACK_BASELINE
  return clamp01(base + offtrack)
}

export interface UiClickEnvelope {
  freqHz: number
  durSec: number
  vol: number
  wave: OscillatorType
}

export function uiClickEnvelope(
  variant: 'soft' | 'confirm' | 'back',
): UiClickEnvelope {
  switch (variant) {
    case 'confirm':
      return { freqHz: midiFreq(76), durSec: 0.09, vol: 0.16, wave: 'triangle' }
    case 'back':
      return { freqHz: midiFreq(64), durSec: 0.08, vol: 0.13, wave: 'triangle' }
    case 'soft':
    default:
      return { freqHz: midiFreq(72), durSec: 0.05, vol: 0.1, wave: 'square' }
  }
}

// ---------------------------------------------------------------------------
// Continuous voices.
// ---------------------------------------------------------------------------

function buildDrone(e: AudioEngine): DroneVoice {
  const osc = e.ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.value = DRONE_BASE_HZ
  const filter = e.ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = DRONE_FILTER_BASE_HZ
  filter.Q.value = 6
  const gain = e.ctx.createGain()
  gain.gain.value = 0
  osc.connect(filter)
  filter.connect(gain)
  gain.connect(e.master)
  return { osc, filter, gain, started: false }
}

export function startEngineDrone(): void {
  const e = getAudioEngine()
  if (!e) return
  ensureAudioReady(e)
  if (!droneVoice) droneVoice = buildDrone(e)
  if (!droneVoice.started) {
    droneVoice.osc.start()
    droneVoice.started = true
  }
}

export function updateEngine(
  speedAbs: number,
  maxSpeed: number,
  throttle: number,
  onTrack: boolean,
  racing: boolean,
): void {
  const v = droneVoice
  const e = getAudioEngine()
  if (!v || !e) return
  const now = e.ctx.currentTime
  const targetFreq = droneFreqHz(speedAbs, maxSpeed)
  const targetCutoff = droneFilterHz(speedAbs, maxSpeed)
  const baseVol = droneVolume(speedAbs, maxSpeed, onTrack)
  // Subtle throttle bump on top of speed-driven volume so taps register.
  const throttleBoost = Math.max(0, throttle) * 0.04
  const targetVol = racing ? baseVol + throttleBoost : 0
  v.osc.frequency.setTargetAtTime(targetFreq, now, DRONE_SMOOTH_TC)
  v.filter.frequency.setTargetAtTime(targetCutoff, now, DRONE_SMOOTH_TC)
  v.gain.gain.setTargetAtTime(targetVol, now, DRONE_SMOOTH_TC)
}

export function stopEngineDrone(fadeSec = 0.1): void {
  const v = droneVoice
  const e = getAudioEngine()
  if (!v || !e) return
  const now = e.ctx.currentTime
  v.gain.gain.cancelScheduledValues(now)
  v.gain.gain.setValueAtTime(v.gain.gain.value, now)
  v.gain.gain.linearRampToValueAtTime(0, now + Math.max(fadeSec, 0.02))
}

function buildSkid(e: AudioEngine): SkidVoice {
  const buffer = getOrMakeNoiseBuffer(e, 'skid', SKID_NOISE_DUR_SEC)
  const src = e.ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const filter = e.ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = SKID_FILTER_BASE_HZ
  filter.Q.value = 0.7
  const gain = e.ctx.createGain()
  gain.gain.value = 0
  src.connect(filter)
  filter.connect(gain)
  gain.connect(e.master)
  return { src, filter, gain, started: false }
}

export function startSkid(): void {
  const e = getAudioEngine()
  if (!e) return
  ensureAudioReady(e)
  if (!skidVoice) skidVoice = buildSkid(e)
  if (!skidVoice.started) {
    skidVoice.src.start()
    skidVoice.started = true
  }
}

export function updateSkid(intensity01: number): void {
  const v = skidVoice
  const e = getAudioEngine()
  if (!v || !e) return
  const now = e.ctx.currentTime
  const i = clamp01(intensity01)
  const targetVol = SKID_MAX_VOL * i
  const targetCutoff = SKID_FILTER_BASE_HZ + SKID_FILTER_RANGE_HZ * i
  v.gain.gain.setTargetAtTime(targetVol, now, SKID_SMOOTH_TC)
  v.filter.frequency.setTargetAtTime(targetCutoff, now, SKID_SMOOTH_TC)
}

export function stopSkid(fadeSec = 0.1): void {
  const v = skidVoice
  const e = getAudioEngine()
  if (!v || !e) return
  const now = e.ctx.currentTime
  v.gain.gain.cancelScheduledValues(now)
  v.gain.gain.setValueAtTime(v.gain.gain.value, now)
  v.gain.gain.linearRampToValueAtTime(0, now + Math.max(fadeSec, 0.02))
}

// ---------------------------------------------------------------------------
// Per-frame SFX driver. RaceCanvas calls this once per rAF.
// ---------------------------------------------------------------------------

export interface DriveSfxInput {
  speedAbs: number
  maxSpeed: number
  throttle: number
  steerAbs: number
  onTrack: boolean
  prevOnTrack: boolean
  racing: boolean
}

export function updateDriveSfx(input: DriveSfxInput): void {
  updateEngine(input.speedAbs, input.maxSpeed, input.throttle, input.onTrack, input.racing)
  const skid = input.racing
    ? skidIntensity(input.speedAbs, input.maxSpeed, input.steerAbs, input.onTrack)
    : 0
  updateSkid(skid)
  if (input.racing && input.prevOnTrack && !input.onTrack) {
    playOffTrackRumble()
  }
}

// ---------------------------------------------------------------------------
// One-shot SFX. Each schedules nodes against master and self-terminates.
// ---------------------------------------------------------------------------

interface OneShotNoteOpts {
  freqHz: number
  startTime: number
  durSec: number
  wave: OscillatorType
  vol: number
  attackSec?: number
}

function schedMasterNote(e: AudioEngine, opts: OneShotNoteOpts): void {
  const osc = e.ctx.createOscillator()
  const gain = e.ctx.createGain()
  osc.type = opts.wave
  osc.frequency.value = opts.freqHz
  const attack = opts.attackSec ?? 0.01
  gain.gain.setValueAtTime(0, opts.startTime)
  gain.gain.linearRampToValueAtTime(opts.vol, opts.startTime + attack)
  gain.gain.exponentialRampToValueAtTime(0.001, opts.startTime + opts.durSec)
  osc.connect(gain)
  gain.connect(e.master)
  osc.start(opts.startTime)
  osc.stop(opts.startTime + opts.durSec + 0.02)
}

export function playLapStinger(): void {
  const e = getAudioEngine()
  if (!e) return
  ensureAudioReady(e)
  const start = e.ctx.currentTime + 0.005
  // Three-note triangle arpeggio (E5, G5, C6).
  const notes = [76, 79, 84]
  for (let i = 0; i < notes.length; i++) {
    schedMasterNote(e, {
      freqHz: midiFreq(notes[i]),
      startTime: start + i * STINGER_GAP,
      durSec: STINGER_NOTE_DUR,
      wave: 'triangle',
      vol: 0.18,
    })
  }
}

export function playPbFanfare(variant: 'pb' | 'record'): void {
  const e = getAudioEngine()
  if (!e) return
  ensureAudioReady(e)
  const start = e.ctx.currentTime + 0.005
  const noteDur = variant === 'record' ? FANFARE_NOTE_DUR_RECORD : FANFARE_NOTE_DUR_PB
  const gap = noteDur * 0.95
  // Bright 5-note major arpeggio: G5 - B5 - D6 - G6 - B6.
  const melody = [79, 83, 86, 91, 95]
  for (let i = 0; i < melody.length; i++) {
    schedMasterNote(e, {
      freqHz: midiFreq(melody[i]),
      startTime: start + i * gap,
      durSec: noteDur,
      wave: 'square',
      vol: variant === 'record' ? 0.18 : 0.15,
    })
    schedMasterNote(e, {
      freqHz: midiFreq(melody[i] - 12),
      startTime: start + i * gap,
      durSec: noteDur,
      wave: 'triangle',
      vol: variant === 'record' ? 0.12 : 0.09,
    })
  }
  if (variant === 'record') {
    // Octave-up doubling on the final two notes for extra sparkle.
    schedMasterNote(e, {
      freqHz: midiFreq(melody[3] + 12),
      startTime: start + 3 * gap,
      durSec: noteDur * 1.2,
      wave: 'triangle',
      vol: 0.1,
    })
    schedMasterNote(e, {
      freqHz: midiFreq(melody[4] + 12),
      startTime: start + 4 * gap,
      durSec: noteDur * 1.4,
      wave: 'triangle',
      vol: 0.12,
    })
    // Kick on beat one.
    const kick = e.ctx.createOscillator()
    const kgain = e.ctx.createGain()
    kick.type = 'sine'
    kick.frequency.setValueAtTime(160, start)
    kick.frequency.exponentialRampToValueAtTime(40, start + 0.1)
    kgain.gain.setValueAtTime(0.22, start)
    kgain.gain.exponentialRampToValueAtTime(0.001, start + 0.18)
    kick.connect(kgain)
    kgain.connect(e.master)
    kick.start(start)
    kick.stop(start + 0.25)
  }
}

export function playUiClick(variant: 'soft' | 'confirm' | 'back' = 'soft'): void {
  const e = getAudioEngine()
  if (!e) return
  ensureAudioReady(e)
  const env = uiClickEnvelope(variant)
  schedMasterNote(e, {
    freqHz: env.freqHz,
    startTime: e.ctx.currentTime + 0.005,
    durSec: env.durSec,
    wave: env.wave,
    vol: env.vol,
    attackSec: 0.005,
  })
}

export function playOffTrackRumble(): void {
  const e = getAudioEngine()
  if (!e) return
  ensureAudioReady(e)
  const start = e.ctx.currentTime + 0.005
  const buffer = getOrMakeNoiseBuffer(e, 'rumble', RUMBLE_DUR_SEC)
  const src = e.ctx.createBufferSource()
  src.buffer = buffer
  const filter = e.ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 380
  filter.Q.value = 1.2
  const gain = e.ctx.createGain()
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(0.18, start + 0.04)
  gain.gain.exponentialRampToValueAtTime(0.001, start + RUMBLE_DUR_SEC)
  src.connect(filter)
  filter.connect(gain)
  gain.connect(e.master)
  src.start(start)
  src.stop(start + RUMBLE_DUR_SEC + 0.02)
}

/** Duck both continuous voices. One-shots ride out their own short tails. */
export function silenceAllSfx(fadeSec = 0.05): void {
  stopEngineDrone(fadeSec)
  stopSkid(fadeSec)
}

/** Test-only: tear down voices so each test starts fresh. */
export function _resetSfxForTesting(): void {
  if (droneVoice) {
    try {
      droneVoice.osc.stop()
    } catch {
      // ignore: osc may not have started
    }
    droneVoice.gain.disconnect()
    droneVoice = null
  }
  if (skidVoice) {
    try {
      skidVoice.src.stop()
    } catch {
      // ignore
    }
    skidVoice.gain.disconnect()
    skidVoice = null
  }
}
