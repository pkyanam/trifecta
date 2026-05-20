"use client"

import Link from "next/link"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Sun, Moon, Menu, X } from "lucide-react"

export function Nav() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <nav className="relative z-50 w-full border-b border-border/40 bg-background/50 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-base font-bold tracking-tight text-foreground">
            Trifecta
          </span>
        </Link>

        {/* Right navigation items */}
        <div className="hidden items-center gap-5 md:flex">
          <Link
            href="https://github.com/pkyanam/trifecta"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            GitHub
          </Link>
          <Link
            href="https://testflight.apple.com/join/M5FkR4R8"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            iOS (TestFlight)
          </Link>
          <Link
            href="https://forms.gle/WPHxw8axUs6QanXBA"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Android (Beta)
          </Link>

          <span className="h-4 w-px bg-border/60 mx-1" />

          {/* Launch Web App Button */}
          <Link
            href="https://app.trifecta.belweave.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground hover:opacity-90 active:scale-95 transition-all shadow-sm"
          >
            Launch Web App
          </Link>

          {/* Theme Switcher */}
          {mounted && (
            <button
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
              aria-label="Toggle theme"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4 text-amber-500" />
              ) : (
                <Moon className="h-4 w-4 text-neutral-600" />
              )}
            </button>
          )}
        </div>

        {/* Mobile controls */}
        <div className="flex items-center gap-2 md:hidden">
          {mounted && (
            <button
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground"
            >
              {resolvedTheme === "dark" ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-neutral-600" />}
            </button>
          )}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-border bg-background px-6 py-4 md:hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex flex-col gap-3 font-semibold text-sm">
            <Link
              href="https://github.com/pkyanam/trifecta"
              target="_blank"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground py-1"
            >
              GitHub
            </Link>
            <Link
              href="https://app.trifecta.belweave.com"
              target="_blank"
              onClick={() => setMobileMenuOpen(false)}
              className="text-muted-foreground hover:text-foreground py-1"
            >
              Launch Web App
            </Link>
            <Link
              href="https://testflight.apple.com/join/M5FkR4R8"
              target="_blank"
              onClick={() => setMobileMenuOpen(false)}
              className="text-muted-foreground hover:text-foreground py-1"
            >
              iOS (TestFlight)
            </Link>
            <Link
              href="https://forms.gle/WPHxw8axUs6QanXBA"
              target="_blank"
              onClick={() => setMobileMenuOpen(false)}
              className="text-muted-foreground hover:text-foreground py-1"
            >
              Android (Beta)
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-border/30 bg-background py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row text-sm text-muted-foreground font-semibold">
        <div>
          <span>© 2026 Belweave · Apache 2.0 licensed</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="https://github.com/pkyanam/trifecta" target="_blank" className="hover:text-foreground transition-colors">
            GitHub
          </Link>
          <Link href="https://discord.gg/jn4EGJjrvv" target="_blank" className="hover:text-foreground transition-colors">
            Discord
          </Link>
          <Link href="https://app.trifecta.belweave.com" target="_blank" className="hover:text-foreground transition-colors">
            Web App
          </Link>
        </div>
      </div>
    </footer>
  )
}
