import {
  useLayoutEffect,
  useState,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react'
import ravenLogo from '../../../../../logo/raven.svg'
import incognitoIcon from '../../assets/incognito.svg'

export interface OverlayTab<T extends string> {
  id: T
  label: string
}

interface OverlayTitleBarProps<T extends string> {
  stealthEnabled: boolean
  isRecording: boolean
  isStarting: boolean
  incognitoMode: boolean
  isCollapsed: boolean
  tabs: OverlayTab<T>[]
  activeTab: T
  onSelectTab: (tab: T) => void
  onToggleCollapsed: () => void
  onToggleRecording: () => void
  onToggleStealth: () => void
  onToggleIncognito: () => void
  onClose: () => void
  onLogoClick: () => void
  onDragMouseDown: (event: ReactMouseEvent<HTMLElement>) => void
}

const iconButtonBase =
  'w-7 h-7 shrink-0 flex items-center justify-center rounded-lg border transform-gpu transition-all duration-150 active:scale-[0.96] outline-none focus:outline-none'
const iconButtonIdle =
  'border-white/10 bg-white/[0.06] hover:bg-white/[0.14] text-white/85'

/**
 * Title bar of the overlay card. Every pixel that is not a button or a tab
 * moves the card, so there is always a large target to grab.
 */
export function OverlayTitleBar<T extends string>({
  stealthEnabled,
  isRecording,
  isStarting,
  incognitoMode,
  isCollapsed,
  tabs,
  activeTab,
  onSelectTab,
  onToggleCollapsed,
  onToggleRecording,
  onToggleStealth,
  onToggleIncognito,
  onClose,
  onLogoClick,
  onDragMouseDown
}: OverlayTitleBarProps<T>) {
  const [tooltip, setTooltip] = useState<{ text: string; left: number } | null>(null)
  const [clampedLeft, setClampedLeft] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)

  const showTooltip = (text: string, element: HTMLElement) => {
    const bar = barRef.current
    if (!bar) return
    const buttonRect = element.getBoundingClientRect()
    const barRect = bar.getBoundingClientRect()
    setTooltip({ text, left: buttonRect.left - barRect.left + buttonRect.width / 2 })
  }

  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current || !barRef.current) {
      setClampedLeft(null)
      return
    }
    const half = tooltipRef.current.offsetWidth / 2
    const margin = 4
    const minCenter = half + margin
    const maxCenter = Math.max(minCenter, barRef.current.clientWidth - half - margin)
    setClampedLeft(Math.min(Math.max(tooltip.left, minCenter), maxCenter))
  }, [tooltip])

  const handleBarMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    setTooltip(null)
    onDragMouseDown(event)
  }

  const tipProps = (text: string) => ({
    onMouseEnter: (e: ReactMouseEvent<HTMLButtonElement>) => showTooltip(text, e.currentTarget),
    onMouseLeave: () => setTooltip(null),
  })

  return (
    <div
      ref={barRef}
      className={`relative h-11 shrink-0 flex items-center gap-1.5 pl-2.5 pr-2 select-none cursor-default ${
        isCollapsed ? '' : 'border-b border-white/10'
      }`}
      onMouseDown={handleBarMouseDown}
    >
      <button
        type="button"
        onClick={onLogoClick}
        onMouseDown={(e) => { setTooltip(null); onDragMouseDown(e) }}
        className="w-7 h-7 shrink-0 flex items-center justify-center cursor-default"
        {...tipProps('Open dashboard')}
      >
        <img src={ravenLogo} alt="Raven" className="w-6 h-6 object-contain" draggable={false} />
      </button>

      {!isCollapsed && tabs.length > 0 && (
        <div className="flex items-center gap-3 ml-1.5 min-w-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`h-11 shrink-0 text-xs font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-white border-[#4169E1]'
                  : 'text-white/50 border-transparent hover:text-white/75'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Empty space: the drag handle */}
      <div className="flex-1 min-w-2 self-stretch" />

      <TitleButton
        onClick={onToggleCollapsed}
        className={`${iconButtonBase} ${iconButtonIdle}`}
        label={isCollapsed ? 'Show panel' : 'Hide panel'}
        tipProps={tipProps}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          className={`transition-transform duration-150 ${isCollapsed ? 'rotate-180' : ''}`}
        >
          <path d="M2 8L6 4L10 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </TitleButton>

      <TitleButton
        onClick={onToggleRecording}
        disabled={isStarting}
        className={`${iconButtonBase} disabled:opacity-70 ${
          isRecording
            ? 'border-red-300/30 bg-red-500/25 hover:bg-red-500/35 text-red-100'
            : iconButtonIdle
        }`}
        label={isRecording ? 'Stop Session' : 'Start Session'}
        tipProps={tipProps}
      >
        {isStarting ? (
          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round" />
          </svg>
        ) : isRecording ? (
          <div className="w-2.5 h-2.5 bg-current rounded-[2px]" />
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24">
            <path fill="currentColor" d="M12 3a4 4 0 0 0-4 4v4.5a4 4 0 1 0 8 0V7a4 4 0 0 0-4-4Z" />
            <path fill="currentColor" d="M6.25 11.5a.75.75 0 0 1 .75.75 5 5 0 0 0 10 0 .75.75 0 0 1 1.5 0 6.5 6.5 0 0 1-5.75 6.46V21a.75.75 0 0 1-1.5 0v-2.29A6.5 6.5 0 0 1 5.5 12.25a.75.75 0 0 1 .75-.75Z" />
          </svg>
        )}
      </TitleButton>

      <span className="w-px h-4 mx-0.5 bg-white/15 shrink-0" />

      <TitleButton
        onClick={onToggleStealth}
        className={`${iconButtonBase} ${
          stealthEnabled
            ? 'border-blue-300/30 bg-gradient-to-b from-blue-500 to-blue-700 text-white'
            : iconButtonIdle
        }`}
        label={stealthEnabled ? 'Raven is Undetectable' : 'Raven is Detectable'}
        ariaLabel={stealthEnabled ? 'Turn undetectability off' : 'Turn undetectability on'}
        tipProps={tipProps}
      >
        {stealthEnabled ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c5.6 0 9.4 4.1 10.6 7.9a.8.8 0 0 1 0 .2 15 15 0 0 1-3 4.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6 6.2a15.2 15.2 0 0 0-4.6 5.7.8.8 0 0 0 0 .2C2.6 15.9 6.4 20 12 20c1.4 0 2.7-.2 3.9-.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M1.5 12s3.7-8 10.5-8 10.5 8 10.5 8-3.7 8-10.5 8S1.5 12 1.5 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
          </svg>
        )}
      </TitleButton>

      <TitleButton
        onClick={onToggleIncognito}
        className={`${iconButtonBase} ${
          incognitoMode
            ? 'border-purple-400/30 bg-gradient-to-b from-purple-500/80 to-purple-700/80'
            : iconButtonIdle
        }`}
        label={incognitoMode ? 'Incognito ON - Session not saved' : 'Incognito OFF'}
        tipProps={tipProps}
      >
        <img src={incognitoIcon} alt="Incognito" width={14} height={14} className={incognitoMode ? 'opacity-100' : 'opacity-80'} />
      </TitleButton>

      <TitleButton
        onClick={onClose}
        className={`${iconButtonBase} border-transparent text-white/55 hover:text-white hover:bg-white/[0.12]`}
        label="Hide Raven"
        tipProps={tipProps}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </TitleButton>

      {tooltip && (
        <div
          ref={tooltipRef}
          className="absolute top-full mt-1.5 px-3 py-1.5 text-white text-xs font-medium rounded-full whitespace-nowrap z-[100] pointer-events-none border border-white/15 bg-gradient-to-b from-[#353c4e] to-[#202633] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.35)]"
          style={{ left: clampedLeft ?? tooltip.left, transform: 'translateX(-50%)' }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}

function TitleButton({
  onClick,
  disabled,
  className,
  label,
  ariaLabel,
  tipProps,
  children
}: {
  onClick: () => void
  disabled?: boolean
  className: string
  label: string
  ariaLabel?: string
  tipProps: (text: string) => {
    onMouseEnter: (e: ReactMouseEvent<HTMLButtonElement>) => void
    onMouseLeave: () => void
  }
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel ?? label}
      {...tipProps(label)}
    >
      {children}
    </button>
  )
}
