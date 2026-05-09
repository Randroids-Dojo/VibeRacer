import { useEffect } from 'react'
import { setMusicPersonalization } from '@/game/music'
import {
  NEUTRAL_PERSONALIZATION,
  personalizeForRacer,
  personalizeForSlug,
} from '@/game/musicPersonalization'

interface MusicPersonalizationOptions {
  slug: string
  initials: string | null | undefined
  // Player setting: when false, music plays the neutral baseline.
  musicPerTrack: boolean
  // Player setting: when true (and `musicPerTrack` is also true), the slug
  // seed is folded with a hash of the player's initials.
  musicMixInitials: boolean
}

// Push the slug-derived (or slug + initials-derived) musical personalization
// into the audio engine whenever the inputs change. The engine treats the
// setter as idempotent so a re-fire on identical inputs is a no-op.
export function useMusicPersonalization({
  slug,
  initials,
  musicPerTrack,
  musicMixInitials,
}: MusicPersonalizationOptions): void {
  useEffect(() => {
    let next
    if (!musicPerTrack) {
      next = { ...NEUTRAL_PERSONALIZATION }
    } else if (musicMixInitials) {
      next = personalizeForRacer(slug, initials ?? null)
    } else {
      next = personalizeForSlug(slug)
    }
    setMusicPersonalization(next)
  }, [slug, initials, musicPerTrack, musicMixInitials])
}
