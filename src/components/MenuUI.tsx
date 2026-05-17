'use client'
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useClickSfx, type ClickVariant } from '@/hooks/useClickSfx'
import { menuTheme } from './menuTheme'
import { MenuNavProvider, useRegisterFocusable } from './MenuNav'
import type { FocusAxis } from './MenuNav'

// Shared visual language for the dark in-game / pause / settings menus.
// Components on the light title backdrop (SlugInput, SlugLanding) intentionally
// keep their own styles since they live on a sky gradient.

// Re-export the design tokens so existing client-side callers (MenuUI's
// own primitives, the in-game pause / settings modals, the
// PreRaceSetup / DragGarage modals) continue to read them from
// './MenuUI'. The tokens themselves live in a separate non-client
// module (./menuTheme) so server components (MenuPageShell and the
// per-hub app/.../page.tsx files) can import them too without crossing
// the React Server Component → client boundary, which silently leaves
// constant imports as `undefined` at SSR time.
export { menuTheme } from './menuTheme'

// Single style block injected once so :focus-visible draws a consistent
// keyboard / gamepad focus ring on every menu primitive.
const FOCUS_STYLE_ID = 'menuui-focus-style'
function injectFocusStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById(FOCUS_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = FOCUS_STYLE_ID
  // Scope the outline reset to :focus:not(:focus-visible) so browsers without
  // :focus-visible support keep their default focus ring as a fallback.
  style.textContent = `
.menuui-focusable:focus:not(:focus-visible) { outline: none; }
.menuui-focusable:focus-visible {
  outline: none;
  box-shadow: ${menuTheme.focusRing};
}
.menuui-radio:focus:not(:focus-visible) { outline: none; }
.menuui-radio:focus-visible {
  outline: none;
  box-shadow: ${menuTheme.focusRing};
}
.menuui-tab:focus:not(:focus-visible) { outline: none; }
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
  onBack,
  onTabPrev,
  onTabNext,
  autoFocus,
  // 'dim' (default) renders the rgba dim backdrop used by in-game modals
  // (pause, settings, photo, etc.). 'page' uses the sky-blue page bg from
  // MenuPageShell so a full-screen modal (PreRaceSetup, DragGarage) reads
  // as part of the colorful menu family instead of a black box.
  variant = 'dim',
}: {
  children: ReactNode
  zIndex?: number
  // Closes the overlay. Wires Esc / B / DPad-back to call this.
  onBack?: () => void
  onTabPrev?: () => void
  onTabNext?: () => void
  autoFocus?: boolean
  variant?: 'dim' | 'page'
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    injectFocusStyle()
  }, [])

  const inner = onBack || onTabPrev || onTabNext || autoFocus !== undefined ? (
    <MenuNavProvider
      onBack={onBack}
      onTabPrev={onTabPrev}
      onTabNext={onTabNext}
      autoFocus={autoFocus}
    >
      {children}
    </MenuNavProvider>
  ) : (
    children
  )

  const isPage = variant === 'page'
  const overlay = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: isPage ? '#9ad8ff' : menuTheme.overlayBg,
        display: isPage ? 'flex' : 'grid',
        alignItems: isPage ? 'flex-start' : undefined,
        justifyContent: isPage ? 'center' : undefined,
        placeItems: isPage ? undefined : 'center',
        zIndex,
        fontFamily: menuTheme.font,
        color: menuTheme.textPrimary,
        padding: isPage ? 24 : 16,
        boxSizing: 'border-box',
        overflow: isPage ? 'auto' : 'hidden',
      }}
    >
      {inner}
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
      {onClose ? <MenuHeaderClose onClose={onClose} /> : null}
    </div>
  )
}

// Split out so the focusable registration only fires when the button is
// actually rendered. Otherwise an unrendered close ref would sit in the
// MenuNav registry with `ref.current === null` and trip arrow nav.
function MenuHeaderClose({ onClose }: { onClose: () => void }) {
  const clickBack = useClickSfx('back')
  const ref = useRef<HTMLButtonElement | null>(null)
  // Push close to the end of the focus order with a high `order` value so
  // auto-focus on overlay open lands on the first useful interactive element
  // (e.g. the first tab in SettingsPane), not on Close.
  useRegisterFocusable(ref, { axis: 'vertical', order: 1e10 })
  return (
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

export function MenuSettingRow({
  label,
  children,
}: {
  label: ReactNode
  children: ReactNode
}) {
  return (
    <div style={settingRowStyle}>
      <div style={settingLabelStyle}>{label}</div>
      {children}
    </div>
  )
}

const settingRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const settingLabelStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
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
      className,
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
        className={className ? `menuui-focusable ${className}` : 'menuui-focusable'}
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
  // Per-row group id so left / right cycle within this radio row only and
  // off-axis arrow presses (up / down) walk out to the next focusable.
  const groupId = useId()
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
            group={groupId}
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
  group,
}: {
  opt: MenuRadioOption<T>
  selected: boolean
  onPick: () => void
  group: string
}) {
  const ref = useRef<HTMLButtonElement | null>(null)
  useRegisterFocusable(ref, {
    axis: 'horizontal',
    group,
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
  // Optional DOM id for the tab button. Pair with `controlsId` when the
  // matching tab panel uses `aria-labelledby` to point back at the tab.
  id?: string
  // Optional id of the panel this tab controls. Sets `aria-controls` so
  // screen readers wire the tab ↔ panel relationship correctly.
  controlsId?: string
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
  // Per-bar group id so multiple tab strips don't bleed into each other on
  // arrow nav (rare today but cheap insurance).
  const groupId = useId()
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
          group={groupId}
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
  group,
}: {
  tab: MenuTabDef<T>
  selected: boolean
  onPick: () => void
  group: string
}) {
  const ref = useRef<HTMLButtonElement | null>(null)
  useRegisterFocusable(ref, {
    axis: 'horizontal',
    group,
    disabled: tab.disabled,
    onActivate: onPick,
  })
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={tab.id}
      aria-selected={selected}
      aria-controls={tab.controlsId}
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

// --- Shared menu shell -----------------------------------------------------
//
// The Free Race / Derby / Drag / Tour / Settings menus and the
// PreRaceSetup / DragGarage modals all paint the same shape: a sky-blue
// page backdrop, a dark-translucent header strip with the title, a
// dark-translucent body panel for the content, and (where relevant)
// cream pick-rows with a red-pink primary CTA. The primitives below are
// the single source of truth for that family so a layout / token tweak
// lands on every screen at once.

// `MenuShellStage` is the inner "title strip + body panel" pair. Drop it
// inside any container (a server `<main>` for routes, a MenuOverlay
// variant='page' for modals) and pass `title` + `children`.
export function MenuShellStage({
  title,
  closeHref,
  closeLabel = 'CLOSE',
  width = 'narrow',
  children,
}: {
  title: ReactNode
  // Optional CLOSE link on the right of the header. Used by routes
  // (Free Race, Derby, ...) that navigate back via Link rather than a
  // JS handler. Modal-style stages (PreRaceSetup, DragGarage) skip it
  // because Esc / B / DPad-back already close them.
  closeHref?: string
  closeLabel?: string
  width?: 'narrow' | 'wide'
  children: ReactNode
}) {
  const isWide = width === 'wide'
  return (
    <div style={isWide ? shellStageWide : shellStageNarrow}>
      <header style={shellHeaderStyle}>
        <h1 style={shellTitleStyle}>{title}</h1>
        {closeHref ? (
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a href={closeHref} style={shellCloseStyle} aria-label={closeLabel}>
            {closeLabel}
          </a>
        ) : null}
      </header>
      <div style={shellPanelStyle}>{children}</div>
    </div>
  )
}

// `MenuStageOverlay` wraps `MenuShellStage` in a page-variant MenuOverlay,
// the modal flavor used by PreRaceSetup and DragGarage. Closing is handled
// by the surrounding MenuNavProvider (Esc / B / DPad-back), matching the
// pause-menu / settings overlays.
export function MenuStageOverlay({
  title,
  onBack,
  zIndex,
  autoFocus,
  width = 'narrow',
  children,
}: {
  title: ReactNode
  onBack?: () => void
  zIndex?: number
  autoFocus?: boolean
  width?: 'narrow' | 'wide'
  children: ReactNode
}) {
  return (
    <MenuOverlay
      variant="page"
      zIndex={zIndex}
      onBack={onBack}
      autoFocus={autoFocus}
    >
      <MenuShellStage title={title} width={width}>
        {children}
      </MenuShellStage>
    </MenuOverlay>
  )
}

// `MenuPickRow` is the cream picker row used by PreRaceSetup and the
// DragGarage part lists. Selected → solid accent fill with white text;
// unselected → cream fill with dark text and a thick black outline. The
// optional `tag` slot renders a small right-aligned chip (e.g. "STOCK").
export function MenuPickRow({
  label,
  sublabel,
  tag,
  selected,
  onPick,
  axis = 'vertical',
  ariaLabel,
}: {
  label: ReactNode
  sublabel?: ReactNode
  tag?: ReactNode
  selected: boolean
  onPick: () => void
  axis?: FocusAxis
  ariaLabel?: string
}) {
  const ref = useRef<HTMLButtonElement | null>(null)
  useRegisterFocusable(ref, { axis, onActivate: onPick })
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel}
      onClick={onPick}
      className="menuui-focusable"
      style={{
        ...pickRowStyle,
        background: selected ? menuTheme.accentBg : menuTheme.cardBg,
        color: selected ? menuTheme.accentText : menuTheme.cardText,
        borderColor: selected ? menuTheme.accentBg : menuTheme.cardBorder,
      }}
    >
      <span style={pickRowTextStyle}>
        <span style={pickRowLabelStyle}>{label}</span>
        {sublabel ? (
          <span
            style={{
              ...pickRowSublabelStyle,
              color: selected
                ? 'rgba(255,255,255,0.85)'
                : menuTheme.cardMutedText,
            }}
          >
            {sublabel}
          </span>
        ) : null}
      </span>
      {tag ? (
        <span
          style={{
            ...pickRowTagStyle,
            opacity: selected ? 0.85 : 0.6,
          }}
        >
          {tag}
        </span>
      ) : null}
    </button>
  )
}

// `MenuStartButton` is the red-pink "go" CTA shared by every menu shell.
// It composes on top of MenuButton so the focus ring, click sfx, and
// gamepad-nav registration all stay consistent with the rest of the menu
// primitives.
export const MenuStartButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
    onClick?: () => void
    children: ReactNode
  }
>(function MenuStartButton({ children, onClick, style, ...rest }, ref) {
  return (
    <MenuButton
      ref={ref}
      variant="primary"
      click="confirm"
      onClick={onClick}
      style={{ ...startBtnStyle, ...style }}
      {...rest}
    >
      {children}
    </MenuButton>
  )
})

const shellStageNarrow: CSSProperties = {
  position: 'relative',
  width: 'min(480px, 100%)',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}
const shellStageWide: CSSProperties = {
  ...shellStageNarrow,
  width: 'min(640px, 100%)',
}
const shellHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 16px',
  background: menuTheme.shellHeaderBg,
  borderRadius: 12,
  backdropFilter: menuTheme.shellBlur,
  WebkitBackdropFilter: menuTheme.shellBlur,
}
const shellTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: 1,
  color: '#fff',
}
const shellCloseStyle: CSSProperties = {
  padding: '6px 10px',
  background: 'rgba(255,255,255,0.1)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 10,
  fontSize: 12,
  letterSpacing: 1,
  fontFamily: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
  textDecoration: 'none',
}
const shellPanelStyle: CSSProperties = {
  background: menuTheme.shellPanelBg,
  padding: 18,
  borderRadius: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  boxShadow: menuTheme.shellShadow,
  backdropFilter: menuTheme.shellBlur,
  WebkitBackdropFilter: menuTheme.shellBlur,
  // Belt-and-suspenders so a rogue child can never push the panel wider
  // than its column (mobile inputs with implicit size= attrs, etc.).
  minWidth: 0,
}

const pickRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '9px 12px',
  borderRadius: 8,
  border: '2px solid',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
  width: '100%',
  minWidth: 0,
}
const pickRowTextStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
}
const pickRowLabelStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
}
const pickRowSublabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: 0.2,
}
const pickRowTagStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1.2,
}
const startBtnStyle: CSSProperties = {
  padding: '14px 20px',
  background: menuTheme.ctaBg,
  color: 'white',
  borderRadius: 12,
  fontSize: 20,
  fontWeight: 700,
  letterSpacing: 0.5,
  boxShadow: `0 6px 0 ${menuTheme.ctaShadow}`,
  border: 'none',
}
