'use client'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  MenuButton,
  MenuHeader,
  MenuHint,
  MenuOverlay,
  MenuPanel,
  MenuSection,
  MenuSlider,
  MenuToggle,
  menuTheme,
} from './MenuUI'
import { MusicStepGrid } from './MusicStepGrid'
import { MusicTransport } from './MusicTransport'
import { MusicVibePad } from './MusicVibePad'
import { MusicLibrary } from './MusicLibrary'
import {
  DEFAULT_TRACK_MUSIC,
  MUSIC_FINISH_STINGER_STEP_COUNT,
  TRACK_MUSIC_SCALE_FLAVORS,
  TRACK_MUSIC_VOICES,
  TRACK_MUSIC_WAVES,
  TrackMusicSchema,
  type TrackMusic,
  type MusicFinishStingerPattern,
  type MusicVoice,
  type MusicWave,
} from '@/lib/trackMusic'
import {
  auditionMusicNote,
  crossfadeTo,
  setActiveMusic,
  stopMusic,
} from '@/game/music'
import {
  upsertMyMusic,
  writeMusicOverride,
  type MyMusicEntry,
} from '@/lib/myMusic'

type SaveScope = 'unsaved' | 'default' | 'mine' | 'library'

type ConfirmKind = 'default' | 'mine' | 'library' | null

const SCOPE_INFO: Record<
  SaveScope,
  { icon: string; label: string; audience: string; tone: 'accent' | 'green' | 'muted' | 'warn' }
> = {
  unsaved: {
    icon: '●',
    label: 'Unsaved changes',
    audience: 'pick a save target below to commit',
    tone: 'warn',
  },
  default: {
    icon: '🌐',
    label: 'Track default',
    audience: 'every racer on this slug hears this on next load',
    tone: 'accent',
  },
  mine: {
    icon: '👤',
    label: 'Your override',
    audience: 'only you, only on this slug',
    tone: 'green',
  },
  library: {
    icon: '🔖',
    label: 'In your library',
    audience: 'saved, not applied to any track yet',
    tone: 'muted',
  },
}

function applyVoiceMix(
  music: TrackMusic,
  solos: Set<MusicVoice>,
  mutes: Set<MusicVoice>,
): TrackMusic {
  const hasSolo = solos.size > 0
  if (!hasSolo && mutes.size === 0) return music
  const voices = { ...music.voices }
  for (const name of TRACK_MUSIC_VOICES) {
    const voice = voices[name]
    const silenced = mutes.has(name) || (hasSolo && !solos.has(name))
    voices[name] = { ...voice, volume: silenced ? 0 : voice.volume }
  }
  return { ...music, voices }
}

