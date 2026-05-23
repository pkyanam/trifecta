"use client"

import Image from "next/image"
import Link from "next/link"
import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react"
import { UserButton, useClerk, useUser } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import { toast } from "sonner"
import {
  Bot,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  CreditCard,
  Cpu,
  ExternalLink,
  FileText,
  FolderGit2,
  Globe2,
  Grid2X2,
  Info,
  Laptop,
  LockKeyhole,
  Loader2,
  Minus,
  MonitorUp,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Square,
  Terminal as TerminalIcon,
  Trash2,
  UserRound,
  X,
} from "lucide-react"

import { CreateSandboxModal } from "@/components/CreateSandboxModal"
import { TerminalEmbed } from "@/components/TerminalEmbed"
import { ConnectionInfo } from "@/components/ConnectionInfo"
import {
  ACPRegistryProviderIcon,
  ClaudeAIIcon,
  CursorProviderIcon,
  DevinProviderIcon,
  GeminiIcon,
  HermesProviderIcon,
  OpenAIIcon,
  OpenCodeProviderIcon,
} from "@/components/provider-icons"
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  CLOUD_PLANS,
  GPU_ADDON_TIERS,
  SANDBOX_SIZE_TIERS,
  type CloudPlanId,
} from "@/lib/billing"
import type { CloudAccount, SandboxRecord } from "@/lib/types"

type AppId =
  | "welcome"
  | "agents"
  | "clients"
  | "downloads"
  | "pricing"
  | "dashboard"
  | "sandbox"
  | "privacy"
  | "about"
  | "auth"

type WindowState = {
  x: number
  y: number
  width: number
  height: number
  minimized?: boolean
  maximized?: boolean
  placed?: boolean
}

type DragState = {
  id: AppId
  startX: number
  startY: number
  originX: number
  originY: number
}

type ResizeState = {
  id: AppId
  startX: number
  startY: number
  originWidth: number
  originHeight: number
}

type AccountInfo = {
  account: CloudAccount | null
  isAdmin: boolean
  creditsUsedTotal: number
  creditsRemaining: number
  creditsTotal: number
  gpuUsageUsdTotal: number
}

type AppMeta = {
  id: AppId
  label: string
  icon: React.ReactNode
  iconSrc?: string
  accent: string
}

const repoUrl = "https://github.com/pkyanam/trifecta"
const releasesUrl = "https://github.com/pkyanam/trifecta/releases"
const webAppUrl = "https://app.trifecta.belweave.com"

const TOP_INSET = 56
const BOTTOM_INSET = 116
const SIDE_INSET = 16

const apps: AppMeta[] = [
  { id: "welcome", label: "Product OS", icon: <Sparkles className="h-5 w-5" />, iconSrc: "/os-icons/product-os-single.png", accent: "linear-gradient(135deg, #ffffff, #8b5cf6 48%, #22d3ee)" },
  { id: "agents", label: "Agents", icon: <Bot className="h-5 w-5" />, iconSrc: "/os-icons/agents-single.png", accent: "linear-gradient(135deg, #f97316, #ef4444)" },
  { id: "clients", label: "Clients", icon: <Grid2X2 className="h-5 w-5" />, iconSrc: "/os-icons/clients-single.png", accent: "linear-gradient(135deg, #38bdf8, #2563eb)" },
  { id: "downloads", label: "Downloads", icon: <Laptop className="h-5 w-5" />, iconSrc: "/os-icons/downloads-single.png", accent: "linear-gradient(135deg, #34d399, #0d9488)" },
  { id: "pricing", label: "Pricing", icon: <CreditCard className="h-5 w-5" />, iconSrc: "/os-icons/pricing-single.png", accent: "linear-gradient(135deg, #fbbf24, #f472b6)" },
  { id: "dashboard", label: "Dashboard", icon: <MonitorUp className="h-5 w-5" />, iconSrc: "/os-icons/dashboard-single.png", accent: "linear-gradient(135deg, #60a5fa, #a78bfa)" },
  { id: "privacy", label: "Privacy", icon: <ShieldCheck className="h-5 w-5" />, iconSrc: "/os-icons/privacy-single.png", accent: "linear-gradient(135deg, #86efac, #16a34a)" },
  { id: "about", label: "About", icon: <FileText className="h-5 w-5" />, iconSrc: "/os-icons/about-single.png", accent: "linear-gradient(135deg, #e5e7eb, #71717a)" },
]

const sandboxAppMeta: AppMeta = {
  id: "sandbox",
  label: "Sandbox",
  icon: <Code2 className="h-5 w-5" />,
  iconSrc: "/os-icons/sandbox-single.png",
  accent: "linear-gradient(135deg, #c084fc, #22c55e)",
}

const APP_DEFAULT_SIZE: Record<AppId, { width: number; height: number }> = {
  welcome: { width: 1040, height: 680 },
  agents: { width: 1000, height: 720 },
  clients: { width: 920, height: 660 },
  downloads: { width: 900, height: 640 },
  pricing: { width: 1160, height: 780 },
  dashboard: { width: 1120, height: 760 },
  sandbox: { width: 1120, height: 800 },
  privacy: { width: 820, height: 640 },
  about: { width: 880, height: 640 },
  auth: { width: 480, height: 660 },
}

const APP_IDS = new Set<AppId>([
  "welcome",
  "agents",
  "clients",
  "downloads",
  "pricing",
  "dashboard",
  "sandbox",
  "privacy",
  "about",
  "auth",
])

function isAppId(value: string | null): value is AppId {
  return value != null && APP_IDS.has(value as AppId)
}

function buildInitialWindows(): Record<AppId, WindowState> {
  const result = {} as Record<AppId, WindowState>
  for (const id of APP_IDS) {
    const size = APP_DEFAULT_SIZE[id]
    result[id] = { x: 360, y: 96, width: size.width, height: size.height, placed: false }
  }
  return result
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))

function effectiveSize(state: WindowState) {
  if (typeof window === "undefined") return { w: state.width, h: state.height }
  return {
    w: Math.min(state.width, window.innerWidth - SIDE_INSET * 2),
    h: Math.min(state.height, window.innerHeight - (TOP_INSET + BOTTOM_INSET)),
  }
}

function clampPosition(state: WindowState): WindowState {
  if (typeof window === "undefined") return state
  const { w, h } = effectiveSize(state)
  const maxX = Math.max(SIDE_INSET, window.innerWidth - w - SIDE_INSET)
  const maxY = Math.max(TOP_INSET, window.innerHeight - h - (BOTTOM_INSET - 20))
  return { ...state, x: clamp(state.x, SIDE_INSET, maxX), y: clamp(state.y, TOP_INSET, maxY) }
}

const providers = [
  { name: "Codex", connection: "JSON-RPC over stdio", setup: "codex login", icon: <OpenAIIcon className="h-5 w-5" /> },
  { name: "Claude Code", connection: "JSON-RPC over stdio", setup: "claude auth login", icon: <ClaudeAIIcon className="h-5 w-5" /> },
  { name: "OpenCode", connection: "JSON-RPC over stdio", setup: "opencode auth login", icon: <OpenCodeProviderIcon className="h-4 w-5" /> },
  { name: "Gemini", connection: "Headless CLI", setup: "npm i -g @google/gemini-cli", icon: <GeminiIcon className="h-5 w-5" /> },
  { name: "Antigravity", connection: "Python SDK / CLI", setup: "pip install google-antigravity", icon: <Sparkles className="h-5 w-5 text-indigo-500" /> },
  { name: "Cursor", connection: "ACP over stdio", setup: "cursor-agent", icon: <CursorProviderIcon className="h-4 w-4" /> },
  { name: "Hermes", connection: "ACP over stdio", setup: "hermes setup", icon: <HermesProviderIcon className="h-5 w-5" /> },
  { name: "Devin", connection: "ACP over stdio", setup: "devin acp", icon: <DevinProviderIcon className="h-5 w-5" /> },
  { name: "ACP Registry", connection: "ACP-compatible command", setup: "custom command", icon: <ACPRegistryProviderIcon className="h-5 w-3" /> },
]

