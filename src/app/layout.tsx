import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Fredoka } from 'next/font/google'
import { UpdateBanner } from '@/components/UpdateBanner'
import './globals.css'

const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-cartoony',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'VibeRacer',
  description: 'A cartoony 3D arcade racer where every URL is a playground.',
}

// `viewport-fit: cover` lets pages opt into drawing under the iOS notch /
// home indicator and Android display cutouts, which makes
// `env(safe-area-inset-*)` return non-zero values so per-HUD safe-area
// padding (HUD.tsx, DragHUD, TuningSession DriveHud, etc.) actually has
// somewhere to read from.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fredoka.variable}>
      <body>
        <UpdateBanner />
        {children}
      </body>
    </html>
  )
}
