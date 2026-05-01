'use client'

import type { CSSProperties } from 'react'
import type { ControlSettings } from '@/lib/controlSettings'
import {
  GHOST_SOURCES,
  GHOST_SOURCE_DESCRIPTIONS,
  GHOST_SOURCE_LABELS,
  type GhostSource,
} from '@/lib/ghostSource'
import {
  MenuButton,
  MenuHint,
  MenuSection,
  MenuSettingRow,
  MenuToggle,
} from './MenuUI'

interface SettingsGhostTabProps {
  settings: ControlSettings
  onChange: (next: ControlSettings) => void
}

export function SettingsGhostTab({
  settings,
  onChange,
}: SettingsGhostTabProps) {
  function setGhostSource(value: GhostSource) {
    onChange({ ...settings, ghostSource: value, showGhost: true })
  }

  function setGhostOff() {
    onChange({ ...settings, showGhost: false })
  }

  return (
    <MenuSection title="Ghost and guides">
      <div style={subSection}>
        <div style={subTitle}>Ghost car</div>
        <MenuHint>
          Race a translucent car that drives a recorded lap. Pick whose lap to
          chase, or turn off.
        </MenuHint>
        <div style={choiceRow}>
          <MenuButton
            variant={!settings.showGhost ? 'primary' : 'secondary'}
            onClick={setGhostOff}
            title="Hide the ghost car."
          >
            Off
          </MenuButton>
          {GHOST_SOURCES.map((source) => {
            const active = settings.showGhost && settings.ghostSource === source
            return (
              <MenuButton
                key={source}
                variant={active ? 'primary' : 'secondary'}
                onClick={() => setGhostSource(source)}
                title={GHOST_SOURCE_DESCRIPTIONS[source]}
              >
                {GHOST_SOURCE_LABELS[source]}
              </MenuButton>
            )
          })}
        </div>
        <MenuHint>
          {!settings.showGhost
            ? 'No ghost will appear during the race.'
            : GHOST_SOURCE_DESCRIPTIONS[settings.ghostSource]}
        </MenuHint>
        <MenuSettingRow label="Show nameplate">
          <MenuToggle
            value={settings.showGhostNameplate}
            onChange={(value) =>
              onChange({ ...settings, showGhostNameplate: value })
            }
            disabled={!settings.showGhost}
          />
        </MenuSettingRow>
        <MenuHint>
          Floats the ghost&apos;s initials and lap time above their car.
        </MenuHint>
        <MenuSettingRow label="Show live gap">
          <MenuToggle
            value={settings.showGhostGap}
            onChange={(value) => onChange({ ...settings, showGhostGap: value })}
            disabled={!settings.showGhost}
          />
        </MenuSettingRow>
        <MenuHint>
          Live time gap to the ghost. Negative means you are ahead.
        </MenuHint>
      </div>

      <div style={subSection}>
        <div style={subTitle}>Racing line</div>
        <MenuHint>
          Cyan line above the road tracing the ghost&apos;s lap. Study the fast
          line without the ghost on screen.
        </MenuHint>
        <MenuSettingRow label="Show racing line">
          <MenuToggle
            value={settings.showRacingLine}
            onChange={(value) =>
              onChange({ ...settings, showRacingLine: value })
            }
          />
        </MenuSettingRow>
      </div>
    </MenuSection>
  )
}

const subSection: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  paddingTop: 2,
}

const subTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 1.2,
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.72)',
}

const choiceRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 8,
}
