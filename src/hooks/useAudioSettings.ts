'use client'
import { useCallback, useEffect, useState } from 'react'
import {
  AUDIO_SETTINGS_EVENT,
  AUDIO_SETTINGS_STORAGE_KEY,
  cloneDefaultAudioSettings,
  readStoredAudioSettings,
  writeStoredAudioSettings,
  type AudioSettings,
} from '@/lib/audioSettings'
import { applyAudioSettings } from '@/game/audioEngine'

// Mirrors useControlSettings: a single source of truth for audio settings
// in React, hydrated from localStorage on mount, written through on every
// update, and synced across hook instances via a custom event (in-tab) and
// the storage event (cross-tab). On every change we also push the new
// gains into the live audio engine so playback updates immediately.
export function useAudioSettings(): {
  settings: AudioSettings
  setSettings: (next: AudioSettings) => void
  resetSettings: () => void
  hydrated: boolean
} {
  const [settings, setSettingsState] = useState<AudioSettings>(() =>
    cloneDefaultAudioSettings(),
  )
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = readStoredAudioSettings()
    setSettingsState(stored)
    applyAudioSettings(stored)
    setHydrated(true)
  }, [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== AUDIO_SETTINGS_STORAGE_KEY) return
      const next = readStoredAudioSettings()
      setSettingsState(next)
      applyAudioSettings(next)
    }
    function onCustom(e: Event) {
      const detail = (e as CustomEvent<AudioSettings>).detail
      if (!detail) return
      setSettingsState(detail)
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(AUDIO_SETTINGS_EVENT, onCustom)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(AUDIO_SETTINGS_EVENT, onCustom)
    }
  }, [])

  const setSettings = useCallback((next: AudioSettings) => {
    setSettingsState(next)
    writeStoredAudioSettings(next)
    applyAudioSettings(next)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<AudioSettings>(AUDIO_SETTINGS_EVENT, { detail: next }),
      )
    }
  }, [])

  const resetSettings = useCallback(() => {
    const fresh = cloneDefaultAudioSettings()
    setSettingsState(fresh)
    writeStoredAudioSettings(fresh)
    applyAudioSettings(fresh)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<AudioSettings>(AUDIO_SETTINGS_EVENT, { detail: fresh }),
      )
    }
  }, [])

  return { settings, setSettings, resetSettings, hydrated }
}
