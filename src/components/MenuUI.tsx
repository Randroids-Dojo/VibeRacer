'use client'
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useClickSfx, type ClickVariant } from '@/hooks/useClickSfx'
import { useRegisterFocusable } from './MenuNav'
import type { FocusAxis } from './MenuNav'

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
  focusRing: '0 0 0 2px #161616, 0 0 0 4px #ff6b35',
} as const

// Single style block injected once so :focus-visible draws a consistent
// keyboard / gamepad focus ring on every menu primitive.
const FOCUS_STYLE_ID = 'menuui-focus-style'
function injectFocusStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById(FOCUS_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = FOCUS_STYLE_ID
  style.textContent = `
.menuui-focusable:focus { outline: none; }
.menuui-focusable:focus-visible {
  outline: none;
  box-shadow: ${menuTheme.focusRing};
}
.menuui-radio:focus-visible {
  outline: none;
  box-shadow: ${menuTheme.focusRing};
}
.menuui-tab:focus-visible {
  outline: none;
  box-shadow: ${menuTheme.focusRing};
}
input.menuui-range:focus-visible {
  outline: 2px solid ${menuTheme.accent};
  outline-offset: 2px;
}
`
  document.head.appendChild(style)
}

export function MenuOverlay({
  children,
  zIndex = 100,
}: {
  children: ReactNode
  zIndex?: number
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    injectFocusStyle()
  }, [])

  const overlay = (
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
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  )

  if (!mounted) return overlay
  return createPortal(overlay, document.body)
}

