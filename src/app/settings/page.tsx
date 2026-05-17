'use client'
import { useRouter } from 'next/navigation'
import { useControlSettings } from '@/hooks/useControlSettings'
import { MenuPageShell } from '@/components/MenuPageShell'
import { SettingsPane } from '@/components/SettingsPane'

// Full-page Settings route. Mirrors the Free Race / Derby / Drag / Tour
// hubs by hosting the SettingsPane body inside a MenuPageShell, so the
// blue page background and dark-translucent header / body panels match
// the rest of the top-level menu family. CLOSE in the shell header (and
// Esc / B in MenuNavProvider) navigates back to the title.
export default function SettingsPage() {
  const router = useRouter()
  const { settings, setSettings, resetSettings } = useControlSettings()
  return (
    <MenuPageShell title="Settings" width="wide">
      <SettingsPane
        mode="page"
        settings={settings}
        onChange={setSettings}
        onClose={() => router.push('/')}
        onReset={resetSettings}
      />
    </MenuPageShell>
  )
}
