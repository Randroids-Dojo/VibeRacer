'use client'
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useClickSfx, type ClickVariant } from '@/hooks/useClickSfx'

// Shared visual language for the dark in-game / pause / settings menus.
// Components on the light title backdrop (SlugInput, SlugLanding) intentionally
// keep their own styles since they live on a sky gradient.

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
} as const

export function MenuOverlay({
  children,
  zIndex = 100,
}: {
  children: ReactNode
  zIndex?: number
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: menuTheme.overlayBg,
        display: 'grid',
        placeItems: 'center',
        zIndex,
        fontFamily: menuTheme.font,
        color: menuTheme.textPrimary,
        padding: 16,
      }}
    >
      {children}
    </div>
  )
}

export function MenuPanel({
  children,
  width = 'narrow',
}: {
  children: ReactNode
  width?: 'narrow' | 'wide'
}) {
  const minWidth = width === 'wide' ? 320 : 260
  const maxWidth = width === 'wide' ? 460 : 360
  return (
    <div
      style={{
        background: menuTheme.panelBg,
        color: menuTheme.textPrimary,
        borderRadius: 12,
        padding: '22px 26px',
        minWidth,
        maxWidth,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        boxShadow: menuTheme.panelShadow,
        border: `1px solid ${menuTheme.panelBorder}`,
        maxHeight: 'calc(100vh - 32px)',
        overflow: 'auto',
      }}
    >
      {children}
    </div>
  )
}

export function MenuTitle({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 26,
        fontWeight: 800,
        letterSpacing: 2,
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  )
}

export function MenuHeader({
  title,
  onClose,
}: {
  title: ReactNode
  onClose?: () => void
}) {
  const clickBack = useClickSfx('back')
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2 }}>
        {title}
      </div>
      {onClose ? (
        <button
          onClick={() => {
            clickBack()
            onClose()
          }}
          aria-label="Close"
          style={{
            border: 'none',
            background: 'transparent',
            color: '#ccc',
            cursor: 'pointer',
            fontSize: 12,
            letterSpacing: 1,
            fontFamily: 'inherit',
          }}
        >
          CLOSE
        </button>
      ) : null}
    </div>
  )
}

export function MenuSection({
  title,
  children,
}: {
  title?: ReactNode
  children: ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {title ? (
        <div
          style={{
            fontSize: 12,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            color: menuTheme.textMuted,
          }}
        >
          {title}
        </div>
      ) : null}
      {children}
    </div>
  )
}

export function MenuHint({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        opacity: 0.7,
        lineHeight: 1.4,
      }}
    >
      {children}
    </div>
  )
}

export type MenuButtonVariant = 'primary' | 'secondary' | 'ghost'

interface MenuButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  variant?: MenuButtonVariant
  click?: ClickVariant
  onClick?: () => void
  fullWidth?: boolean
}

// Buttons play a UI click on activation. `click` selects the variant; the
// default 'soft' fits low-stakes interactions, 'confirm' the primary CTA,
// 'back' for cancel / close.
export const MenuButton = forwardRef<HTMLButtonElement, MenuButtonProps>(
  function MenuButton(
    {
      variant = 'secondary',
      click = 'soft',
      onClick,
      fullWidth = true,
      children,
      style,
      disabled,
      ...rest
    },
    ref,
  ) {
    const playClick = useClickSfx(click)
    const variantStyle: CSSProperties =
      variant === 'primary'
        ? { background: menuTheme.accentBg, color: menuTheme.accentText }
        : variant === 'ghost'
          ? {
              background: 'transparent',
              color: '#cfcfcf',
              border: `1px solid ${menuTheme.ghostBorder}`,
            }
          : { background: menuTheme.secondaryBg, color: 'white' }
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={() => {
          playClick()
          onClick?.()
        }}
        style={{
          border: variant === 'ghost' ? variantStyle.border : 'none',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 16,
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          width: fullWidth ? '100%' : undefined,
          opacity: disabled ? 0.5 : 1,
          ...variantStyle,
          ...style,
        }}
        {...rest}
      >
        {children}
      </button>
    )
  },
)

// Compact pill toggle. Used for boolean settings like sfx/music enabled.
export function MenuToggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label?: ReactNode
  value: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  const click = useClickSfx('soft')
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => {
        click()
        onChange(!value)
      }}
      style={{
        border: 'none',
        borderRadius: 999,
        padding: '6px 14px',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: 'uppercase',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        background: value ? menuTheme.accentBg : '#3a3a3a',
        color: 'white',
        opacity: disabled ? 0.5 : 1,
        minWidth: 64,
      }}
    >
      {label ?? (value ? 'On' : 'Off')}
    </button>
  )
}

// Range slider with a numeric percent readout. Volumes are 0..1, displayed
// 0..100. Disabled state matches the toggle's visual treatment.
export function MenuSlider({
  label,
  value,
  onChange,
  disabled,
  min = 0,
  max = 1,
  step = 0.01,
  format = formatPercent,
}: {
  label: ReactNode
  value: number
  onChange: (next: number) => void
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  format?: (value: number) => string
}) {
  return (
    <label
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 8,
        alignItems: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 14, minWidth: 56 }}>{label}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            flex: 1,
            accentColor: menuTheme.accent,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        />
      </div>
      <span
        style={{
          fontFamily: 'monospace',
          fontSize: 12,
          opacity: 0.75,
          minWidth: 36,
          textAlign: 'right',
        }}
      >
        {format(value)}
      </span>
    </label>
  )
}

function formatPercent(v: number): string {
  return `${Math.round(v * 100)}%`
}
