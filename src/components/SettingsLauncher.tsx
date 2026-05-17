'use client'
import Link from 'next/link'

interface Props {
  buttonStyle: React.CSSProperties
}

// Title-screen entry point for the Settings page. Settings used to mount as
// an in-place modal here, but the top-level menu family (Free Race, Derby,
// Drag, Tour) all navigate to their own full-page hub, so Settings does too:
// /settings hosts SettingsPane inside MenuPageShell with the shared blue
// background. The in-game pause overlay still mounts SettingsPane as a
// modal directly via Game.tsx.
export function SettingsLauncher({ buttonStyle }: Props) {
  return (
    <Link href="/settings" style={{ ...buttonStyle, textDecoration: 'none' }}>
      Settings
    </Link>
  )
}
