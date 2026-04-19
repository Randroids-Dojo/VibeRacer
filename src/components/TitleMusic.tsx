'use client'
import { useEffect } from 'react'
import { startTitleMusic, stopMusic } from '@/game/music'

export function TitleMusic() {
  useEffect(() => {
    startTitleMusic()
    return () => {
      stopMusic()
    }
  }, [])

  return null
}
