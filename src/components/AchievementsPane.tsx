'use client'

import { useMemo } from 'react'
import {
  ACHIEVEMENTS,
  achievementProgress,
  type AchievementDef,
  type AchievementMap,
} from '@/game/achievements'
import { MenuButton, MenuOverlay, MenuPanel, menuTheme } from './MenuUI'

interface AchievementsPaneProps {
  // Cross-track lifetime unlock map. Empty object reads as "no unlocks yet"
  // and the pane renders a friendly empty-state header alongside the locked
  // achievement list (so the player can see what is on offer even before
  // their first lap).
  achievements: AchievementMap
  onBack: () => void
}

export function AchievementsPane({
  achievements,
  onBack,
}: AchievementsPaneProps) {
  const progress = useMemo(
    () => achievementProgress(achievements),
    [achievements],
  )

  // Sort: unlocked first (most-recent first inside that group), then locked in
  // the canonical ACHIEVEMENTS order so a player browsing the locked list sees
  // a stable, predictable layout each time they open the pane.
  const sorted = useMemo(() => {
    const unlocked: AchievementDef[] = []
    const locked: AchievementDef[] = []
    for (const def of ACHIEVEMENTS) {
      if (achievements[def.id]) unlocked.push(def)
      else locked.push(def)
    }
    unlocked.sort((a, b) => {
      const ua = achievements[a.id]?.unlockedAt ?? 0
      const ub = achievements[b.id]?.unlockedAt ?? 0
      return ub - ua
    })
    return [...unlocked, ...locked]
  }, [achievements])

  return (
    <MenuOverlay zIndex={100}>
      <MenuPanel width="wide">
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2 }}>
            ACHIEVEMENTS
          </div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.4,
              color: menuTheme.textMuted,
              textTransform: 'uppercase',
            }}
          >
            {progress.unlockedCount} / {progress.totalCount}
          </div>
        </div>

        <ProgressBar fraction={progress.fraction} />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {sorted.map((def) => {
            const meta = achievements[def.id] ?? null
            return (
              <AchievementRow
                key={def.id}
                def={def}
                unlockedAt={meta?.unlockedAt ?? null}
                slug={meta?.slug ?? null}
              />
            )
          })}
        </div>

        <MenuButton click="back" onClick={onBack}>
          Back
        </MenuButton>
      </MenuPanel>
    </MenuOverlay>
  )
}

function ProgressBar({ fraction }: { fraction: number }) {
  const clamped = Math.max(0, Math.min(1, fraction))
  return (
    <div
      style={{
        height: 8,
        background: menuTheme.rowBg,
        borderRadius: 999,
        overflow: 'hidden',
        border: `1px solid ${menuTheme.panelBorder}`,
      }}
      aria-label={`${Math.round(clamped * 100)}% complete`}
    >
      <div
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          background: menuTheme.accent,
          transition: 'width 0.2s ease-out',
        }}
      />
    </div>
  )
}

function AchievementRow({
  def,
  unlockedAt,
  slug,
}: {
  def: AchievementDef
  unlockedAt: number | null
  slug: string | null
}) {
  const isUnlocked = unlockedAt !== null
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: 12,
        padding: '10px 12px',
        background: menuTheme.rowBg,
        border: `1px solid ${
          isUnlocked ? menuTheme.accentBg : menuTheme.panelBorder
        }`,
        borderRadius: 8,
        opacity: isUnlocked ? 1 : 0.6,
      }}
    >
      <Badge unlocked={isUnlocked} category={def.category} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: isUnlocked
                ? menuTheme.textPrimary
                : menuTheme.textMuted,
            }}
          >
            {def.name}
          </div>
          <CategoryChip category={def.category} />
        </div>
        <div
          style={{
            fontSize: 12,
            color: menuTheme.textMuted,
            lineHeight: 1.4,
          }}
        >
          {def.description}
        </div>
        {isUnlocked && unlockedAt !== null ? (
          <div
            style={{
              fontSize: 10,
              color: menuTheme.textHint,
              letterSpacing: 0.4,
              fontFamily: 'monospace',
            }}
          >
            Earned {formatUnlockDate(unlockedAt)}
            {slug ? ` on /${slug}` : null}
          </div>
        ) : (
          <div
            style={{
              fontSize: 10,
              color: menuTheme.textMuted,
              letterSpacing: 0.4,
            }}
          >
            Locked
          </div>
        )}
      </div>
    </div>
  )
}

function Badge({
  unlocked,
  category,
}: {
  unlocked: boolean
  category: AchievementDef['category']
}) {
  const color = unlocked ? CATEGORY_COLOR[category] : '#3a3a3a'
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        background: unlocked ? color : menuTheme.rowBg,
        border: `2px solid ${color}`,
        display: 'grid',
        placeItems: 'center',
        fontSize: 18,
        fontWeight: 800,
        color: unlocked ? '#1a1a1a' : '#5a5a5a',
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      {unlocked ? '★' : '?'}
    </div>
  )
}

function CategoryChip({
  category,
}: {
  category: AchievementDef['category']
}) {
  return (
    <div
      style={{
        fontSize: 9,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        color: CATEGORY_COLOR[category],
        background: 'transparent',
        border: `1px solid ${CATEGORY_COLOR[category]}`,
        borderRadius: 999,
        padding: '2px 6px',
        flexShrink: 0,
      }}
    >
      {category}
    </div>
  )
}

const CATEGORY_COLOR: Record<AchievementDef['category'], string> = {
  speed: '#5cb6ff',
  progression: '#ffb55c',
  style: '#ff7a9c',
  mastery: '#f4d774',
  discovery: '#85e08c',
}

function formatUnlockDate(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const d = new Date(ms)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
