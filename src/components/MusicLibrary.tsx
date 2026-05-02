'use client'
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import { MenuButton, menuTheme } from './MenuUI'
import {
  KNOWN_MUSIC_EVENT,
  MUSIC_OVERRIDES_EVENT,
  MY_MUSIC_EVENT,
  deleteMyMusic,
  readAllKnownMusic,
  readMusicOverride,
  readMyMusic,
  writeMusicOverride,
  type MusicOverride,
  type MyMusicEntry,
} from '@/lib/myMusic'
import { setActiveMusic } from '@/game/music'
import type { TrackMusic } from '@/lib/trackMusic'

export type LibraryFilter = 'all' | 'mine' | 'this' | 'visited' | 'defaults'

const FILTERS: Array<{ value: LibraryFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'this', label: 'This slug' },
  { value: 'visited', label: 'Visited' },
  { value: 'defaults', label: 'Defaults' },
]

export interface LibraryItem {
  key: string
  source: 'mine' | 'default'
  name: string
  music: TrackMusic
  originSlug?: string
  myEntryId?: string
  defaultSlug?: string
  updatedAt?: number
}

/**
 * Build the unified card list shown by the Library drawer. Defaults are
 * tagged by their slug so the drawer can apply them by writing a "visited"
 * override; personal entries are tagged with their library id so the drawer
 * can write a "mine" override.
 */
export function buildLibraryItems(
  myMusic: MyMusicEntry[],
  knownMusic: Record<string, TrackMusic>,
  filter: LibraryFilter,
  currentSlug: string,
): LibraryItem[] {
  const items: LibraryItem[] = []

  if (filter === 'all' || filter === 'mine' || filter === 'this') {
    for (const entry of myMusic) {
      if (filter === 'this' && entry.originSlug !== currentSlug) continue
      items.push({
        key: `mine:${entry.id}`,
        source: 'mine',
        name: entry.name,
        music: entry.music,
        originSlug: entry.originSlug,
        myEntryId: entry.id,
        updatedAt: entry.updatedAt,
      })
    }
  }

  if (
    filter === 'all' ||
    filter === 'visited' ||
    filter === 'defaults' ||
    filter === 'this'
  ) {
    for (const [slug, music] of Object.entries(knownMusic)) {
      if (filter === 'this' && slug !== currentSlug) continue
      items.push({
        key: `default:${slug}`,
        source: 'default',
        name: music.name ?? `/${slug} default`,
        music,
        originSlug: slug,
        defaultSlug: slug,
      })
    }
  }

  items.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  return items
}

/**
 * Render a tiny 16-dot strip representing a tune's bass step pattern. Used
 * inside library cards as a glanceable signature. Active steps light up in
 * the accent color; rests are a muted dot. No labels, just the rhythm shape.
 */
function MiniStepStrip({ music }: { music: TrackMusic }) {
  return (
    <div style={miniStrip} aria-hidden>
      {music.voices.bass.steps.map((step, index) => (
        <span
          key={index}
          style={{
            ...miniDot,
            background:
              step !== null ? menuTheme.accent : menuTheme.ghostBorder,
            opacity: step !== null ? 1 : 0.5,
          }}
        />
      ))}
    </div>
  )
}

