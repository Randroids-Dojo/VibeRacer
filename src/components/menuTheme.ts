// Shared design tokens for the menu family (Free Race, Derby, Drag,
// Tour, Settings page hubs, plus the PreRaceSetup and DragGarage
// modals). Lives in its own non-'use client' module so React Server
// Components (MenuPageShell, the per-mode app/.../page.tsx files) can
// import the constants directly without crossing the client boundary.
// Importing them from MenuUI ('use client') resolved to `undefined`
// for the server bundle and broke card / cta inline styles.

export const menuTheme = {
  font: 'system-ui, sans-serif',
  panelBg: '#161616',
  panelBorder: '#2a2a2a',
  overlayBg: 'rgba(0,0,0,0.6)',
  inputBg: '#0e0e0e',
  rowBg: '#1d1d1d',
  textPrimary: '#ffffff',
  textMuted: '#9aa0a6',
  textHint: 'rgba(255,255,255,0.7)',
  accent: '#ff6b35',
  accentBg: '#ff6b35',
  accentText: '#ffffff',
  secondaryBg: '#2a2a2a',
  ghostBorder: '#3a3a3a',
  panelShadow: '0 20px 60px rgba(0,0,0,0.6)',
  focusRing: '0 0 0 2px #161616, 0 0 0 4px #ff6b35',
  // Shared menu-shell tokens. The full-page menus and full-page modals
  // all paint the same sky-blue backdrop, dark-translucent header strip,
  // and dark-translucent body panel. Reading these from one place means
  // a global tweak (panel alpha, blur radius, etc.) lands everywhere.
  pageBg: '#9ad8ff',
  shellHeaderBg: 'rgba(0,0,0,0.55)',
  shellPanelBg: 'rgba(0,0,0,0.45)',
  shellBlur: 'blur(4px)',
  shellShadow: '0 20px 50px rgba(0,0,0,0.35)',
  // Cream pick-row card. The unselected state of every option list and
  // every menu-shell card anchors here so the cartoony cream surface
  // stays consistent across screens.
  cardBg: '#fff8d6',
  cardBorder: 'rgba(0,0,0,0.75)',
  cardText: '#1b1b1b',
  cardMutedText: 'rgba(0,0,0,0.6)',
  cardShadow: '0 6px 0 #b48a14',
  // Bold red-pink "go" button. Reused by every primary CTA on the menu
  // shell (Start a new race, Start race, Race, Play, etc.).
  ctaBg: '#e84a5f',
  ctaShadow: '#9c2a3c',
  // Pick-row selected state. Anchored to the same red-pink as the CTA
  // so the selected option visually links to the "go" path. The CTA
  // outranks the selected row with bigger padding + a drop shadow so
  // the two never read as the same control even on a narrow modal.
  pickSelectedBg: '#e84a5f',
  pickSelectedText: '#ffffff',
  pickSelectedBorder: '#9c2a3c',
} as const
