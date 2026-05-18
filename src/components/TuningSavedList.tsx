'use client'
import { useMemo, useState, type CSSProperties } from 'react'
import {
  CONTROL_TYPE_LABELS,
  TRACK_TAG_LABELS,
  computeOverallRating,
  filterSaved,
  sortSaved,
  type ControlType,
  type SavedTuning,
  type SortBy,
  type TrackTag,
} from '@/lib/tuningLab'
import { menuTheme } from './menuTheme'

interface Props {
  items: SavedTuning[]
  onApply: (t: SavedTuning) => void
  onShare: (t: SavedTuning) => void
  onEdit: (t: SavedTuning) => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
}

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'updatedDesc', label: 'Recently updated' },
  { value: 'overallRatingDesc', label: 'Highest rated' },
  { value: 'lapAsc', label: 'Fastest lap' },
  { value: 'nameAsc', label: 'Name A to Z' },
]

const CONTROL_FILTERS: (ControlType | 'all')[] = [
  'all',
  'keyboard',
  'touch_single',
  'touch_dual',
]

const TAG_FILTERS: (TrackTag | 'all')[] = [
  'all',
  'twisty',
  'fast',
  'mixed',
  'technical',
]

export function TuningSavedList({
  items,
  onApply,
  onShare,
  onEdit,
  onDelete,
  onRename,
}: Props) {
  const [sortBy, setSortBy] = useState<SortBy>('updatedDesc')
  const [controlFilter, setControlFilter] = useState<ControlType | 'all'>('all')
  const [tagFilter, setTagFilter] = useState<TrackTag | 'all'>('all')
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    const filtered = filterSaved(items, {
      controlType: controlFilter === 'all' ? undefined : controlFilter,
      trackTag: tagFilter === 'all' ? undefined : tagFilter,
      search,
    })
    return sortSaved(filtered, sortBy)
  }, [items, controlFilter, tagFilter, search, sortBy])

  return (
    <div style={wrap}>
      <div style={controls}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
          style={searchField}
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          style={selectField}
          aria-label="Sort"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div style={filterRow} role="group" aria-label="Filter by control">
        {CONTROL_FILTERS.map((f) => {
          const label =
            f === 'all' ? 'Any control' : CONTROL_TYPE_LABELS[f as ControlType]
          const active = controlFilter === f
          return (
            <FilterChip
              key={f}
              label={label}
              active={active}
              onClick={() => setControlFilter(f)}
            />
          )
        })}
      </div>

      <div style={filterRow} role="group" aria-label="Filter by track tag">
        {TAG_FILTERS.map((f) => {
          const label =
            f === 'all' ? 'Any track' : TRACK_TAG_LABELS[f as TrackTag]
          const active = tagFilter === f
          return (
            <FilterChip
              key={f}
              label={label}
              active={active}
              onClick={() => setTagFilter(f)}
            />
          )
        })}
      </div>

      {visible.length === 0 ? (
        <div style={empty}>
          {items.length === 0
            ? 'No saved tunings yet. Run a session and save one.'
            : 'No tunings match these filters.'}
        </div>
      ) : (
        <div style={list}>
          {visible.map((t) => (
            <Row
              key={t.id}
              t={t}
              onApply={onApply}
              onShare={onShare}
              onEdit={onEdit}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        ...chip,
        background: active ? menuTheme.pickSelectedBg : menuTheme.cardBg,
        color: active ? menuTheme.pickSelectedText : menuTheme.cardText,
        borderColor: active
          ? menuTheme.pickSelectedBorder
          : menuTheme.cardBorder,
      }}
    >
      {label}
    </button>
  )
}

function Row({
  t,
  onApply,
  onShare,
  onEdit,
  onDelete,
  onRename,
}: {
  t: SavedTuning
  onApply: (t: SavedTuning) => void
  onShare: (t: SavedTuning) => void
  onEdit: (t: SavedTuning) => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(t.name)
  const overall = computeOverallRating(t.ratings)
  const dots = Math.round(overall * 5)

  return (
    <div style={row}>
      <div style={rowHeader}>
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 48))}
            onBlur={() => {
              if (name.trim()) onRename(t.id, name.trim())
              setEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                ;(e.target as HTMLInputElement).blur()
              } else if (e.key === 'Escape') {
                setName(t.name)
                setEditing(false)
              }
            }}
            autoFocus
            style={renameField}
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            style={rowName}
            aria-label={`Rename ${t.name}`}
          >
            {t.name}
          </button>
        )}
        <div style={ratingDots} aria-label={`Rating ${dots} of 5`}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              style={{
                ...dot,
                background:
                  i < dots ? menuTheme.ctaBg : 'rgba(0,0,0,0.18)',
              }}
            />
          ))}
        </div>
      </div>

      <div style={badges}>
        <span style={badge}>{CONTROL_TYPE_LABELS[t.controlType]}</span>
        {t.trackTags.map((tag) => (
          <span key={tag} style={badge}>
            {TRACK_TAG_LABELS[tag]}
          </span>
        ))}
        {t.lapTimeMs !== null ? (
          <span style={badge}>{(t.lapTimeMs / 1000).toFixed(2)}s</span>
        ) : null}
      </div>

      {t.notes ? <div style={noteText}>{t.notes}</div> : null}

      <div style={rowActions}>
        <button onClick={() => onApply(t)} style={primaryBtn}>
          Use this setup
        </button>
        <button onClick={() => onEdit(t)} style={secondaryBtn}>
          Edit
        </button>
        <button onClick={() => onShare(t)} style={secondaryBtn}>
          Share
        </button>
        <button
          onClick={() => {
            if (window.confirm(`Delete "${t.name}"?`)) onDelete(t.id)
          }}
          style={dangerBtn}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

const wrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  width: '100%',
}
const controls: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 8,
}
const searchField: CSSProperties = {
  background: '#fffbe8',
  color: menuTheme.cardText,
  border: `2px solid ${menuTheme.cardBorder}`,
  borderRadius: 8,
  padding: '10px 12px',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 600,
}
const selectField: CSSProperties = {
  background: '#fffbe8',
  color: menuTheme.cardText,
  border: `2px solid ${menuTheme.cardBorder}`,
  borderRadius: 8,
  padding: '10px 12px',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
}
const filterRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}
const chip: CSSProperties = {
  border: '2px solid',
  borderRadius: 999,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  letterSpacing: 0.3,
}
const list: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}
const row: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 12,
  background: menuTheme.cardBg,
  color: menuTheme.cardText,
  border: `2px solid ${menuTheme.cardBorder}`,
  borderRadius: 12,
  boxShadow: `0 4px 0 ${menuTheme.cardShadow}`,
}
const rowHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
}
const rowName: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: menuTheme.cardText,
  fontSize: 16,
  fontWeight: 800,
  cursor: 'pointer',
  textAlign: 'left',
  padding: 0,
  fontFamily: 'inherit',
}
const renameField: CSSProperties = {
  background: '#fffbe8',
  color: menuTheme.cardText,
  border: `2px solid ${menuTheme.ctaBg}`,
  borderRadius: 6,
  padding: '6px 8px',
  fontFamily: 'inherit',
  fontSize: 15,
  fontWeight: 700,
  flex: 1,
}
const ratingDots: CSSProperties = {
  display: 'flex',
  gap: 3,
}
const dot: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  display: 'inline-block',
}
const badges: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}
const badge: CSSProperties = {
  fontSize: 11,
  padding: '3px 8px',
  background: 'rgba(0,0,0,0.08)',
  color: menuTheme.cardText,
  border: '1px solid rgba(0,0,0,0.18)',
  borderRadius: 999,
  letterSpacing: 0.5,
  fontWeight: 700,
}
const noteText: CSSProperties = {
  fontSize: 12,
  color: menuTheme.cardMutedText,
  lineHeight: 1.4,
}
const rowActions: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}
const primaryBtn: CSSProperties = {
  background: menuTheme.ctaBg,
  color: '#fff',
  border: `2px solid ${menuTheme.ctaShadow}`,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxShadow: `0 3px 0 ${menuTheme.ctaShadow}`,
}
const secondaryBtn: CSSProperties = {
  background: '#fffbe8',
  color: menuTheme.cardText,
  border: `2px solid ${menuTheme.cardBorder}`,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const dangerBtn: CSSProperties = {
  background: '#fffbe8',
  color: menuTheme.ctaShadow,
  border: `2px solid ${menuTheme.ctaShadow}`,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const empty: CSSProperties = {
  color: menuTheme.cardMutedText,
  fontSize: 13,
  fontStyle: 'italic',
  padding: 16,
  textAlign: 'center',
  background: menuTheme.cardBg,
  border: `2px dashed ${menuTheme.cardBorder}`,
  borderRadius: 12,
}
