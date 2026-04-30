'use client'
import { useRouter } from 'next/navigation'
import { FeatureListOverlay } from './FeatureListOverlay'

export function FeatureListRoute() {
  const router = useRouter()

  return <FeatureListOverlay onClose={() => router.push('/')} />
}
