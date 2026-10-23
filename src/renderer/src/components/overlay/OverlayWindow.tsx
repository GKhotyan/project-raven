import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  type CSSProperties,
} from 'react'
import Markdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark-dimmed.css'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Wand2, MessageSquareText, RotateCcw, ChevronRight } from 'lucide-react'
import { OverlayTitleBar, type OverlayTab } from './OverlayTitleBar'
import { TranscriptTab } from './TranscriptTab'
import { ScreenshotStrip } from './ScreenshotStrip'
import { OverlayNotification, type NotificationData } from './OverlayNotification'
import { useOverlayResize, type ResizeEdge } from './useOverlayResize'
import { useOverlayDrag } from './useOverlayDrag'
import { useMousePassthrough } from './useMousePassthrough'
import { createLogger } from '../../lib/logger'
import { fileBytes, imageFromItems } from '../../lib/clipboardImages'
import { detectMacPlatform, modifierLabel } from '../../lib/shortcutLabels'
import { sentScreenshotsLabel } from '../../../../shared/screenshots'
import {
  EMPTY_OVERLAY_INSETS,
  placeOverlayPanel,
  type OverlayInsets,
} from '../../lib/overlayPanelLayout'

const assistModKey = modifierLabel(detectMacPlatform())

const log = createLogger('OverlayWindow')

/** If `claude:response` start never arrives, unlatch so later clicks work. */
const AI_START_WATCHDOG_MS = 8_000

interface ResponseCard {
  id: string
  content: string
  action: string
  badgeVariant: 'quick' | 'custom' | 'system'
  screenshotCount: number
  /** Of those, sent as their text description instead of the image. */
  screenshotTextCount?: number
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const codeRef = useRef<HTMLPreElement>(null)

  const handleCopy = async () => {
    const text = codeRef.current?.textContent ?? ''
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard not available */ }
  }

  return (
    <div className="relative group/code">
      <pre ref={codeRef}>{children}</pre>
      <button
        type="button"
        onClick={() => { void handleCopy() }}
        className="absolute top-2 right-2 w-7 h-7 rounded-md flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/50 hover:text-white transition-all opacity-0 group-hover/code:opacity-100"
        title={copied ? 'Copied!' : 'Copy code'}
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M20 7L10 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </div>
  )
}

function KeyCap({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex justify-center items-center shrink-0 h-[18px] min-w-[18px] px-1 rounded-[5px] text-[10px] text-white/50"
      style={{ border: '1px solid rgba(255,255,255,0.2)', background: 'linear-gradient(to bottom, rgba(0,0,0,0.12), rgba(0,0,0,0.18))' }}
    >
      {children}
    </span>
  )
}

const quickActions = [
  { action: 'assist', label: 'Assist', Icon: Sparkles },
  { action: 'what-should-i-say', label: 'What should I say?', Icon: Wand2 },
  { action: 'follow-up', label: 'Follow-up questions', Icon: MessageSquareText },
  { action: 'recap', label: 'Recap', Icon: RotateCcw },
] as const

const getActionLabel = (action?: string): string => {
  switch (action) {
    case 'assist':
      return 'Assist'
    case 'what-should-i-say':
      return 'What should I say?'
    case 'follow-up':
      return 'Follow-up questions'
    case 'recap':
      return 'Recap'
    case 'tell-me-more':
      return 'Tell me more'
    case 'custom':
      return 'Question'
    default:
      return 'Assist'
  }
}

