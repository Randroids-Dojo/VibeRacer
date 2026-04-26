'use client'
import { useCallback } from 'react'
import { playUiClick } from '@/game/audio'

export type ClickVariant = 'soft' | 'confirm' | 'back'

/**
 * Returns a stable callback that plays a UI click SFX. Variant controls the
 * pitch and timbre: 'confirm' for primary actions, 'back' for close / cancel,
 * 'soft' (default) for sliders, toggles, and other low-stakes interactions.
 */
export function useClickSfx(variant: ClickVariant = 'soft'): () => void {
  return useCallback(() => {
    playUiClick(variant)
  }, [variant])
}