export function MusicEditor({
  slug,
  initialMusic,
}: {
  slug: string
  initialMusic: TrackMusic | null
}) {
  const router = useRouter()
  const [music, setMusic] = useState<TrackMusic>(() =>
    TrackMusicSchema.parse(initialMusic ?? DEFAULT_TRACK_MUSIC),
  )
  const [paintDegree, setPaintDegree] = useState(0)
  const [scope, setScope] = useState<SaveScope>(() =>
    initialMusic ? 'default' : 'unsaved',
  )
  const [savedScope, setSavedScope] = useState<SaveScope>(() =>
    initialMusic ? 'default' : 'unsaved',
  )
  const [savedSnapshot, setSavedSnapshot] = useState<TrackMusic>(() =>
    TrackMusicSchema.parse(initialMusic ?? DEFAULT_TRACK_MUSIC),
  )
  const [personalName, setPersonalName] = useState(
    music.name ?? `/${slug} music`,
  )
  const [status, setStatus] = useState('')
  const [confirming, setConfirming] = useState<ConfirmKind>(null)
  const [playing, setPlaying] = useState(false)
  const [solos, setSolos] = useState<Set<MusicVoice>>(() => new Set())
  const [mutes, setMutes] = useState<Set<MusicVoice>>(() => new Set())
  const [libraryOpen, setLibraryOpen] = useState(false)

  const previewMusic = useMemo(
    () => applyVoiceMix(music, solos, mutes),
    [music, solos, mutes],
  )

  // Push the active mix to the engine on every meaningful change so the live
  // loop reflects edits within one bar. Safe to call when not playing too:
  // setActiveMusic just stages the state for the next time the game track
  // becomes audible.
  useEffect(() => {
    setActiveMusic(previewMusic)
  }, [previewMusic])

  // Manage start/stop transitions. Title music is restored when the editor
  // unmounts so a back-navigation lands on the lobby with the usual loop.
  useEffect(() => {
    if (playing) {
      crossfadeTo('game', 0.4)
    } else {
      stopMusic(0.4)
    }
  }, [playing])

  useEffect(() => {
    return () => {
      stopMusic(0.6)
    }
  }, [])

  const dirty = useMemo(
    () => JSON.stringify(music) !== JSON.stringify(savedSnapshot),
    [music, savedSnapshot],
  )

  function patch(next: Partial<TrackMusic>): void {
    setMusic((current) => TrackMusicSchema.parse({ ...current, ...next }))
    if (scope !== 'unsaved') setScope('unsaved')
  }

  function patchVoice(
    voice: MusicVoice,
    next: Partial<TrackMusic['voices'][MusicVoice]>,
  ): void {
    setMusic((current) =>
      TrackMusicSchema.parse({
        ...current,
        voices: {
          ...current.voices,
          [voice]: { ...current.voices[voice], ...next },
        },
      }),
    )
    if (scope !== 'unsaved') setScope('unsaved')
  }

  function patchAutomation(
    next: Partial<TrackMusic['automation']>,
  ): void {
    setMusic((current) =>
      TrackMusicSchema.parse({
        ...current,
        automation: { ...current.automation, ...next },
      }),
    )
    if (scope !== 'unsaved') setScope('unsaved')
  }

  function setFinishStinger(): void {
    const seedPhrase = [0, 2, 4, 7, 4, 2, 0, null]
    const phrase: MusicFinishStingerPattern = Array.from(
      { length: MUSIC_FINISH_STINGER_STEP_COUNT },
      (_, index) => seedPhrase[index] ?? null,
    )
    patchAutomation({ finishStinger: phrase })
  }

  const replaceMusic = useCallback((next: TrackMusic) => {
    setMusic(TrackMusicSchema.parse(next))
    setPersonalName(next.name ?? `/${slug} music`)
    setScope('unsaved')
  }, [slug])

  function toggleSolo(voice: MusicVoice): void {
    setSolos((current) => {
      const next = new Set(current)
      if (next.has(voice)) next.delete(voice)
      else next.add(voice)
      return next
    })
  }

  function toggleMute(voice: MusicVoice): void {
    setMutes((current) => {
      const next = new Set(current)
      if (next.has(voice)) next.delete(voice)
      else next.add(voice)
      return next
    })
  }

  function auditionVoice(voice: MusicVoice): void {
    const config = music.voices[voice]
    auditionMusicNote({
      degree: paintDegree,
      octave: config.octave,
      wave: config.wave,
      rootMidi: music.rootMidi,
      scale: music.scale,
    })
  }

  async function commitDefault(): Promise<void> {
    setStatus('Saving track default...')
    const named: TrackMusic = {
      ...music,
      name: personalName.trim() || music.name,
    }
    const res = await fetch(`/api/track/${encodeURIComponent(slug)}/music`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(named),
    })
    if (!res.ok) {
      setStatus('Default save failed.')
      return
    }
    writeMusicOverride(slug, { source: 'default' })
    setMusic(named)
    setSavedSnapshot(named)
    setSavedScope('default')
    setScope('default')
    setStatus('Saved as track default.')
  }

  function commitMine(): void {
    const now = Date.now()
    const name = personalName.trim() || `/${slug} music`
    const named: TrackMusic = { ...music, name }
    const entry: MyMusicEntry = {
      id: crypto.randomUUID(),
      name,
      originSlug: slug,
      music: named,
      createdAt: now,
      updatedAt: now,
    }
    upsertMyMusic(entry)
    writeMusicOverride(slug, { source: 'mine', id: entry.id })
    setMusic(named)
    setSavedSnapshot(named)
    setSavedScope('mine')
    setScope('mine')
    setStatus('Saved as your override.')
  }

  function commitLibrary(): void {
    const now = Date.now()
    const name = personalName.trim() || `/${slug} music`
    const named: TrackMusic = { ...music, name }
    const entry: MyMusicEntry = {
      id: crypto.randomUUID(),
      name,
      originSlug: slug,
      music: named,
      createdAt: now,
      updatedAt: now,
    }
    upsertMyMusic(entry)
    setMusic(named)
    setSavedSnapshot(named)
    setSavedScope('library')
    setScope('library')
    setStatus('Saved to your library.')
  }

  function revert(): void {
    setMusic(TrackMusicSchema.parse(savedSnapshot))
    setScope(savedScope)
    setStatus('Reverted to last save.')
  }

  function loadFromLibrary(
    next: TrackMusic,
    source: { kind: 'mine' | 'default'; id?: string; slug?: string },
  ): void {
    replaceMusic(next)
    setSavedSnapshot(next)
    const loadedScope: SaveScope = source.kind === 'mine' ? 'mine' : 'default'
    setSavedScope(loadedScope)
    setScope(loadedScope)
    setStatus(
      source.kind === 'mine'
        ? `Loaded "${next.name ?? 'tune'}" from your library.`
        : `Loaded /${source.slug ?? '?'} default.`,
    )
    setLibraryOpen(false)
  }

  function close(): void {
    router.push(`/${slug}`)
  }

  return (
    <>
      <MenuOverlay zIndex={300} onBack={close}>
        <MenuPanel width="wide">
          <MenuHeader title={`Music for /${slug}`} onClose={close} />
          <ScopeBanner scope={scope} dirty={dirty} slug={slug} />
          <div style={topActions}>
            <MenuButton fullWidth={false} onClick={() => setLibraryOpen(true)}>
              📂 Library
            </MenuButton>
            {dirty && scope !== 'unsaved' ? (
              <MenuButton
                fullWidth={false}
                variant="ghost"
                onClick={revert}
              >
                ↺ Revert
              </MenuButton>
            ) : null}
          </div>

          <MusicTransport
            playing={playing}
            onPlayToggle={() => setPlaying((value) => !value)}
          />

          <MenuSection title="Vibe">
            <MusicVibePad music={music} onMusicChange={replaceMusic} />
            <MenuHint>
              Drag the puck to morph energy and mood. Roll re-shuffles
              rhythms while keeping your vibe; lock pins the puck.
            </MenuHint>
          </MenuSection>

          <MenuSection title="Globals">
            <MenuSlider
              label="Tempo"
              value={music.bpm}
              min={60}
              max={220}
              step={1}
              format={(v) => `${Math.round(v)} BPM`}
              onChange={(bpm) => patch({ bpm: Math.round(bpm) })}
            />
            <MenuSlider
              label="Root"
              value={music.rootMidi}
              min={36}
              max={84}
              step={1}
              format={(v) => `MIDI ${Math.round(v)}`}
              onChange={(rootMidi) => patch({ rootMidi: Math.round(rootMidi) })}
            />
            <label style={selectLabel}>
              <span>Scale</span>
              <select
                value={music.scale}
                onChange={(event) =>
                  patch({ scale: event.target.value as TrackMusic['scale'] })
                }
                style={selectStyle}
              >
                {TRACK_MUSIC_SCALE_FLAVORS.map((scale) => (
                  <option key={scale} value={scale}>
                    {scale}
                  </option>
                ))}
              </select>
            </label>
          </MenuSection>

          <MenuSection title="Paint degree">
            <MenuSlider
              label="Degree"
              value={paintDegree}
              min={-7}
              max={7}
              step={1}
              format={(v) => `${Math.round(v)}`}
              onChange={(v) => setPaintDegree(Math.round(v))}
            />
            <MenuHint>
              The degree painted into a step when you tap a rest. Right-click
              an active step to bump it up the scale.
            </MenuHint>
          </MenuSection>

          <MenuSection title="Voices">
            {TRACK_MUSIC_VOICES.map((voiceName) => {
              const voice = music.voices[voiceName]
              const solo = solos.has(voiceName)
              const mute = mutes.has(voiceName)
              return (
                <div key={voiceName} style={voiceBlock}>
                  <div style={voiceHeader}>
                    <strong style={voiceTitle}>{voiceName}</strong>
                    <div style={voiceActions}>
                      <button
                        type="button"
                        style={voiceChip(solo, '#e0a13a')}
                        onClick={() => toggleSolo(voiceName)}
                        aria-pressed={solo}
                      >
                        Solo
                      </button>
                      <button
                        type="button"
                        style={voiceChip(mute, '#7a7a7a')}
                        onClick={() => toggleMute(voiceName)}
                        aria-pressed={mute}
                      >
                        Mute
                      </button>
                      <button
                        type="button"
                        style={voiceChip(false, menuTheme.accent)}
                        onClick={() => auditionVoice(voiceName)}
                      >
                        Audition
                      </button>
                      <MenuToggle
                        value={voice.enabled}
                        onChange={(enabled) =>
                          patchVoice(voiceName, { enabled })
                        }
                      />
                    </div>
                  </div>
                  <div style={miniGrid}>
                    <label style={selectLabel}>
                      <span>Wave</span>
                      <select
                        value={voice.wave}
                        onChange={(event) =>
                          patchVoice(voiceName, {
                            wave: event.target.value as MusicWave,
                          })
                        }
                        style={selectStyle}
                      >
                        {TRACK_MUSIC_WAVES.map((wave) => (
                          <option key={wave} value={wave}>
                            {wave}
                          </option>
                        ))}
                      </select>
                    </label>
                    <MenuSlider
                      label="Vol"
                      value={voice.volume}
                      onChange={(volume) => patchVoice(voiceName, { volume })}
                    />
                    <MenuSlider
                      label="Oct"
                      value={voice.octave}
                      min={-2}
                      max={2}
                      step={1}
                      format={(v) => `${Math.round(v)}`}
                      onChange={(octave) =>
                        patchVoice(voiceName, { octave: Math.round(octave) })
                      }
                    />
                  </div>
                  <MusicStepGrid
                    label={`${voiceName} steps`}
                    steps={voice.steps}
                    paintDegree={paintDegree}
                    onChange={(steps) => patchVoice(voiceName, { steps })}
                  />
                </div>
              )
            })}
          </MenuSection>

          <MenuSection title="Drums">
            <div style={row}>
              <MenuToggle
                label="Kick"
                value={music.drums.kick}
                onChange={(kick) => patch({ drums: { ...music.drums, kick } })}
              />
              <MenuToggle
                label="Snare"
                value={music.drums.snare}
                onChange={(snare) => patch({ drums: { ...music.drums, snare } })}
              />
              <MenuToggle
                label="Hat"
                value={music.drums.hat}
                onChange={(hat) => patch({ drums: { ...music.drums, hat } })}
              />
            </div>
            <MenuSlider
              label="Density"
              value={music.drums.density}
              onChange={(density) => patch({ drums: { ...music.drums, density } })}
            />
          </MenuSection>

          <MenuSection title="Automation">
            <MenuSlider
              label="Tempo low"
              value={music.automation.tempoMinFactor}
              min={0.25}
              max={2}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(tempoMinFactor) =>
                patchAutomation({ tempoMinFactor })
              }
            />
            <MenuSlider
              label="Tempo high"
              value={music.automation.tempoMaxFactor}
              min={0.25}
              max={2}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(tempoMaxFactor) =>
                patchAutomation({ tempoMaxFactor })
              }
            />
            <MenuSlider
              label="Per-lap key change"
              value={music.automation.perLapSemitones}
              min={-6}
              max={6}
              step={1}
              format={(v) => `${Math.round(v)} semitones`}
              onChange={(perLapSemitones) =>
                patchAutomation({
                  perLapSemitones: Math.round(perLapSemitones),
                })
              }
            />
            <label style={selectLabel}>
              <span>Off-track scale</span>
              <select
                value={music.automation.offTrackScale ?? 'none'}
                onChange={(event) =>
                  patchAutomation({
                    offTrackScale:
                      event.target.value === 'none'
                        ? null
                        : (event.target.value as TrackMusic['scale']),
                  })
                }
                style={selectStyle}
              >
                <option value="none">none</option>
                {TRACK_MUSIC_SCALE_FLAVORS.map((scale) => (
                  <option key={scale} value={scale}>
                    {scale}
                  </option>
                ))}
              </select>
            </label>
            <MenuSlider
              label="Off-track duck"
              value={music.automation.offTrackDuck}
              min={0}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(offTrackDuck) => patchAutomation({ offTrackDuck })}
            />
            <div style={voiceBlock}>
              <div style={voiceHeader}>
                <strong style={voiceTitle}>Finish stinger</strong>
                <div style={row}>
                  <MenuButton fullWidth={false} onClick={setFinishStinger}>
                    {music.automation.finishStinger ? 'Reset' : 'Add'}
                  </MenuButton>
                  <MenuButton
                    fullWidth={false}
                    disabled={!music.automation.finishStinger}
                    onClick={() => patchAutomation({ finishStinger: null })}
                  >
                    Clear
                  </MenuButton>
                </div>
              </div>
              {music.automation.finishStinger ? (
                <MusicStepGrid
                  label="finish stinger"
                  steps={music.automation.finishStinger}
                  paintDegree={paintDegree}
                  onChange={(finishStinger) =>
                    patchAutomation({ finishStinger })
                  }
                />
              ) : (
                <MenuHint>No custom finish phrase.</MenuHint>
              )}
            </div>
          </MenuSection>

          <SaveBar
            slug={slug}
            personalName={personalName}
            onPersonalNameChange={setPersonalName}
            onRequestConfirm={setConfirming}
            status={status}
          />
        </MenuPanel>
      </MenuOverlay>

      {confirming ? (
        <ConfirmSheet
          kind={confirming}
          slug={slug}
          personalName={personalName}
          onPersonalNameChange={setPersonalName}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            setConfirming(null)
            if (confirming === 'default') await commitDefault()
            else if (confirming === 'mine') commitMine()
            else if (confirming === 'library') commitLibrary()
          }}
        />
      ) : null}

      <MusicLibrary
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onLoad={loadFromLibrary}
        slug={slug}
        defaultMusic={initialMusic}
      />
    </>
  )
}

