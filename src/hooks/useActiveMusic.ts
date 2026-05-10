import { useEffect } from 'react'
import { setActiveMusic, setMusicLapIndex, setMusicOffTrack } from '@/game/music'
import {
  KNOWN_MUSIC_EVENT,
  MUSIC_OVERRIDES_EVENT,
  MY_MUSIC_EVENT,
  recordKnownMusic,
  resolvePersonalMusic,
} from '@/lib/myMusic'
import type { TrackMusic } from '@/lib/trackMusic'

// Drive the audio engine's active music slot from the (slug, initialMusic)
// pair, refreshing whenever the player edits their custom-music library or
// per-slug overrides in another tab. The effect is "global state into a
// React lifecycle" rather than React-managed state, so the cleanup also
// resets the lap index, off-track flag, and the active slot itself when
// the component unmounts.
export function useActiveMusic(
  slug: string,
  initialMusic: TrackMusic | null,
): void {
  useEffect(() => {
    recordKnownMusic(slug, initialMusic)
    setActiveMusic(resolvePersonalMusic(slug, initialMusic))
    function refreshMusic() {
      setActiveMusic(resolvePersonalMusic(slug, initialMusic))
    }
    window.addEventListener(MY_MUSIC_EVENT, refreshMusic)
    window.addEventListener(MUSIC_OVERRIDES_EVENT, refreshMusic)
    window.addEventListener(KNOWN_MUSIC_EVENT, refreshMusic)
    window.addEventListener('storage', refreshMusic)
    return () => {
      window.removeEventListener(MY_MUSIC_EVENT, refreshMusic)
      window.removeEventListener(MUSIC_OVERRIDES_EVENT, refreshMusic)
      window.removeEventListener(KNOWN_MUSIC_EVENT, refreshMusic)
      window.removeEventListener('storage', refreshMusic)
      setMusicLapIndex(0)
      setMusicOffTrack(false)
      setActiveMusic(null)
    }
  }, [slug, initialMusic])
}
