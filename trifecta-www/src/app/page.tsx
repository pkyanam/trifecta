"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { Check, Apple, Smartphone, Globe, Monitor, Terminal, ArrowRight } from "lucide-react"
import { Nav, Footer } from "@/components/nav"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  ClaudeAIIcon,
  OpenAIIcon,
  GeminiIcon,
  CursorProviderIcon,
  OpenCodeProviderIcon,
  GithubCopilotProviderIcon,
  ACPRegistryProviderIcon,
  HermesProviderIcon,
  DevinProviderIcon,
} from "@/components/provider-icons"

/* ── Animated counter hook ── */
function useCountUp(target: number, duration = 1200) {
  const [count, setCount] = useState(0)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts
      const elapsed = ts - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(ease * target))
      if (progress < 1) rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return count
}

/* ── Counter with IntersectionObserver ── */
function AnimatedStat({ value, label, suffix = "" }: { value: number; label: string; suffix?: string }) {
  const [started, setStarted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStarted(true); obs.disconnect() } },
      { threshold: 0.5 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const count = useCountUp(started ? value : 0)

  return (
    <div ref={ref} className="text-center">
      <div className="text-4xl font-black tracking-tight text-foreground tabular-nums sm:text-5xl">
        {count}{suffix}
      </div>
      <div className="mt-1.5 text-sm font-medium text-muted-foreground">{label}</div>
    </div>
  )
}