const clients = [
  { name: "iOS / iPadOS", detail: "Native SwiftUI client", href: "https://testflight.apple.com/join/M5FkR4R8", icon: <Smartphone className="h-5 w-5" /> },
  { name: "Android", detail: "Native Kotlin + Jetpack Compose client", href: "https://forms.gle/WPHxw8axUs6QanXBA", icon: <Smartphone className="h-5 w-5" /> },
  { name: "Desktop", detail: "Electron app and local server", href: releasesUrl, icon: <Laptop className="h-5 w-5" /> },
  { name: "VS Code / Cursor", detail: "IDE extension surface", href: repoUrl, icon: <Code2 className="h-5 w-5" /> },
  { name: "Web UI", detail: "Browser client for paired sessions", href: webAppUrl, icon: <Globe2 className="h-5 w-5" /> },
]

const downloads = [
  { name: "Desktop releases", detail: "macOS, Windows, and Linux desktop builds when published", href: releasesUrl, icon: <Laptop className="h-5 w-5" /> },
  { name: "Server releases", detail: "Server bundle and self-hosting artifacts", href: releasesUrl, icon: <Server className="h-5 w-5" /> },
  { name: "iOS TestFlight", detail: "Native iPhone and iPad beta", href: "https://testflight.apple.com/join/M5FkR4R8", icon: <Smartphone className="h-5 w-5" /> },
  { name: "Android beta", detail: "Native Android beta sign-up", href: "https://forms.gle/WPHxw8axUs6QanXBA", icon: <Smartphone className="h-5 w-5" /> },
]

