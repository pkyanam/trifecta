"use client"

import Link from "next/link"
import { Check, Apple, Smartphone, Globe, Monitor, Terminal } from "lucide-react"
import { Nav, Footer } from "@/components/nav"



export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Top Navbar */}
      <Nav />

      {/* HERO SECTION WITH GRID */}
      <section className="relative w-full pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="absolute inset-0 clean-grid opacity-100 -z-10" />

        <div className="mx-auto max-w-4xl px-6 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl lg:text-7xl leading-[1.1] max-w-3xl mx-auto">
            Your AI coding workspace on any device.
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed">
            Run agent threads, review diffs, approve terminal commands, and commit to Git from your desktop, browser, or mobile device. Works with Claude Code, Codex, and local tools.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row items-center">
            {/* Launch Web App Button */}
            <Link
              href="https://app.trifecta.belweave.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-7 text-sm font-bold text-primary-foreground hover:opacity-90 active:scale-95 transition-all shadow-sm"
            >
              Launch Web App
            </Link>
            {/* GitHub border button */}
            <Link
              href="https://github.com/pkyanam/trifecta"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-card/40 backdrop-blur px-6 text-sm font-semibold text-foreground hover:bg-secondary/40 transition-all"
            >
              Star on GitHub
            </Link>
          </div>

          {/* Platform Matrix */}
          <div className="mt-12 flex flex-col items-center justify-center gap-4 text-sm">
            <span className="text-xs uppercase tracking-widest font-extrabold text-muted-foreground/60">Supported Platforms</span>
            <div className="flex flex-wrap justify-center gap-3 max-w-2xl mt-1">
              <Link
                href="https://github.com/pkyanam/trifecta"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2.5 rounded-full border border-border bg-card/40 backdrop-blur px-5 hover:border-foreground/30 hover:text-foreground transition-all duration-200"
              >
                <Apple className="h-4 w-4 text-foreground" />
                <span className="font-medium">macOS</span>
              </Link>
              <Link
                href="https://testflight.apple.com/join/M5FkR4R8"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2.5 rounded-full border border-border bg-card/40 backdrop-blur px-5 hover:border-foreground/30 hover:text-foreground transition-all duration-200"
              >
                <Smartphone className="h-4 w-4 text-foreground" />
                <span className="font-medium">iOS (TestFlight)</span>
              </Link>
              <Link
                href="https://forms.gle/WPHxw8axUs6QanXBA"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2.5 rounded-full border border-border bg-card/40 backdrop-blur px-5 hover:border-foreground/30 hover:text-foreground transition-all duration-200"
              >
                <Smartphone className="h-4 w-4 text-foreground" />
                <span className="font-medium">Android (Beta)</span>
              </Link>
              <Link
                href="https://app.trifecta.belweave.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2.5 rounded-full border border-border bg-card/40 backdrop-blur px-5 hover:border-foreground/30 hover:text-foreground transition-all duration-200"
              >
                <Globe className="h-4 w-4 text-foreground" />
                <span className="font-medium">Web</span>
              </Link>
              <Link
                href="https://github.com/pkyanam/trifecta"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2.5 rounded-full border border-border bg-card/40 backdrop-blur px-5 hover:border-foreground/30 hover:text-foreground transition-all duration-200"
              >
                <Monitor className="h-4 w-4 text-foreground" />
                <span className="font-medium">Windows</span>
              </Link>
              <Link
                href="https://github.com/pkyanam/trifecta"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2.5 rounded-full border border-border bg-card/40 backdrop-blur px-5 hover:border-foreground/30 hover:text-foreground transition-all duration-200"
              >
                <Terminal className="h-4 w-4 text-foreground" />
                <span className="font-medium">Linux</span>
              </Link>
            </div>
          </div>
        </div>

        {/* WORKSPACE PREVIEW SCREENSHOT */}
        <div className="mx-auto max-w-5xl px-6 mt-16 md:mt-20">
          <img
            src="/trifecta-desktop-image.png"
            alt="Trifecta App Workspace Screenshot"
            className="w-full h-auto object-cover rounded-2xl border border-border shadow-2xl bg-card animate-in fade-in zoom-in-95 duration-500"
          />
        </div>
      </section>



      {/* BRING YOUR OWN SUB */}
      <section className="relative w-full py-16 md:py-24 border-t border-border/40 bg-background">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-12">
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl">
              Bring your own subscription
            </h2>
            <p className="mt-4 text-sm md:text-base text-muted-foreground max-w-2xl leading-relaxed">
              Trifecta doesn't resell API tokens. Plug in Claude Code, Codex, OpenCode, or Cursor with the credentials you already own — orchestrate everything from a single surface.
            </p>
          </div>
          {/* Agent command cards row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            
            {/* Claude */}
            <div className="rounded-xl border border-border bg-card p-4 font-mono">
              <div className="flex items-center gap-2.5 mb-3">
                <svg
                  preserveAspectRatio="xMidYMid"
                  viewBox="0 0 256 257"
                  className="h-5 w-5 fill-[#d97757]"
                >
                  <path d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z" />
                </svg>
                <span className="text-sm font-bold text-foreground font-sans">Claude Code</span>
              </div>
              <div className="bg-secondary border border-border/50 rounded-lg p-2.5 text-xs sm:text-sm text-foreground/95 select-all">
                claude auth login
              </div>
            </div>

            {/* Codex */}
            <div className="rounded-xl border border-border bg-card p-4 font-mono">
              <div className="flex items-center gap-2.5 mb-3">
                <svg
                  preserveAspectRatio="xMidYMid"
                  viewBox="0 0 256 260"
                  className="h-5 w-5 fill-black dark:fill-white"
                >
                  <path d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z" />
                </svg>
                <span className="text-sm font-bold text-foreground font-sans">Codex CLI</span>
              </div>
              <div className="bg-secondary border border-border/50 rounded-lg p-2.5 text-xs sm:text-sm text-foreground/95 select-all">
                codex login
              </div>
            </div>

            {/* OpenCode */}
            <div className="rounded-xl border border-border bg-card p-4 font-mono">
              <div className="flex items-center gap-2.5 mb-3">
                <svg
                  viewBox="0 0 32 40"
                  fill="none"
                  className="h-5 w-4"
                >
                  <path className="dark:hidden" d="M24 32H8V16H24V32Z" fill="#CFCECD" />
                  <path className="dark:hidden" d="M24 8H8V32H24V8ZM32 40H0V0H32V40Z" fill="#211E1E" />
                  <path className="hidden dark:block" d="M24 32H8V16H24V32Z" fill="#4B4646" />
                  <path className="hidden dark:block" d="M24 8H8V32H24V8ZM32 40H0V0H32V40Z" fill="#F1ECEC" />
                </svg>
                <span className="text-sm font-bold text-foreground font-sans">OpenCode</span>
              </div>
              <div className="bg-secondary border border-border/50 rounded-lg p-2.5 text-xs sm:text-sm text-foreground/95 select-all">
                opencode auth
              </div>
            </div>

            {/* Cursor */}
            <div className="rounded-xl border border-border bg-card p-4 font-mono">
              <div className="flex items-center gap-2.5 mb-3">
                <svg
                  viewBox="0 0 466.73 532.09"
                  className="h-5 w-4.5 fill-[#26251E] dark:fill-[#EDECEC]"
                >
                  <path d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z" />
                </svg>
                <span className="text-sm font-bold text-foreground font-sans">Cursor</span>
              </div>
              <div className="bg-secondary border border-border/50 rounded-lg p-2.5 text-xs sm:text-sm text-foreground/95 select-all">
                cursor-agent
              </div>
            </div>

          </div>

          {/* Quick specs footer list */}
          <div className="mt-8 border-t border-border/30 pt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm text-muted-foreground font-semibold">
            <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
              <Check className="h-4.5 w-4.5 stroke-[3]" />
              No keys resold. No quota caps.
            </span>
            <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
              <Check className="h-4.5 w-4.5 stroke-[3]" />
              Switch models mid-thread.
            </span>
            <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
              <Check className="h-4.5 w-4.5 stroke-[3]" />
              More harnesses shipping weekly.
            </span>
          </div>

        </div>
      </section>

      {/* ONE BUTTON TO COMMIT AND PUSH */}
      <section className="relative w-full py-16 md:py-24 border-t border-border/40 bg-background">
        <div className="mx-auto max-w-5xl px-6 grid gap-12 lg:grid-cols-2 items-center">
          
          {/* Card Mockup on the Left */}
          <div className="relative p-5 rounded-2xl border border-border bg-card font-mono text-sm text-muted-foreground shadow-xl space-y-4">
            
            {/* PR Status Card */}
            <div className="border border-border bg-background rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-sans font-bold text-foreground text-sm sm:text-base">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" className="h-4.5 w-4.5">
                    <circle cx="18" cy="18" r="3" />
                    <circle cx="6" cy="6" r="3" />
                    <path d="M13 6h3a2 2 0 0 1 2 2v7" />
                    <line x1="6" y1="9" x2="6" y2="21" />
                  </svg>
                  Add marketing hero animation
                </span>
                <span className="text-xs font-sans font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full uppercase">
                  READY
                </span>
              </div>

              <div className="text-xs text-muted-foreground">
                feat/marketing-hero → main <span className="text-border mx-1">·</span> <span>+142 −38</span> <span className="text-border mx-1">·</span> 3 commits
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-foreground/80 font-medium">apps/marketing/src/pages/index.astro</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">+14 -2</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/80 font-medium">apps/marketing/src/layouts/Layout.astro</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">+8 -0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/80 font-medium">apps/marketing/public/hero.css</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">+120 -36</span>
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <span className="flex-1 bg-secondary border border-border rounded-lg py-2 text-xs text-center text-muted-foreground font-semibold cursor-pointer hover:text-foreground">View diff</span>
                <span className="flex-1 bg-secondary border border-border rounded-lg py-2 text-xs text-center text-muted-foreground font-semibold flex items-center justify-center gap-1.5 cursor-pointer hover:text-foreground">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5">
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                  </svg>
                  Open pull request
                </span>
              </div>
            </div>

            {/* Branch connector wire */}
            <div className="flex flex-col items-center">
              <div className="w-0.5 h-10 bg-gradient-to-b from-border to-primary" />
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            </div>

            {/* Commit Stark Button */}
            <div className="flex justify-center">
              <span className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground font-bold px-5 text-xs shadow hover:opacity-90 transition-all cursor-pointer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4">
                  <circle cx="18" cy="18" r="3" />
                  <circle cx="6" cy="6" r="3" />
                  <path d="M13 6h3a2 2 0 0 1 2 2v7" />
                  <line x1="6" y1="9" x2="6" y2="21" />
                </svg>
                Commit & push
                <kbd className="bg-primary-foreground/20 text-primary-foreground px-1.5 py-0.5 rounded text-[10px] font-sans ml-1.5">⌘⏎</kbd>
              </span>
            </div>
          </div>

          {/* Copy Description on the Right */}
          <div className="space-y-6">
            <div>
              <h3 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl leading-tight">
                One action to commit, push, and PR.
              </h3>
              <p className="mt-4 text-base md:text-lg text-muted-foreground leading-relaxed">
                Every agent thread writes to its own branch. When it's good, one button opens the PR on GitHub with a generated title, body and changelog. No terminal dance required.
              </p>
            </div>

            <ul className="space-y-3.5 text-sm md:text-base font-semibold text-muted-foreground">
              <li className="flex items-center gap-2.5">
                <Check className="h-5 w-5 text-emerald-500 stroke-[3]" />
                Auto-generated PR titles & bodies
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="h-5 w-5 text-emerald-500 stroke-[3]" />
                Inline diff review before you push
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="h-5 w-5 text-emerald-500 stroke-[3]" />
                Draft PRs, stack PRs, amend PRs
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="h-5 w-5 text-emerald-500 stroke-[3]" />
                Works with your existing GitHub auth
              </li>
            </ul>
          </div>

        </div>
      </section>

      {/* OPEN SOURCE FORK PANEL */}
      <section className="relative w-full py-16 md:py-24 border-t border-border/40 bg-background">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-12">
            <span className="text-xs uppercase font-extrabold tracking-widest text-primary">Open Source</span>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl mt-1">
              Fully customizable. Fully open.
            </h2>
            <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              If you don't like how a feature behaves, fork the code and make it yours. Trifecta is Apache 2.0 licensed, end-to-end typed, and run fully on your terms.
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-2 items-stretch">
            {/* Terminal Clone on Left */}
            <div className="rounded-2xl border border-border bg-card text-foreground font-mono text-xs sm:text-sm p-6 leading-relaxed shadow-lg flex flex-col justify-between">
              <div>
                <div className="text-muted-foreground select-none mb-3">~/code</div>
                <div className="space-y-1.5 text-muted-foreground">
                  <div>
                    <span className="text-foreground/40 select-none">$ </span>
                    <span className="text-foreground font-semibold">gh repo fork pkyanam/trifecta --clone</span>
                  </div>
                  <div>✓ Cloned trifecta into ./trifecta</div>
                  
                  <div className="pt-2">
                    <span className="text-foreground/40 select-none">$ </span>
                    <span className="text-foreground font-semibold">cd trifecta && bun install</span>
                  </div>
                  <div>✓ 1 284 packages installed in 4.2s</div>

                  <div className="pt-2">
                    <span className="text-foreground/40 select-none">$ </span>
                    <span className="text-foreground font-semibold">bun dev</span>
                  </div>
                  <div className="text-emerald-600 dark:text-emerald-400">▲ Trifecta dev server → <span className="underline">http://localhost:4001</span></div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-6 border-t border-border/20 pt-3 select-none flex justify-between">
                <span>Bun runtime v1.1+</span>
                <span>Port 4001 active</span>
              </div>
            </div>

            {/* Spec Cards on Right */}
            <div className="grid gap-4 grid-cols-2">
              
              <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-foreground text-base sm:text-lg">Apache 2.0</h4>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
                    License · commercial-friendly
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-foreground text-base sm:text-lg">TypeScript</h4>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
                    End-to-end, strictly typed
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-foreground text-base sm:text-lg">1 monorepo</h4>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
                    Desktop · web · server · harnesses
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-foreground text-base sm:text-lg">No telemetry</h4>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
                    Unless you opt in. Full stop.
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* Star visual footer badges */}
          <div className="mt-10 border-t border-border/30 pt-6 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground font-semibold">
            <Link href="https://github.com/pkyanam/trifecta" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Star on GitHub</Link>
            <span className="text-muted-foreground">·</span>
            <Link href="https://github.com/pkyanam/trifecta" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Fork the repo</Link>
            <span className="text-muted-foreground">·</span>
            <Link href="https://github.com/pkyanam/trifecta/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Read CONTRIBUTING.md</Link>
          </div>

        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="relative w-full py-20 md:py-28 border-t border-border/40 bg-background">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl max-w-2xl mx-auto leading-none">
            A better workspace for AI agents.
          </h2>
          
          <p className="mx-auto mt-6 max-w-xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            Install Trifecta, plug in your preferred harness, and let your agents get to work.
          </p>

          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row items-center">
            {/* Launch Web App Button */}
            <Link
              href="https://app.trifecta.belweave.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-7 text-sm font-bold text-primary-foreground hover:opacity-90 active:scale-95 transition-all shadow-md"
            >
              Launch Web App
            </Link>
            {/* GitHub outline pill */}
            <Link
              href="https://github.com/pkyanam/trifecta"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-card/40 backdrop-blur px-6 text-sm font-semibold text-foreground hover:bg-secondary/40 transition-all"
            >
              Star on GitHub
            </Link>
          </div>

          <div className="mt-6 text-xs sm:text-sm text-muted-foreground font-mono">
            macOS · iOS · Android · Windows · Linux · Web
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  )
}
