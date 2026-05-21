"use client"

import Link from "next/link"
import Image from "next/image"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Sun, Moon, Menu, X } from "lucide-react"

export function Nav() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    setMounted(true)
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <nav
      className={`relative z-50 w-full border-b transition-all duration-200 ${
        scrolled
          ? "border-border/60 bg-background/80 backdrop-blur-xl shadow-sm shadow-black/5"
          : "border-border/30 bg-background/40 backdrop-blur-md"
      }`}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <Image
            src="/trifectaAppLogo.png"
            alt="Trifecta"
            width={26}
            height={26}
            className="rounded-md ring-1 ring-border group-hover:ring-foreground/20 transition-all"
          />
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            Trifecta
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 md:flex">
          <NavLink href="https://github.com/pkyanam/trifecta" external>GitHub</NavLink>
          <NavLink href="https://testflight.apple.com/join/M5FkR4R8" external>iOS</NavLink>
          <NavLink href="https://forms.gle/WPHxw8axUs6QanXBA" external>Android</NavLink>
          <NavLink href="https://discord.gg/JvjG4yjQVY" external>Discord</NavLink>

          <span className="mx-2 h-4 w-px bg-border/60" />

          <NavLink href="/dashboard">Dashboard</NavLink>

          <Link
            href="https://app.trifecta.belweave.com"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 inline-flex h-8 items-center justify-center rounded-full bg-foreground px-4 text-xs font-semibold text-background hover:opacity-85 active:scale-95 transition-all"
          >
            Launch App
          </Link>

          {mounted && (
            <button
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
              aria-label="Toggle theme"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-3.5 w-3.5 text-amber-400" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
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
              {resolvedTheme === "dark" ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5" />}
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

      {mobileMenuOpen && (
        <div className="border-b border-border bg-background/95 backdrop-blur px-6 py-4 md:hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex flex-col gap-1 text-sm font-medium">
            {[
              { href: "https://github.com/pkyanam/trifecta", label: "GitHub", external: true },
              { href: "/dashboard", label: "Dashboard" },
              { href: "https://testflight.apple.com/join/M5FkR4R8", label: "iOS (TestFlight)", external: true },
              { href: "https://forms.gle/WPHxw8axUs6QanXBA", label: "Android (Beta)", external: true },
              { href: "https://discord.gg/JvjG4yjQVY", label: "Discord", external: true },
              { href: "https://app.trifecta.belweave.com", label: "Launch App", external: true },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-3 py-2.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}

function NavLink({ href, external, children }: { href: string; external?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
    >
      {children}
    </Link>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-border/30 bg-background py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <Image src="/trifectaAppLogo.png" alt="Trifecta" width={20} height={20} className="rounded" />
          <span className="text-sm font-semibold text-foreground">Trifecta</span>
          <span className="text-sm text-muted-foreground">· Apache 2.0 · © 2026 Belweave</span>
        </div>
        <div className="flex items-center gap-5 text-sm text-muted-foreground font-medium">
          {[
            { href: "https://github.com/pkyanam/trifecta", label: "GitHub" },
            { href: "https://discord.gg/JvjG4yjQVY", label: "Discord" },
            { href: "https://app.trifecta.belweave.com", label: "Web App" },
            { href: "/privacy", label: "Privacy" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target={link.href.startsWith("http") ? "_blank" : undefined}
              rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  )
}