function ScopeBanner({
  scope,
  dirty,
  slug,
}: {
  scope: SaveScope
  dirty: boolean
  slug: string
}) {
  const info = SCOPE_INFO[scope]
  const tone = info.tone
  return (
    <div
      style={{
        ...bannerWrap,
        borderColor:
          tone === 'accent'
            ? menuTheme.accent
            : tone === 'green'
              ? '#6ec07c'
              : tone === 'warn'
                ? '#e0a13a'
                : menuTheme.ghostBorder,
        background:
          tone === 'accent'
            ? 'rgba(255,107,53,0.1)'
            : tone === 'green'
              ? 'rgba(110,192,124,0.1)'
              : tone === 'warn'
                ? 'rgba(224,161,58,0.1)'
                : menuTheme.inputBg,
      }}
      role="status"
    >
      <span style={bannerIcon}>{info.icon}</span>
      <div style={bannerText}>
        <span style={bannerLabel}>
          {info.label} for /{slug}
          {dirty && scope !== 'unsaved' ? ' (unsaved changes)' : ''}
        </span>
        <span style={bannerAudience}>{info.audience}</span>
      </div>
    </div>
  )
}

function SaveBar({
  slug,
  personalName,
  onPersonalNameChange,
  onRequestConfirm,
  status,
}: {
  slug: string
  personalName: string
  onPersonalNameChange: (next: string) => void
  onRequestConfirm: (kind: ConfirmKind) => void
  status: string
}) {
  return (
    <div style={saveBar} aria-label="Save actions">
      <input
        aria-label="Tune name"
        value={personalName}
        onChange={(event) => onPersonalNameChange(event.target.value)}
        placeholder="tune name"
        style={input}
      />
      <button
        type="button"
        style={saveAction.default}
        onClick={() => onRequestConfirm('default')}
      >
        <span style={saveIcon}>🌐</span>
        <span style={saveLabel}>Save as track default</span>
        <span style={saveAudience}>everyone on /{slug} hears this</span>
      </button>
      <button
        type="button"
        style={saveAction.mine}
        onClick={() => onRequestConfirm('mine')}
      >
        <span style={saveIcon}>👤</span>
        <span style={saveLabel}>Save as my override</span>
        <span style={saveAudience}>only you, only on /{slug}</span>
      </button>
      <button
        type="button"
        style={saveAction.library}
        onClick={() => onRequestConfirm('library')}
      >
        <span style={saveIcon}>🔖</span>
        <span style={saveLabel}>Save to my library</span>
        <span style={saveAudience}>stash it, do not apply yet</span>
      </button>
      {status ? <MenuHint>{status}</MenuHint> : null}
    </div>
  )
}

