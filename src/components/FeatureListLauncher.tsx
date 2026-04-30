'use client'
import Link from 'next/link'
import { type CSSProperties } from 'react'

interface FeatureListLauncherProps {
  buttonStyle: CSSProperties
}

export function FeatureListLauncher({ buttonStyle }: FeatureListLauncherProps) {
  return (
    <Link href="/features" style={{ ...buttonStyle, textDecoration: 'none' }}>
      Feature List
    </Link>
  )
}