export default function Home() {
  const [openWindows, setOpenWindows] = useState<AppId[]>(["welcome"])
  const [windowState, setWindowState] = useState<Record<AppId, WindowState>>(buildInitialWindows)
  const [selectedSandbox, setSelectedSandbox] = useState<SandboxRecord | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [resize, setResize] = useState<ResizeState | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [clock, setClock] = useState({ time: "", date: "" })
  const spawnCount = useRef(0)

  const availableApps = selectedSandbox ? [...apps, sandboxAppMeta] : apps
  const frontId = [...openWindows].reverse().find((id) => !windowState[id]?.minimized) ?? null

  const placeWindow = useCallback((id: AppId, current: Record<AppId, WindowState>): WindowState => {
    const base = current[id]
    const { w, h } = effectiveSize(base)
    const vw = typeof window === "undefined" ? 1440 : window.innerWidth
    const vh = typeof window === "undefined" ? 900 : window.innerHeight
    const offset = (spawnCount.current++ % 5) * 32
    const x = clamp(Math.round((vw - w) / 2) + offset - 64, SIDE_INSET, Math.max(SIDE_INSET, vw - w - SIDE_INSET))
    const y = clamp(Math.round((vh - h - TOP_INSET) / 2) + offset - 16, TOP_INSET, Math.max(TOP_INSET, vh - h - (BOTTOM_INSET - 20)))
    return { ...base, x, y, placed: true, minimized: false }
  }, [])

  const openApp = useCallback(
    (id: AppId) => {
      if (id === "sandbox" && !selectedSandbox) return
      setOpenWindows((current) => [...current.filter((item) => item !== id), id])
      setWindowState((current) => {
        const next = current[id].placed
          ? { ...current[id], minimized: false }
          : placeWindow(id, current)
        return { ...current, [id]: next }
      })
    },
    [placeWindow, selectedSandbox],
  )

  const openSandbox = useCallback(
    (sandbox: SandboxRecord) => {
      setSelectedSandbox(sandbox)
      setOpenWindows((current) => [...current.filter((item) => item !== "sandbox"), "sandbox"])
      setWindowState((current) => {
        const next = current.sandbox.placed
          ? { ...current.sandbox, minimized: false }
          : placeWindow("sandbox", current)
        return { ...current, sandbox: next }
      })
    },
    [placeWindow],
  )

  const closeApp = useCallback((id: AppId) => {
    setOpenWindows((current) => current.filter((item) => item !== id))
    if (id === "sandbox") setSelectedSandbox(null)
  }, [])

  const bringToFront = useCallback((id: AppId) => {
    setOpenWindows((current) => (current[current.length - 1] === id ? current : [...current.filter((item) => item !== id), id]))
  }, [])

  const setMinimized = useCallback(
    (id: AppId, minimized: boolean) => {
      setWindowState((current) => ({ ...current, [id]: { ...current[id], minimized } }))
      if (!minimized) bringToFront(id)
    },
    [bringToFront],
  )

  const toggleMaximize = useCallback(
    (id: AppId) => {
      setWindowState((current) => ({ ...current, [id]: { ...current[id], maximized: !current[id].maximized, minimized: false } }))
      bringToFront(id)
    },
    [bringToFront],
  )

  // Clock + date in the menu bar.
  useEffect(() => {
    const update = () =>
      setClock({
        time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date()),
        date: new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date()),
      })
    update()
    const timer = window.setInterval(update, 20_000)
    return () => window.clearInterval(timer)
  }, [])

  // Restore persisted window layout and place the initial window(s).
  useEffect(() => {
    const nextWindows = buildInitialWindows()
    let nextOpen: AppId[] = ["welcome"]
    try {
      const saved = window.localStorage.getItem("trifecta-os-state")
      if (saved) {
        const parsed = JSON.parse(saved) as {
          openWindows?: string[]
          windowState?: Partial<Record<AppId, WindowState>>
        }
        if (parsed.windowState) {
          for (const [key, value] of Object.entries(parsed.windowState)) {
            if (isAppId(key) && value) {
              nextWindows[key] = clampPosition({ ...nextWindows[key], ...value, maximized: false, minimized: false })
            }
          }
        }
        if (parsed.openWindows?.length) {
          const restored = parsed.openWindows.filter((id): id is AppId => isAppId(id) && id !== "sandbox")
          if (restored.length) nextOpen = restored
        }
      }
    } catch {
      window.localStorage.removeItem("trifecta-os-state")
    }
    // Ensure every initially-open window has a real on-screen position.
    for (const id of nextOpen) {
      if (!nextWindows[id].placed) nextWindows[id] = placeWindow(id, nextWindows)
    }
    // One-time hydration from localStorage (an external system) on mount.
    /* eslint-disable react-hooks/set-state-in-effect */
    setWindowState(nextWindows)
    setOpenWindows(nextOpen)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [placeWindow])

  // Persist layout (excluding the contextual sandbox window).
  useEffect(() => {
    const stateToSave = {
      openWindows: openWindows.filter((id) => id !== "sandbox"),
      windowState,
    }
    try {
      window.localStorage.setItem("trifecta-os-state", JSON.stringify(stateToSave))
    } catch {
      /* ignore quota errors */
    }
  }, [openWindows, windowState])

  // Deep links: /?app=dashboard, /?checkout=success|cancel. Read once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const app = params.get("app")
    const checkout = params.get("checkout")
    let target: AppId | null = null
    if (isAppId(app) && app !== "sandbox") target = app
    if (checkout === "success") {
      toast.success("Subscription active — welcome to Trifecta Cloud.")
      target = "pricing"
    } else if (checkout === "cancel") {
      target = "pricing"
    }
    if (target) {
      // One-time sync from the URL (external system) into window state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      openApp(target)
      window.history.replaceState({}, "", "/")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Drag handling with viewport clamping.
  useEffect(() => {
    if (!drag) return
    const onMove = (event: globalThis.PointerEvent) => {
      setWindowState((current) => {
        const target = current[drag.id]
        const { w, h } = effectiveSize(target)
        const maxX = Math.max(SIDE_INSET, window.innerWidth - w - SIDE_INSET)
        const maxY = Math.max(TOP_INSET, window.innerHeight - h - (BOTTOM_INSET - 20))
        return {
          ...current,
          [drag.id]: {
            ...target,
            x: clamp(drag.originX + event.clientX - drag.startX, SIDE_INSET, maxX),
            y: clamp(drag.originY + event.clientY - drag.startY, TOP_INSET, maxY),
            maximized: false,
          },
        }
      })
    }
    const onUp = () => setDrag(null)
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [drag])

  // Resize handling with viewport clamping.
  useEffect(() => {
    if (!resize) return
    const onMove = (event: globalThis.PointerEvent) => {
      const maxW = window.innerWidth - SIDE_INSET * 2
      const maxH = window.innerHeight - (TOP_INSET + BOTTOM_INSET) + 20
      setWindowState((current) => ({
        ...current,
        [resize.id]: {
          ...current[resize.id],
          width: clamp(resize.originWidth + event.clientX - resize.startX, 420, maxW),
          height: clamp(resize.originHeight + event.clientY - resize.startY, 320, maxH),
          maximized: false,
        },
      }))
    }
    const onUp = () => setResize(null)
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [resize])

  // Keep windows reachable when the viewport changes.
  useEffect(() => {
    const onResize = () => {
      setWindowState((current) => {
        const next = { ...current }
        for (const id of APP_IDS) {
          if (next[id].placed) next[id] = clampPosition(next[id])
        }
        return next
      })
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // Global shortcuts: ⌘K search.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  function beginDrag(id: AppId, event: PointerEvent<HTMLDivElement>) {
    if (windowState[id].maximized) return
    bringToFront(id)
    setDrag({ id, startX: event.clientX, startY: event.clientY, originX: windowState[id].x, originY: windowState[id].y })
  }

  function beginResize(id: AppId, event: PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    bringToFront(id)
    setResize({ id, startX: event.clientX, startY: event.clientY, originWidth: windowState[id].width, originHeight: windowState[id].height })
  }

  return (
    <main className="vercel-os min-h-screen overflow-hidden">
      <MenuBar clock={clock} openApp={openApp} openSearch={() => setSearchOpen(true)} />

      <div className="pointer-events-none fixed inset-0 os-vercel-grid" />
      <div className="fixed inset-0 z-10">
        {openWindows.map((id, index) => {
          const state = windowState[id]
          if (state.minimized) return null
          const title = id === "sandbox" ? selectedSandbox?.name ?? "Sandbox" : availableApps.find((app) => app.id === id)?.label ?? "Trifecta"
          return (
            <OSWindow
              key={id}
              id={id}
              title={title}
              state={state}
              zIndex={20 + index}
              front={frontId === id}
              onFocus={() => bringToFront(id)}
              onClose={() => closeApp(id)}
              onMinimize={() => setMinimized(id, true)}
              onMaximize={() => toggleMaximize(id)}
              onDragStart={(event) => beginDrag(id, event)}
              onResizeStart={(event) => beginResize(id, event)}
            >
              <AppContent
                id={id}
                openApp={openApp}
                selectedSandbox={selectedSandbox}
                onOpenSandbox={openSandbox}
                onSandboxClosed={() => closeApp("sandbox")}
              />
            </OSWindow>
          )
        })}
      </div>

      <Dock apps={availableApps} openApp={openApp} openWindows={openWindows} />
      {searchOpen && <SearchPalette apps={availableApps} openApp={openApp} onClose={() => setSearchOpen(false)} />}
    </main>
  )
}

function MenuBar({ clock, openApp, openSearch }: { clock: { time: string; date: string }; openApp: (id: AppId) => void; openSearch: () => void }) {
  const { isLoaded, isSignedIn } = useUser()

  const navItems: Array<[string, AppId]> = [
    ["Agents", "agents"],
    ["Clients", "clients"],
    ["Pricing", "pricing"],
    ["Dashboard", "dashboard"],
    ["Downloads", "downloads"],
    ["About", "about"],
  ]

  return (
    <header className="os-topbar fixed inset-x-0 top-0 z-50 flex h-12 items-center justify-between border-b px-3 backdrop-blur-2xl sm:px-4">
      <div className="flex items-center gap-1">
        <button onClick={() => openApp("welcome")} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-black hover:bg-white/8">
          <Image src="/trifecta-logo.png" alt="Trifecta" width={34} height={34} className="h-7 w-7 rounded-[8px] object-cover" priority />
          <span className="hidden sm:inline">Trifecta OS</span>
        </button>
        <nav className="hidden items-center gap-0.5 lg:flex">
          {navItems.map(([label, id]) => (
            <button key={label} onClick={() => openApp(id)} className="rounded-md px-3 py-1.5 text-sm font-semibold os-muted transition hover:bg-white/8 hover:text-white">
              {label}
            </button>
          ))}
          <a href={repoUrl} target="_blank" rel="noopener noreferrer" className="rounded-md px-3 py-1.5 text-sm font-semibold os-muted transition hover:bg-white/8 hover:text-white">
            GitHub
          </a>
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button onClick={openSearch} className="os-raised hidden h-8 items-center gap-2 rounded-lg border px-3 text-xs os-subtle md:flex">
          <Search className="h-3.5 w-3.5" />
          Search
          <span className="ml-1 rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] os-subtle">⌘K</span>
        </button>
        <button onClick={openSearch} className="os-raised grid h-8 w-8 place-items-center rounded-lg border os-muted md:hidden" aria-label="Search OS">
          <Search className="h-4 w-4" />
        </button>
        {isLoaded && !isSignedIn && (
          <button onClick={() => openApp("auth")} className="rounded-md px-3 py-1.5 text-sm font-semibold os-muted hover:bg-white/8 hover:text-white">
            Sign in
          </button>
        )}
        {isLoaded && isSignedIn && <UserButton appearance={{ baseTheme: dark }} />}
        <div className="hidden flex-col items-end leading-tight sm:flex" suppressHydrationWarning>
          <span className="text-xs font-bold">{clock.time}</span>
          <span className="text-[10px] os-subtle">{clock.date}</span>
        </div>
      </div>
    </header>
  )
}

type SearchItem = {
  appId: AppId
  label: string
  detail: string
  keywords: string
  icon: React.ReactNode
  iconSrc?: string
  accent: string
}

function SearchPalette({ apps: appList, openApp, onClose }: { apps: AppMeta[]; openApp: (id: AppId) => void; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)

  const items: SearchItem[] = [
    ...appList.map((app) => ({
      appId: app.id,
      label: app.label,
      detail: searchDetailForApp(app.id),
      keywords: searchKeywordsForApp(app.id),
      icon: app.icon,
      iconSrc: app.iconSrc,
      accent: app.accent,
    })),
    {
      appId: "auth",
      label: "Sign in or create account",
      detail: "Open Trifecta authentication for the dashboard.",
      keywords: "login sign in signup sign up clerk account auth",
      icon: <UserRound className="h-5 w-5" />,
      iconSrc: "/os-icons/auth-single.png",
      accent: "linear-gradient(135deg, #f8fafc, #64748b)",
    },
    {
      appId: "dashboard",
      label: "Provision a sandbox",
      detail: "Open Dashboard and create a cloud sandbox.",
      keywords: "create provision sandbox daytona cloud terminal environment new",
      icon: <Server className="h-5 w-5" />,
      iconSrc: "/os-icons/sandbox-single.png",
      accent: "linear-gradient(135deg, #22c55e, #06b6d4)",
    },
  ]

  const normalizedQuery = query.trim().toLowerCase()
  const results = normalizedQuery
    ? items.filter((item) => `${item.label} ${item.detail} ${item.keywords}`.toLowerCase().includes(normalizedQuery))
    : items

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function runItem(item: SearchItem) {
    openApp(item.appId)
    onClose()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setSelected((current) => Math.min(current + 1, Math.max(results.length - 1, 0)))
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setSelected((current) => Math.max(current - 1, 0))
      return
    }
    if (event.key === "Enter" && results[selected]) {
      event.preventDefault()
      runItem(results[selected])
    }
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-start bg-black/40 px-3 pt-16 backdrop-blur-sm sm:pt-24" onMouseDown={onClose}>
      <div className="os-window-shell mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border shadow-2xl shadow-black/40" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <Search className="h-5 w-5 os-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelected(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Search apps, sandboxes, downloads, providers…"
            className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-white/35"
          />
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg os-muted hover:bg-white/8" aria-label="Close search">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[min(520px,calc(100vh-150px))] overflow-auto p-2">
          {results.length === 0 && <div className="px-4 py-8 text-center text-sm os-muted">No OS results found.</div>}
          {results.map((item, index) => (
            <button
              key={`${item.appId}-${item.label}`}
              onClick={() => runItem(item)}
              onMouseEnter={() => setSelected(index)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${selected === index ? "bg-white/10" : "hover:bg-white/8"}`}
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl text-white shadow-lg shadow-black/20 ring-1 ring-white/15" style={{ background: item.accent, color: "#fff" }}>
                {item.iconSrc ? <Image src={item.iconSrc} alt="" width={44} height={44} className="h-full w-full object-contain" /> : item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black">{item.label}</span>
                <span className="mt-0.5 block truncate text-xs os-muted">{item.detail}</span>
              </span>
              {selected === index && <span className="hidden rounded border border-white/10 px-2 py-1 font-mono text-[10px] os-subtle sm:inline">Enter</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function searchDetailForApp(id: AppId) {
  if (id === "welcome") return "Open the Product OS overview."
  if (id === "agents") return "Supported coding agents and provider setup commands."
  if (id === "clients") return "iOS, Android, desktop, IDE, and web clients."
  if (id === "downloads") return "Desktop, server, iOS, and Android download links."
  if (id === "pricing") return "Plans, credits, sandbox sizes, and billing."
  if (id === "dashboard") return "Cloud sandbox and account dashboard."
  if (id === "sandbox") return "Open the selected sandbox terminal and connection."
  if (id === "privacy") return "Privacy policy and terms."
  if (id === "auth") return "Sign in or create a Trifecta account."
  return "Project and repository information."
}

function searchKeywordsForApp(id: AppId) {
  if (id === "welcome") return "home product os overview trifecta"
  if (id === "agents") return "codex claude opencode gemini antigravity cursor hermes devin acp providers"
  if (id === "clients") return "ios android desktop ide vscode cursor web app mobile"
  if (id === "downloads") return "download releases github server desktop testflight android"
  if (id === "pricing") return "plans billing credits launch-hours subscription gpu account"
  if (id === "dashboard") return "sandbox provision create billing account terminal cloud"
  if (id === "sandbox") return "terminal shell sandbox connect pairing"
  if (id === "privacy") return "privacy terms policy clerk posthog google vercel supabase daytona"
  if (id === "auth") return "sign in sign up login account clerk"
  return "about github repository company"
}

function OSWindow({
  id,
  title,
  state,
  zIndex,
  front,
  onClose,
  onMinimize,
  onMaximize,
  onFocus,
  onDragStart,
  onResizeStart,
  children,
}: {
  id: AppId
  title: string
  state: WindowState
  zIndex: number
  front: boolean
  onClose: () => void
  onMinimize: () => void
  onMaximize: () => void
  onFocus: () => void
  onDragStart: (event: PointerEvent<HTMLDivElement>) => void
  onResizeStart: (event: PointerEvent<HTMLDivElement>) => void
  children: React.ReactNode
}) {
  const style: React.CSSProperties = state.maximized
    ? { left: SIDE_INSET, top: TOP_INSET, width: `calc(100vw - ${SIDE_INSET * 2}px)`, height: `calc(100vh - ${TOP_INSET + BOTTOM_INSET}px)`, zIndex }
    : {
        left: state.x,
        top: state.y,
        width: `min(${state.width}px, calc(100vw - ${SIDE_INSET * 2}px))`,
        height: `min(${state.height}px, calc(100vh - ${TOP_INSET + BOTTOM_INSET}px))`,
        zIndex,
      }

  return (
    <section
      onMouseDown={onFocus}
      className={`os-window-shell absolute flex overflow-hidden rounded-2xl border shadow-2xl shadow-black/35 backdrop-blur-2xl transition-shadow ${front ? "ring-1 ring-white/15" : "opacity-[0.99]"}`}
      style={style}
      aria-label={title}
      data-window={id}
    >
      <div className="flex min-h-0 w-full flex-col">
        <div
          onPointerDown={onDragStart}
          onDoubleClick={onMaximize}
          className="os-window-titlebar flex h-11 cursor-grab select-none items-center justify-between border-b px-4 active:cursor-grabbing"
        >
          <div className="group flex items-center gap-2" onPointerDown={(event) => event.stopPropagation()}>
            <button onClick={onClose} className="grid h-3.5 w-3.5 place-items-center rounded-full bg-[#ff5f57]" aria-label={`Close ${title}`}>
              <X className="h-2.5 w-2.5 text-black/60 opacity-0 group-hover:opacity-100" />
            </button>
            <button onClick={onMinimize} className="grid h-3.5 w-3.5 place-items-center rounded-full bg-[#febc2e]" aria-label={`Minimize ${title}`}>
              <Minus className="h-2.5 w-2.5 text-black/60 opacity-0 group-hover:opacity-100" />
            </button>
            <button onClick={onMaximize} className="grid h-3.5 w-3.5 place-items-center rounded-full bg-[#28c840]" aria-label={`Maximize ${title}`}>
              <Square className="h-2 w-2 text-black/60 opacity-0 group-hover:opacity-100" />
            </button>
          </div>
          <h2 className="pointer-events-none absolute left-1/2 max-w-[60%] -translate-x-1/2 truncate text-sm font-black">{title}</h2>
          <span className="hidden font-mono text-[10px] os-subtle sm:inline">trifecta://{id}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
      {!state.maximized && (
        <div onPointerDown={onResizeStart} className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize" aria-label={`Resize ${title}`}>
          <span className="absolute bottom-1 right-1 h-2.5 w-2.5 border-b border-r border-white/30" />
        </div>
      )}
    </section>
  )
}

function Dock({
  apps: appList,
  openApp,
  openWindows,
}: {
  apps: AppMeta[]
  openApp: (id: AppId) => void
  openWindows: AppId[]
}) {
  return (
    <div className="os-dock fixed bottom-3 left-1/2 z-50 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-end gap-2 overflow-x-auto rounded-2xl border px-3 py-3 shadow-2xl shadow-black/35 backdrop-blur-2xl sm:bottom-5">
      {appList.map((app) => {
        const isOpen = openWindows.includes(app.id)
        return (
          <button
            key={app.id}
            onClick={() => openApp(app.id)}
            className="group relative flex w-16 shrink-0 flex-col items-center gap-1 os-muted transition hover:-translate-y-1"
            aria-label={`Open ${app.label}`}
          >
            <span className="max-w-16 truncate text-[10px] font-black leading-none">{app.label}</span>
            <span className="relative grid h-14 w-14 place-items-center overflow-hidden rounded-[15px] text-white shadow-lg shadow-black/25 ring-1 ring-white/20 transition group-hover:scale-105">
              {app.iconSrc ? (
                <Image src={app.iconSrc} alt="" width={56} height={56} className="h-full w-full object-contain" />
              ) : (
                <span className="grid h-full w-full place-items-center" style={{ background: app.accent, color: "#fff" }}>
                  {app.icon}
                </span>
              )}
              {isOpen && <span className="absolute -bottom-1 h-1.5 w-1.5 rounded-full bg-current" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function AppContent({
  id,
  openApp,
  selectedSandbox,
  onOpenSandbox,
  onSandboxClosed,
}: {
  id: AppId
  openApp: (id: AppId) => void
  selectedSandbox: SandboxRecord | null
  onOpenSandbox: (sandbox: SandboxRecord) => void
  onSandboxClosed: () => void
}) {
  if (id === "welcome") return <WelcomeApp openApp={openApp} />
  if (id === "agents") return <AgentsApp />
  if (id === "clients") return <ClientsApp />
  if (id === "downloads") return <DownloadsApp />
  if (id === "pricing") return <PricingApp openApp={openApp} />
  if (id === "dashboard") return <DashboardApp openApp={openApp} onOpenSandbox={onOpenSandbox} />
  if (id === "sandbox") return <SandboxApp key={selectedSandbox?.id} sandbox={selectedSandbox} onClosed={onSandboxClosed} />
  if (id === "privacy") return <PrivacyApp />
  if (id === "auth") return <AuthApp openApp={openApp} />
  return <AboutApp openApp={openApp} />
}

/* ─────────────────────────  Shared building blocks  ───────────────────────── */

function WindowPage({ eyebrow, title, body, action, children }: { eyebrow: string; title: string; body?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-white/38">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">{title}</h1>
          {body && <p className="mt-3 max-w-3xl text-sm leading-6 text-white/56">{body}</p>}
        </div>
        {action}
      </div>
      <div className="mt-6">{children}</div>
    </div>
  )
}

function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          toast.error("Clipboard unavailable")
        }
      }}
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-md os-muted transition hover:bg-white/10 hover:text-white ${className ?? ""}`}
      aria-label="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function LinkGrid({ items }: { items: Array<{ name: string; detail: string; href: string; icon: React.ReactNode }> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <Link key={item.name} href={item.href} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/10 bg-white/[0.035] p-4 transition hover:bg-white/[0.06]">
          <span className="flex items-center gap-4">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-black/35">{item.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-black">{item.name}</span>
              <span className="mt-1 block text-sm text-white/50">{item.detail}</span>
            </span>
            <ExternalLink className="h-4 w-4 text-white/38" />
          </span>
        </Link>
      ))}
    </div>
  )
}

/* ─────────────────────────────────  Apps  ─────────────────────────────────── */

function WelcomeApp({ openApp }: { openApp: (id: AppId) => void }) {
  return (
    <div className="grid min-h-full gap-8 p-8 lg:grid-cols-[0.96fr_1.04fr]">
      <div className="flex flex-col justify-center">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-white/42">Trifecta Product OS</p>
        <h1 className="mt-5 max-w-xl text-5xl font-black leading-[1.04] tracking-tight">One interface for your coding agents.</h1>
        <p className="mt-6 max-w-lg text-base leading-7 text-white/60">
          A desktop server runs agents on your machine. Native iOS, Android, IDE, and web clients connect to it so you can chat, watch work, review diffs, approve actions, and drive Git from anywhere.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button onClick={() => openApp("agents")} className="os-primary-button rounded-lg px-4 py-2.5 text-sm font-black">Explore agents</button>
          <button onClick={() => openApp("dashboard")} className="os-secondary-button rounded-lg px-4 py-2.5 text-sm font-black">Open dashboard</button>
          <button onClick={() => openApp("pricing")} className="os-secondary-button rounded-lg px-4 py-2.5 text-sm font-black">Pricing</button>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold text-white/45">
          <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> 9 supported agents</span>
          <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> 5 client surfaces</span>
          <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Cloud sandboxes</span>
        </div>
      </div>
      <div className="grid content-center gap-4">
        <FeaturePanel icon={<Bot className="h-8 w-8" />} title="Many providers" body="Codex, Claude Code, OpenCode, Gemini, Antigravity, Cursor, Hermes, Devin, and ACP-compatible agents." />
        <div className="grid gap-4 sm:grid-cols-2">
          <FeaturePanel icon={<Smartphone className="h-7 w-7" />} title="Many clients" body="iOS, Android, desktop, IDE, and web surfaces pair with the same server." />
          <FeaturePanel icon={<FolderGit2 className="h-7 w-7" />} title="One workflow" body="Review diffs, approve actions, and drive Git from paired clients." />
        </div>
      </div>
    </div>
  )
}

function FeaturePanel({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl shadow-black/30">
      <div className="text-white/82">{icon}</div>
      <h3 className="mt-4 text-xl font-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/55">{body}</p>
    </div>
  )
}

function AgentsApp() {
  return (
    <WindowPage eyebrow="Agents" title="Bring the coding agent you already use." body="Trifecta routes supported providers through one shared client interface. Run the setup command on your server, then pair a client.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {providers.map((provider) => (
          <div key={provider.name} className="flex flex-col rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-black/5 bg-white p-2 shadow-sm">{provider.icon}</span>
              <div className="min-w-0">
                <h3 className="truncate font-black">{provider.name}</h3>
                <p className="truncate text-xs font-semibold text-white/45">{provider.connection}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-white/70">{provider.setup}</code>
              <CopyButton value={provider.setup} />
            </div>
          </div>
        ))}
      </div>
    </WindowPage>
  )
}

function ClientsApp() {
  return (
    <WindowPage eyebrow="Clients" title="Use Trifecta from every working surface." body="Mobile, desktop, IDE, and web clients pair with the Trifecta server.">
      <LinkGrid items={clients} />
    </WindowPage>
  )
}

function DownloadsApp() {
  return (
    <WindowPage eyebrow="Downloads" title="Install desktop, server, and mobile builds." body="Desktop and server downloads point to GitHub releases. Mobile links open TestFlight and the Android beta sign-up.">
      <LinkGrid items={downloads} />
      <div className="mt-5 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <code className="min-w-0 flex-1 truncate font-mono text-sm text-white/75">npx @belweave/trifecta</code>
        <span className="hidden text-xs text-white/45 sm:inline">Fastest server path before pairing a client</span>
        <CopyButton value="npx @belweave/trifecta" />
      </div>
    </WindowPage>
  )
}

/* ───────────────────────────  Pricing + Account  ──────────────────────────── */

const planList = Object.values(CLOUD_PLANS)

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { error: text }
  }
}

