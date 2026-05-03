'use client'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import Link from 'next/link'
import {
  TUNING_LAB_KEY,
  TUNING_LAB_SYNTHETIC_SLUG,
  applySavedAsLastLoaded,
  buildExportPayload,
  persistLabLastLoaded,
  cloneDefaultParams,
  deleteTuning as deleteTuningStore,
  parseImportedJson,
  readSavedTunings,
  upsertTuning,
  type ControlType,
  type ImportResult,
  type RoundLog,
  type SavedTuning,
  type TrackTag,
} from '@/lib/tuningLab'
import { resolveStartingTuning } from '@/lib/tuningSettings'
import { useControlSettings } from '@/hooks/useControlSettings'
import { useTuningRecorder } from '@/hooks/useTuningRecorder'
import {
  applyTuningHistoryEntry,
  type TuningHistoryEntry,
} from '@/lib/tuningHistory'
import { TuningSavedList } from './TuningSavedList'
import { TuningSession } from './TuningSession'
import { TuningHistoryList } from './TuningHistoryList'

type View = 'home' | 'session' | 'list' | 'import' | 'history'

export function TuningLab() {
  const { settings, hydrated: controlsHydrated } = useControlSettings()
  const [view, setView] = useState<View>('home')
  const [items, setItems] = useState<SavedTuning[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [importText, setImportText] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const { history: tuningHistory, record: recordTuningChange } =
    useTuningRecorder()

  useEffect(() => {
    setItems(readSavedTunings())
    setHydrated(true)
  }, [])

  // Pick up saved-tuning writes from any source (this tab, another tab).
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== TUNING_LAB_KEY) return
      setItems(readSavedTunings())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const initialControlType: ControlType = useMemo(() => {
    if (!controlsHydrated) return 'keyboard'
    if (settings.touchMode === 'dual') return 'touch_dual'
    if (settings.touchMode === 'single') return 'touch_single'
    return 'keyboard'
  }, [controlsHydrated, settings.touchMode])

  const initialParams = useMemo(() => {
    if (!hydrated) return cloneDefaultParams()
    return resolveStartingTuning('__lab__')
    // Only depend on hydrated since storage reads are user-action triggered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  function flashToast(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1800)
  }

  const handleSaved = useCallback((saved: SavedTuning, _rounds: RoundLog[]) => {
    setItems(readSavedTunings())
    flashToast(`Saved "${saved.name}"`)
    setView('list')
  }, [])

  const handleDiscard = useCallback((_rounds: RoundLog[]) => {
    setItems(readSavedTunings())
    setView('home')
  }, [])

  function applyToNextRace(t: SavedTuning) {
    applySavedAsLastLoaded(t)
    recordTuningChange({
      next: t.params,
      source: 'savedApplied',
      label: t.name,
      slug: TUNING_LAB_SYNTHETIC_SLUG,
      immediate: true,
    })
    flashToast(`"${t.name}" will load on your next race`)
  }

  function applyHistoryEntryFromLab(entry: TuningHistoryEntry) {
    // Inside the lab there is no live race, so the apply path is the same as
    // the lab's "carry forward to next race" hook: write to the synthetic
    // __lab__ slug and the lastLoaded key. The next race the player opens
    // picks up these params.
    applyTuningHistoryEntry(entry, persistLabLastLoaded)
    recordTuningChange({
      next: entry.params,
      source: 'historyRevert',
      label: 'Reverted from history',
      slug: TUNING_LAB_SYNTHETIC_SLUG,
      immediate: true,
    })
    flashToast('Tuning reverted to next race')
  }

  async function copyTuningToClipboard(t: SavedTuning) {
    const text = JSON.stringify(t, null, 2)
    await safeClipboardWrite(text)
    flashToast('Tuning JSON copied to clipboard')
  }

  async function copySessionToClipboard() {
    // Used from the home view to dump the most recent session list. We export
    // every saved tuning together so the user can paste a snapshot into an LLM.
    const payload = buildExportPayload({
      rounds: [],
      controlType: initialControlType,
      trackTags: [],
    })
    const dump = {
      ...payload,
      saved: null,
      savedList: items,
    }
    await safeClipboardWrite(JSON.stringify(dump, null, 2))
    flashToast('Saved-tunings snapshot copied to clipboard')
  }

  function onDelete(id: string) {
    deleteTuningStore(id)
    setItems(readSavedTunings())
  }

  function onRename(id: string, name: string) {
    const target = items.find((t) => t.id === id)
    if (!target) return
    const updated: SavedTuning = {
      ...target,
      name,
      updatedAt: new Date().toISOString(),
    }
    upsertTuning(updated)
    setItems(readSavedTunings())
  }

  function tryParseImport() {
    let parsed: unknown
    try {
      parsed = JSON.parse(importText)
    } catch {
      setImportResult({ kind: 'error', reason: 'invalid JSON' })
      return
    }
    setImportResult(parseImportedJson(parsed))
  }

  function commitImport() {
    if (!importResult) return
    if (importResult.kind === 'tuning') {
      upsertTuning(importResult.saved)
      setItems(readSavedTunings())
      recordTuningChange({
        next: importResult.saved.params,
        source: 'imported',
        label: importResult.saved.name,
        slug: TUNING_LAB_SYNTHETIC_SLUG,
        immediate: true,
      })
      flashToast(`Imported "${importResult.saved.name}"`)
      setImportText('')
      setImportResult(null)
      setView('list')
      return
    }
    if (importResult.kind === 'session') {
      const last = importResult.session.rounds.at(-1)
      if (!last) {
        flashToast('Session has no rounds to save')
        return
      }
      const id = `t-import-${Date.now()}`
      upsertTuning({
        id,
        name: 'Imported session',
        params: last.params,
        ratings: last.ratings,
        controlType: importResult.session.controlType,
        trackTags: importResult.session.trackTags,
        lapTimeMs: last.lapTimeMs,
        notes: last.notes,
        createdAt: importResult.session.timestamp,
        updatedAt: new Date().toISOString(),
      })
      setItems(readSavedTunings())
      recordTuningChange({
        next: last.params,
        source: 'imported',
        label: 'Imported session',
        slug: TUNING_LAB_SYNTHETIC_SLUG,
        immediate: true,
      })
      flashToast('Imported session saved')
      setImportText('')
      setImportResult(null)
      setView('list')
    }
  }

  return (
    <div style={shell}>
      {view !== 'session' ? (
        <header style={shellHeader}>
          <Link href="/" style={backLink}>
            ← Back to title
          </Link>
          <h1 style={shellTitle}>Tuning Lab</h1>
          <p style={shellTag}>
            Drive a short test loop, rate the feel, and have the lab suggest
            new params. Save what works.
          </p>
        </header>
      ) : null}

      {view === 'home' ? (
        <div style={card}>
          <button
            onClick={() => setView('session')}
            style={primaryBtn}
            disabled={!hydrated || !controlsHydrated}
          >
            Start a tuning session
          </button>
          <button onClick={() => setView('list')} style={secondaryBtn}>
            Saved tunings ({items.length})
          </button>
          <button onClick={() => setView('history')} style={secondaryBtn}>
            Recent changes ({tuningHistory.length})
          </button>
          <button onClick={() => setView('import')} style={secondaryBtn}>
            Import JSON
          </button>
          <button onClick={copySessionToClipboard} style={tertiaryBtn}>
            Copy all saved tunings to clipboard
          </button>
        </div>
      ) : null}

      {view === 'session' ? (
        <TuningSession
          initialParams={initialParams}
          initialControlType={initialControlType}
          initialTrackTags={[]}
          onSaved={handleSaved}
          onDiscard={handleDiscard}
        />
      ) : null}

      {view === 'list' ? (
        <div style={card}>
          <TuningSavedList
            items={items}
            onApply={applyToNextRace}
            onExport={copyTuningToClipboard}
            onDelete={onDelete}
            onRename={onRename}
          />
          <div style={ctaRow}>
            <button onClick={() => setView('home')} style={secondaryBtn}>
              Back
            </button>
          </div>
        </div>
      ) : null}

      {view === 'history' ? (
        <div style={card}>
          <h2 style={cardTitle}>Recent changes</h2>
          <p style={cardCopy}>
            Every tuning change you make lands here. Apply any prior snapshot
            to roll the live car back. Slider drags coalesce into one entry,
            and discrete actions (apply, reset, accept recommendation) each
            land as their own row.
          </p>
          <TuningHistoryList
            entries={tuningHistory}
            liveParams={initialParams}
            onApply={applyHistoryEntryFromLab}
            scopeSlug={null}
          />
          <div style={ctaRow}>
            <button onClick={() => setView('home')} style={secondaryBtn}>
              Back
            </button>
          </div>
        </div>
      ) : null}

      {view === 'import' ? (
        <div style={card}>
          <h2 style={cardTitle}>Import JSON</h2>
          <p style={cardCopy}>
            Paste a tuning or a full session log. Sessions import the final
            round as a saved tuning.
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste JSON here"
            style={importField}
            rows={8}
          />
          <div style={ctaRow}>
            <button onClick={() => setView('home')} style={secondaryBtn}>
              Back
            </button>
            <button onClick={tryParseImport} style={primaryBtn}>
              Parse
            </button>
          </div>
          {importResult ? (
            importResult.kind === 'error' ? (
              <div style={importError}>Could not parse: {importResult.reason}</div>
            ) : importResult.kind === 'tuning' ? (
              <div style={importPreview}>
                <div>Tuning: {importResult.saved.name}</div>
                <button onClick={commitImport} style={primaryBtn}>
                  Save tuning
                </button>
              </div>
            ) : (
              <div style={importPreview}>
                <div>
                  Session: {importResult.session.rounds.length} rounds, control{' '}
                  {importResult.session.controlType}
                </div>
                <button onClick={commitImport} style={primaryBtn}>
                  Save final round
                </button>
              </div>
            )
          ) : null}
        </div>
      ) : null}

      {toast ? <div style={toastStyle}>{toast}</div> : null}
    </div>
  )
}

async function safeClipboardWrite(text: string) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // fall through to manual copy
  }
  // Fallback: hidden textarea + execCommand. Older browsers and some
  // permissions setups need this path.
  if (typeof document === 'undefined') return
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  try {
    document.execCommand('copy')
  } catch {
    // ignore
  }
  document.body.removeChild(ta)
}

