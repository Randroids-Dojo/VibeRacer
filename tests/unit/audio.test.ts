import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  achievementUnlockCuePattern,
  droneFilterHz,
  droneFreqHz,
  droneVolume,
  engineToneTargets,
  highSpeedModAmount,
  playAchievementUnlockCue,
  playLapStinger,
  playOffTrackRumble,
  playPbFanfare,
  playWrongWayCue,
  playUiClick,
  silenceAllSfx,
  skidIntensity,
  startEngineDrone,
  startSkid,
  stopEngineDrone,
  stopSkid,
  uiClickEnvelope,
  updateDriveSfx,
  updateEngine,
  updateSkid,
  wrongWayCuePattern,
  _resetSfxForTesting,
} from '@/game/audio'
import { _resetAudioEngineForTesting, getAudioEngine } from '@/game/audioEngine'

// ---------------------------------------------------------------------------
// Pure helpers (no Web Audio).
// ---------------------------------------------------------------------------

describe('droneFreqHz', () => {
  it('uses the warm profile by default', () => {
    expect(droneFreqHz(0, 26)).toBeCloseTo(48, 6)
  })

  it('keeps the original implementation available as Classic', () => {
    expect(droneFreqHz(0, 26, 'classic')).toBeCloseTo(60, 6)
    expect(droneFreqHz(26, 26, 'classic')).toBeCloseTo(60 + 220, 6)
  })

  it('clamps when speed exceeds maxSpeed', () => {
    expect(droneFreqHz(40, 26, 'classic')).toBeCloseTo(60 + 220, 6)
  })

  it('is monotonically non-decreasing', () => {
    let prev = -Infinity
    for (let s = 0; s <= 30; s += 0.5) {
      const v = droneFreqHz(s, 26)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  it('handles zero or negative max gracefully', () => {
    expect(droneFreqHz(10, 0)).toBeCloseTo(48, 6)
  })
})

describe('droneFilterHz', () => {
  it('uses a softer default cutoff than Classic', () => {
    expect(droneFilterHz(0, 26)).toBeCloseTo(280, 6)
    expect(droneFilterHz(0, 26, 'classic')).toBeCloseTo(600, 6)
  })

  it('returns Classic base + range at max speed', () => {
    expect(droneFilterHz(26, 26, 'classic')).toBeCloseTo(600 + 4000, 6)
  })

  it('is monotonically non-decreasing', () => {
    let prev = -Infinity
    for (let s = 0; s <= 30; s += 0.5) {
      const v = droneFilterHz(s, 26)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
})

describe('droneVolume', () => {
  it('is greater on track than off track at the same speed', () => {
    expect(droneVolume(20, 26, true)).toBeGreaterThan(droneVolume(20, 26, false))
  })

  it('grows with speed', () => {
    expect(droneVolume(20, 26, true)).toBeGreaterThan(droneVolume(2, 26, true))
  })

  it('sets Smooth quieter than Classic at full speed', () => {
    expect(droneVolume(26, 26, true, 'smooth')).toBeLessThan(
      droneVolume(26, 26, true, 'classic'),
    )
  })

  it('keeps Warm quieter than Classic at full speed', () => {
    expect(droneVolume(26, 26, true)).toBeLessThan(
      droneVolume(26, 26, true, 'classic'),
    )
  })

  it('returns 0 when maxSpeed is zero', () => {
    expect(droneVolume(10, 0, true)).toBe(0)
  })
})

describe('engineToneTargets', () => {
  it('does not modulate below high speed', () => {
    expect(highSpeedModAmount(10, 26)).toBe(0)
    expect(engineToneTargets(10, 26, 'warm', 0)).toEqual({
      freqHz: droneFreqHz(10, 26, 'warm'),
      filterHz: droneFilterHz(10, 26, 'warm'),
    })
  })

  it('fluctuates tone at max speed', () => {
    const a = engineToneTargets(26, 26, 'warm', 0.1)
    const b = engineToneTargets(26, 26, 'warm', 0.2)
    expect(a.freqHz).not.toBeCloseTo(b.freqHz, 6)
    expect(a.filterHz).not.toBeCloseTo(b.filterHz, 6)
  })

  it('makes Electric brighter and more animated than Warm', () => {
    expect(droneFreqHz(26, 26, 'electric')).toBeGreaterThan(
      droneFreqHz(26, 26, 'warm') * 2,
    )
    const warmA = engineToneTargets(26, 26, 'warm', 0.1)
    const warmB = engineToneTargets(26, 26, 'warm', 0.2)
    const electricA = engineToneTargets(26, 26, 'electric', 0.1)
    const electricB = engineToneTargets(26, 26, 'electric', 0.2)
    expect(Math.abs(electricA.freqHz - electricB.freqHz)).toBeGreaterThan(
      Math.abs(warmA.freqHz - warmB.freqHz),
    )
  })
})

describe('skidIntensity', () => {
  it('is zero at zero steer on track', () => {
    expect(skidIntensity(20, 26, 0, true)).toBe(0)
  })

  it('is zero at zero speed off track so the rumble does not play while parked', () => {
    expect(skidIntensity(0, 26, 0, false)).toBe(0)
  })

  it('reaches the off-track baseline at full speed off track', () => {
    expect(skidIntensity(26, 26, 0, false)).toBeCloseTo(0.4, 6)
  })

  it('scales the off-track baseline linearly with speed', () => {
    expect(skidIntensity(13, 26, 0, false)).toBeCloseTo(0.2, 6)
  })

  it('clamps to 1', () => {
    expect(skidIntensity(26, 26, 1, false)).toBe(1)
  })

  it('is monotonic in steer x speed', () => {
    const a = skidIntensity(10, 26, 0.2, true)
    const b = skidIntensity(20, 26, 0.6, true)
    expect(b).toBeGreaterThan(a)
  })
})

describe('uiClickEnvelope', () => {
  it('returns positive duration for every variant', () => {
    for (const v of ['soft', 'confirm', 'back'] as const) {
      const env = uiClickEnvelope(v)
      expect(env.durSec).toBeGreaterThan(0)
      expect(env.vol).toBeGreaterThan(0)
      expect(env.freqHz).toBeGreaterThan(0)
    }
  })

  it('uses a different frequency for each variant', () => {
    const a = uiClickEnvelope('soft').freqHz
    const b = uiClickEnvelope('confirm').freqHz
    const c = uiClickEnvelope('back').freqHz
    expect(new Set([a, b, c]).size).toBe(3)
  })
})

describe('cue patterns', () => {
  it('wrong-way cue is short and descending', () => {
    const pattern = wrongWayCuePattern()
    expect(pattern.length).toBe(2)
    expect(pattern[0].midi).toBeGreaterThan(pattern[1].midi)
    expect(Math.max(...pattern.map((n) => n.offsetSec + n.durSec))).toBeLessThan(
      0.5,
    )
  })

  it('achievement cue adds sparkle for multi-unlocks', () => {
    expect(achievementUnlockCuePattern(1).length).toBe(3)
    expect(achievementUnlockCuePattern(3).length).toBe(4)
    expect(achievementUnlockCuePattern(Number.NaN).length).toBe(3)
  })

  it('cue pattern values stay playable', () => {
    const all = [
      ...wrongWayCuePattern(),
      ...achievementUnlockCuePattern(2),
    ]
    for (const note of all) {
      expect(note.midi).toBeGreaterThan(0)
      expect(note.offsetSec).toBeGreaterThanOrEqual(0)
      expect(note.durSec).toBeGreaterThan(0)
      expect(note.vol).toBeGreaterThan(0)
      expect(note.vol).toBeLessThanOrEqual(0.2)
    }
  })
})

// ---------------------------------------------------------------------------
// Web Audio paths via a minimal AudioContext stub.
// ---------------------------------------------------------------------------

interface StubGain {
  value: number
  setValueAtTime: ReturnType<typeof vi.fn>
  setTargetAtTime: ReturnType<typeof vi.fn>
  linearRampToValueAtTime: ReturnType<typeof vi.fn>
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
  cancelScheduledValues: ReturnType<typeof vi.fn>
}

interface StubGainNode {
  gain: StubGain
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

interface StubOscillator {
  type: OscillatorType
  frequency: StubGain
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  startedAt: number | null
  stoppedAt: number | null
}

interface StubBiquad {
  type: string
  frequency: StubGain
  Q: { value: number }
  connect: ReturnType<typeof vi.fn>
}

interface StubBufferSource {
  buffer: AudioBuffer | null
  loop: boolean
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  startedAt: number | null
  stoppedAt: number | null
}

let oscillators: StubOscillator[] = []
let bufferSources: StubBufferSource[] = []
let gains: StubGainNode[] = []
let stubCtx: {
  ctx: {
    currentTime: number
    state: AudioContextState
    resume: ReturnType<typeof vi.fn>
    suspend: ReturnType<typeof vi.fn>
  }
} | null = null
let documentHidden = false
let documentListeners: Record<string, (() => void)[]> = {}

function makeStubGainParam(): StubGain {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  }
}

function makeStubGainNode(): StubGainNode {
  const node: StubGainNode = {
    gain: makeStubGainParam(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
  gains.push(node)
  return node
}

function makeStubOscillator(): StubOscillator {
  const osc: StubOscillator = {
    type: 'sine',
    frequency: makeStubGainParam(),
    connect: vi.fn(),
    start: vi.fn(function (this: StubOscillator, t?: number) {
      this.startedAt = t ?? 0
    }),
    stop: vi.fn(function (this: StubOscillator, t?: number) {
      this.stoppedAt = t ?? 0
    }),
    startedAt: null,
    stoppedAt: null,
  }
  // Bind start/stop's this so the wrapper updates the right object.
  osc.start = vi.fn((t?: number) => {
    osc.startedAt = t ?? 0
  })
  osc.stop = vi.fn((t?: number) => {
    osc.stoppedAt = t ?? 0
  })
  oscillators.push(osc)
  return osc
}

function makeStubBiquad(): StubBiquad {
  return {
    type: 'lowpass',
    frequency: makeStubGainParam(),
    Q: { value: 0 },
    connect: vi.fn(),
  }
}

function makeStubBufferSource(): StubBufferSource {
  const src: StubBufferSource = {
    buffer: null,
    loop: false,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    startedAt: null,
    stoppedAt: null,
  }
  src.start = vi.fn((t?: number) => {
    src.startedAt = t ?? 0
  })
  src.stop = vi.fn((t?: number) => {
    src.stoppedAt = t ?? 0
  })
  bufferSources.push(src)
  return src
}

function installStubAudioContext() {
  oscillators = []
  bufferSources = []
  gains = []
  class StubAudioContext {
    state: AudioContextState = 'running'
    sampleRate = 44100
    currentTime = 0
    destination = {}
    resume: ReturnType<typeof vi.fn>
    suspend: ReturnType<typeof vi.fn>
    constructor() {
      this.resume = vi.fn(() => {
        this.state = 'running'
        return Promise.resolve()
      })
      this.suspend = vi.fn(() => {
        this.state = 'suspended'
        return Promise.resolve()
      })
      stubCtx = { ctx: this }
    }
    createOscillator() {
      return makeStubOscillator()
    }
    createGain() {
      return makeStubGainNode()
    }
    createBiquadFilter() {
      return makeStubBiquad()
    }
    createBufferSource() {
      return makeStubBufferSource()
    }
    createBuffer(_channels: number, length: number, _rate: number) {
      const data = new Float32Array(length)
      return {
        getChannelData: () => data,
      } as unknown as AudioBuffer
    }
  }
  documentHidden = false
  documentListeners = {}
  const g = globalThis as unknown as Record<string, unknown>
  g.window = {
    AudioContext: StubAudioContext,
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  g.document = {
    get hidden() {
      return documentHidden
    },
    addEventListener: (type: string, listener: () => void) => {
      documentListeners[type] = [...(documentListeners[type] ?? []), listener]
    },
    removeEventListener: (type: string, listener: () => void) => {
      documentListeners[type] = (documentListeners[type] ?? []).filter(
        (candidate) => candidate !== listener,
      )
    },
  }
  g.AudioContext = StubAudioContext
}

function uninstallStubAudioContext() {
  const g = globalThis as unknown as Record<string, unknown>
  delete g.AudioContext
  delete g.window
  delete g.document
  stubCtx = null
  documentHidden = false
  documentListeners = {}
}

function dispatchVisibilityChange(hidden: boolean): void {
  documentHidden = hidden
  for (const listener of documentListeners.visibilitychange ?? []) {
    listener()
  }
}

beforeEach(() => {
  installStubAudioContext()
})

afterEach(() => {
  _resetSfxForTesting()
  _resetAudioEngineForTesting()
  uninstallStubAudioContext()
})

describe('audio context page visibility', () => {
  it('suspends the shared context while the page is hidden', () => {
    const engine = getAudioEngine()
    expect(engine).not.toBeNull()
    dispatchVisibilityChange(true)
    expect(stubCtx!.ctx.suspend).toHaveBeenCalledTimes(1)
    expect(stubCtx!.ctx.state).toBe('suspended')
  })

  it('resumes the shared context when the page becomes visible again', () => {
    const engine = getAudioEngine()
    expect(engine).not.toBeNull()
    dispatchVisibilityChange(true)
    dispatchVisibilityChange(false)
    expect(stubCtx!.ctx.resume).toHaveBeenCalledTimes(1)
    expect(stubCtx!.ctx.state).toBe('running')
  })

  it('does not resume audio while the page is still hidden', () => {
    const engine = getAudioEngine()
    expect(engine).not.toBeNull()
    dispatchVisibilityChange(true)
    playUiClick('soft')
    expect(stubCtx!.ctx.resume).not.toHaveBeenCalled()
  })
})

describe('startEngineDrone / updateEngine / stopEngineDrone', () => {
  it('starts at most one oscillator regardless of repeat calls', () => {
    startEngineDrone()
    startEngineDrone()
    startEngineDrone()
    const started = oscillators.filter((o) => o.startedAt !== null)
    expect(started.length).toBe(1)
  })

  it('routes target frequency, cutoff, and volume through setTargetAtTime', () => {
    startEngineDrone()
    updateEngine(20, 26, 1, true, true, 'warm')
    const oscFreq = oscillators[0].frequency
    expect(oscFreq.setTargetAtTime).toHaveBeenCalled()
    expect(oscillators[0].type).toBe('sawtooth')
    // The drone gain node is gains[0] inside the drone voice.
    const droneGain = gains.find((g) => g.gain.setTargetAtTime.mock.calls.length > 0)
    expect(droneGain).toBeDefined()
  })

  it('ramps gain to 0 on stop', () => {
    startEngineDrone()
    updateEngine(20, 26, 0, true, true)
    stopEngineDrone(0.1)
    const droneGain = gains.find((g) => g.gain.linearRampToValueAtTime.mock.calls.length > 0)
    expect(droneGain).toBeDefined()
    const lastCall = droneGain!.gain.linearRampToValueAtTime.mock.calls.at(-1)
    expect(lastCall?.[0]).toBe(0)
  })

  it('ducks to silence when racing is false', () => {
    startEngineDrone()
    updateEngine(20, 26, 0, true, false)
    const droneGain = gains.find((g) => g.gain.setTargetAtTime.mock.calls.length > 0)
    expect(droneGain).toBeDefined()
    const lastCall = droneGain!.gain.setTargetAtTime.mock.calls.at(-1)
    expect(lastCall?.[0]).toBe(0)
  })
})

describe('startSkid / updateSkid / stopSkid', () => {
  it('starts at most one buffer source regardless of repeat calls', () => {
    startSkid()
    startSkid()
    const started = bufferSources.filter((s) => s.startedAt !== null)
    expect(started.length).toBe(1)
  })

  it('updates gain via setTargetAtTime', () => {
    startSkid()
    updateSkid(0.5)
    const skidGain = gains.find((g) => g.gain.setTargetAtTime.mock.calls.length > 0)
    expect(skidGain).toBeDefined()
  })

  it('ramps gain to 0 on stop', () => {
    startSkid()
    stopSkid(0.1)
    const skidGain = gains.find((g) => g.gain.linearRampToValueAtTime.mock.calls.length > 0)
    expect(skidGain).toBeDefined()
  })
})

describe('updateDriveSfx', () => {
  it('does not throw when called repeatedly', () => {
    startEngineDrone()
    startSkid()
    expect(() => {
      for (let i = 0; i < 60; i++) {
        updateDriveSfx({
          speedAbs: i * 0.4,
          maxSpeed: 26,
          throttle: 1,
          steerAbs: i % 2 === 0 ? 1 : 0,
          onTrack: true,
          prevOnTrack: true,
          racing: true,
        })
      }
    }).not.toThrow()
  })

  it('triggers the off-track rumble when onTrack flips false', () => {
    startEngineDrone()
    startSkid()
    const beforeSources = bufferSources.length
    updateDriveSfx({
      speedAbs: 10,
      maxSpeed: 26,
      throttle: 1,
      steerAbs: 0,
      onTrack: false,
      prevOnTrack: true,
      racing: true,
    })
    expect(bufferSources.length).toBeGreaterThan(beforeSources)
  })

  it('does not trigger rumble when staying off track', () => {
    startEngineDrone()
    startSkid()
    const beforeSources = bufferSources.length
    updateDriveSfx({
      speedAbs: 10,
      maxSpeed: 26,
      throttle: 1,
      steerAbs: 0,
      onTrack: false,
      prevOnTrack: false,
      racing: true,
    })
    expect(bufferSources.length).toBe(beforeSources)
  })
})

describe('one-shot SFX', () => {
  it('lap stinger schedules three notes that stop within ~1.1s', () => {
    playLapStinger()
    expect(oscillators.length).toBe(3)
    const maxStop = Math.max(...oscillators.map((o) => o.stoppedAt ?? 0))
    expect(maxStop).toBeLessThan(1.1)
  })

  it('PB fanfare (pb) schedules the expected number of voices', () => {
    playPbFanfare('pb')
    // 5 notes x 2 voices = 10 oscillators.
    expect(oscillators.length).toBe(10)
    const maxStop = Math.max(...oscillators.map((o) => o.stoppedAt ?? 0))
    expect(maxStop).toBeLessThan(1.5)
  })

  it('PB fanfare (record) adds an octave doubling and a kick', () => {
    playPbFanfare('record')
    // 5 notes x 2 voices + 2 octave doublings + 1 kick = 13.
    expect(oscillators.length).toBe(13)
  })

  it('UI click schedules exactly one oscillator per call', () => {
    playUiClick('soft')
    expect(oscillators.length).toBe(1)
    playUiClick('confirm')
    playUiClick('back')
    expect(oscillators.length).toBe(3)
  })

  it('off-track rumble schedules a buffer source under a lowpass', () => {
    playOffTrackRumble()
    expect(bufferSources.length).toBe(1)
    const stop = bufferSources[0].stoppedAt ?? 0
    expect(stop).toBeLessThan(1.0)
  })

  it('wrong-way cue schedules the pure warning pattern', () => {
    playWrongWayCue()
    expect(oscillators.length).toBe(wrongWayCuePattern().length)
  })

  it('achievement unlock cue schedules the pure sparkle pattern', () => {
    playAchievementUnlockCue(2)
    expect(oscillators.length).toBe(achievementUnlockCuePattern(2).length)
  })
})

describe('silenceAllSfx', () => {
  it('ramps both drone and skid gains to 0', () => {
    startEngineDrone()
    startSkid()
    silenceAllSfx(0.05)
    const ramped = gains.filter(
      (g) => g.gain.linearRampToValueAtTime.mock.calls.length > 0,
    )
    // Drone gain + skid gain each ramped to 0.
    expect(ramped.length).toBeGreaterThanOrEqual(2)
    for (const g of ramped) {
      const last = g.gain.linearRampToValueAtTime.mock.calls.at(-1)
      expect(last?.[0]).toBe(0)
    }
  })
})

// Touch the unused stubCtx so eslint knows it's intentional.
void stubCtx