export function MenuPanel({
  children,
  width = 'narrow',
  overflow = 'auto',
}: {
  children: ReactNode
  width?: 'narrow' | 'wide'
  overflow?: CSSProperties['overflow']
}) {
  const minWidth = width === 'wide' ? 320 : 260
  const maxWidth = width === 'wide' ? 760 : 360
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
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        boxShadow: menuTheme.panelShadow,
        border: `1px solid ${menuTheme.panelBorder}`,
        maxHeight: 'calc(100vh - 32px)',
        minHeight: 0,
        overflow,
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
  const ref = useRef<HTMLButtonElement | null>(null)
  // Close lives at the top of the panel in DOM order, but we push it to the
  // end of the focus order with a high `order` value so auto-focus on overlay
  // open lands on the first useful interactive element (e.g. the first tab
  // in SettingsPane), not on Close.
  useRegisterFocusable(ref, { axis: 'vertical', order: 1e10 })
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
          ref={ref}
          className="menuui-focusable"
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
            borderRadius: 4,
            padding: '4px 6px',
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
  // Optional axis hint for the parent MenuNav. Defaults to 'vertical' which
  // matches every existing pause / settings stack. Override to 'horizontal'
  // when used inside a row.
  navAxis?: FocusAxis
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
      navAxis,
      ...rest
    },
    ref,
  ) {
    const playClick = useClickSfx(click)
    const localRef = useRef<HTMLButtonElement | null>(null)
    // Forward the inner ref to the parent ref AND keep our own copy for
    // useRegisterFocusable. The ref-forwarding pattern below mirrors the
    // existing forwardRef behavior; we don't want to break callers like
    // InitialsPrompt that focus the button directly.
    const setRef = (node: HTMLButtonElement | null) => {
      localRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) (ref as { current: HTMLButtonElement | null }).current = node
    }
    useRegisterFocusable(localRef, {
      axis: navAxis ?? 'vertical',
      disabled,
    })
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
        ref={setRef}
        type="button"
        disabled={disabled}
        className="menuui-focusable"
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
  navAxis,
}: {
  label?: ReactNode
  value: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  navAxis?: FocusAxis
}) {
  const click = useClickSfx('soft')
  const ref = useRef<HTMLButtonElement | null>(null)
  useRegisterFocusable(ref, { axis: navAxis ?? 'vertical', disabled })
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      className="menuui-focusable"
      onClick={() => {
        click()
        onChange(!value)
      }}
      onKeyDown={(e) => {
        // Left / right toggles when the user is on a horizontal toggle row,
        // matching ARIA switch conventions. Up / down still moves focus via
        // the MenuNav handler so this is purely additive.
        if (
          (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
          navAxis !== 'horizontal'
        ) {
          // For vertical layouts, do not hijack left / right - MenuNav will
          // ignore them anyway since axis is vertical.
        }
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
  const ref = useRef<HTMLInputElement | null>(null)
  // Sliders register as 'both' so left / right adjusts the value (handled by
  // the native range input + MenuNav pass-through) and up / down moves focus
  // out of the slider.
  useRegisterFocusable(ref, { axis: 'both', disabled })
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
          ref={ref}
          type="range"
          className="menuui-range"
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

// Generic "pick one of N" row used by the many settings selectors (touch
// mode, time-of-day, weather, ghost source, camera preset, headlight mode,
// brake light mode, time-of-day cycle, speed unit, plate / text colors,
// gamepad rumble mode, haptic mode, paint swatches). Each option is a real
// button with role=radio and arrow-key roving handled through MenuNav.
export interface MenuRadioOption<T extends string> {
  value: T
  label: ReactNode
  disabled?: boolean
  // Optional hint shown under the row when this option is selected.
  description?: ReactNode
  // Optional inline render override (e.g. color swatches). When provided this
  // replaces the default text label rendering. The button wrapper still
  // supplies role and focus.
  render?: (selected: boolean) => ReactNode
  // Optional title attribute (tooltip).
  title?: string
}

export function MenuRadioRow<T extends string>({
  label,
  value,
  options,
  onChange,
  ariaLabel,
  columns,
}: {
  label?: ReactNode
  value: T
  options: ReadonlyArray<MenuRadioOption<T>>
  onChange: (next: T) => void
  ariaLabel?: string
  // Optional grid column count. When set the options render in a grid; else
  // they wrap horizontally.
  columns?: number
}) {
  const click = useClickSfx('soft')
  const selected = options.find((o) => o.value === value)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label ? (
        <div
          style={{
            fontSize: 12,
            color: menuTheme.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
          }}
        >
          {label}
        </div>
      ) : null}
      <div
        role="radiogroup"
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        style={{
          display: columns ? 'grid' : 'flex',
          gridTemplateColumns: columns
            ? `repeat(${columns}, minmax(0, 1fr))`
            : undefined,
          flexWrap: columns ? undefined : 'wrap',
          gap: 6,
        }}
      >
        {options.map((opt) => (
          <RadioOption
            key={opt.value}
            opt={opt}
            selected={opt.value === value}
            onPick={() => {
              if (opt.disabled) return
              click()
              onChange(opt.value)
            }}
          />
        ))}
      </div>
      {selected?.description ? (
        <div
          style={{
            fontSize: 11,
            opacity: 0.7,
            lineHeight: 1.4,
          }}
        >
          {selected.description}
        </div>
      ) : null}
    </div>
  )
}

function RadioOption<T extends string>({
  opt,
  selected,
  onPick,
}: {
  opt: MenuRadioOption<T>
  selected: boolean
  onPick: () => void
}) {
  const ref = useRef<HTMLButtonElement | null>(null)
  useRegisterFocusable(ref, {
    axis: 'horizontal',
    disabled: opt.disabled,
    onActivate: onPick,
  })
  if (opt.render) {
    return (
      <button
        ref={ref}
        type="button"
        role="radio"
        aria-checked={selected}
        title={opt.title}
        disabled={opt.disabled}
        className="menuui-radio"
        onClick={onPick}
        style={{
          border: 'none',
          background: 'transparent',
          padding: 0,
          cursor: opt.disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          opacity: opt.disabled ? 0.4 : 1,
          borderRadius: 6,
        }}
      >
        {opt.render(selected)}
      </button>
    )
  }
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={selected}
      title={opt.title}
      disabled={opt.disabled}
      className="menuui-radio"
      onClick={onPick}
      style={{
        border: `1px solid ${selected ? menuTheme.accent : menuTheme.ghostBorder}`,
        background: selected ? menuTheme.accentBg : 'transparent',
        color: selected ? menuTheme.accentText : '#cfcfcf',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 13,
        fontWeight: 600,
        cursor: opt.disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        opacity: opt.disabled ? 0.4 : 1,
        textAlign: 'center',
      }}
    >
      {opt.label}
    </button>
  )
}

// Horizontal tab strip. Each tab is a button with role=tab. Arrow Left / Right
// (via MenuNav since axis='horizontal') and gamepad LB / RB (the parent
// MenuNavProvider supplies onTabPrev / onTabNext) move between tabs.
export interface MenuTabDef<T extends string> {
  value: T
  label: ReactNode
  disabled?: boolean
}

export function MenuTabBar<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: ReadonlyArray<MenuTabDef<T>>
  value: T
  onChange: (next: T) => void
  ariaLabel?: string
}) {
  const click = useClickSfx('soft')
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        borderBottom: `1px solid ${menuTheme.panelBorder}`,
        paddingBottom: 8,
      }}
    >
      {tabs.map((tab) => (
        <TabButton
          key={tab.value}
          tab={tab}
          selected={tab.value === value}
          onPick={() => {
            if (tab.disabled || tab.value === value) return
            click()
            onChange(tab.value)
          }}
        />
      ))}
    </div>
  )
}

function TabButton<T extends string>({
  tab,
  selected,
  onPick,
}: {
  tab: MenuTabDef<T>
  selected: boolean
  onPick: () => void
}) {
  const ref = useRef<HTMLButtonElement | null>(null)
  useRegisterFocusable(ref, {
    axis: 'horizontal',
    group: 'tabbar',
    disabled: tab.disabled,
    onActivate: onPick,
  })
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={selected}
      disabled={tab.disabled}
      className="menuui-tab"
      onClick={onPick}
      style={{
        border: 'none',
        background: selected ? menuTheme.accentBg : 'transparent',
        color: selected ? menuTheme.accentText : '#cfcfcf',
        borderRadius: 6,
        padding: '6px 12px',
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        cursor: tab.disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        opacity: tab.disabled ? 0.4 : 1,
      }}
    >
      {tab.label}
    </button>
  )
}

function formatPercent(v: number): string {
  return `${Math.round(v * 100)}%`
}
