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
import { TuneStepGrid } from './TuneStepGrid'
import {
  DEFAULT_TRACK_TUNE,
  TUNE_FINISH_STINGER_STEP_COUNT,
  TRACK_TUNE_SCALE_FLAVORS,
  TRACK_TUNE_VOICES,
  TRACK_TUNE_WAVES,
  TrackTuneSchema,
  generateTuneFromSeed,
  type TrackTune,
  type TuneFinishStingerPattern,
  type TuneVoice,
  type TuneWave,
} from '@/lib/tunes'
import { setActiveTune } from '@/game/music'
import {
  upsertMyTune,
  writeTuneOverride,
  type MyTuneEntry,
} from '@/lib/myTunes'

export function TuneEditor({
  slug,
  initialTune,
}: {
  slug: string
  initialTune: TrackTune | null
}) {
  const router = useRouter()
  const [tune, setTune] = useState<TrackTune>(() =>
    TrackTuneSchema.parse(initialTune ?? DEFAULT_TRACK_TUNE),
  )
  const [seed, setSeed] = useState(tune.seedWord ?? '')
  const [paintDegree, setPaintDegree] = useState(0)
  const [personalName, setPersonalName] = useState(
    tune.name ?? `/${slug} tune`,
  )
  const [status, setStatus] = useState('')
  const saveBody = useMemo(() => JSON.stringify(tune), [tune])

  function patch(next: Partial<TrackTune>): void {
    setTune((current) => TrackTuneSchema.parse({ ...current, ...next }))
  }

  function patchVoice(
    voice: TuneVoice,
    next: Partial<TrackTune['voices'][TuneVoice]>,
  ): void {
    setTune((current) =>
      TrackTuneSchema.parse({
        ...current,
        voices: {
          ...current.voices,
          [voice]: { ...current.voices[voice], ...next },
        },
      }),
    )
  }

  function patchAutomation(
    next: Partial<TrackTune['automation']>,
  ): void {
    setTune((current) =>
      TrackTuneSchema.parse({
        ...current,
        automation: { ...current.automation, ...next },
      }),
    )
  }

  function setFinishStinger(): void {
    const seedPhrase = [0, 2, 4, 7, 4, 2, 0, null]
    const phrase: TuneFinishStingerPattern = Array.from(
      { length: TUNE_FINISH_STINGER_STEP_COUNT },
      (_, index) => seedPhrase[index] ?? null,
    )
    patchAutomation({ finishStinger: phrase })
  }

  async function saveDefault(): Promise<void> {
    setStatus('Saving default tune...')
    const res = await fetch(`/api/track/${encodeURIComponent(slug)}/tune`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: saveBody,
    })
    if (!res.ok) {
      setStatus('Default tune save failed.')
      return
    }
    writeTuneOverride(slug, { source: 'default' })
    setStatus('Default tune saved.')
  }

  function savePersonal(): void {
    const now = Date.now()
    const entry: MyTuneEntry = {
      id: crypto.randomUUID(),
      name: personalName.trim() || `/${slug} tune`,
      originSlug: slug,
      tune,
      createdAt: now,
      updatedAt: now,
    }
    upsertMyTune(entry)
    writeTuneOverride(slug, { source: 'mine', id: entry.id })
    setStatus('Personal tune saved and applied.')
  }

  function applyForMe(): void {
    setActiveTune(tune)
    const now = Date.now()
    const entry: MyTuneEntry = {
      id: crypto.randomUUID(),
      name: personalName.trim() || `/${slug} tune`,
      originSlug: slug,
      tune,
      createdAt: now,
      updatedAt: now,
    }
    upsertMyTune(entry)
    writeTuneOverride(slug, { source: 'mine', id: entry.id })
    setStatus('Tune applied for this browser.')
  }

  function rollSeed(): void {
    const word = seed.trim() || `track-${slug}`
    const next = generateTuneFromSeed(word)
    setTune(next)
    setPersonalName(next.name ?? `${word} tune`)
    setStatus(`Seeded from ${word}.`)
  }

  return (
    <MenuOverlay zIndex={300} onBack={() => router.push(`/${slug}`)}>
      <MenuPanel width="wide">
        <MenuHeader title={`Tune for /${slug}`} onClose={() => router.push(`/${slug}`)} />

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
          <MenuHint>Same word, same starting tune.</MenuHint>
        </MenuSection>

        <MenuSection title="Globals">
          <MenuSlider
            label="Tempo"
            value={tune.bpm}
            min={60}
            max={220}
            step={1}
            format={(v) => `${Math.round(v)} BPM`}
            onChange={(bpm) => patch({ bpm: Math.round(bpm) })}
          />
          <MenuSlider
            label="Root"
            value={tune.rootMidi}
            min={36}
            max={84}
            step={1}
            format={(v) => `MIDI ${Math.round(v)}`}
            onChange={(rootMidi) => patch({ rootMidi: Math.round(rootMidi) })}
          />
          <label style={label}>
            <span>Scale</span>
            <select
              value={tune.scale}
              onChange={(event) =>
                patch({ scale: event.target.value as TrackTune['scale'] })
              }
              style={select}
            >
              {TRACK_TUNE_SCALE_FLAVORS.map((scale) => (
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
          {TRACK_TUNE_VOICES.map((voiceName) => {
            const voice = tune.voices[voiceName]
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
                          wave: event.target.value as TuneWave,
                        })
                      }
                      style={select}
                    >
                      {TRACK_TUNE_WAVES.map((wave) => (
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
                <TuneStepGrid
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
              value={tune.drums.kick}
              onChange={(kick) => patch({ drums: { ...tune.drums, kick } })}
            />
            <MenuToggle
              label="Snare"
              value={tune.drums.snare}
              onChange={(snare) => patch({ drums: { ...tune.drums, snare } })}
            />
            <MenuToggle
              label="Hat"
              value={tune.drums.hat}
              onChange={(hat) => patch({ drums: { ...tune.drums, hat } })}
            />
          </div>
          <MenuSlider
            label="Density"
            value={tune.drums.density}
            onChange={(density) => patch({ drums: { ...tune.drums, density } })}
          />
        </MenuSection>

        <MenuSection title="Automation">
          <MenuSlider
            label="Tempo low"
            value={tune.automation.tempoMinFactor}
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
            value={tune.automation.tempoMaxFactor}
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
            value={tune.automation.perLapSemitones}
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
              value={tune.automation.offTrackScale ?? 'none'}
              onChange={(event) =>
                patchAutomation({
                  offTrackScale:
                    event.target.value === 'none'
                      ? null
                      : (event.target.value as TrackTune['scale']),
                })
              }
              style={select}
            >
              <option value="none">none</option>
              {TRACK_TUNE_SCALE_FLAVORS.map((scale) => (
                <option key={scale} value={scale}>
                  {scale}
                </option>
              ))}
            </select>
          </label>
          <MenuSlider
            label="Off-track duck"
            value={tune.automation.offTrackDuck}
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
                  {tune.automation.finishStinger ? 'Reset' : 'Add'}
                </MenuButton>
                <MenuButton
                  fullWidth={false}
                  disabled={!tune.automation.finishStinger}
                  onClick={() => patchAutomation({ finishStinger: null })}
                >
                  Clear
                </MenuButton>
              </div>
            </div>
            {tune.automation.finishStinger ? (
              <TuneStepGrid
                label="finish stinger"
                steps={tune.automation.finishStinger}
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
            aria-label="Personal tune name"
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