function PricingApp({ openApp }: { openApp: (id: AppId) => void }) {
  const { isLoaded, isSignedIn } = useUser()
  const [info, setInfo] = useState<AccountInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyPlan, setBusyPlan] = useState<string | null>(null)
  const [portalBusy, setPortalBusy] = useState(false)

  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/account")
      if (res.ok) setInfo((await res.json()) as AccountInfo)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // `loading` only drives the status pill while signed in, so it is fine to
    // leave it set when signed out; fetchAccount sets it false after the fetch.
    if (isLoaded && isSignedIn) void fetchAccount()
  }, [isLoaded, isSignedIn, fetchAccount])

  const account = info?.account ?? null
  const isAdmin = info?.isAdmin === true
  const activePlan = ACTIVE_SUBSCRIPTION_STATUSES.has(account?.subscription_status ?? "") ? account?.plan : null

  const statusLabel = isAdmin
    ? "Admin · god mode"
    : activePlan
      ? `${CLOUD_PLANS[activePlan as CloudPlanId].name} active`
      : !isSignedIn
        ? "Not signed in"
        : "No active plan"

  async function choosePlan(planId: CloudPlanId) {
    if (!isSignedIn) {
      openApp("auth")
      return
    }
    setBusyPlan(planId)
    try {
      if (planId === "free") {
        const res = await fetch("/api/billing/free", { method: "POST" })
        const data = await readJson(res)
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Unable to activate free trial.")
        toast.success("Free trial activated.")
        await fetchAccount()
        return
      }
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      })
      const data = await readJson(res)
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Unable to start checkout.")
      if (typeof data.url !== "string") throw new Error("Checkout did not return a redirect URL.")
      window.location.assign(data.url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update plan.")
    } finally {
      setBusyPlan(null)
    }
  }

  async function openPortal() {
    setPortalBusy(true)
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" })
      const data = await readJson(res)
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Unable to open subscription settings.")
      if (typeof data.url !== "string") throw new Error("Subscription settings did not return a redirect URL.")
      window.location.assign(data.url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to open subscription settings.")
      setPortalBusy(false)
    }
  }

  const creditPct = info && info.creditsTotal > 0 ? Math.min(100, (info.creditsUsedTotal / info.creditsTotal) * 100) : 0

  return (
    <WindowPage
      eyebrow="Pricing & Account"
      title="Cloud sandboxes without surprise bills."
      body="Start with included runtime, scale up when a session needs more power, and keep GPU work as a clear pay-as-you-go add-on."
      action={
        <div className="os-card flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
          {isAdmin ? <ShieldCheck className="h-4 w-4 text-emerald-400" /> : <CreditCard className="h-4 w-4 os-subtle" />}
          <span className="font-bold">{loading && isSignedIn ? "Loading…" : statusLabel}</span>
        </div>
      }
    >
      {isSignedIn && (account?.stripe_customer_id || activePlan) && (
        <div className="mb-5 flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black">Subscription</h2>
            {!isAdmin && activePlan && info ? (
              <div className="mt-2">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 text-xs">
                  <span className="text-white/55">
                    {info.creditsUsedTotal.toFixed(1)} / {info.creditsTotal} launch-hours used
                  </span>
                  <span className={info.creditsRemaining <= 0 ? "font-bold text-amber-400" : "font-bold text-emerald-400"}>
                    {info.creditsRemaining <= 0 ? "Credits exhausted — overages apply" : `${info.creditsRemaining.toFixed(1)} hrs remaining`}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full rounded-full ${info.creditsRemaining <= 0 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${creditPct.toFixed(1)}%` }} />
                </div>
                {info.gpuUsageUsdTotal > 0 && (
                  <p className="mt-2 text-xs font-semibold text-white/55">
                    GPU usage this period: ${info.gpuUsageUsdTotal.toFixed(2)}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-1 text-sm text-white/55">Update payment details, change plans, or cancel from your account portal.</p>
            )}
          </div>
          <button onClick={openPortal} disabled={portalBusy || !account?.stripe_customer_id} className="os-secondary-button inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-black disabled:opacity-50">
            {portalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Manage subscription
          </button>
        </div>
      )}

      <div className="mb-5 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
          <h2 className="text-sm font-black">What a launch-hour means</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">
            A launch-hour is the billing unit for CPU sandbox runtime. Time only accrues while a sandbox is running.
            Stopped sandboxes keep their record, but they do not burn launch-hours.
          </p>
          <div className="mt-3 grid gap-2 text-sm text-white/65 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3"><span className="font-black text-white">Launch</span><br />1 runtime hour = 1 launch-hour</div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3"><span className="font-black text-white">Build</span><br />1 runtime hour = 2 launch-hours</div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3"><span className="font-black text-white">Max CPU</span><br />1 runtime hour = 4 launch-hours</div>
          </div>
        </article>
        <article className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
          <h2 className="text-sm font-black">Example usage</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">
            Run a Build sandbox for 2.5 hours and an H100 sandbox for 30 minutes:
          </p>
          <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-xs text-white/70">
            <div>2.5 runtime hours × 2 = 5 launch-hours</div>
            <div>0.5 GPU hours × $4.45 = $2.23 GPU usage</div>
          </div>
        </article>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {planList.map((plan) => {
          const isCurrent = activePlan === plan.id
          return (
            <article key={plan.id} className={`flex flex-col rounded-xl border bg-white/[0.035] p-4 ${isCurrent ? "border-emerald-400/40" : "border-white/10"}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-black">{plan.name}</h3>
                {isCurrent && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black text-emerald-400">CURRENT</span>}
              </div>
              <div className="mt-3">
                <span className="text-3xl font-black">{plan.price}</span>
                <span className="text-sm text-white/45">/{plan.interval}</span>
              </div>
              <p className="mt-1 text-xs font-semibold text-white/45">{plan.monthlyLaunchHours} launch-hours / mo</p>
              <ul className="mt-4 flex-1 space-y-2">
                {[
                  `${plan.runningSandboxLimit} running sandbox${plan.runningSandboxLimit === 1 ? "" : "es"}`,
                  `${plan.storedSandboxLimit} stored sandboxes`,
                  `${plan.idleTimeoutMinutes}-min idle auto-stop`,
                  plan.gpuEnabled ? "GPU add-ons available" : "CPU sandboxes only",
                ].map((detail) => (
                  <li key={detail} className="flex gap-2 text-sm leading-5 text-white/62">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {detail}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => choosePlan(plan.id)}
                disabled={busyPlan !== null || isCurrent}
                className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-black disabled:opacity-60 ${isCurrent ? "os-secondary-button" : "os-primary-button"}`}
              >
                {busyPlan === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isCurrent ? "Current plan" : !isSignedIn ? "Sign in to choose" : plan.isFree ? "Start free trial" : `Choose ${plan.name}`}
              </button>
            </article>
          )
        })}
      </div>

      <h2 className="mt-8 text-sm font-black uppercase tracking-[0.2em] text-white/40">Sandbox sizes</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {Object.values(SANDBOX_SIZE_TIERS).map((size) => (
          <article key={size.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black">{size.label}</h3>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs font-bold text-white/55">{size.creditMultiplier}x</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-white/70">{size.cpu} vCPU · {size.memory} GiB RAM · {size.disk} GiB disk</p>
            <p className="mt-3 text-2xl font-black">{size.price}</p>
          </article>
        ))}
      </div>

      <h2 className="mt-8 text-sm font-black uppercase tracking-[0.2em] text-white/40">GPU add-ons</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {Object.values(GPU_ADDON_TIERS).map((gpu) => (
          <article key={gpu.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <div>
              <h3 className="font-black">{gpu.label}</h3>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-white/50"><LockKeyhole className="h-3.5 w-3.5" /> Pro and Team · billed while running</p>
            </div>
            <span className="text-xl font-black">{gpu.price}</span>
          </article>
        ))}
      </div>
    </WindowPage>
  )
}

/* ──────────────────────────────  Dashboard  ───────────────────────────────── */

function DashboardApp({ openApp, onOpenSandbox }: { openApp: (id: AppId) => void; onOpenSandbox: (sandbox: SandboxRecord) => void }) {
  const { isLoaded, isSignedIn } = useUser()

  if (!isLoaded) {
    return (
      <div className="grid min-h-full place-items-center p-6">
        <Loader2 className="h-6 w-6 animate-spin os-subtle" />
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div className="grid min-h-full place-items-center p-6">
        <div className="max-w-md text-center">
          <LockKeyhole className="mx-auto h-10 w-10 text-white/70" />
          <h2 className="mt-4 text-3xl font-black">Sign in to open Dashboard.</h2>
          <p className="mt-3 text-sm leading-6 text-white/56">Sandbox provisioning, billing, and terminal access require an authenticated account.</p>
          <button onClick={() => openApp("auth")} className="os-primary-button mt-6 rounded-lg px-4 py-2.5 text-sm font-black">Open sign in</button>
        </div>
      </div>
    )
  }

  return <RealDashboardApp openApp={openApp} onOpenSandbox={onOpenSandbox} />
}

function RealDashboardApp({ openApp, onOpenSandbox }: { openApp: (id: AppId) => void; onOpenSandbox: (sandbox: SandboxRecord) => void }) {
  const { user } = useUser()
  const [sandboxes, setSandboxes] = useState<SandboxRecord[]>([])
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const loadDashboard = useCallback(async () => {
    try {
      const [sandboxRes, accountRes] = await Promise.all([fetch("/api/sandboxes"), fetch("/api/billing/account")])
      if (sandboxRes.ok) setSandboxes(((await sandboxRes.json()).sandboxes ?? []) as SandboxRecord[])
      if (accountRes.ok) setAccountInfo((await accountRes.json()) as AccountInfo)
    } catch {
      /* network errors surface via empty state */
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    // Fetch dashboard data on mount and poll; state updates happen post-await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard()
    const id = window.setInterval(() => void loadDashboard(), 12_000)
    return () => window.clearInterval(id)
  }, [loadDashboard])

  const running = sandboxes.filter((sandbox) => sandbox.status === "running").length
  const stopped = sandboxes.filter((sandbox) => sandbox.status === "stopped").length
  const account = accountInfo?.account ?? null
  const isAdmin = accountInfo?.isAdmin === true
  const hasActivePlan = ACTIVE_SUBSCRIPTION_STATUSES.has(account?.subscription_status ?? "")
  const currentPlan = account?.plan ? CLOUD_PLANS[account.plan as keyof typeof CLOUD_PLANS] : null
  const canCreate = isAdmin || hasActivePlan
  const allowedTiers = isAdmin ? ["launch", "build", "max-cpu"] : [...(currentPlan?.allowedSandboxTiers ?? [])]

  return (
    <WindowPage
      eyebrow="Dashboard"
      title={`Welcome${user?.firstName ? `, ${user.firstName}` : ""}.`}
      body="Create and manage your cloud sandboxes. Open a running sandbox for its terminal, connection details, and resources."
      action={
        <button
          onClick={() => {
            setRefreshing(true)
            void loadDashboard()
          }}
          className="os-secondary-button inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-black"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      }
    >
      {loading ? (
        <div className="grid place-items-center rounded-xl border border-white/10 bg-white/[0.03] p-12">
          <Loader2 className="h-6 w-6 animate-spin os-subtle" />
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Total" value={sandboxes.length} />
              <Stat label="Running" value={running} />
              <Stat label="Stopped" value={stopped} />
              <Stat label="Plan" value={isAdmin ? "admin" : account?.plan ?? "none"} />
            </div>
            {canCreate ? (
              <button onClick={() => setShowCreateModal(true)} className="os-primary-button inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-black">
                <Plus className="h-4 w-4" /> New Sandbox
              </button>
            ) : (
              <button onClick={() => openApp("pricing")} className="os-primary-button inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-black">
                <CreditCard className="h-4 w-4" /> Choose Plan
              </button>
            )}
          </div>

          {!isAdmin && hasActivePlan && currentPlan && accountInfo && (
            <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 text-xs">
                <span className="text-white/55">{accountInfo.creditsUsedTotal.toFixed(1)} / {accountInfo.creditsTotal} launch-hours used</span>
                <span className="flex items-center gap-1.5 text-white/45"><Clock className="h-3 w-3" /> Idle auto-stop: {currentPlan.idleTimeoutMinutes} min</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${accountInfo.creditsRemaining <= 0 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${Math.min(100, (accountInfo.creditsUsedTotal / Math.max(1, accountInfo.creditsTotal)) * 100).toFixed(1)}%` }}
                />
              </div>
              {accountInfo.gpuUsageUsdTotal > 0 && (
                <p className="mt-2 text-xs font-semibold text-white/50">GPU usage this period: ${accountInfo.gpuUsageUsdTotal.toFixed(2)}</p>
              )}
            </div>
          )}

          {sandboxes.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] py-16 text-center">
              <MonitorUp className="mx-auto h-9 w-9 text-white/20" />
              <h3 className="mt-4 font-black">No sandboxes yet</h3>
              <p className="mt-2 text-sm text-white/50">{canCreate ? "Create your first sandbox to get started." : "Choose a plan to unlock sandbox creation."}</p>
              {canCreate ? (
                <button onClick={() => setShowCreateModal(true)} className="os-primary-button mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-black">
                  <Plus className="h-4 w-4" /> Create Sandbox
                </button>
              ) : (
                <button onClick={() => openApp("pricing")} className="os-primary-button mt-5 rounded-lg px-4 py-2.5 text-sm font-black">Choose Plan</button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sandboxes.map((sandbox) => (
                <OSSandboxCard key={sandbox.id} sandbox={sandbox} onOpen={() => onOpenSandbox(sandbox)} onRefresh={() => void loadDashboard()} />
              ))}
            </div>
          )}

          {showCreateModal && canCreate && (
            <CreateSandboxModal
              allowedTiers={allowedTiers}
              gpuEnabled={isAdmin || (account?.gpu_enabled ?? false)}
              onClose={() => setShowCreateModal(false)}
              onSuccess={() => void loadDashboard()}
            />
          )}
        </>
      )}
    </WindowPage>
  )
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function OSSandboxCard({ sandbox, onOpen, onRefresh }: { sandbox: SandboxRecord; onOpen: () => void; onRefresh: () => void }) {
  const [acting, setActing] = useState(false)
  const tier = SANDBOX_SIZE_TIERS[sandbox.tier as keyof typeof SANDBOX_SIZE_TIERS]

  async function doAction(action: "start" | "stop") {
    setActing(true)
    try {
      const res = await fetch(`/api/sandboxes/${sandbox.id}/${action}`, { method: "POST" })
      if (res.ok) {
        toast.success(action === "start" ? "Sandbox starting" : "Sandbox stopping")
        onRefresh()
      } else {
        toast.error(`Failed to ${action} sandbox`)
      }
    } catch {
      toast.error("Network error")
    } finally {
      setActing(false)
    }
  }

  async function doDelete() {
    if (!window.confirm(`Delete "${sandbox.name}"? This cannot be undone.`)) return
    setActing(true)
    try {
      const res = await fetch(`/api/sandboxes/${sandbox.id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Sandbox deleted")
        onRefresh()
      } else {
        toast.error("Failed to delete sandbox")
      }
    } catch {
      toast.error("Network error")
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <h3 className="truncate font-black hover:underline">{sandbox.name}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SandboxStatus status={sandbox.status} />
            {tier && <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/55">{tier.label}</span>}
          </div>
        </button>
        <button onClick={onOpen} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg os-muted transition hover:bg-white/10 hover:text-white" aria-label="Open sandbox">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-white/45">
        <span className="flex items-center gap-1.5"><Cpu className="h-3 w-3" /> {tier ? tier.label : sandbox.tier}</span>
        <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {timeAgo(sandbox.created_at)}</span>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button onClick={onOpen} className="os-secondary-button flex-1 rounded-lg px-3 py-2 text-xs font-black">Open</button>
        {sandbox.status === "stopped" && (
          <button onClick={() => doAction("start")} disabled={acting} className="grid h-8 w-8 place-items-center rounded-lg border border-emerald-500/25 text-emerald-400 transition hover:bg-emerald-500/10 disabled:opacity-50" aria-label="Start">
            <Play className="h-3.5 w-3.5" />
          </button>
        )}
        {sandbox.status === "running" && (
          <button onClick={() => doAction("stop")} disabled={acting} className="grid h-8 w-8 place-items-center rounded-lg border border-white/15 os-muted transition hover:bg-white/10 disabled:opacity-50" aria-label="Stop">
            <Square className="h-3.5 w-3.5" />
          </button>
        )}
        <button onClick={doDelete} disabled={acting} className="grid h-8 w-8 place-items-center rounded-lg border border-red-500/25 text-red-400 transition hover:bg-red-500/10 disabled:opacity-50" aria-label="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

const STATUS_STYLE: Record<string, { label: string; dot: string; text: string }> = {
  running: { label: "Running", dot: "bg-emerald-500 animate-pulse", text: "text-emerald-400" },
  stopped: { label: "Stopped", dot: "bg-zinc-400", text: "text-white/55" },
  creating: { label: "Creating", dot: "bg-blue-500 animate-pulse", text: "text-blue-400" },
  starting: { label: "Starting", dot: "bg-amber-500 animate-pulse", text: "text-amber-400" },
  error: { label: "Error", dot: "bg-red-500", text: "text-red-400" },
}

function SandboxStatus({ status }: { status: string }) {
  const cfg = STATUS_STYLE[status.toLowerCase()] ?? { label: status, dot: "bg-zinc-400", text: "text-white/55" }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-bold ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

/* ───────────────────────────  Sandbox detail  ─────────────────────────────── */

function SandboxApp({ sandbox, onClosed }: { sandbox: SandboxRecord | null; onClosed: () => void }) {
  const [sb, setSb] = useState<SandboxRecord | null>(sandbox)
  const [tab, setTab] = useState<"terminal" | "connect" | "resources">("terminal")
  const [acting, setActing] = useState(false)

  const refresh = useCallback(async () => {
    if (!sandbox) return
    try {
      const res = await fetch(`/api/sandboxes/${sandbox.id}`)
      if (res.ok) setSb((await res.json()).sandbox as SandboxRecord)
    } catch {
      /* keep last known state */
    }
  }, [sandbox])

  useEffect(() => {
    if (!sandbox) return
    // Poll the live sandbox record; state updates happen post-await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    const id = window.setInterval(() => void refresh(), 9_000)
    return () => window.clearInterval(id)
  }, [sandbox, refresh])

  if (!sandbox || !sb) {
    return (
      <div className="grid min-h-full place-items-center p-6 text-center">
        <div>
          <Code2 className="mx-auto h-10 w-10 text-white/25" />
          <h2 className="mt-4 text-2xl font-black">No sandbox selected.</h2>
          <p className="mt-2 text-sm text-white/55">Open Dashboard and choose a sandbox.</p>
        </div>
      </div>
    )
  }

  const tier = SANDBOX_SIZE_TIERS[sb.tier as keyof typeof SANDBOX_SIZE_TIERS]

  async function doAction(action: "start" | "stop") {
    setActing(true)
    try {
      const res = await fetch(`/api/sandboxes/${sb!.id}/${action}`, { method: "POST" })
      if (res.ok) {
        toast.success(action === "start" ? "Sandbox starting" : "Sandbox stopping")
        await refresh()
      } else {
        toast.error(`Failed to ${action} sandbox`)
      }
    } catch {
      toast.error("Network error")
    } finally {
      setActing(false)
    }
  }

  async function doDelete() {
    if (!window.confirm(`Delete "${sb!.name}"? This cannot be undone.`)) return
    setActing(true)
    try {
      const res = await fetch(`/api/sandboxes/${sb!.id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Sandbox deleted")
        onClosed()
      } else {
        toast.error("Failed to delete sandbox")
        setActing(false)
      }
    } catch {
      toast.error("Network error")
      setActing(false)
    }
  }

  const tabs: Array<{ id: typeof tab; label: string; icon: React.ReactNode }> = [
    { id: "terminal", label: "Terminal", icon: <TerminalIcon className="h-3.5 w-3.5" /> },
    { id: "connect", label: "Connect", icon: <Info className="h-3.5 w-3.5" /> },
    { id: "resources", label: "Resources", icon: <Cpu className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="flex min-h-full flex-col p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="truncate text-xl font-black">{sb.name}</h2>
            <SandboxStatus status={sb.status} />
            {tier && <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/55">{tier.label}</span>}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-white/45">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(sb.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sb.status === "stopped" && (
            <button onClick={() => doAction("start")} disabled={acting} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 px-3 py-2 text-sm font-black text-emerald-400 transition hover:bg-emerald-500/10 disabled:opacity-50">
              <Play className="h-4 w-4" /> Start
            </button>
          )}
          {sb.status === "running" && (
            <button onClick={() => doAction("stop")} disabled={acting} className="os-secondary-button inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-black disabled:opacity-50">
              <Square className="h-4 w-4" /> Stop
            </button>
          )}
          <button onClick={doDelete} disabled={acting} className="inline-flex items-center gap-2 rounded-lg border border-red-500/25 px-3 py-2 text-sm font-black text-red-400 transition hover:bg-red-500/10 disabled:opacity-50">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      </div>

      <div className="mb-4 inline-flex w-fit gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-black transition ${tab === item.id ? "bg-white/12 text-white" : "os-muted hover:text-white"}`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {tab === "terminal" && <TerminalEmbed sandboxId={sb.id} status={sb.status} />}
        {tab === "connect" && <ConnectionInfo sandboxId={sb.id} status={sb.status} />}
        {tab === "resources" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-white/40">Resources</h3>
              <div className="space-y-2.5 text-sm">
                {[
                  ["Runtime profile", "Daytona snapshot default"],
                  ["Tier", tier ? `${tier.label} — ${tier.price}` : sb.tier],
                  ["Requested disk", `${sb.disk_gib ?? tier?.disk ?? 10} GiB`],
                  ["Sandbox ID", `${sb.id.slice(0, 16)}…`],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-4">
                    <span className="text-white/45">{k}</span>
                    <span className={`font-semibold text-white/80 ${k === "Sandbox ID" ? "font-mono text-xs" : ""}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-white/40">Getting started</h3>
              <ol className="list-decimal space-y-3 pl-4 text-sm leading-relaxed text-white/55">
                <li>Authenticate your AI CLI inside the terminal (e.g. <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs text-white/75">claude auth login</code>).</li>
                <li>Open the <span className="font-semibold text-white/75">Connect</span> tab and scan the QR or copy the pairing link.</li>
                <li>Paste the pairing link into the Trifecta app → Settings → Connections.</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────  Privacy / About / Auth  ───────────────────── */

function PrivacyApp() {
  return (
    <WindowPage eyebrow="Privacy" title="Privacy and account boundaries." body="Authentication and cloud controls are scoped to the signed-in dashboard. The full policy and terms open in a new tab.">
      <div className="space-y-4 text-sm leading-7 text-white/62">
        <p>Account, billing, analytics, database, deployment, and sandbox infrastructure are described in the full policy.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="os-secondary-button inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-black">
            Privacy Policy <ExternalLink className="h-4 w-4" />
          </Link>
          <Link href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="os-secondary-button inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-black">
            Terms of Service <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </WindowPage>
  )
}

function AboutApp({ openApp }: { openApp: (id: AppId) => void }) {
  return (
    <WindowPage eyebrow="About" title="Trifecta repository map." body="Trifecta includes a desktop server, native mobile clients, IDE surfaces, web UI, and a cloud dashboard.">
      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={() => openApp("agents")} className="os-secondary-button rounded-xl p-4 text-left font-black">Supported agents</button>
        <button onClick={() => openApp("clients")} className="os-secondary-button rounded-xl p-4 text-left font-black">Client apps</button>
        <Link href={repoUrl} target="_blank" rel="noopener noreferrer" className="os-secondary-button flex items-center justify-between rounded-xl p-4 font-black">
          <span className="flex items-center gap-2"><FolderGit2 className="h-4 w-4" /> GitHub repository</span>
          <ExternalLink className="h-4 w-4" />
        </Link>
        <Link href={releasesUrl} target="_blank" rel="noopener noreferrer" className="os-secondary-button flex items-center justify-between rounded-xl p-4 font-black">
          Releases <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
      <p className="mt-5 text-xs text-white/40">Apache 2.0 · © 2026 Belweave</p>
    </WindowPage>
  )
}

function AuthApp({ openApp }: { openApp: (id: AppId) => void }) {
  const { isLoaded, isSignedIn } = useUser()
  const { openSignIn, openSignUp } = useClerk()

  return (
    <div className="grid min-h-full place-items-center p-5">
      {!isLoaded && <Loader2 className="h-6 w-6 animate-spin os-subtle" />}
      {isLoaded && isSignedIn && (
        <div className="text-center">
          <UserRound className="mx-auto h-10 w-10 text-white/70" />
          <h2 className="mt-4 text-2xl font-black">You are signed in.</h2>
          <p className="mt-2 text-sm text-white/55">Open the Dashboard to manage sandboxes and billing.</p>
          <button onClick={() => openApp("dashboard")} className="os-primary-button mt-5 rounded-lg px-4 py-2.5 text-sm font-black">Open Dashboard</button>
        </div>
      )}
      {isLoaded && !isSignedIn && (
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.035] p-6">
          <Image src="/trifecta-logo.png" alt="Trifecta" width={48} height={48} className="h-12 w-12 rounded-xl object-cover" />
          <h2 className="mt-5 text-2xl font-black">Trifecta account</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">Sign in to open the dashboard, manage billing, and provision cloud sandboxes.</p>
          <div className="mt-5 grid gap-3">
            <button onClick={() => openSignIn()} className="os-primary-button rounded-lg px-4 py-2.5 text-sm font-black">Sign in</button>
            <button onClick={() => openSignUp()} className="os-secondary-button rounded-lg px-4 py-2.5 text-sm font-black">Create account</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
      <div className="truncate text-2xl font-black">{value}</div>
      <div className="mt-1 text-xs font-black uppercase tracking-wider text-white/42">{label}</div>
    </div>
  )
}
