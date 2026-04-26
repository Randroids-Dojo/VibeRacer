'use client'
import { useState } from 'react'
import { useControlSettings } from '@/hooks/useControlSettings'
import { HowToPlay } from './HowToPlay'

interface Props {
  buttonStyle: React.CSSProperties
}

// Title-screen entry point for the How to Play overlay. Mirrors
// SettingsLauncher: the button itself styles to match the rest of the title
// menu, and clicking it mounts the overlay with the player's live key /
// gamepad / touch settings so the help reflects any remap they have done.
export function HowToPlayLauncher({ buttonStyle }: Props) {
  const [open, setOpen] = useState(false)
  const { settings } = useControlSettings()
  return (
    <>
      <button
        type="button"
        style={buttonStyle}
        onClick={() => setOpen(true)}
      >
        How to play
      </button>
      {open ? (
        <HowToPlay
          keyBindings={settings.keyBindings}
          gamepadBindings={settings.gamepadBindings}
          touchMode={settings.touchMode}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}
