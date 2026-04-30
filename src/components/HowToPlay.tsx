'use client'

import {
  HOW_TO_PLAY_GOAL_BODY,
  HOW_TO_PLAY_GOAL_TITLE,
  HOW_TO_PLAY_TIPS,
  buildGamepadHelpRows,
  buildKeyboardHelpRows,
  buildTouchHelp,
  type GamepadHelpRow,
  type HelpRow,
} from '@/lib/howToPlay'
import {
  type GamepadBindings,
  type KeyBindings,
  type TouchMode,
} from '@/lib/controlSettings'
import {
  MenuButton,
  MenuHeader,
  MenuOverlay,
  MenuPanel,
  MenuSection,
  menuTheme,
} from './MenuUI'
import { MenuNavProvider } from './MenuNav'

interface Props {
  keyBindings: KeyBindings
  gamepadBindings: GamepadBindings
  touchMode: TouchMode
  onClose: () => void
}

// "How to Play" reference overlay. Reachable from the title screen and the
// pause menu. Pulls keyboard / gamepad rows from the player's current bindings
// so the help reflects any remap the player did in Settings; the touch section
// swaps to the dual-stick blurb when that mode is active.
export function HowToPlay({
  keyBindings,
  gamepadBindings,
  touchMode,
  onClose,
}: Props) {
  const keyboardRows = buildKeyboardHelpRows(keyBindings)
  const gamepadRows = buildGamepadHelpRows(gamepadBindings)
  const touch = buildTouchHelp(touchMode)
  return (
    <MenuOverlay zIndex={120}>
      <MenuNavProvider onBack={onClose}>
        <MenuPanel width="wide">
        <MenuHeader title="HOW TO PLAY" onClose={onClose} />

        <MenuSection title={HOW_TO_PLAY_GOAL_TITLE}>
          <p style={paragraphStyle}>{HOW_TO_PLAY_GOAL_BODY}</p>
        </MenuSection>

        <MenuSection title="Keyboard">
          <KeyboardTable rows={keyboardRows} />
        </MenuSection>

        <MenuSection title="Touch">
          <p style={subTitleStyle}>{touch.modeLabel}</p>
          <p style={paragraphStyle}>{touch.intro}</p>
          <ul style={bulletList}>
            {touch.bullets.map((b, i) => (
              <li key={i} style={bulletItem}>
                {b}
              </li>
            ))}
          </ul>
          <p style={hintStyle}>
            Switch single-stick or dual-stick in Settings.
          </p>
        </MenuSection>

        <MenuSection title="Gamepad">
          <GamepadTable rows={gamepadRows} />
          <p style={hintStyle}>
            Steering uses the left analog stick (or the d-pad). Plug in any
            Standard layout controller and press a button to wake it up.
          </p>
        </MenuSection>

        <MenuSection title="Pro tips">
          <ul style={bulletList}>
            {HOW_TO_PLAY_TIPS.map((tip, i) => (
              <li key={i} style={bulletItem}>
                {tip}
              </li>
            ))}
          </ul>
        </MenuSection>

        <MenuButton click="back" onClick={onClose}>
          Done
        </MenuButton>
        </MenuPanel>
      </MenuNavProvider>
    </MenuOverlay>
  )
}

function KeyboardTable({ rows }: { rows: HelpRow[] }) {
  return (
    <div style={tableStyle}>
      {rows.map((row) => (
        <div key={row.action} style={rowStyle}>
          <span style={actionLabelStyle}>{row.label}</span>
          <span style={keysCellStyle}>
            {row.keys.length === 0 ? (
              <span style={emptyKeyStyle}>not bound</span>
            ) : (
              row.keys.map((k, i) => (
                <Keycap key={`${row.action}-${i}`}>{k}</Keycap>
              ))
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

function GamepadTable({ rows }: { rows: GamepadHelpRow[] }) {
  return (
    <div style={tableStyle}>
      {rows.map((row) => (
        <div key={row.action} style={rowStyle}>
          <span style={actionLabelStyle}>{row.label}</span>
          <span style={keysCellStyle}>
            {row.buttons.length === 0 ? (
              <span style={emptyKeyStyle}>not bound</span>
            ) : (
              row.buttons.map((b, i) => (
                <Keycap key={`${row.action}-${i}`}>{b}</Keycap>
              ))
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

function Keycap({ children }: { children: React.ReactNode }) {
  return <span style={keycapStyle}>{children}</span>
}

const paragraphStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.5,
  color: menuTheme.textHint,
}

const subTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  color: menuTheme.textPrimary,
  opacity: 0.85,
}

const hintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.4,
  color: menuTheme.textMuted,
}

const bulletList: React.CSSProperties = {
  margin: 0,
  padding: '0 0 0 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const bulletItem: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.45,
  color: menuTheme.textHint,
}

const tableStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 12,
  alignItems: 'center',
  background: menuTheme.rowBg,
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${menuTheme.panelBorder}`,
}

const actionLabelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: menuTheme.textPrimary,
}

const keysCellStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  justifyContent: 'flex-end',
}

const keycapStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '3px 8px',
  borderRadius: 6,
  background: '#0e0e0e',
  border: `1px solid ${menuTheme.ghostBorder}`,
  fontSize: 12,
  fontFamily: 'monospace',
  color: menuTheme.textPrimary,
  minWidth: 28,
  textAlign: 'center',
  letterSpacing: 0.5,
}

const emptyKeyStyle: React.CSSProperties = {
  fontSize: 12,
  color: menuTheme.textMuted,
  fontStyle: 'italic',
}
