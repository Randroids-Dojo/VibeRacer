'use client'
import { useCallback, useEffect, useState } from 'react'
import {
  CONTROL_SETTINGS_STORAGE_KEY,
  cloneDefaultSettings,
  readStoredControlSettings,
  writeStoredControlSettings,
  type ControlSettings,
} from '@/lib/controlSettings'

// Keeps a single source of truth for control settings in React. Reads on
// mount (avoids server / client mismatch on SSR), writes through to
// localStorage on every update, and listens for cross-tab changes so a
// settings tweak in one tab reaches the live game in another.
export function useControlSettings(): {
  settings: ControlSettings
  setSettings: (next: ControlSettings) => void
  resetSettings: () => void
  hydrated: boolean
} {
  const [settings, setSettingsState] = useState<ControlSettings>(() =>
    cloneDefaultSettings(),
  )
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setSettingsState(readStoredControlSettings())
    setHydrated(true)
  }, [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== CONTROL_SETTINGS_STORAGE_KEY) return
      setSettingsState(readStoredControlSettings())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setSettings = useCallback((next: ControlSettings) => {
    setSettingsState(next)
    writeStoredControlSettings(next)
  }, [])

  const resetSettings = useCallback(() => {
    const fresh = cloneDefaultSettings()
    setSettingsState(fresh)
    writeStoredControlSettings(fresh)
  }, [])

  return { settings, setSettings, resetSettings, hydrated }
}
