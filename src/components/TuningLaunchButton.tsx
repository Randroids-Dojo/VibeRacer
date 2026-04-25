import Link from 'next/link'
import type { CSSProperties } from 'react'

interface Props {
  buttonStyle: CSSProperties
}

// Server-renderable launcher to the Tuning Lab. Mirrors SettingsLauncher in
// placement on the home page, but the lab is a full route rather than a modal,
// so this is just a styled Link.
export function TuningLaunchButton({ buttonStyle }: Props) {
  return (
    <Link href="/tune" style={buttonStyle}>
      Tuning Lab
    </Link>
  )
}
