'use client'
import { useCallback, useEffect, useState } from 'react'
import type { CarParams } from '@/game/physics'
import {
  TUNING_LAST_LOADED_KEY,
  cloneDefaultParams,
  clampParams,
  migrateLegacyTuning,
  perTrackKey,
  resolveStartingTuning,
  writeTuning,
} from '@/lib/tuningSettings'

// Per-track tuning. Hydrates on mount so SSR + client agree, listens for
// cross-tab storage changes (so a tweak in another tab reaches the live game),
// and writes through to localStorage on every update. Each save also stamps
// the "last loaded" key so a fresh slug starts from the most recent setup.
export function useTuning(slug: string): {
  params: CarParams
  setParams: (next: CarParams) => void
  applyParams: (next: CarParams) => void
  resetParams: () => void
  hydrated: boolean
} {
  const [params, setParamsState] = useState<CarParams>(() => cloneDefaultParams())
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    migrateLegacyTuning()
    setParamsState(resolveStartingTuning(slug))
    setHydrated(true)
  }, [slug])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== perTrackKey(slug) && e.key !== TUNING_LAST_LOADED_KEY) {
        return
      }
      setParamsState(resolveStartingTuning(slug))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [slug])

  const setParams = useCallback(
    (next: CarParams) => {
      const safe = clampParams(next)
      setParamsState(safe)
      writeTuning(slug, safe)
    },
    [slug],
  )

  // applyParams is the "Try this setup" entry point. Same write path as
  // setParams, just named for clarity at the call site.
  const applyParams = useCallback(
    (next: CarParams) => {
      const safe = clampParams(next)
      setParamsState(safe)
      writeTuning(slug, safe)
    },
    [slug],
  )

  const resetParams = useCallback(() => {
    const fresh = cloneDefaultParams()
    setParamsState(fresh)
    writeTuning(slug, fresh)
  }, [slug])

  return { params, setParams, applyParams, resetParams, hydrated }
}
