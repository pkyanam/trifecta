"use client"

import { useCallback, useEffect, useState } from "react"
import localFont from "next/font/local"
import Link from "next/link"
import { ArrowLeft, Check, Copy, KeyRound, Loader2, RefreshCw, ShieldAlert } from "lucide-react"

const geistPixel = localFont({
  src: "../../../../public/fonts/GeistPixel-Square.woff2",
  variable: "--font-geist-pixel",
  display: "swap",
})

type KeyMeta = {
  prefix: string
  created_at: string
  last_used_at: string | null
  revoked: boolean
}

type AccountData = {
  found: boolean
  email?: string
  status?: string
  plan?: string
  cap_usd?: number
  used_usd?: number
  remaining_usd?: number
  keys?: KeyMeta[]
}

const fmtUsd = (n: number | undefined) =>
  n == null ? "—" : `$${n.toFixed(2)}`

export default function AccountClient() {
  const [data, setData] = useState<AccountData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [freshKey, setFreshKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/triad/account", { cache: "no-store" })
      if (!res.ok) throw new Error("could not load your account")
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not load your account")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const mint = useCallback(
    async (path: string) => {
      setWorking(true)
      setError(null)
      setFreshKey(null)
      try {
        const res = await fetch(path, { method: "POST" })
        const body = (await res.json()) as { api_key?: string; error?: string }
        if (!res.ok || !body.api_key) throw new Error(body.error || "key operation failed")
        setFreshKey(body.api_key)
        await load()
      } catch (e) {
        setError(e instanceof Error ? e.message : "key operation failed")
      } finally {
        setWorking(false)
      }
    },
    [load],
  )

  const copyKey = useCallback(async () => {
    if (!freshKey) return
    await navigator.clipboard.writeText(freshKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [freshKey])

  const activeKeys = (data?.keys ?? []).filter((k) => !k.revoked)
  const pct =
    data?.cap_usd && data.cap_usd > 0
      ? Math.min(100, Math.round(((data.used_usd ?? 0) / data.cap_usd) * 100))
      : 0

  return (
    <div
      className={`${geistPixel.variable} min-h-screen bg-black font-[var(--font-geist-pixel)] text-white selection:bg-white selection:text-black`}
    >
      <main className="relative isolate flex min-h-screen flex-col overflow-hidden px-5 py-5 sm:px-8">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.055)_1px,transparent_1px)] bg-[size:72px_72px]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[440px] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.18),rgba(255,255,255,0.05)_32%,transparent_64%)]" />

        <header className="mx-auto flex w-full max-w-5xl items-center justify-between border-b border-white/10 pb-5 text-[11px] text-white/55">
          <Link href="/triad" className="inline-flex items-center gap-2 transition hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>back to triad</span>
          </Link>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            <span>private alpha</span>
          </div>
        </header>

        <section className="mx-auto w-full max-w-5xl flex-1 py-12">
          <div className="mb-8 inline-flex items-center gap-2 border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/60">
            <KeyRound className="h-3.5 w-3.5 text-white" />
            <span>gateway access</span>
          </div>
          <h1 className="text-5xl leading-none text-white sm:text-6xl">your access</h1>

          {loading ? (
            <div className="mt-10 flex items-center gap-3 text-white/50">
              <Loader2 className="h-4 w-4 animate-spin" /> loading…
            </div>
          ) : !data?.found ? (
            <div className="mt-10 max-w-lg border border-white/12 bg-white/[0.03] p-6 text-sm leading-6 text-white/55">
              no founder subscription is linked to your email yet.
              <div className="mt-5">
                <Link
                  href="/triad/signup"
                  className="inline-flex h-11 items-center justify-center border border-white bg-white px-5 text-xs text-black transition hover:bg-black hover:text-white"
                >
                  get founder access
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-10 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
              {/* Plan + usage */}
              <div className="border border-white/12 bg-white/[0.025] p-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div>
                    <p className="text-[11px] text-white/40">plan</p>
                    <p className="mt-1 text-2xl text-white">founder access</p>
                  </div>
                  <span
                    className={`px-2 py-1 text-[10px] uppercase ${
                      data.status === "active"
                        ? "border border-white/30 bg-white text-black"
                        : "border border-white/15 text-white/50"
                    }`}
                  >
                    {data.status}
                  </span>
                </div>

                <div className="mt-5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-white/50">monthly usage</span>
                    <span className="text-white/80">
                      {fmtUsd(data.used_usd)} / {fmtUsd(data.cap_usd)}
                    </span>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden border border-white/15 bg-white/[0.04]">
                    <div className="h-full bg-white" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-3 text-[11px] text-white/40">
                    {fmtUsd(data.remaining_usd)} remaining · hard capped, no overages
                  </p>
                </div>
              </div>

              {/* Keys */}
              <div className="border border-white/12 bg-white/[0.025] p-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <h2 className="text-lg text-white">api keys</h2>
                  <button
                    onClick={() => mint(activeKeys.length ? "/api/triad/keys/rotate" : "/api/triad/keys")}
                    disabled={working || data.status !== "active"}
                    className="inline-flex items-center gap-2 border border-white bg-white px-3 py-2 text-[11px] text-black transition hover:bg-black hover:text-white disabled:opacity-50"
                  >
                    {working ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : activeKeys.length ? (
                      <RefreshCw className="h-3.5 w-3.5" />
                    ) : (
                      <KeyRound className="h-3.5 w-3.5" />
                    )}
                    {activeKeys.length ? "rotate key" : "generate key"}
                  </button>
                </div>

                {freshKey && (
                  <div className="mt-4 border border-white/30 bg-white/[0.06] p-4">
                    <div className="flex items-center gap-2 text-[11px] text-white/70">
                      <ShieldAlert className="h-3.5 w-3.5" /> copy this now — it is shown only once
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <code className="flex-1 break-all border border-white/15 bg-black px-3 py-2 text-xs text-white">
                        {freshKey}
                      </code>
                      <button
                        onClick={copyKey}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-white/20 text-white/70 transition hover:text-white"
                        aria-label="copy"
                      >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-4 space-y-2">
                  {activeKeys.length === 0 && !freshKey && (
                    <p className="text-sm text-white/40">no active key yet. generate one to start.</p>
                  )}
                  {activeKeys.map((k) => (
                    <div
                      key={k.prefix}
                      className="flex items-center justify-between border border-white/10 bg-white/[0.02] px-3 py-2 text-xs"
                    >
                      <code className="text-white/70">{k.prefix}……</code>
                      <span className="text-white/35">
                        {k.last_used_at
                          ? `last used ${new Date(k.last_used_at).toLocaleDateString()}`
                          : "never used"}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 border-t border-white/10 pt-4 text-[11px] leading-5 text-white/40">
                  use it as an OpenAI-compatible key. base url:
                  <code className="ml-1 break-all text-white/60">
                    {process.env.NEXT_PUBLIC_TRIAD_API_BASE ?? "https://gateway.trifecta.belweave.com/v1"}
                  </code>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-6 max-w-lg border border-white/20 bg-white/[0.04] p-3 text-xs text-white/60">
              {error}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