const shell: CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: 16,
  gap: 16,
  fontFamily: 'system-ui, sans-serif',
  color: 'white',
  background:
    'linear-gradient(180deg, #1f2330 0%, #0c1018 100%)',
}
const shellHeader: CSSProperties = {
  width: '100%',
  maxWidth: 520,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}
const shellTitle: CSSProperties = {
  margin: 0,
  fontSize: 30,
  fontWeight: 800,
  letterSpacing: 1,
  color: '#fff7b0',
  WebkitTextStroke: '1.5px #1b1b1b',
}
const shellTag: CSSProperties = {
  margin: 0,
  fontSize: 13,
  opacity: 0.8,
  lineHeight: 1.4,
}
const backLink: CSSProperties = {
  fontSize: 12,
  letterSpacing: 1,
  color: '#cfcfcf',
  textDecoration: 'none',
  alignSelf: 'flex-start',
}
const card: CSSProperties = {
  width: '100%',
  maxWidth: 520,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 16,
  background: '#161616',
  border: '1px solid #2a2a2a',
  borderRadius: 12,
}
const cardTitle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: 1,
}
const cardCopy: CSSProperties = {
  margin: 0,
  fontSize: 13,
  opacity: 0.8,
  lineHeight: 1.4,
}
const primaryBtn: CSSProperties = {
  background: '#ff6b35',
  color: 'white',
  border: 'none',
  borderRadius: 10,
  padding: '12px 18px',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const secondaryBtn: CSSProperties = {
  background: 'transparent',
  color: '#cfcfcf',
  border: '1px solid #3a3a3a',
  borderRadius: 10,
  padding: '10px 16px',
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const tertiaryBtn: CSSProperties = {
  background: 'transparent',
  color: '#9aa0a6',
  border: 'none',
  borderRadius: 6,
  padding: '8px',
  fontSize: 12,
  textDecoration: 'underline',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const ctaRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  marginTop: 6,
}
const importField: CSSProperties = {
  background: '#0e0e0e',
  color: 'white',
  border: '1px solid #3a3a3a',
  borderRadius: 8,
  padding: 10,
  fontFamily: 'monospace',
  fontSize: 12,
  resize: 'vertical',
  minHeight: 120,
}
const importPreview: CSSProperties = {
  background: '#0e0e0e',
  border: '1px solid #2a2a2a',
  borderRadius: 8,
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  fontSize: 13,
}
const importError: CSSProperties = {
  background: '#3a1d1d',
  border: '1px solid #553030',
  color: '#ff9090',
  borderRadius: 8,
  padding: 10,
  fontSize: 13,
}
const toastStyle: CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: 24,
  transform: 'translateX(-50%)',
  background: 'rgba(0,0,0,0.85)',
  color: 'white',
  padding: '10px 16px',
  borderRadius: 999,
  fontSize: 13,
  zIndex: 1000,
  boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
}
