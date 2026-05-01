'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { useAudioSettings } from '@/hooks/useAudioSettings'
import {
  ENGINE_NOISE_DESCRIPTIONS,
  ENGINE_NOISE_LABELS,
  ENGINE_NOISE_MODES,
} from '@/lib/audioSettings'
import {
  KNOWN_MUSIC_EVENT,
  MY_MUSIC_EVENT,
  MUSIC_OVERRIDES_EVENT,
  readAllKnownMusic,
  readMyMusic,
  readMusicOverride,
  writeMusicOverride,
  type MyMusicEntry,
} from '@/lib/myMusic'
import {
  MenuButton,
  MenuHint,
  MenuSection,
  MenuSlider,
  MenuToggle,
  menuTheme,
} from './MenuUI'
import { useRegisterFocusable } from './MenuNav'

interface SettingsAudioTabProps {
  slug?: string
}

export function SettingsAudioTab({ slug }: SettingsAudioTabProps) {
  const router = useRouter()
  const {
    settings: audio,
    setSettings: setAudio,
  } = useAudioSettings()
  const [myMusic, setMyMusic] = useState<MyMusicEntry[]>([])
  const [knownMusic, setKnownMusic] =
    useState<ReturnType<typeof readAllKnownMusic>>({})
  const [musicChoice, setMusicChoice] = useState('default')
  const musicSelectRef = useRef<HTMLSelectElement | null>(null)
  useRegisterFocusable(musicSelectRef, { disabled: !slug })

  useEffect(() => {
    function refreshMusic() {
      setMyMusic(readMyMusic())
      setKnownMusic(readAllKnownMusic())
      if (slug) {
        const override = readMusicOverride(slug)
        if (override.source === 'mine') setMusicChoice(`mine:${override.id}`)
        else if (override.source === 'visited') {
          setMusicChoice(`visited:${override.slug}`)
        } else setMusicChoice('default')
      } else {
        setMusicChoice('default')
      }
    }
    refreshMusic()
    window.addEventListener(MY_MUSIC_EVENT, refreshMusic)
    window.addEventListener(KNOWN_MUSIC_EVENT, refreshMusic)
    window.addEventListener(MUSIC_OVERRIDES_EVENT, refreshMusic)
    window.addEventListener('storage', refreshMusic)
    return () => {
      window.removeEventListener(MY_MUSIC_EVENT, refreshMusic)
      window.removeEventListener(KNOWN_MUSIC_EVENT, refreshMusic)
      window.removeEventListener(MUSIC_OVERRIDES_EVENT, refreshMusic)
      window.removeEventListener('storage', refreshMusic)
    }
  }, [slug])

  function chooseMusic(value: string): void {
    setMusicChoice(value)
    if (!slug) return
    if (value === 'default') {
      writeMusicOverride(slug, { source: 'default' })
      return
    }
    if (value.startsWith('mine:')) {
      writeMusicOverride(slug, { source: 'mine', id: value.slice(5) })
      return
    }
    if (value.startsWith('visited:')) {
      writeMusicOverride(slug, { source: 'visited', slug: value.slice(8) })
    }
  }

  return (
    <>
      <MenuSection title="Mix">
        <div style={settingRow}>
          <div style={settingLabel}>Music</div>
          <MenuToggle
            value={audio.musicEnabled}
            onChange={(v) => setAudio({ ...audio, musicEnabled: v })}
          />
        </div>
        <MenuSlider
          label="Music volume"
          value={audio.musicVolume}
          disabled={!audio.musicEnabled}
          onChange={(v) => setAudio({ ...audio, musicVolume: v })}
        />
        <div style={settingRow}>
          <div style={settingLabel}>Sound effects</div>
          <MenuToggle
            value={audio.sfxEnabled}
            onChange={(v) => setAudio({ ...audio, sfxEnabled: v })}
          />
        </div>
        <MenuSlider
          label="SFX volume"
          value={audio.sfxVolume}
          disabled={!audio.sfxEnabled}
          onChange={(v) => setAudio({ ...audio, sfxVolume: v })}
        />
      </MenuSection>

      <MenuSection title="Engine noise">
        <MenuHint>
          Pick how the continuous engine drone sounds while racing.
        </MenuHint>
        <div style={buttonGrid}>
          {ENGINE_NOISE_MODES.map((mode) => (
            <MenuButton
              key={mode}
              variant={audio.engineNoise === mode ? 'primary' : 'secondary'}
              disabled={!audio.sfxEnabled}
              onClick={() => setAudio({ ...audio, engineNoise: mode })}
            >
              {ENGINE_NOISE_LABELS[mode]}
            </MenuButton>
          ))}
        </div>
        <MenuHint>{ENGINE_NOISE_DESCRIPTIONS[audio.engineNoise]}</MenuHint>
      </MenuSection>

      <MenuSection title="Music identity">
        <MenuHint>
          Shifts the music&apos;s key, scale, and tempo per track so each one
          has its own sound. Turn off for the same loop everywhere.
        </MenuHint>
        <div style={settingRow}>
          <div style={settingLabel}>Per-track flavor</div>
          <MenuToggle
            value={audio.musicPerTrack}
            disabled={!audio.musicEnabled}
            onChange={(v) => setAudio({ ...audio, musicPerTrack: v })}
          />
        </div>
        <MenuHint>
          Mixes your initials into the seed so two racers on the same track
          hear different flavors.
        </MenuHint>
        <div style={settingRow}>
          <div style={settingLabel}>Mix in your initials</div>
          <MenuToggle
            value={audio.musicMixInitials}
            disabled={!audio.musicEnabled || !audio.musicPerTrack}
            onChange={(v) => setAudio({ ...audio, musicMixInitials: v })}
          />
        </div>
      </MenuSection>

      <MenuSection title="Track music">
        <MenuHint>
          Use the authored music or pick one of your saved or visited entries.
        </MenuHint>
        <select
          ref={musicSelectRef}
          value={musicChoice}
          disabled={!slug}
          onChange={(event) => chooseMusic(event.target.value)}
          style={musicSelect}
          aria-label="Track music"
          className="menuui-focusable"
        >
          <option value="default">Default for this track</option>
          {myMusic.map((entry) => (
            <option key={entry.id} value={`mine:${entry.id}`}>
              My music: {entry.name}
            </option>
          ))}
          {Object.keys(knownMusic).map((knownSlug) => (
            <option key={knownSlug} value={`visited:${knownSlug}`}>
              Visited: /{knownSlug}
            </option>
          ))}
        </select>
        <MenuButton
          onClick={() => {
            if (slug) router.push(`/music/${slug}`)
          }}
          disabled={!slug}
        >
          Edit this track&apos;s music
        </MenuButton>
      </MenuSection>
    </>
  )
}

const settingRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const settingLabel: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
}

const buttonGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 8,
}

const musicSelect: CSSProperties = {
  background: menuTheme.inputBg,
  color: menuTheme.textPrimary,
  border: `1px solid ${menuTheme.ghostBorder}`,
  borderRadius: 8,
  padding: '10px 12px',
  font: 'inherit',
}
