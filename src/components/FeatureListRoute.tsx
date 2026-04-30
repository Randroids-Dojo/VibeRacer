'use client'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { FeatureListOverlay } from './FeatureListOverlay'

export function FeatureListRoute() {
  const router = useRouter()
  const close = useCallback(() => {
    router.push('/')
  }, [router])

  return <FeatureListOverlay onClose={close} />
}
