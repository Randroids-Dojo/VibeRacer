'use client'
import { useState, type CSSProperties } from 'react'
import { FeatureListOverlay } from './FeatureListOverlay'

interface FeatureListLauncherProps {
  buttonStyle: CSSProperties
}

export function FeatureListLauncher({ buttonStyle }: FeatureListLauncherProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" style={buttonStyle} onClick={() => setOpen(true)}>
        Feature List
      </button>
      {open ? <FeatureListOverlay onClose={() => setOpen(false)} /> : null}
    </>
  )
}
