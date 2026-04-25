'use client'
import { useState } from 'react'
import { useControlSettings } from '@/hooks/useControlSettings'
import { SettingsPane } from './SettingsPane'

interface Props {
  buttonStyle: React.CSSProperties
}

export function SettingsLauncher({ buttonStyle }: Props) {
  const [open, setOpen] = useState(false)
  const { settings, setSettings, resetSettings } = useControlSettings()
  return (
    <>
      <button
        type="button"
        style={buttonStyle}
        onClick={() => setOpen(true)}
      >
        Settings
      </button>
      {open ? (
        <SettingsPane
          settings={settings}
          onChange={setSettings}
          onClose={() => setOpen(false)}
          onReset={resetSettings}
        />
      ) : null}
    </>
  )
}
