/**
 * Shared Web Audio engine: a single AudioContext, master GainNode, plus
 * dedicated music and SFX buses, and a one-time first-gesture handler that
 * resumes a suspended context. Both the music scheduler and the SFX layer
 * route into the same master so volume, autoplay-gesture resume, and
 * per-channel volume control stay coherent.
 *
 * Routing:
 *   music tracks  -> musicBus -> master -> destination
 *   SFX voices    -> sfxBus   -> master -> destination
 *
 * The buses pick up their initial gain from persisted user audio settings
 * (see lib/audioSettings.ts). Live updates arrive via applyAudioSettings.
 */

import {
  effectiveMusicGain,
  effectiveSfxGain,
  readStoredAudioSettings,
  type AudioSettings,
} from '@/lib/audioSettings'

const MASTER_GAIN = 1.0
const BUS_SMOOTH_TC_SEC = 0.05

export interface AudioEngine {
  ctx: AudioContext
  master: GainNode
  musicBus: GainNode
  sfxBus: GainNode
  noiseBuffers: Map<string, AudioBuffer>
}

let engine: AudioEngine | null = null
let firstGestureHandler: (() => void) | null = null
let visibilityHandler: (() => void) | null = null
let hiddenSuspendActive = false

function pageIsHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden
}

export function getAudioEngine(): AudioEngine | null {
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
  const initial = readStoredAudioSettings()
  const musicBus = ctx.createGain()
  musicBus.gain.value = effectiveMusicGain(initial)
  musicBus.connect(master)
  const sfxBus = ctx.createGain()
  sfxBus.gain.value = effectiveSfxGain(initial)
  sfxBus.connect(master)
  engine = { ctx, master, musicBus, sfxBus, noiseBuffers: new Map() }
  installVisibilityPause(engine)
  return engine
}

function installVisibilityPause(e: AudioEngine): void {
  if (typeof document === 'undefined') return
  if (visibilityHandler) return
  const handler = () => {
    if (document.hidden) {
      hiddenSuspendActive = true
      if (e.ctx.state === 'running') void e.ctx.suspend()
      return
    }
    if (!hiddenSuspendActive) return
    hiddenSuspendActive = false
    ensureAudioReady(e)
  }
  visibilityHandler = handler
  document.addEventListener('visibilitychange', handler)
  handler()
}

/**
 * Resume the AudioContext if it is suspended. If the browser blocks the
 * resume (autoplay policy), attach a one-shot document-level pointerdown +
 * keydown handler that retries on the next user gesture. Idempotent.
 */
export function ensureAudioReady(e: AudioEngine): void {
  if (pageIsHidden()) return
  if (e.ctx.state !== 'suspended') return
  void e.ctx.resume()
  if (firstGestureHandler) return
  const handler = () => {
    const cur = engine
    if (cur && !pageIsHidden()) void cur.ctx.resume()
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

/**
 * Get or create a cached white-noise AudioBuffer keyed by a string label.
 * Used by both the music drum voices and the skid SFX so we never allocate
 * the same buffer twice.
 */
export function getOrMakeNoiseBuffer(
  e: AudioEngine,
  key: string,
  durationSec: number,
): AudioBuffer {
  const cached = e.noiseBuffers.get(key)
  if (cached) return cached
  const size = Math.floor(e.ctx.sampleRate * durationSec)
  const buf = e.ctx.createBuffer(1, size, e.ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1
  e.noiseBuffers.set(key, buf)
  return buf
}

function setBusGain(node: GainNode, value: number, ctx: AudioContext): void {
  const now = ctx.currentTime
  node.gain.cancelScheduledValues(now)
  node.gain.setTargetAtTime(value, now, BUS_SMOOTH_TC_SEC)
}

/** Push the user's current audio settings into the live bus gains. */
export function applyAudioSettings(s: AudioSettings): void {
  const e = engine
  if (!e) return
  setBusGain(e.musicBus, effectiveMusicGain(s), e.ctx)
  setBusGain(e.sfxBus, effectiveSfxGain(s), e.ctx)
}

/** Test-only: drop the singleton so each test starts from a clean slate. */
export function _resetAudioEngineForTesting(): void {
  if (firstGestureHandler) {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', firstGestureHandler)
      window.removeEventListener('keydown', firstGestureHandler)
    }
    firstGestureHandler = null
  }
  if (visibilityHandler) {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityHandler)
    }
    visibilityHandler = null
  }
  hiddenSuspendActive = false
  engine = null
}