/* ── Provider chip for marquee ── */
function ProviderChip({
  icon,
  name,
  comingSoon,
}: {
  icon: React.ReactNode
  name: string
  comingSoon?: boolean
}) {
  return (
    <div
      className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-4 py-2.5 mx-2 transition-all
        ${comingSoon
          ? "border-border/40 bg-card/20 opacity-50"
          : "border-border bg-card/60 backdrop-blur hover:border-foreground/20 hover:bg-card"
        }`}
    >
      <span className="h-5 w-5 shrink-0 flex items-center justify-center">{icon}</span>
      <span className="text-sm font-semibold text-foreground whitespace-nowrap">{name}</span>
      {comingSoon && (
        <span className="ml-1 rounded-full border border-border/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          soon
        </span>
      )}
    </div>
  )
}

const PROVIDERS = [
  { icon: <ClaudeAIIcon className="h-5 w-5" />, name: "Claude Code", accent: "#d97757" },
  { icon: <OpenAIIcon className="h-5 w-5" />, name: "Codex CLI" },
  { icon: <GeminiIcon className="h-5 w-5" />, name: "Gemini CLI" },
  { icon: <CursorProviderIcon className="h-4 w-4" />, name: "Cursor Agent" },
  { icon: <OpenCodeProviderIcon className="h-4 w-5" />, name: "OpenCode" },
  { icon: <HermesProviderIcon className="h-5 w-5" />, name: "Hermes" },
  { icon: <DevinProviderIcon className="h-5 w-5" />, name: "Devin" },
  { icon: <ACPRegistryProviderIcon className="h-5 w-3" />, name: "ACP Registry" },
  { icon: <GithubCopilotProviderIcon className="h-5 w-5" />, name: "GitHub Copilot", comingSoon: true },
]

const PLATFORM_LINKS = [
  { icon: <Apple className="h-4 w-4" />, label: "macOS", href: "https://github.com/pkyanam/trifecta" },
  { icon: <Smartphone className="h-4 w-4" />, label: "iOS", href: "https://testflight.apple.com/join/M5FkR4R8" },
  { icon: <Smartphone className="h-4 w-4" />, label: "Android", href: "https://forms.gle/WPHxw8axUs6QanXBA" },
  { icon: <Globe className="h-4 w-4" />, label: "Web", href: "https://app.trifecta.belweave.com" },
  { icon: <Monitor className="h-4 w-4" />, label: "Windows", href: "https://github.com/pkyanam/trifecta" },
  { icon: <Terminal className="h-4 w-4" />, label: "Linux", href: "https://github.com/pkyanam/trifecta" },
]

const FAQ_ITEMS = [
  {
    q: "Is Trifecta free to use?",
    a: "Trifecta is open-source under the Apache 2.0 license. You can self-host it for free. You bring your own API subscriptions — we don't charge you for tokens or proxy your requests.",
  },
  {
    q: "Which AI providers are supported?",
    a: "Claude Code, Codex CLI, Gemini CLI, Cursor Agent, OpenCode, Hermes, Devin, and ACP Registry are all live today. GitHub Copilot support is coming soon.",
  },
  {
    q: "Can I use it on mobile while my agent runs on desktop?",
    a: "Yes — that's the core use case. Start a Claude Code session on your machine, then monitor, approve commands, review diffs, and push from your iPhone, iPad, or Android device.",
  },
  {
    q: "Do I need to expose my machine to the internet?",
    a: "Trifecta uses a secure relay so your local machine stays behind your firewall. No port forwarding or public IP required.",
  },
  {
    q: "How do I add a custom provider or fork the project?",
    a: "Clone the repo, add your provider driver in the packages directory, and register it in the config. The architecture is fully documented in CONTRIBUTING.md.",
  },
  {
    q: "What's the cloud sandbox dashboard for?",
    a: "It's an optional cloud tier that provisions isolated Trifecta Cloud sandboxes for running agents remotely, without tying up your local machine. Still in early access.",
  },
]

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <Nav />

      {/* ── HERO ── */}
      <section className="relative w-full overflow-hidden pt-20 pb-24 md:pt-28 md:pb-32">
        {/* Grid */}
        <div className="absolute inset-0 clean-grid opacity-100 -z-10" />

        {/* RGB glows */}
        <div className="glow-red -z-10 -top-32 -left-48 opacity-60" />
        <div className="glow-blue -z-10 -top-20 -right-48 opacity-50" />

        <div className="mx-auto max-w-4xl px-6 text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Open-source · Apache 2.0 · 9 providers
          </div>

          <h1 className="text-5xl font-black tracking-tight text-foreground sm:text-6xl lg:text-[80px] leading-[1.05] max-w-3xl mx-auto">
            Your AI agents,
            <br />
            <span className="text-muted-foreground/60">everywhere you are.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            Run agent threads, review diffs, approve terminal commands, and commit to Git from your desktop, browser, or mobile. Works with Claude Code, Codex, Gemini, Cursor, and more.
          </p>

          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row items-center">
            <Link
              href="https://app.trifecta.belweave.com"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-7 text-sm font-bold text-background hover:opacity-88 active:scale-95 transition-all shadow-sm"
            >
              Launch Web App
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="https://github.com/pkyanam/trifecta"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-card/40 backdrop-blur px-6 text-sm font-semibold text-foreground hover:bg-accent/60 transition-all"
            >
              <svg viewBox="0 0 1024 1024" fill="currentColor" className="h-4 w-4 shrink-0">
                <path fillRule="evenodd" clipRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.81 6.05 12.6C6.12 12.08 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8.02 3.86C8.7 3.86 9.38 3.95 10.02 4.13C11.55 3.09 12.22 3.31 12.22 3.31C12.66 4.41 12.38 5.23 12.3 5.43C12.81 5.99 13.12 6.7 13.12 7.58C13.12 10.65 11.25 11.33 9.47 11.53C9.76 11.78 10.01 12.26 10.01 13.01C10.01 14.08 10 14.94 10 15.21C10 15.42 10.15 15.67 10.55 15.59C13.71 14.53 16 11.53 16 8C16 3.58 12.42 0 8 0Z" transform="scale(64)" />
              </svg>
              Star on GitHub
            </Link>
          </div>

          {/* Platform pills */}
          <div className="mt-12 flex flex-wrap justify-center gap-2">
            {PLATFORM_LINKS.map((p) => (
              <Link
                key={p.label}
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-full border border-border/60 bg-card/30 backdrop-blur px-4 text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-all"
              >
                {p.icon}
                {p.label}
              </Link>
            ))}
          </div>
        </div>

        {/* App screenshot */}
        <div className="mx-auto max-w-5xl px-6 mt-16">
          <div className="relative rounded-2xl border border-border/60 shadow-2xl overflow-hidden bg-card">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/30 z-10 pointer-events-none" />
            <Image
              src="/trifecta-desktop-image.png"
              alt="Trifecta App Workspace"
              width={1200}
              height={720}
              className="w-full h-auto object-cover"
              priority
            />
          </div>
        </div>
      </section>

      {/* ── PROVIDER MARQUEE ── */}
      <section className="relative w-full border-y border-border/50 bg-card/30 py-8 overflow-hidden">
        <div className="glow-green -z-0 top-1/2 left-1/4 -translate-y-1/2 opacity-40" />

        <div className="mb-5 text-center">
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground/50">
            Supported Providers
          </span>
        </div>

        {/* Fade masks */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-l from-background to-transparent" />

        <div className="overflow-hidden">
          <div className="animate-provider-marquee">
            {[...PROVIDERS, ...PROVIDERS].map((p, i) => (
              <ProviderChip key={i} icon={p.icon} name={p.name} comingSoon={(p as { comingSoon?: boolean }).comingSoon} />
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="relative w-full py-20 md:py-28 border-b border-border/40 overflow-hidden">
        <div className="glow-red -z-10 bottom-0 right-1/3 opacity-30" />

        <div className="mx-auto max-w-4xl px-6">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <AnimatedStat value={9} label="AI providers" suffix="+" />
            <AnimatedStat value={6} label="Platforms" />
            <AnimatedStat value={100} label="Open-source" suffix="%" />
            <AnimatedStat value={0} label="Keys resold" />
          </div>
        </div>
      </section>

      {/* ── BRING YOUR OWN SUBSCRIPTION ── */}
      <section className="relative w-full py-20 md:py-28 border-b border-border/40 overflow-hidden">
        <div className="glow-blue -z-10 top-0 left-0 opacity-25" />
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-12">
            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground/50">Setup</span>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-5xl">
              Bring your own subscription
            </h2>
            <p className="mt-4 text-sm md:text-base text-muted-foreground max-w-2xl leading-relaxed">
              Trifecta doesn&apos;t resell API tokens. Plug in Claude Code, Codex, OpenCode, or Cursor with the credentials you already own.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: <ClaudeAIIcon className="h-5 w-5" />,
                name: "Claude Code",
                cmd: "claude auth login",
              },
              {
                icon: <OpenAIIcon className="h-5 w-5" />,
                name: "Codex CLI",
                cmd: "codex login",
              },
              {
                icon: <OpenCodeProviderIcon className="h-4 w-5" />,
                name: "OpenCode",
                cmd: "opencode auth",
              },
              {
                icon: <CursorProviderIcon className="h-4 w-4" />,
                name: "Cursor",
                cmd: "cursor-agent",
              },
            ].map((item) => (
              <div key={item.name} className="group rounded-xl border border-border bg-card p-4 hover:border-foreground/20 transition-all">
                <div className="flex items-center gap-2.5 mb-3">
                  {item.icon}
                  <span className="text-sm font-bold text-foreground">{item.name}</span>
                </div>
                <div className="rounded-lg bg-secondary/70 border border-border/50 px-3 py-2 font-mono text-xs text-foreground/90 select-all">
                  {item.cmd}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 border-t border-border/30 pt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm font-semibold">
            {[
              "No keys resold. No quota caps.",
              "Switch models mid-thread.",
              "More harnesses shipping weekly.",
            ].map((text) => (
              <span key={text} className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
                <Check className="h-4 w-4 stroke-[3]" />
                {text}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── GIT SECTION ── */}
      <section className="relative w-full py-20 md:py-28 border-b border-border/40 overflow-hidden">
        <div className="glow-green -z-10 top-1/2 right-0 -translate-y-1/2 opacity-25" />
        <div className="mx-auto max-w-5xl px-6 grid gap-16 lg:grid-cols-2 items-center">
          {/* Terminal mockup */}
          <div className="relative rounded-2xl border border-border bg-card font-mono text-sm text-muted-foreground shadow-xl space-y-4 p-5 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent pointer-events-none" />
            <div className="border border-border bg-background rounded-xl p-4 space-y-4 relative">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-sans font-bold text-foreground text-sm">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" className="h-4 w-4">
                    <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
                    <path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
                  </svg>
                  Add marketing hero animation
                </span>
                <span className="text-xs font-sans font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full uppercase">READY</span>
              </div>
              <div className="text-xs text-muted-foreground font-sans">
                feat/marketing-hero → main <span className="opacity-30 mx-1">·</span> +142 −38 <span className="opacity-30 mx-1">·</span> 3 commits
              </div>
              <div className="space-y-1.5 text-xs font-sans">
                {[
                  ["apps/marketing/src/pages/index.astro", "+14 -2"],
                  ["apps/marketing/src/layouts/Layout.astro", "+8 -0"],
                  ["apps/marketing/public/hero.css", "+120 -36"],
                ].map(([file, diff]) => (
                  <div key={file} className="flex justify-between">
                    <span className="text-foreground/70 font-medium truncate mr-4">{file}</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">{diff}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2.5 pt-2">
                <span className="flex-1 bg-secondary border border-border rounded-lg py-2 text-xs text-center text-muted-foreground font-semibold font-sans cursor-pointer hover:text-foreground transition-colors">View diff</span>
                <span className="flex-1 bg-foreground border border-foreground rounded-lg py-2 text-xs text-center text-background font-bold font-sans flex items-center justify-center gap-1.5 cursor-pointer">
                  Open pull request
                </span>
              </div>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-px h-8 bg-gradient-to-b from-border to-emerald-500" />
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </div>
            <div className="flex justify-center">
              <span className="inline-flex h-9 items-center gap-2 rounded-lg bg-foreground text-background font-bold px-5 text-xs">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5">
                  <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
                  <path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
                </svg>
                Commit &amp; push
                <kbd className="bg-background/20 text-background/80 px-1.5 py-0.5 rounded text-[10px] font-sans ml-1">⌘⏎</kbd>
              </span>
            </div>
          </div>

          {/* Copy */}
          <div className="space-y-6">
            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground/50">Git workflow</span>
            <h3 className="text-3xl font-black tracking-tight text-foreground sm:text-5xl leading-tight">
              One action to commit, push, and PR.
            </h3>
            <p className="text-base text-muted-foreground leading-relaxed">
              Every agent thread writes to its own branch. When it&apos;s good, one button opens the PR on GitHub with a generated title, body, and changelog.
            </p>
            <ul className="space-y-3 text-sm font-semibold text-muted-foreground">
              {["Auto-generated PR titles & bodies", "Inline diff review before you push", "Draft PRs, stack PRs, amend PRs", "Works with your existing GitHub auth"].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-emerald-500 stroke-[3] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── OPEN SOURCE ── */}
      <section className="relative w-full py-20 md:py-28 border-b border-border/40 overflow-hidden">
        <div className="glow-red -z-10 top-0 right-0 opacity-20" />
        <div className="glow-blue -z-10 bottom-0 left-0 opacity-20" />
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-12">
            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground/50">Open Source</span>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-5xl">
              Fully customizable. Fully open.
            </h2>
            <p className="mt-4 text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Fork the code. Make it yours. Apache 2.0 licensed, end-to-end typed, runs fully on your terms.
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-2 items-stretch">
            {/* Terminal clone */}
            <div className="rounded-2xl border border-border bg-card text-foreground font-mono text-xs p-6 leading-loose shadow-lg flex flex-col justify-between">
              <div>
                <div className="text-muted-foreground/40 select-none mb-4 text-[11px] uppercase tracking-widest font-bold">~/code</div>
                <div className="space-y-0.5">
                  {[
                    { prompt: true, text: "gh repo fork pkyanam/trifecta --clone" },
                    { prompt: false, text: "✓ Cloned trifecta into ./trifecta", dim: false },
                    { prompt: true, text: "cd trifecta && bun install" },
                    { prompt: false, text: "✓ 1 284 packages installed in 4.2s" },
                    { prompt: true, text: "bun dev" },
                    { prompt: false, text: "▲ Trifecta dev server → http://localhost:4001", green: true },
                  ].map((line, i) => (
                    <div key={i} className={line.green ? "text-emerald-500" : "text-muted-foreground"}>
                      {line.prompt && <span className="text-foreground/20 select-none mr-1">$</span>}
                      <span className={line.prompt ? "text-foreground font-semibold" : ""}>{line.text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground/40 mt-6 border-t border-border/20 pt-3 select-none flex justify-between">
                <span>Bun runtime v1.1+</span><span>Port 4001 active</span>
              </div>
            </div>

            <div className="grid gap-4 grid-cols-2">
              {[
                { title: "Apache 2.0", sub: "License · commercial-friendly" },
                { title: "TypeScript", sub: "End-to-end, strictly typed" },
                { title: "1 monorepo", sub: "Desktop · web · server · harnesses" },
                { title: "No telemetry", sub: "Unless you opt in. Full stop." },
              ].map(({ title, sub }) => (
                <div key={title} className="rounded-xl border border-border bg-card p-5 hover:border-foreground/20 transition-all">
                  <h4 className="font-black text-foreground text-base">{title}</h4>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{sub}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 border-t border-border/30 pt-6 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground font-semibold">
            {[
              { href: "https://github.com/pkyanam/trifecta", label: "Star on GitHub" },
              { href: "https://github.com/pkyanam/trifecta", label: "Fork the repo" },
              { href: "https://github.com/pkyanam/trifecta/blob/main/CONTRIBUTING.md", label: "Read CONTRIBUTING.md" },
            ].map((link) => (
              <Link key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors flex items-center gap-1.5">
                {link.label} <ArrowRight className="h-3 w-3" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="relative w-full py-20 md:py-28 border-b border-border/40">
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-center mb-12">
            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground/50">FAQ</span>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              Common questions
            </h2>
          </div>

          <Accordion className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem
                key={i}
                value={i}
                className="rounded-xl border border-border bg-card px-5 transition-all"
              >
                <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline py-4">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section className="relative w-full py-24 md:py-32 overflow-hidden">
        <div className="glow-red -z-10 top-0 left-1/4 opacity-20" />
        <div className="glow-blue -z-10 bottom-0 right-1/4 opacity-20" />
        <div className="absolute inset-0 clean-grid opacity-50 -z-10" />

        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-4xl font-black tracking-tight text-foreground sm:text-6xl max-w-2xl mx-auto leading-[1.05]">
            A better workspace for AI agents.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            Install Trifecta, plug in your preferred harness, and let your agents get to work.
          </p>

          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row items-center">
            <Link
              href="https://app.trifecta.belweave.com"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground px-8 text-sm font-bold text-background hover:opacity-88 active:scale-95 transition-all shadow-md"
            >
              Launch Web App
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="https://github.com/pkyanam/trifecta"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-card/40 backdrop-blur px-6 text-sm font-semibold text-foreground hover:bg-accent/60 transition-all"
            >
              Star on GitHub
            </Link>
          </div>

          <div className="mt-6 text-xs text-muted-foreground/60 font-mono tracking-wider">
            macOS · iOS · Android · Windows · Linux · Web
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
