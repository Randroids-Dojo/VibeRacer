import { describe, it, expect } from 'vitest'
import {
  CAMERA_PRESET_DESCRIPTIONS,
  CAMERA_PRESET_LABELS,
  CAMERA_PRESET_NAMES,
  DEFAULT_CAMERA_PRESET,
  getCameraPreset,
  isCameraPresetName,
  matchCameraPreset,
} from '@/lib/cameraPresets'
import {
  CAMERA_DISTANCE_MAX,
  CAMERA_DISTANCE_MIN,
  CAMERA_FOLLOW_SPEED_MAX,
  CAMERA_FOLLOW_SPEED_MIN,
  CAMERA_FOV_MAX,
  CAMERA_FOV_MIN,
  CAMERA_HEIGHT_MAX,
  CAMERA_HEIGHT_MIN,
  CAMERA_LOOK_AHEAD_MAX,
  CAMERA_LOOK_AHEAD_MIN,
  DEFAULT_CAMERA_SETTINGS,
} from '@/lib/controlSettings'

describe('camera preset table', () => {
  it('exposes a unique non-empty list of names', () => {
    const set = new Set<string>(CAMERA_PRESET_NAMES)
    expect(set.size).toBe(CAMERA_PRESET_NAMES.length)
    expect(CAMERA_PRESET_NAMES.length).toBeGreaterThan(0)
  })

  it('has a label and description for every name', () => {
    for (const name of CAMERA_PRESET_NAMES) {
      expect(typeof CAMERA_PRESET_LABELS[name]).toBe('string')
      expect(CAMERA_PRESET_LABELS[name].length).toBeGreaterThan(0)
      expect(typeof CAMERA_PRESET_DESCRIPTIONS[name]).toBe('string')
      expect(CAMERA_PRESET_DESCRIPTIONS[name].length).toBeGreaterThan(0)
    }
  })

  it('lists the default preset among the names', () => {
    expect(CAMERA_PRESET_NAMES).toContain(DEFAULT_CAMERA_PRESET)
  })
})

describe('getCameraPreset', () => {
  it('chase preset matches the legacy default camera settings', () => {
    expect(getCameraPreset('chaseFar')).toEqual(DEFAULT_CAMERA_SETTINGS)
  })

  it('every preset value sits inside the slider bounds', () => {
    for (const name of CAMERA_PRESET_NAMES) {
      const p = getCameraPreset(name)
      expect(p.height).toBeGreaterThanOrEqual(CAMERA_HEIGHT_MIN)
      expect(p.height).toBeLessThanOrEqual(CAMERA_HEIGHT_MAX)
      expect(p.distance).toBeGreaterThanOrEqual(CAMERA_DISTANCE_MIN)
      expect(p.distance).toBeLessThanOrEqual(CAMERA_DISTANCE_MAX)
      expect(p.lookAhead).toBeGreaterThanOrEqual(CAMERA_LOOK_AHEAD_MIN)
      expect(p.lookAhead).toBeLessThanOrEqual(CAMERA_LOOK_AHEAD_MAX)
      expect(p.followSpeed).toBeGreaterThanOrEqual(CAMERA_FOLLOW_SPEED_MIN)
      expect(p.followSpeed).toBeLessThanOrEqual(CAMERA_FOLLOW_SPEED_MAX)
      expect(p.fov).toBeGreaterThanOrEqual(CAMERA_FOV_MIN)
      expect(p.fov).toBeLessThanOrEqual(CAMERA_FOV_MAX)
    }
  })

  it('returns a fresh object so callers can mutate without poisoning the table', () => {
    const a = getCameraPreset('hood')
    const b = getCameraPreset('hood')
    expect(a).not.toBe(b)
    a.height = -999
    const c = getCameraPreset('hood')
    expect(c.height).not.toBe(-999)
  })

  it('falls back to the default preset when given an unknown name', () => {
    // Bypass the type guard intentionally to exercise the defensive path.
    const got = getCameraPreset('nope' as unknown as 'chaseFar')
    expect(got).toEqual(getCameraPreset(DEFAULT_CAMERA_PRESET))
  })

  it('chase close sits closer than the default chase camera', () => {
    const close = getCameraPreset('chaseClose')
    expect(close.distance).toBeLessThan(DEFAULT_CAMERA_SETTINGS.distance)
    expect(close.height).toBeLessThan(DEFAULT_CAMERA_SETTINGS.height)
    expect(close.lookAhead).toBeGreaterThan(DEFAULT_CAMERA_SETTINGS.lookAhead)
  })

  it('chase far is the default chase camera', () => {
    const far = getCameraPreset('chaseFar')
    expect(far).toEqual(DEFAULT_CAMERA_SETTINGS)
  })

  it('cockpit and dashboard sit inside the body region', () => {
    const cockpit = getCameraPreset('cockpit')
    const dashboard = getCameraPreset('dashboard')
    expect(cockpit.cameraForward).toBeGreaterThan(0)
    expect(cockpit.cameraForward).toBeLessThan(dashboard.cameraForward!)
    expect(dashboard.cameraForward).toBeLessThan(getCameraPreset('hood').cameraForward!)
    expect(cockpit.height).toBeLessThan(DEFAULT_CAMERA_SETTINGS.height)
    expect(dashboard.height).toBeLessThan(DEFAULT_CAMERA_SETTINGS.height)
  })

  it('hood and bumper mount in front of the cockpit views', () => {
    const hood = getCameraPreset('hood')
    const bumper = getCameraPreset('bumper')
    expect(hood.cameraForward).toBeGreaterThan(getCameraPreset('dashboard').cameraForward!)
    expect(bumper.cameraForward).toBeGreaterThan(hood.cameraForward!)
    expect(bumper.height).toBeLessThan(hood.height)
    expect(bumper.fov).toBeGreaterThan(hood.fov)
  })
})

describe('matchCameraPreset', () => {
  it('returns the matching preset name for the default settings', () => {
    expect(matchCameraPreset(DEFAULT_CAMERA_SETTINGS)).toBe('chaseFar')
  })

  it('returns the matching preset name for every preset', () => {
    for (const name of CAMERA_PRESET_NAMES) {
      expect(matchCameraPreset(getCameraPreset(name))).toBe(name)
    }
  })

  it('returns null when the camera has drifted off any preset', () => {
    const tweaked = { ...getCameraPreset('chaseFar'), height: 7.3 }
    expect(matchCameraPreset(tweaked)).toBeNull()
  })

  it('returns null when only one slider has been nudged', () => {
    const tweaked = { ...getCameraPreset('hood'), fov: 91 }
    expect(matchCameraPreset(tweaked)).toBeNull()
  })
})

describe('isCameraPresetName', () => {
  it('returns true for every known preset name', () => {
    for (const name of CAMERA_PRESET_NAMES) {
      expect(isCameraPresetName(name)).toBe(true)
    }
  })

  it('returns false for unknown strings, non-strings, and null', () => {
    expect(isCameraPresetName('nope')).toBe(false)
    expect(isCameraPresetName('')).toBe(false)
    expect(isCameraPresetName(null)).toBe(false)
    expect(isCameraPresetName(undefined)).toBe(false)
    expect(isCameraPresetName(123)).toBe(false)
    expect(isCameraPresetName({ name: 'chase' })).toBe(false)
  })
})