export function OverlayWindow() {
  const [safeInsets, setSafeInsets] = useState<OverlayInsets>(EMPTY_OVERLAY_INSETS)
  const resize = useOverlayResize(safeInsets)
  const {
    panelWidth, panelRight, panelBottom, panelHeight,
    setPanelRight, setPanelBottom, setPanelHeight,
    handleResizeStart,
    handleResizeDoubleClick,
    cleanupResize,
    EDGE_CURSORS,
    OVERLAY_DEFAULT_COMPACT_HEIGHT,
  } = resize

  // Hit-test refs for mouse passthrough
  const panelRef = useRef<HTMLDivElement | null>(null)
  const notificationRef = useRef<HTMLDivElement | null>(null)
  const screenshotViewerRef = useRef<HTMLDivElement | null>(null)

  const { setOverlayMouseIgnore } = useMousePassthrough({ panelRef, notificationRef, screenshotViewerRef })

  const getPanelHeight = useCallback(
    () => panelRef.current?.offsetHeight ?? OVERLAY_DEFAULT_COMPACT_HEIGHT,
    [OVERLAY_DEFAULT_COMPACT_HEIGHT],
  )
  const layoutRef = useRef({
    panelWidth,
    panelRight,
    panelBottom,
    panelHeight,
    safeInsets,
  })
  layoutRef.current = { panelWidth, panelRight, panelBottom, panelHeight, safeInsets }

  // State
  const [isRecording, setIsRecording] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [stealthEnabled, setStealthEnabled] = useState(false)
  const [incognitoMode, setIncognitoMode] = useState(false)
  // "Hide panel" folds the card down to its title bar
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [responses, setResponses] = useState<ResponseCard[]>([])
  const [isLoadingResponse, setIsLoadingResponse] = useState(false)
  const [activeResponseId, setActiveResponseId] = useState<string | null>(null)
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hoveredResponseId, setHoveredResponseId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<NotificationData[]>([])
  const [limitInfo, setLimitInfo] = useState<{ type: 'ai' | 'session'; used: number; limit: number; resetAt: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'responses' | 'transcript'>('transcript')
  const scrollHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refs
  const inputRef = useRef<HTMLInputElement>(null)
  const activeResponseIdRef = useRef<string | null>(null)
  const requestInFlightRef = useRef(false)
  const aiStartWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const responseAreaRef = useRef<HTMLDivElement | null>(null)
  const copiedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notificationTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const hasResponse = responses.length > 0 || isLoadingResponse
  const isPanelExpanded = hasResponse || isRecording
  const layoutMode: 'collapsed' | 'idle' | 'expanded' =
    isCollapsed ? 'collapsed' : isPanelExpanded ? 'expanded' : 'idle'

  const { handleLogoClick, handleDragMouseDown, cleanupDrag } = useOverlayDrag({
    panelRight, panelBottom, panelWidth, getPanelHeight,
    insets: safeInsets,
    setPanelRight, setPanelBottom, setOverlayMouseIgnore,
  })

  // Initialize
  useEffect(() => {
    window.raven.storeGet('stealthEnabled').then((enabled) => {
      if (typeof enabled === 'boolean') setStealthEnabled(enabled)
    }).catch(() => {})

    window.raven.storeGet('incognitoMode').then((enabled) => {
      if (typeof enabled === 'boolean') setIncognitoMode(enabled)
    }).catch(() => {})

    window.raven.audioGetState().then((state) => {
      setIsRecording(state.isRecording)
    }).catch((err) => log.error('Failed to get audio state:', err))

    const loadInsets = () => {
      void window.raven.windowGetOverlaySafeInsets?.().then((insets) => {
        if (insets && typeof insets.top === 'number') setSafeInsets(insets)
      }).catch(() => {})
    }
    loadInsets()
    window.addEventListener('resize', loadInsets)

    const unsubStealth = window.raven.onStealthChanged((enabled: boolean) => {
      setStealthEnabled(enabled)
    })

    const unsubRecording = window.raven.onRecordingStateChanged((state) => {
      setIsRecording(state.isRecording)
      if (!state.isRecording) {
        setIsStarting(false)
      }
    })

    const unsubNotification = window.raven.on('overlay:notification', (data: unknown) => {
      const n = data as NotificationData
      if (n?.id) {
        pushNotification(n)
      }
    })

    const unsubClaude = window.raven.onClaudeResponse((data) => {
      const clearWatchdog = () => {
        if (aiStartWatchdogRef.current) {
          clearTimeout(aiStartWatchdogRef.current)
          aiStartWatchdogRef.current = null
        }
      }
      if (data.type === 'start') {
        clearWatchdog()
        requestInFlightRef.current = true
        setIsLoadingResponse(true)
        setLimitInfo(null)
        const entryId = data.messageId || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        setActiveResponseId(entryId)
        activeResponseIdRef.current = entryId

        setResponses((prev) => [
          ...prev,
          {
            id: entryId,
            content: '',
            action: data.userMessage?.content?.trim() || getActionLabel(data.userMessage?.action),
            badgeVariant:
              data.userMessage?.action === 'custom' && Boolean(data.userMessage?.content?.trim())
                ? 'custom'
                : 'quick',
            screenshotCount: data.requestMeta?.screenshotCount ?? 0,
            screenshotTextCount: data.requestMeta?.screenshotTextCount ?? 0
          }
        ])
      } else if (data.type === 'delta') {
        setIsLoadingResponse(false)
        const targetId = data.messageId || activeResponseIdRef.current
        if (!targetId) return
        setResponses((prev) =>
          prev.map((entry) =>
            entry.id === targetId
              ? { ...entry, content: data.fullText || '' }
              : entry
          )
        )
      } else if (data.type === 'done') {
        clearWatchdog()
        requestInFlightRef.current = false
        setIsLoadingResponse(false)
        const targetId = data.messageId || activeResponseIdRef.current
        if (targetId) {
          setResponses((prev) =>
            prev.map((entry) =>
              entry.id === targetId
                ? { ...entry, content: data.fullText || entry.content }
                : entry
            )
          )
        }
        setActiveResponseId(null)
        activeResponseIdRef.current = null
      } else if (data.type === 'error') {
        clearWatchdog()
        requestInFlightRef.current = false
        setIsLoadingResponse(false)

        if (data.error === 'LIMIT_REACHED' && data.limitInfo) {
          setLimitInfo({ type: 'ai', ...data.limitInfo })
        } else {
          setResponses((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              content: data.error || 'Something went wrong',
              action: 'Error',
              badgeVariant: 'system',
              screenshotCount: 0
            }
          ])
        }
        setActiveResponseId(null)
        activeResponseIdRef.current = null
      } else if (data.type === 'cleared') {
        clearWatchdog()
        requestInFlightRef.current = false
        setResponses([])
        setLimitInfo(null)
        setActiveResponseId(null)
        activeResponseIdRef.current = null
        setHoveredMessageId(null)
      } else if (data.type === 'restored') {
        // A saved session was resumed: replace whatever is on screen with
        // the earlier sitting's answers so the user can scroll back to them.
        clearWatchdog()
        requestInFlightRef.current = false
        setIsLoadingResponse(false)
        setLimitInfo(null)
        setActiveResponseId(null)
        activeResponseIdRef.current = null
        setHoveredMessageId(null)
        setResponses(
          (data.restoredResponses ?? []).map((r) => {
            // Sessions saved before userMessage existed on AI responses
            // resume with it undefined; fall back to the action label.
            const asked = (r.userMessage ?? '').trim()
            const isCustom = r.action === 'custom' && asked.length > 0
            return {
              id: r.id,
              content: r.response ?? '',
              action: isCustom ? asked : getActionLabel(r.action),
              badgeVariant: isCustom ? 'custom' : 'quick',
              screenshotCount: 0,
            }
          }),
        )
      }
    })

    const unsubAi = window.raven.onHotkeyAiSuggestion(async () => {
      await handleAssist()
    })

    const unsubSessionLimit = window.raven.onSessionLimit(() => {
      setLimitInfo({
        type: 'session',
        used: 1,
        limit: 1,
        resetAt: '',
      })
    })

    return () => {
      unsubStealth()
      unsubRecording()
      unsubNotification()
      unsubClaude()
      unsubAi()
      unsubSessionLimit()
      cleanupResize()
      if (copiedResetTimerRef.current) {
        clearTimeout(copiedResetTimerRef.current)
        copiedResetTimerRef.current = null
      }
      // notificationTimersRef holds a useRef(new Map()) whose reference
      // never changes for the component's lifetime (the Map identity is
      // stable; only its contents mutate). The linter still warns because
      // in the general case a ref can be reassigned - here it cannot.
      notificationTimersRef.current.forEach(t => clearTimeout(t))
      // eslint-disable-next-line react-hooks/exhaustive-deps
      notificationTimersRef.current.clear()
      if (scrollHideTimerRef.current) {
        clearTimeout(scrollHideTimerRef.current)
        scrollHideTimerRef.current = null
      }
      if (aiStartWatchdogRef.current) {
        clearTimeout(aiStartWatchdogRef.current)
        aiStartWatchdogRef.current = null
      }
      cleanupDrag()
      setOverlayMouseIgnore(false)
      window.removeEventListener('resize', loadInsets)
    }
    // cleanupDrag, cleanupResize and isRecording are intentionally omitted:
    // this effect runs once per overlay mount to wire up global listeners.
    // Re-running on those would double-register listeners / leak cleanups.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setOverlayMouseIgnore])

  useEffect(() => {
    const MOVE_STEP = 50
    const unsub = window.raven.onHotkeyMove((direction: 'up' | 'down' | 'left' | 'right') => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const { panelWidth: w, panelRight: r, panelBottom: b, safeInsets: insets } = layoutRef.current
      const height = getPanelHeight()
      let nextRight = r
      let nextBottom = b
      switch (direction) {
        case 'up':
          nextBottom = b + MOVE_STEP
          break
        case 'down':
          nextBottom = b - MOVE_STEP
          break
        case 'left':
          nextRight = r + MOVE_STEP
          break
        case 'right':
          nextRight = r - MOVE_STEP
          break
      }
      const placed = placeOverlayPanel({
        viewportWidth: vw,
        viewportHeight: vh,
        insets,
        width: w,
        height,
        right: nextRight,
        bottom: nextBottom,
        previousHeight: height,
      })
      setPanelRight(placed.right)
      setPanelBottom(placed.bottom)
    })
    return () => unsub()
  }, [setPanelRight, setPanelBottom, getPanelHeight])

  useEffect(() => {
    if (!responseAreaRef.current) return
    if (isAtBottom) {
      responseAreaRef.current.scrollTop = responseAreaRef.current.scrollHeight
    }
  }, [responses, isLoadingResponse, isAtBottom])

  const handleResponseScroll = useCallback(() => {
    const el = responseAreaRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30
    setIsAtBottom(atBottom)

    el.classList.add('is-scrolling')
    if (scrollHideTimerRef.current) clearTimeout(scrollHideTimerRef.current)
    scrollHideTimerRef.current = setTimeout(() => {
      el.classList.remove('is-scrolling')
    }, 1200)
  }, [])

  const scrollToBottom = useCallback(() => {
    if (!responseAreaRef.current) return
    responseAreaRef.current.scrollTo({ top: responseAreaRef.current.scrollHeight, behavior: 'smooth' })
    setIsAtBottom(true)
  }, [])

  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      await window.raven.audioStopRecording()
    } else {
      setIsStarting(true)
      setResponses([])
      setActiveResponseId(null)
      activeResponseIdRef.current = null
      await window.raven.claudeClearHistory?.()

      try {
        const micId = await window.raven.storeGet('selectedMicrophone')
        const result = await window.raven.audioStartRecording(
          typeof micId === 'string' && micId ? micId : undefined,
        ) as { success: boolean; code?: string; error?: string }
        if (result && !result.success) {
          if (result.code === 'SESSION_LIMIT') {
            setLimitInfo({ type: 'session', used: 1, limit: 1, resetAt: '' })
          } else {
            // Any other failure (mic/screen permission denied, capture
            // backend failed to start, etc.) used to silently leave the user
            // staring at an overlay that briefly showed "starting" and
            // then went back to idle with no explanation. Surface the
            // main-process error string as an overlay notification so
            // the user knows what went wrong + can remediate.
            const errorMessage = result.error?.trim() || 'Unable to start recording. Please try again.'
            pushNotification({
              id: `start-fail-${Date.now()}`,
              title: 'Recording failed to start',
              body: errorMessage,
              type: 'error',
              autoDismissMs: 8000,
            })
          }
          setIsStarting(false)
          return
        }
        await new Promise(resolve => setTimeout(resolve, 3000))
        setIsStarting(false)
      } catch (err) {
        log.error('Failed to start recording:', err)
        pushNotification({
          id: `start-fail-${Date.now()}`,
          title: 'Recording failed to start',
          body: err instanceof Error ? err.message : 'The recording IPC call failed unexpectedly.',
          type: 'error',
          autoDismissMs: 8000,
        })
        await window.raven.audioStopRecording()
        setIsStarting(false)
      }
    }
    // pushNotification is a stable useCallback defined later in the component,
    // so it cannot be referenced in this dependency array (temporal dead zone)
    // and does not need to be — its identity never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording])

  useEffect(() => {
    const unsub = window.raven.onHotkeyToggleRecording(() => {
      handleToggleRecording()
    })
    return () => unsub()
  }, [handleToggleRecording])

  // Hotkey: clear conversation (Cmd/Ctrl+Shift+Backspace).
  // The hotkey was previously registered in main + broadcast as
  // 'hotkey:clear-conversation', but no overlay subscriber existed, so
  // pressing it silently did nothing. Clear responses locally and ask
  // ClaudeService to drop its conversation history so the NEXT AI
  // request starts fresh.
  useEffect(() => {
    const unsub = window.raven.onHotkeyClearConversation(() => {
      setResponses([])
      setActiveResponseId(null)
      activeResponseIdRef.current = null
      setIsLoadingResponse(false)
      requestInFlightRef.current = false
      setLimitInfo(null)
      window.raven.claudeClearHistory?.().catch(() => { /* best-effort */ })
    })
    return () => unsub()
  }, [])

  // Hotkeys: scroll the response area (Cmd/Ctrl+Shift+Up/Down).
  // Same bug class - registered in main but no overlay listener, so
  // the hotkeys were quietly dead. Scroll by half the visible height
  // per press; users who want finer control can use trackpad scroll.
  useEffect(() => {
    const scrollByFraction = (direction: 'up' | 'down') => {
      const el = responseAreaRef.current
      if (!el) return
      const step = Math.max(80, Math.round(el.clientHeight / 2))
      el.scrollBy({
        top: direction === 'up' ? -step : step,
        behavior: 'smooth',
      })
    }
    const unsubUp = window.raven.onHotkeyScrollUp(() => scrollByFraction('up'))
    const unsubDown = window.raven.onHotkeyScrollDown(() => scrollByFraction('down'))
    return () => {
      unsubUp()
      unsubDown()
    }
  }, [])

  const handleHide = () => {
    setOverlayMouseIgnore(true)
    window.raven.windowHide()
  }

  const handleToggleStealth = useCallback(async () => {
    const next = !stealthEnabled
    setStealthEnabled(next)
    try {
      await window.raven.windowSetStealth(next)
    } catch {
      setStealthEnabled(!next)
    }
  }, [stealthEnabled])

  const dismissNotification = useCallback((id: string) => {
    const timer = notificationTimersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      notificationTimersRef.current.delete(id)
    }
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  // Helper so every notification callsite - IPC-broadcast and in-component
  // direct pushes - gets the auto-dismiss timer registered uniformly. The
  // previous code only registered the timer inside the IPC handler, so any
  // direct setNotifications(prev => [...prev, n]) in this file produced a
  // notification that never disappeared. Route everything through this.
  const pushNotification = useCallback((n: NotificationData) => {
    setNotifications(prev => [...prev, n])
    if (n.autoDismissMs) {
      const timerId = setTimeout(() => {
        setNotifications(prev => prev.filter(x => x.id !== n.id))
        notificationTimersRef.current.delete(n.id)
      }, n.autoDismissMs)
      notificationTimersRef.current.set(n.id, timerId)
    }
  }, [])

  // Meeting auto-start: main detects a Zoom/Meet/Teams/Webex window and pushes
  // this event. In 'auto' mode it also asks us to start immediately; in
  // 'prompt' mode we show a toast with a Start button. The action's onClick is
  // built here (functions can't cross IPC), which is why this is a dedicated
  // channel rather than the generic overlay:notification path.
  useEffect(() => {
    const unsub = window.raven.on('meeting:detected', (data: unknown) => {
      const d = (data ?? {}) as { platform?: string; title?: string; autoStart?: boolean }
      if (isRecording) return

      const platformLabel =
        d.platform === 'zoom'
          ? 'Zoom'
          : d.platform === 'teams'
            ? 'Microsoft Teams'
            : d.platform === 'meet'
              ? 'Google Meet'
              : d.platform === 'webex'
                ? 'Webex'
                : 'a'

      if (d.autoStart) {
        void handleToggleRecording()
        pushNotification({
          id: `meeting-auto-${Date.now()}`,
          title: 'Recording started',
          body: `${platformLabel} meeting detected.`,
          type: 'meeting',
          autoDismissMs: 5000,
        })
        return
      }

      const id = `meeting-${Date.now()}`
      pushNotification({
        id,
        title: 'Meeting detected',
        body: `Start Raven for your ${platformLabel} meeting?`,
        type: 'meeting',
        autoDismissMs: 15000,
        action: {
          label: 'Start Raven',
          onClick: () => {
            dismissNotification(id)
            void handleToggleRecording()
          },
        },
      })
    })
    return () => unsub()
  }, [isRecording, handleToggleRecording, pushNotification, dismissNotification])

  const handleToggleIncognito = useCallback(async () => {
    const next = !incognitoMode
    setIncognitoMode(next)
    await window.raven.storeSet('incognitoMode', next)
  }, [incognitoMode])

  const clearAiStartWatchdog = useCallback(() => {
    if (aiStartWatchdogRef.current) {
      clearTimeout(aiStartWatchdogRef.current)
      aiStartWatchdogRef.current = null
    }
  }, [])

  const armAiStartWatchdog = useCallback(() => {
    clearAiStartWatchdog()
    aiStartWatchdogRef.current = setTimeout(() => {
      aiStartWatchdogRef.current = null
      if (!requestInFlightRef.current || activeResponseIdRef.current) return
      requestInFlightRef.current = false
      setIsLoadingResponse(false)
      setResponses((prev) => [
        ...prev,
        {
          id: `ai-timeout-${Date.now()}`,
          content: 'Raven did not start a reply. Check the AI API key in Settings, then try again.',
          action: 'Error',
          badgeVariant: 'system',
          screenshotCount: 0,
        },
      ])
    }, AI_START_WATCHDOG_MS)
  }, [clearAiStartWatchdog])

  const [screenshotError, setScreenshotError] = useState<string | null>(null)

  const addScreenshotFile = useCallback(async (file: File) => {
    setScreenshotError(null)
    const res = await window.raven.screenshots.add(await fileBytes(file))
    if (!res.ok) setScreenshotError(res.error)
  }, [])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromItems(Array.from(e.clipboardData?.items ?? []))
      if (!file) return // plain text: let the input handle it
      e.preventDefault()
      void addScreenshotFile(file)
    }
    // Without preventDefault on dragover/drop Electron navigates the overlay to the dropped file.
    const onDragOver = (e: DragEvent) => { e.preventDefault() }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      const file = imageFromItems(Array.from(e.dataTransfer?.items ?? []))
      if (file) void addScreenshotFile(file)
      else if (e.dataTransfer?.files.length) setScreenshotError('Only PNG and JPEG images can be added.')
    }
    window.addEventListener('paste', onPaste)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [addScreenshotFile])

  const beginAiRequest = useCallback(async (opts: {
    action: string
    customPrompt?: string
  }) => {
    if (requestInFlightRef.current) return
    requestInFlightRef.current = true
    setIsAtBottom(true)
    setIsLoadingResponse(true)
    setActiveTab('responses')
    armAiStartWatchdog()

    try {
      const transcript = await window.raven.getTranscript()
      const activeMode = await window.raven.modes.getActive()
      if (!requestInFlightRef.current) return
      await window.raven.claudeGetResponse({
        transcript,
        action: opts.action,
        customPrompt: opts.customPrompt,
        modePrompt: activeMode?.systemPrompt,
        modeId: activeMode?.id,
      })
    } catch (error) {
      clearAiStartWatchdog()
      requestInFlightRef.current = false
      setIsLoadingResponse(false)
      log.error('AI request failed:', error)
      setResponses((prev) => [
        ...prev,
        {
          id: `ai-fail-${Date.now()}`,
          content: error instanceof Error ? error.message : 'Could not reach Raven. Try again.',
          action: 'Error',
          badgeVariant: 'system',
          screenshotCount: 0,
        },
      ])
    }
  }, [armAiStartWatchdog, clearAiStartWatchdog])

  const handleAssist = async () => {
    await beginAiRequest({ action: 'assist' })
  }

  const handleQuickAction = async (action: string) => {
    await beginAiRequest({ action })
  }

  const handleSend = async () => {
    if (requestInFlightRef.current) return

    const trimmed = inputValue.trim()
    if (!trimmed) return
    setInputValue('')
    await beginAiRequest({
      action: 'custom',
      customPrompt: trimmed,
    })
  }

  const handleToggleCollapsed = () => {
    setIsCollapsed((prev) => !prev)
  }

  const handleCopyAction = useCallback(async (entryId: string, text: string) => {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedMessageId(entryId)
      if (copiedResetTimerRef.current) {
        clearTimeout(copiedResetTimerRef.current)
      }
      copiedResetTimerRef.current = setTimeout(() => {
        setCopiedMessageId((current) => (current === entryId ? null : current))
      }, 1200)
    } catch (error) {
      log.error('Failed to copy message:', error)
    }
  }, [])


  useEffect(() => {
    if (hasResponse && activeTab !== 'responses') {
      setActiveTab('responses')
    }
    // activeTab intentionally omitted: we want to JUMP to 'responses' when
    // a new response arrives, not lock the user out of switching tabs
    // while one exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasResponse])

  useEffect(() => {
    if (activeTab === 'responses' && responseAreaRef.current) {
      requestAnimationFrame(() => {
        if (responseAreaRef.current) {
          responseAreaRef.current.scrollTop = responseAreaRef.current.scrollHeight
        }
      })
    }
  }, [activeTab])

  useEffect(() => {
    if (isRecording && !hasResponse) {
      setActiveTab('transcript')
    }
    // hasResponse intentionally omitted: we want to auto-switch to the
    // transcript tab only when recording STARTS (not every time a response
    // toggles on/off while recording is ongoing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording])

  useEffect(() => {
    if (limitInfo) {
      setActiveTab('responses')
    }
  }, [limitInfo])

  useEffect(() => {
    const { panelWidth: w, panelRight: r, panelBottom: b } = layoutRef.current
    const height = getPanelHeight()
    const placed = placeOverlayPanel({
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      insets: safeInsets,
      width: w,
      height,
      right: r,
      bottom: b,
      previousHeight: height,
    })
    if (placed.bottom !== b) setPanelBottom(placed.bottom)
    if (placed.right !== r) setPanelRight(placed.right)
  }, [safeInsets, setPanelBottom, setPanelRight, getPanelHeight])

  // Re-place the card when it switches between collapsed / idle / expanded.
  // Runs before paint with the new height already in the DOM, so the card
  // never flashes in the wrong spot. Collapsing and un-collapsing keep the
  // title bar in place; idle <-> expanded grows into free space as before.
  const prevLayoutModeRef = useRef(layoutMode)
  const renderedHeightRef = useRef<number | null>(null)
  useLayoutEffect(() => {
    const prevMode = prevLayoutModeRef.current
    prevLayoutModeRef.current = layoutMode
    const prevHeight = renderedHeightRef.current
    const el = panelRef.current
    if (prevMode === layoutMode || prevHeight == null || !el) return

    const height = el.offsetHeight
    const { panelWidth: w, panelRight: r, panelBottom: b, safeInsets: insets } = layoutRef.current
    const keepTop = prevMode === 'collapsed' || layoutMode === 'collapsed'
    const placed = placeOverlayPanel({
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      insets,
      width: w,
      height,
      right: r,
      bottom: keepTop ? b + prevHeight - height : b,
      previousHeight: keepTop ? height : prevHeight,
    })
    if (layoutMode === 'expanded' && placed.height !== height) setPanelHeight(placed.height)
    setPanelBottom(placed.bottom)
    setPanelRight(placed.right)
  }, [layoutMode, setPanelHeight, setPanelBottom, setPanelRight])

  // Declared after the effect above so it still sees the previous height.
  useLayoutEffect(() => {
    renderedHeightRef.current = panelRef.current?.offsetHeight ?? null
  })

  const tabs: OverlayTab<'responses' | 'transcript'>[] = isPanelExpanded
    ? [
        ...(hasResponse || !isRecording ? [{ id: 'responses' as const, label: 'Responses' }] : []),
        { id: 'transcript' as const, label: 'Transcript' },
      ]
    : []

  const resizeEdges: { edge: ResizeEdge; className: string }[] = [
    { edge: 'n', className: 'top-0 inset-x-3 h-1.5' },
    { edge: 's', className: 'bottom-0 inset-x-3 h-1.5' },
    { edge: 'w', className: 'left-0 inset-y-3 w-1.5' },
    { edge: 'e', className: 'right-0 inset-y-3 w-1.5' },
    { edge: 'nw', className: 'top-0 left-0 w-3 h-3' },
    { edge: 'ne', className: 'top-0 right-0 w-3 h-3' },
    { edge: 'sw', className: 'bottom-0 left-0 w-3 h-3' },
    { edge: 'se', className: 'bottom-0 right-0 w-3 h-3' },
  ]
  // Only the expanded card has a body worth stretching; the others size to content.
  const canResizeHeight = layoutMode === 'expanded'

  return (
    <div
      className="fixed inset-0 bg-transparent pointer-events-none"
      style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
    >
    {/* Notification area - top right */}
    <div
      ref={notificationRef}
      className="absolute top-4 right-4 flex flex-col gap-2 z-[80] pointer-events-none"
    >
      <AnimatePresence>
        {notifications.map(n => (
          <OverlayNotification key={n.id} notification={n} onDismiss={dismissNotification} />
        ))}
      </AnimatePresence>
    </div>

    {/* Main panel - one card: title bar on top, body below */}
    <div
      ref={panelRef}
      className="absolute flex flex-col rounded-2xl pointer-events-auto"
      style={{
        bottom: `${panelBottom}px`,
        right: `${panelRight}px`,
        width: `${panelWidth}px`,
        ...(layoutMode === 'expanded' ? { height: `${panelHeight}px` } : {}),
        maxHeight: `calc(100vh - ${safeInsets.top + safeInsets.bottom + 40}px)`,
        background: stealthEnabled ? '#18171c80' : '#18171ccc',
        boxShadow: '0 0 0 1px rgba(207,226,255,0.24), 0 -0.5px 0 0 rgba(255,255,255,0.8)',
      }}
    >
      {stealthEnabled && (
        <div
          className="absolute -inset-[10px] pointer-events-none z-[2] p-[0.6px]"
          aria-hidden="true"
        >
          <svg className="w-full h-full overflow-visible">
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              rx="16"
              ry="16"
              fill="none"
              stroke="rgba(118, 126, 142, 0.92)"
              strokeWidth="1.4"
              strokeDasharray="14 9"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      )}

      {/* Resize edges and corners, inside the border like a normal window */}
      {resizeEdges
        .filter(({ edge }) => canResizeHeight || edge === 'e' || edge === 'w')
        .map(({ edge, className }) => (
          <div
            key={edge}
            className={`absolute z-30 ${className}`}
            style={{ cursor: EDGE_CURSORS[edge] }}
            onMouseDown={(e) => { handleResizeStart(edge, e, canResizeHeight) }}
            onDoubleClick={() => { handleResizeDoubleClick(canResizeHeight) }}
          />
        ))}

      <OverlayTitleBar
        stealthEnabled={stealthEnabled}
        isRecording={isRecording}
        isStarting={isStarting}
        incognitoMode={incognitoMode}
        isCollapsed={isCollapsed}
        tabs={tabs}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onToggleCollapsed={handleToggleCollapsed}
        onToggleRecording={handleToggleRecording}
        onToggleStealth={handleToggleStealth}
        onToggleIncognito={handleToggleIncognito}
        onClose={handleHide}
        onLogoClick={handleLogoClick}
        onDragMouseDown={handleDragMouseDown}
      />

      {!isCollapsed && (
        <div className="relative z-[1] flex-1 min-h-0 flex flex-col rounded-b-2xl overflow-hidden">
        {/* Transcript Tab */}
        {isPanelExpanded && activeTab === 'transcript' && (
          <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
            <TranscriptTab />
          </div>
        )}

        {/* Response Area */}
        {hasResponse && activeTab === 'responses' && (
          <div className="relative flex-1 min-h-0">
          <div ref={responseAreaRef} onScroll={handleResponseScroll} className="overlay-scroll h-full overflow-y-auto px-4 pt-4 pb-4 space-y-4" style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 12px, black calc(100% - 12px), transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 12px, black calc(100% - 12px), transparent 100%)' }}>
            <AnimatePresence initial={false}>
            {responses.map((entry, index) => {
              const isLatest = index === responses.length - 1
              const isStreaming = isLoadingResponse && isLatest && activeResponseId === entry.id

              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                >
                  <div
                    className={`flex ${entry.badgeVariant === 'system' ? 'justify-start' : 'justify-end'} ${entry.screenshotCount > 0 ? 'mb-1' : 'mb-3'}`}
                    onMouseEnter={() => setHoveredMessageId(entry.id)}
                    onMouseLeave={() => {
                      setHoveredMessageId((current) => (current === entry.id ? null : current))
                    }}
                  >
                    <div className={`flex items-center gap-1 ${entry.badgeVariant === 'system' ? 'flex-row-reverse' : ''}`}>
                      <button
                        type="button"
                        onClick={() => {
                          void handleCopyAction(entry.id, entry.action)
                        }}
                        className={`p-2 flex items-center justify-center transition-all duration-200 ${
                          hoveredMessageId === entry.id
                            ? 'opacity-60 text-white/55'
                            : 'opacity-0 pointer-events-none text-white/40'
                        } hover:opacity-100 hover:text-white hover:scale-125 active:scale-90`}
                        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
                        title={copiedMessageId === entry.id ? 'Copied' : 'Copy'}
                      >
                        {copiedMessageId === entry.id ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M20 7L10 17l-5-5"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
                            <path d="M408 480H184a72 72 0 0 1-72-72V184a72 72 0 0 1 72-72h224a72 72 0 0 1 72 72v224a72 72 0 0 1-72 72z" />
                            <path d="M160 80h235.88A72.12 72.12 0 0 0 328 32H104a72 72 0 0 0-72 72v224a72.12 72.12 0 0 0 48 67.88V160a80 80 0 0 1 80-80z" />
                          </svg>
                        )}
                      </button>
                      <span
                        className={`px-2.5 py-1.5 text-xs font-medium text-white rounded-xl ${
                          entry.badgeVariant === 'system'
                            ? 'rounded-bl-sm bg-gradient-to-r from-red-500 to-rose-600'
                            : entry.badgeVariant === 'custom'
                              ? 'rounded-br-sm bg-gradient-to-b from-blue-500 to-blue-700'
                              : 'rounded-br-sm bg-gradient-to-r from-purple-500 to-blue-500'
                        }`}
                      >
                        {entry.action}
                      </span>
                    </div>
                  </div>
                  {entry.screenshotCount > 0 && (
                    <div className="flex justify-end mb-3">
                      <span className="text-[11px] font-medium text-white/40">
                        {sentScreenshotsLabel(entry.screenshotCount, entry.screenshotTextCount ?? 0)}
                      </span>
                    </div>
                  )}

                  <div
                    className="max-w-[90%]"
                    onMouseEnter={() => setHoveredResponseId(entry.id)}
                    onMouseLeave={() => setHoveredResponseId((c) => (c === entry.id ? null : c))}
                  >
                  {isStreaming && !entry.content ? (
                    <div className="flex items-center gap-1.5 text-white/40 py-2">
                      <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" />
                      <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                    </div>
                  ) : (
                    // Overlay is ~400px wide, so prose-sm's default heading
                    // sizes (h1 ~32px, h2 ~24px) wrap to 3-4 lines. We
                    // override per-element so all heading levels render at
                    // near-body-text size. System prompt asks the model not
                    // to emit markdown headers, but Claude sometimes ignores
                    // that for long-form answers and users paste
                    // heading-rich content too - so this override is
                    // defensive, not a stylistic preference.
                    <div className="prose prose-sm prose-light max-w-none tracking-[-0.01em] pr-[18px] overflow-hidden break-words [&_h1]:text-[15px] [&_h1]:font-semibold [&_h1]:leading-snug [&_h1]:mt-3 [&_h1]:mb-1 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:leading-snug [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:leading-snug [&_h3]:mt-2 [&_h3]:mb-0.5 [&_h4]:text-[13px] [&_h4]:font-semibold [&_h4]:leading-snug [&_h4]:mt-2 [&_h4]:mb-0.5 [&_h5]:text-[13px] [&_h5]:font-semibold [&_h5]:leading-snug [&_h5]:mt-2 [&_h5]:mb-0.5 [&_h6]:text-[13px] [&_h6]:font-semibold [&_h6]:leading-snug [&_h6]:mt-2 [&_h6]:mb-0.5">
                      <Markdown
                        remarkPlugins={[remarkMath]}
                        rehypePlugins={[rehypeKatex, rehypeHighlight]}
                        components={{
                          pre({ children }) {
                            return <CodeBlock>{children}</CodeBlock>
                          }
                        }}
                      >{entry.content}</Markdown>
                    </div>
                  )}
                  {/*
                    Action buttons (Copy + Tell me more) only for real
                    AI responses. System entries (errors, usage limits,
                    session-expired notices) get neither - copying a
                    "Session expired" string is useless, and "Tell me
                    more" on a system message would trigger another
                    failing AI request and generate a duplicate system
                    entry. Gate on badgeVariant !== 'system'.
                  */}
                  {entry.content && !isStreaming && entry.badgeVariant !== 'system' && (
                    <div className="mt-1 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          void handleCopyAction(`resp-${entry.id}`, entry.content)
                        }}
                        className={`p-2 flex items-center justify-center transition-all duration-200 ${
                          hoveredResponseId === entry.id
                            ? 'opacity-60 text-white/55'
                            : 'opacity-0 pointer-events-none text-white/40'
                        } hover:opacity-100 hover:text-white hover:scale-125 active:scale-90`}
                        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
                        title={copiedMessageId === `resp-${entry.id}` ? 'Copied' : 'Copy'}
                      >
                        {copiedMessageId === `resp-${entry.id}` ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <path d="M20 7L10 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
                            <path d="M408 480H184a72 72 0 0 1-72-72V184a72 72 0 0 1 72-72h224a72 72 0 0 1 72 72v224a72 72 0 0 1-72 72z" />
                            <path d="M160 80h235.88A72.12 72.12 0 0 0 328 32H104a72 72 0 0 0-72 72v224a72.12 72.12 0 0 0 48 67.88V160a80 80 0 0 1 80-80z" />
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickAction('tell-me-more')}
                        className={`h-7 px-2 rounded-md flex items-center gap-1 text-xs transition-all duration-150 ${
                          hoveredResponseId === entry.id
                            ? 'opacity-60 text-white/55'
                            : 'opacity-0 pointer-events-none text-white/40'
                        } hover:opacity-100 hover:text-white`}
                        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
                      >
                        <ChevronRight size={12} />
                        Tell me more
                      </button>
                    </div>
                  )}
                  </div>
                </motion.div>
              )
            })}
            </AnimatePresence>

            {isLoadingResponse && responses.length === 0 && (
              <div className="flex items-center gap-1.5 text-white/40 py-2">
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" />
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              </div>
            )}

            {limitInfo && (
              <div className="rounded-xl bg-white/10 p-4 text-white/80 mt-2">
                <p className="text-sm font-medium mb-1">
                  {limitInfo.type === 'session'
                    ? 'This session hit a length limit.'
                    : `You\u2019ve used all ${limitInfo.limit} AI responses for today.`}
                </p>
                {limitInfo.type === 'ai' && (
                  <span className="text-xs text-white/50">Resets tomorrow</span>
                )}
              </div>
            )}
          </div>


          {/* Scroll to bottom arrow */}
          {!isAtBottom && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="absolute bottom-4 right-3 w-6 h-6 rounded-full border border-white/15 bg-gradient-to-b from-[#353c4e] to-[#202633] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.35)] hover:from-[#3f465a] hover:to-[#2a3142] flex items-center justify-center text-white/80 hover:text-white transition-all z-[4]"
              style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          )}
          </div>
        )}

        {/* Quick Actions - Only when recording; chips wrap instead of clipping */}
        {isRecording && (
          <div className="px-3 pt-2.5 flex flex-wrap items-center gap-1.5 text-xs tracking-tight border-t border-white/15">
            {quickActions.map(({ action, label, Icon }) => (
              <button
                key={action}
                type="button"
                disabled={isLoadingResponse}
                onClick={() => { void handleQuickAction(action) }}
                className="h-7 px-2.5 rounded-full flex items-center gap-1.5 bg-white/[0.07] border border-white/10 text-white/80 hover:bg-white/[0.14] hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-white/[0.07] disabled:hover:text-white/80"
              >
                <Icon size={13} className="text-white/70" />
                {label}
              </button>
            ))}
          </div>
        )}

        <ScreenshotStrip isRecording={isRecording} viewerRef={screenshotViewerRef} />
        {screenshotError && (
          <p className="px-4 pt-1 text-[11px] text-red-300/90">{screenshotError}</p>
        )}
        {/* Input Area */}
        <div className={`mt-auto px-4 pt-1 ${hasResponse && !isRecording ? 'border-t border-white/15' : ''}`}>
          {/* Input Row */}
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0 relative">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onMouseDown={() => {
                  // The overlay is shown inactive (showInactive) so it never
                  // steals focus on appearance. Activating it on input click
                  // ensures the text box reliably receives keyboard focus
                  // after a re-show. No-op on macOS (panel takes input).
                  // We deliberately do NOT revert on blur: flipping the
                  // window back to focusable:false kills setIgnoreMouseEvents
                  // mouse-move forwarding after Ctrl+\ (issue D).
                  void window.raven.windowSetOverlayFocusable(true).then(() => {
                    inputRef.current?.focus()
                  })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    void handleAssist()
                    return
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleSend()
                  }
                }}
                placeholder=""
                className="w-full bg-transparent text-white text-[13px] py-2.5 focus:outline-none"
              />
              {!inputValue && (
                <span className="absolute inset-y-0 left-0 right-0 text-[13px] pointer-events-none text-white/60 flex items-center truncate">
                  Ask about the conversation…
                </span>
              )}
            </div>

            {/* Send Button */}
            <button
              type="button"
              onClick={() => {
                void handleSend()
              }}
              className="w-7 h-7 flex items-center justify-center rounded-full border border-blue-300/30 bg-gradient-to-b from-blue-500 to-blue-700 shadow-md shadow-blue-900/30 transition-all duration-200 ease-out shrink-0 pointer-events-auto relative z-10"
              style={{
                WebkitAppRegion: 'no-drag'
              } as CSSProperties}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="white"
                className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]"
              >
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
          <div className="pb-1.5 flex items-center gap-1 text-[11px] text-white/40 whitespace-nowrap overflow-hidden">
            <KeyCap>{assistModKey}</KeyCap>
            <KeyCap>↵</KeyCap>
            <span className="mr-1.5">Assist</span>
            <span className="w-[3px] h-[3px] rounded-full bg-white/20 shrink-0 mr-1.5" />
            <KeyCap>{assistModKey}</KeyCap>
            <KeyCap>V</KeyCap>
            <span>paste screenshot</span>
          </div>

          </div>
        </div>
      )}
    </div>
    </div>
  )
}
