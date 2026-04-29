import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Fredoka } from 'next/font/google'
import { UpdateBanner } from '@/components/UpdateBanner'

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