export function MusicLibrary({
  open,
  onClose,
  onLoad,
  slug,
  defaultMusic,
}: {
  open: boolean
  onClose: () => void
  onLoad: (music: TrackMusic, source: { kind: 'mine' | 'default'; id?: string; slug?: string }) => void
  slug: string
  defaultMusic: TrackMusic | null
}) {
  const [myMusic, setMyMusic] = useState<MyMusicEntry[]>([])
  const [knownMusic, setKnownMusic] = useState<Record<string, TrackMusic>>({})
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [override, setOverride] = useState<MusicOverride>(() =>
    readMusicOverride(slug),
  )

  useEffect(() => {
    if (!open) return
    function refresh() {
      setMyMusic(readMyMusic())
      setKnownMusic(readAllKnownMusic())
      setOverride(readMusicOverride(slug))
    }
    refresh()
    window.addEventListener(MY_MUSIC_EVENT, refresh)
    window.addEventListener(KNOWN_MUSIC_EVENT, refresh)
    window.addEventListener(MUSIC_OVERRIDES_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(MY_MUSIC_EVENT, refresh)
      window.removeEventListener(KNOWN_MUSIC_EVENT, refresh)
      window.removeEventListener(MUSIC_OVERRIDES_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [open, slug])

  const items = useMemo(
    () => buildLibraryItems(myMusic, knownMusic, filter, slug),
    [myMusic, knownMusic, filter, slug],
  )

  function isActive(item: LibraryItem): boolean {
    if (item.source === 'mine')
      return override.source === 'mine' && override.id === item.myEntryId
    return (
      override.source === 'visited' && override.slug === item.defaultSlug
    ) ||
      (override.source === 'default' && item.defaultSlug === slug)
  }

  function audition(item: LibraryItem): void {
    setActiveMusic(item.music)
  }

  function loadIntoEditor(item: LibraryItem): void {
    onLoad(item.music, {
      kind: item.source === 'mine' ? 'mine' : 'default',
      id: item.myEntryId,
      slug: item.defaultSlug,
    })
  }

  function applyForSlug(item: LibraryItem): void {
    if (item.source === 'mine' && item.myEntryId) {
      writeMusicOverride(slug, { source: 'mine', id: item.myEntryId })
    } else if (item.source === 'default' && item.defaultSlug) {
      writeMusicOverride(slug, { source: 'visited', slug: item.defaultSlug })
    }
    setActiveMusic(item.music)
  }

  function deleteItem(item: LibraryItem): void {
    if (item.source !== 'mine' || !item.myEntryId) return
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Delete "${item.name}" from your library?`)
    ) {
      return
    }
    deleteMyMusic(item.myEntryId)
  }

  if (!open) return null

  return (
    <div style={overlay} onClick={onClose}>
      <aside
        style={drawer}
        aria-label="Music library"
        onClick={(event) => event.stopPropagation()}
      >
        <header style={header}>
          <h2 style={titleStyle}>Music library</h2>
          <button
            type="button"
            aria-label="Close library"
            onClick={onClose}
            style={closeBtn}
          >
            close
          </button>
        </header>
        <div style={chips} role="tablist" aria-label="Library filter">
          {FILTERS.map((entry) => {
            const active = entry.value === filter
            return (
              <button
                key={entry.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(entry.value)}
                style={active ? chipActive : chipInactive}
              >
                {entry.label}
              </button>
            )
          })}
        </div>
        {defaultMusic && filter !== 'mine' ? (
          <div style={defaultRow}>
            <span style={defaultBadge}>track default</span>
            <span style={defaultName}>
              {defaultMusic.name ?? `/${slug} default`}
            </span>
            <MenuButton
              fullWidth={false}
              onClick={() => {
                writeMusicOverride(slug, { source: 'default' })
                setActiveMusic(defaultMusic)
              }}
            >
              Use default
            </MenuButton>
          </div>
        ) : null}
        <ul style={list}>
          {items.length === 0 ? (
            <li style={emptyState}>
              No music here yet. Save a personal tune or visit other slugs to
              fill the library.
            </li>
          ) : null}
          {items.map((item) => (
            <li key={item.key} style={card}>
              <div style={cardHeader}>
                <span style={cardName}>{item.name}</span>
                <span
                  style={
                    item.source === 'mine' ? minePill : defaultPill
                  }
                  title={
                    item.source === 'mine' ? 'personal save' : 'track default'
                  }
                >
                  {item.source === 'mine' ? 'mine' : 'default'}
                </span>
              </div>
              <MiniStepStrip music={item.music} />
              <div style={cardMeta}>
                {item.originSlug ? (
                  <span>from /{item.originSlug}</span>
                ) : null}
                {item.music.scale ? (
                  <span>· {item.music.scale}</span>
                ) : null}
                {Number.isFinite(item.music.bpm) ? (
                  <span>· {item.music.bpm} bpm</span>
                ) : null}
                {isActive(item) ? <span style={activeBadge}>active</span> : null}
              </div>
              <div style={cardActions}>
                <MenuButton fullWidth={false} onClick={() => audition(item)}>
                  Audition
                </MenuButton>
                <MenuButton
                  fullWidth={false}
                  onClick={() => loadIntoEditor(item)}
                >
                  Load
                </MenuButton>
                <MenuButton
                  fullWidth={false}
                  variant="primary"
                  onClick={() => applyForSlug(item)}
                >
                  Apply for /{slug}
                </MenuButton>
                {item.source === 'mine' ? (
                  <MenuButton
                    fullWidth={false}
                    variant="ghost"
                    onClick={() => deleteItem(item)}
                  >
                    Delete
                  </MenuButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  zIndex: 400,
  display: 'flex',
  justifyContent: 'flex-end',
}
const drawer: CSSProperties = {
  width: 'min(420px, 100vw)',
  height: '100vh',
  background: menuTheme.panelBg,
  borderLeft: `1px solid ${menuTheme.panelBorder}`,
  padding: '20px 22px',
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}
const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}
const titleStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: 0.5,
  margin: 0,
}
const closeBtn: CSSProperties = {
  background: 'transparent',
  border: `1px solid ${menuTheme.ghostBorder}`,
  color: menuTheme.textMuted,
  borderRadius: 8,
  padding: '6px 10px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textTransform: 'uppercase',
  letterSpacing: 1,
  fontSize: 11,
}
const chips: CSSProperties = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
}
const chipBase: CSSProperties = {
  border: `1px solid ${menuTheme.ghostBorder}`,
  background: menuTheme.inputBg,
  color: menuTheme.textMuted,
  borderRadius: 999,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.5,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const chipActive: CSSProperties = {
  ...chipBase,
  background: menuTheme.accent,
  color: menuTheme.accentText,
  border: `1px solid ${menuTheme.accent}`,
}
const chipInactive: CSSProperties = chipBase
const defaultRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: 'rgba(255,107,53,0.08)',
  border: `1px solid ${menuTheme.accent}`,
  borderRadius: 10,
  padding: '8px 10px',
}
const defaultBadge: CSSProperties = {
  fontSize: 10,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: menuTheme.accent,
  fontWeight: 800,
}
const defaultName: CSSProperties = {
  flex: 1,
  fontWeight: 700,
}
const list: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}
const emptyState: CSSProperties = {
  padding: 16,
  textAlign: 'center',
  color: menuTheme.textMuted,
  fontSize: 13,
  background: menuTheme.inputBg,
  border: `1px dashed ${menuTheme.ghostBorder}`,
  borderRadius: 10,
}
const card: CSSProperties = {
  border: `1px solid ${menuTheme.panelBorder}`,
  borderRadius: 10,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  background: 'rgba(255,255,255,0.02)',
}
const cardHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 8,
}
const cardName: CSSProperties = {
  fontWeight: 700,
  fontSize: 15,
}
const pillBase: CSSProperties = {
  fontSize: 10,
  letterSpacing: 1,
  textTransform: 'uppercase',
  padding: '2px 8px',
  borderRadius: 999,
  fontWeight: 800,
}
const minePill: CSSProperties = {
  ...pillBase,
  background: 'rgba(110,192,124,0.15)',
  color: '#6ec07c',
  border: '1px solid rgba(110,192,124,0.4)',
}
const defaultPill: CSSProperties = {
  ...pillBase,
  background: 'rgba(255,107,53,0.15)',
  color: menuTheme.accent,
  border: `1px solid ${menuTheme.accent}`,
}
const cardMeta: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  fontSize: 12,
  color: menuTheme.textMuted,
}
const activeBadge: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 10,
  letterSpacing: 1,
  textTransform: 'uppercase',
  background: menuTheme.accent,
  color: menuTheme.accentText,
  padding: '2px 6px',
  borderRadius: 6,
  fontWeight: 800,
}
const cardActions: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}
const miniStrip: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(16, 1fr)',
  gap: 2,
}
const miniDot: CSSProperties = {
  height: 8,
  borderRadius: 2,
}