function ConfirmSheet({
  kind,
  slug,
  personalName,
  onPersonalNameChange,
  onCancel,
  onConfirm,
}: {
  kind: Exclude<ConfirmKind, null>
  slug: string
  personalName: string
  onPersonalNameChange: (next: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const copy =
    kind === 'default'
      ? {
          title: 'Replace track default?',
          body: `Every racer on /${slug} will hear this music on their next load. The previous default stays in version history and can be restored later.`,
          cta: 'Replace track default',
          variant: 'primary' as const,
        }
      : kind === 'mine'
        ? {
            title: 'Set your override?',
            body: `This will play only for you, only on /${slug}. Other players keep hearing the track default.`,
            cta: 'Save and apply for me',
            variant: 'primary' as const,
          }
        : {
            title: 'Save to library?',
            body: 'A copy is stored in your local library. No track is changed until you apply it from the library or save it as a default or override.',
            cta: 'Save to library',
            variant: 'secondary' as const,
          }
  const showName = kind !== 'default'
  return (
    <div style={sheetOverlay} onClick={onCancel}>
      <div
        style={sheet}
        role="dialog"
        aria-label={copy.title}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 style={sheetTitle}>{copy.title}</h3>
        <p style={sheetBody}>{copy.body}</p>
        {showName ? (
          <input
            aria-label="Tune name"
            value={personalName}
            onChange={(event) => onPersonalNameChange(event.target.value)}
            placeholder="tune name"
            style={input}
          />
        ) : null}
        <div style={sheetActions}>
          <MenuButton variant="ghost" onClick={onCancel}>
            Cancel
          </MenuButton>
          <MenuButton variant={copy.variant} onClick={onConfirm} click="confirm">
            {copy.cta}
          </MenuButton>
        </div>
      </div>
    </div>
  )
}

const topActions: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  flexWrap: 'wrap',
}
const bannerWrap: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  border: '1px solid',
  borderRadius: 10,
}
const bannerIcon: CSSProperties = {
  fontSize: 20,
  lineHeight: 1,
}
const bannerText: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  flex: 1,
}
const bannerLabel: CSSProperties = {
  fontWeight: 700,
  color: menuTheme.textPrimary,
}
const bannerAudience: CSSProperties = {
  fontSize: 12,
  color: menuTheme.textMuted,
}
const row: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  flexWrap: 'wrap',
}
const input: CSSProperties = {
  flex: 1,
  minWidth: 180,
  background: menuTheme.inputBg,
  color: menuTheme.textPrimary,
  border: `1px solid ${menuTheme.ghostBorder}`,
  borderRadius: 8,
  padding: '10px 12px',
  font: 'inherit',
}
const selectLabel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 12,
  color: menuTheme.textMuted,
}
const selectStyle: CSSProperties = {
  background: menuTheme.inputBg,
  color: menuTheme.textPrimary,
  border: `1px solid ${menuTheme.ghostBorder}`,
  borderRadius: 8,
  padding: '8px 10px',
  font: 'inherit',
}
const voiceBlock: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 12,
  border: `1px solid ${menuTheme.panelBorder}`,
  borderRadius: 8,
  background: 'rgba(255,255,255,0.03)',
}
const voiceHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  flexWrap: 'wrap',
}
const voiceTitle: CSSProperties = {
  textTransform: 'capitalize',
}
const voiceActions: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
}
function voiceChip(active: boolean, accentColor: string): CSSProperties {
  return {
    border: `1px solid ${active ? accentColor : menuTheme.ghostBorder}`,
    background: active ? accentColor : menuTheme.inputBg,
    color: active ? '#0c0c0c' : menuTheme.textMuted,
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }
}
const miniGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(120px, 180px) 1fr 1fr',
  gap: 12,
  alignItems: 'end',
}
const saveBar: CSSProperties = {
  position: 'sticky',
  bottom: 0,
  zIndex: 5,
  background: 'rgba(22,22,22,0.96)',
  backdropFilter: 'blur(6px)',
  padding: '12px 14px',
  borderRadius: 10,
  border: `1px solid ${menuTheme.panelBorder}`,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}
