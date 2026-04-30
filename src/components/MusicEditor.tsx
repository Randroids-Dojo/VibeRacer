'use client'
import { useMemo, useState, type CSSProperties } from 'react'
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
import {
  DEFAULT_TRACK_MUSIC,
  MUSIC_FINISH_STINGER_STEP_COUNT,
  TRACK_MUSIC_SCALE_FLAVORS,
  TRACK_MUSIC_VOICES,
  TRACK_MUSIC_WAVES,
  TrackMusicSchema,
  generateMusicFromSeed,
  type TrackMusic,
  type MusicFinishStingerPattern,
  type MusicVoice,
  type MusicWave,
} from '@/lib/trackMusic'
import { setActiveMusic } from '@/game/music'
import {
  upsertMyMusic,
  writeMusicOverride,
  type MyMusicEntry,
} from '@/lib/myMusic'

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
  const [seed, setSeed] = useState(music.seedWord ?? '')
  const [paintDegree, setPaintDegree] = useState(0)
  const [personalName, setPersonalName] = useState(
    music.name ?? `/${slug} music`,
  )
  const [status, setStatus] = useState('')
  const saveBody = useMemo(() => JSON.stringify(music), [music])

  function patch(next: Partial<TrackMusic>): void {
    setMusic((current) => TrackMusicSchema.parse({ ...current, ...next }))
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
  }

  function setFinishStinger(): void {
    const seedPhrase = [0, 2, 4, 7, 4, 2, 0, null]
    const phrase: MusicFinishStingerPattern = Array.from(
      { length: MUSIC_FINISH_STINGER_STEP_COUNT },
      (_, index) => seedPhrase[index] ?? null,
    )
    patchAutomation({ finishStinger: phrase })
  }

  async function saveDefault(): Promise<void> {
    setStatus('Saving default music...')
    const res = await fetch(`/api/track/${encodeURIComponent(slug)}/music`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: saveBody,
    })
    if (!res.ok) {
      setStatus('Default music save failed.')
      return
    }
    writeMusicOverride(slug, { source: 'default' })
    setStatus('Default music saved.')
  }

  function savePersonal(): void {
    const now = Date.now()
    const entry: MyMusicEntry = {
      id: crypto.randomUUID(),
      name: personalName.trim() || `/${slug} music`,
      originSlug: slug,
      music,
      createdAt: now,
      updatedAt: now,
    }
    upsertMyMusic(entry)
    writeMusicOverride(slug, { source: 'mine', id: entry.id })
    setStatus('Personal music saved and applied.')
  }

  function applyForMe(): void {
    setActiveMusic(music)
    const now = Date.now()
    const entry: MyMusicEntry = {
      id: crypto.randomUUID(),
      name: personalName.trim() || `/${slug} music`,
      originSlug: slug,
      music,
      createdAt: now,
      updatedAt: now,
    }
    upsertMyMusic(entry)
    writeMusicOverride(slug, { source: 'mine', id: entry.id })
    setStatus('Music applied for this browser.')
  }

  function rollSeed(): void {
    const word = seed.trim() || `track-${slug}`
    const next = generateMusicFromSeed(word)
    setMusic(next)
    setPersonalName(next.name ?? `${word} music`)
    setStatus(`Seeded from ${word}.`)
  }

  return (
    <MenuOverlay zIndex={300}>
      <MenuPanel width="wide">
        <MenuHeader title={`Music for /${slug}`} onClose={() => router.push(`/${slug}`)} />

        <MenuSection title="Seed">
          <div style={row}>
            <input
              aria-label="Seed word"
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              placeholder="seed word"
              style={input}
            />
            <MenuButton fullWidth={false} onClick={rollSeed}>
              Roll
            </MenuButton>
          </div>
          <MenuHint>Same word, same starting music.</MenuHint>
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
          <label style={label}>
            <span>Scale</span>
            <select
              value={music.scale}
              onChange={(event) =>
                patch({ scale: event.target.value as TrackMusic['scale'] })
              }
              style={select}
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
        </MenuSection>

        <MenuSection title="Voices">
          {TRACK_MUSIC_VOICES.map((voiceName) => {
            const voice = music.voices[voiceName]
            return (
              <div key={voiceName} style={voiceBlock}>
                <div style={voiceHeader}>
                  <strong>{voiceName}</strong>
                  <MenuToggle
                    value={voice.enabled}
                    onChange={(enabled) => patchVoice(voiceName, { enabled })}
                  />
                </div>
                <div style={miniGrid}>
                  <label style={label}>
                    <span>Wave</span>
                    <select
                      value={voice.wave}
                      onChange={(event) =>
                        patchVoice(voiceName, {
                          wave: event.target.value as MusicWave,
                        })
                      }
                      style={select}
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
          <label style={label}>
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
              style={select}
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
              <strong>Finish stinger</strong>
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

        <MenuSection title="Save">
          <input
            aria-label="Personal music name"
            value={personalName}
            onChange={(event) => setPersonalName(event.target.value)}
            style={input}
          />
          <div style={row}>
            <MenuButton onClick={() => void saveDefault()}>
              Save as default
            </MenuButton>
            <MenuButton onClick={savePersonal}>Save personal</MenuButton>
            <MenuButton variant="primary" click="confirm" onClick={applyForMe}>
              Apply for me
            </MenuButton>
          </div>
          {status ? <MenuHint>{status}</MenuHint> : null}
        </MenuSection>
      </MenuPanel>
    </MenuOverlay>
  )
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
const label: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 12,
  color: menuTheme.textMuted,
}
const select: CSSProperties = {
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
  textTransform: 'capitalize',
}
const miniGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(120px, 180px) 1fr 1fr',
  gap: 12,
  alignItems: 'end',
}
