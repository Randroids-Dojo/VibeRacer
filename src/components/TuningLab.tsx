'use client'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
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
import { MenuPageShell } from './MenuPageShell'
import {
  MenuShellAction,
  MenuStartButton,
  menuTheme,
} from './MenuUI'
import { TuningEditor } from './TuningEditor'
import { TuningSavedList } from './TuningSavedList'
import { TuningSession } from './TuningSession'
import { TuningHistoryList } from './TuningHistoryList'

type View = 'home' | 'session' | 'manual' | 'list' | 'import' | 'history'

export function TuningLab() {
  const { settings, hydrated: controlsHydrated } = useControlSettings()
  const [view, setView] = useState<View>('home')
  const [items, setItems] = useState<SavedTuning[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [importText, setImportText] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  // When set, the manual view preloads from this entry and saves back to
  // the same id. Cleared on entry into the home/list/import/history views
  // and after a save so the next visit to manual starts from a clean slate.
  const [editingTuning, setEditingTuning] = useState<SavedTuning | null>(null)
  // Where Back / save returns to: 'home' when the player entered manual
  // from the home menu, 'list' when they entered via Edit on a saved row.
  const [manualReturnView, setManualReturnView] = useState<View>('home')
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

  const handleManualSaved = useCallback((saved: SavedTuning) => {
    upsertTuning(saved)
    persistLabLastLoaded(saved.params)
    setItems(readSavedTunings())
    recordTuningChange({
      next: saved.params,
      source: 'savedApplied',
      label: saved.name,
      slug: TUNING_LAB_SYNTHETIC_SLUG,
      immediate: true,
    })
    flashToast(`Saved "${saved.name}"`)
    setEditingTuning(null)
    setManualReturnView('home')
    setView('list')
  }, [recordTuningChange])

  function startEdit(t: SavedTuning) {
    setEditingTuning(t)
    setManualReturnView('list')
    setView('manual')
  }

  function leaveManual() {
    const target = manualReturnView
    setEditingTuning(null)
    setManualReturnView('home')
    setView(target)
  }

  function applyToNextRace(t: SavedTuning) {
    applySavedAsLastLoaded(t)
    recordTuningChange({
      next: t.params,
      source: 'savedApplied',
      label: t.name,
      slug: TUNING_LAB_SYNTHETIC_SLUG,
      immediate: true,
    })
    flashToast(`"${t.name}" is now your active setup`)
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

  async function shareTuning(t: SavedTuning) {
    const text = JSON.stringify(t, null, 2)
    const title = `VibeRacer tuning: ${t.name}`
    // Prefer the native share sheet (mobile + supporting desktop browsers).
    // Fall back to copying the JSON to the clipboard so the player can still
    // paste it into a DM. A user-cancelled share also falls through silently.
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function'
    ) {
      try {
        await navigator.share({ title, text })
        flashToast(`Shared "${t.name}"`)
        return
      } catch (err) {
        if ((err as DOMException | undefined)?.name === 'AbortError') return
        // Any other failure: drop to the clipboard fallback.
      }
    }
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

  // Session mode hands the screen to TuningSession (which has its own
  // chrome). Every other view sits inside the shared MenuPageShell so the
  // Tuning Lab matches Free Race / Derby / Drag / Tour / Settings: blue
  // page background, dark-translucent header strip with the title +
  // CLOSE pill, and a dark-translucent body panel for the content.
  if (view === 'session') {
    return (
      <div style={sessionShellStyle}>
        <TuningSession
          initialParams={initialParams}
          initialControlType={initialControlType}
          initialTrackTags={[]}
          onSaved={handleSaved}
          onDiscard={handleDiscard}
        />
        {toast ? <div style={toastStyle}>{toast}</div> : null}
      </div>
    )
  }

  return (
    <MenuPageShell
      title="Tuning Lab"
      blurb="Drive a short test loop, rate the feel, and have the lab suggest new params. Save what works."
      closeHref="/"
      width="narrow"
    >
      {view === 'home' ? (
        <>
          <MenuStartButton
            onClick={() => setView('session')}
            disabled={!hydrated || !controlsHydrated}
          >
            Start a tuning session
          </MenuStartButton>
          <MenuShellAction
            onClick={() => {
              setEditingTuning(null)
              setManualReturnView('home')
              setView('manual')
            }}
            disabled={!hydrated || !controlsHydrated}
          >
            Build tuning manually (sliders)
          </MenuShellAction>
          <MenuShellAction onClick={() => setView('list')}>
            Saved tunings ({items.length})
          </MenuShellAction>
          <MenuShellAction onClick={() => setView('history')}>
            Recent changes ({tuningHistory.length})
          </MenuShellAction>
          <MenuShellAction onClick={() => setView('import')}>
            Import JSON
          </MenuShellAction>
          <button
            type="button"
            onClick={copySessionToClipboard}
            style={tertiaryBtn}
          >
            Copy all saved tunings to clipboard
          </button>
        </>
      ) : null}

      {view === 'list' ? (
        <>
          <TuningSavedList
            items={items}
            onApply={applyToNextRace}
            onShare={shareTuning}
            onEdit={startEdit}
            onDelete={onDelete}
            onRename={onRename}
          />
          <MenuShellAction onClick={() => setView('home')}>
            Back
          </MenuShellAction>
        </>
      ) : null}

      {view === 'manual' ? (
        <>
          <h2 style={cardTitle}>
            {editingTuning ? `Edit "${editingTuning.name}"` : 'Build tuning manually'}
          </h2>
          <p style={cardCopy}>
            {editingTuning
              ? 'Drag the sliders to retune this setup. Saving overwrites the existing entry.'
              : 'Drag the sliders to dial in a setup, then save it to your library. Skips the test loop and questionnaire.'}
          </p>
          <TuningEditor
            params={initialParams}
            initialControlType={initialControlType}
            editing={editingTuning}
            onSaved={handleManualSaved}
            onClose={leaveManual}
          />
        </>
      ) : null}

      {view === 'history' ? (
        <>
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
          <MenuShellAction onClick={() => setView('home')}>
            Back
          </MenuShellAction>
        </>
      ) : null}

      {view === 'import' ? (
        <>
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
            <MenuShellAction onClick={() => setView('home')}>
              Back
            </MenuShellAction>
            <MenuStartButton onClick={tryParseImport}>Parse</MenuStartButton>
          </div>
          {importResult ? (
            importResult.kind === 'error' ? (
              <div style={importError}>Could not parse: {importResult.reason}</div>
            ) : importResult.kind === 'tuning' ? (
              <div style={importPreview}>
                <div>Tuning: {importResult.saved.name}</div>
                <MenuStartButton onClick={commitImport}>
                  Save tuning
                </MenuStartButton>
              </div>
            ) : (
              <div style={importPreview}>
                <div>
                  Session: {importResult.session.rounds.length} rounds, control{' '}
                  {importResult.session.controlType}
                </div>
                <MenuStartButton onClick={commitImport}>
                  Save final round
                </MenuStartButton>
              </div>
            )
          ) : null}
        </>
      ) : null}

      {toast ? <div style={toastStyle}>{toast}</div> : null}
    </MenuPageShell>
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

// Session view skips MenuPageShell because TuningSession provides its
// own chrome (track HUD, sliders, recorder). Keep the dark stage so the
// recorder reads correctly during the test loop.
const sessionShellStyle: CSSProperties = {
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
  background: 'linear-gradient(180deg, #1f2330 0%, #0c1018 100%)',
}
const cardTitle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: 1,
  color: 'white',
}
const cardCopy: CSSProperties = {
  margin: 0,
  fontSize: 13,
  opacity: 0.85,
  lineHeight: 1.4,
  color: 'white',
}
const tertiaryBtn: CSSProperties = {
  background: 'transparent',
  color: 'rgba(255,255,255,0.65)',
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
  alignItems: 'stretch',
  gap: 8,
  marginTop: 6,
}
const importField: CSSProperties = {
  background: '#fffbe8',
  color: menuTheme.cardText,
  border: `2px solid ${menuTheme.cardBorder}`,
  borderRadius: 12,
  padding: 10,
  fontFamily: 'monospace',
  fontSize: 12,
  resize: 'vertical',
  minHeight: 120,
  fontWeight: 600,
}
const importPreview: CSSProperties = {
  background: menuTheme.cardBg,
  color: menuTheme.cardText,
  border: `2px solid ${menuTheme.cardBorder}`,
  borderRadius: 12,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  boxShadow: `0 3px 0 ${menuTheme.cardShadow}`,
}
const importError: CSSProperties = {
  background: '#ffd9d9',
  border: `2px solid ${menuTheme.ctaShadow}`,
  color: menuTheme.ctaShadow,
  borderRadius: 12,
  padding: 10,
  fontSize: 13,
  fontWeight: 700,
}
const toastStyle: CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: 24,
  transform: 'translateX(-50%)',
  background: menuTheme.cardBg,
  color: menuTheme.cardText,
  border: `2px solid ${menuTheme.cardBorder}`,
  padding: '10px 16px',
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 700,
  zIndex: 1000,
  boxShadow: `0 4px 0 ${menuTheme.cardShadow}, 0 8px 30px rgba(0,0,0,0.35)`,
}