const saveActionBase: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '32px auto 1fr',
  alignItems: 'center',
  gap: 12,
  border: '1px solid',
  borderRadius: 10,
  padding: '10px 14px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
}
const saveIcon: CSSProperties = {
  fontSize: 18,
  textAlign: 'center',
}
const saveLabel: CSSProperties = {
  fontWeight: 700,
  fontSize: 14,
}
const saveAudience: CSSProperties = {
  fontSize: 12,
  color: menuTheme.textMuted,
  textAlign: 'right',
}
const saveAction = {
  default: {
    ...saveActionBase,
    background: menuTheme.accent,
    borderColor: menuTheme.accent,
    color: menuTheme.accentText,
  } satisfies CSSProperties,
  mine: {
    ...saveActionBase,
    background: 'rgba(110,192,124,0.12)',
    borderColor: '#6ec07c',
    color: menuTheme.textPrimary,
  } satisfies CSSProperties,
  library: {
    ...saveActionBase,
    background: 'transparent',
    borderColor: menuTheme.ghostBorder,
    color: menuTheme.textPrimary,
  } satisfies CSSProperties,
}
const sheetOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  zIndex: 500,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
}
const sheet: CSSProperties = {
  background: menuTheme.panelBg,
  border: `1px solid ${menuTheme.panelBorder}`,
  borderRadius: 14,
  padding: 22,
  maxWidth: 460,
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  boxShadow: menuTheme.panelShadow,
}
const sheetTitle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 800,
}
const sheetBody: CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: menuTheme.textHint,
  lineHeight: 1.5,
}
const sheetActions: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  flexWrap: 'wrap',
}
