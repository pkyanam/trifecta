"use client"

import { Suspense, useState } from "react"
import localFont from "next/font/local"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, Check, Lock, Mail, Terminal } from "lucide-react"

const geistPixel = localFont({
  src: "../../../../public/fonts/GeistPixel-Square.woff2",
  variable: "--font-geist-pixel",
  display: "swap",
})

const tiers = [
  { name: "founder", price: "$19.99", detail: "$23.50 gateway usage", available: true },
  { name: "builder", price: "soon", detail: "expanded monthly caps", available: false },
  { name: "studio", price: "soon", detail: "team allocation", available: false },
  { name: "private", price: "soon", detail: "custom routing policy", available: false },
]

function TriadSignupContent() {
  const searchParams = useSearchParams()
  const checkoutStatus = searchParams.get("checkout")
  const checkoutComplete = checkoutStatus === "success"
  const [email, setEmail] = useState("")
  const [selectedTier, setSelectedTier] = useState("founder")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    checkoutStatus === "cancelled" ? "checkout was cancelled. no subscription was created." : null,
  )

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/triad/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, plan: "triad-founder" }),
      })
      const data = await response.json() as { url?: string; error?: string }

      if (!response.ok || !data.url) {
        throw new Error(data.error || "checkout is unavailable right now.")
      }

      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : "checkout is unavailable right now.")
      setIsLoading(false)
    }
  }

  return (
    <div
      className={`${geistPixel.variable} min-h-screen bg-black font-[var(--font-geist-pixel)] text-white selection:bg-white selection:text-black`}
    >
      <main className="relative isolate flex min-h-screen flex-col overflow-hidden px-5 py-5 sm:px-8">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.055)_1px,transparent_1px)] bg-[size:72px_72px]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[440px] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.18),rgba(255,255,255,0.05)_32%,transparent_64%)]" />

        <header className="mx-auto flex w-full max-w-6xl items-center justify-between border-b border-white/10 pb-5 text-[11px] text-white/55">
          <Link href="/triad" className="inline-flex items-center gap-2 transition hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>back to triad</span>
          </Link>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            <span>private alpha</span>
          </div>
        </header>

        <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 py-14 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/60">
              <Terminal className="h-3.5 w-3.5 text-white" />
              <span>founder allocation request</span>
            </div>
            <h1 className="max-w-2xl text-5xl leading-none text-white sm:text-7xl">
              start gateway access
            </h1>
            <p className="mt-6 max-w-lg text-sm leading-6 text-white/52">
              triad is currently a hidden alpha. founder access is available through
              stripe checkout with hard capped monthly usage.
            </p>
          </div>

          <div className="relative">
            <div className="absolute -inset-px bg-[linear-gradient(135deg,rgba(255,255,255,0.7),rgba(255,255,255,0.05)_45%,rgba(255,255,255,0.35))]" />
            <div className="relative border border-white/16 bg-black p-5 shadow-[0_0_80px_rgba(255,255,255,0.10)] sm:p-7">
              {!checkoutComplete ? (
                <form onSubmit={handleSubmit}>
                  <div className="mb-7 border-b border-white/10 pb-5">
                    <p className="text-xs text-white/45">access form</p>
                    <h2 className="mt-2 text-2xl text-white">continue to checkout</h2>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="mb-3 block text-[11px] text-white/40">
                        select allocation
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {tiers.map((tier) => {
                          const selected = selectedTier === tier.name
                          return (
                            <button
                              key={tier.name}
                              type="button"
                              disabled={!tier.available}
                              onClick={() => tier.available && setSelectedTier(tier.name)}
                              className={`border p-3 text-left transition ${
                                selected
                                  ? "border-white bg-white text-black"
                                  : tier.available
                                    ? "border-white/10 bg-white/[0.025] text-white/60 hover:border-white/30 hover:text-white"
                                    : "cursor-not-allowed border-white/10 bg-white/[0.015] text-white/25"
                              }`}
                            >
                              <div className="text-sm">{tier.name}</div>
                              <div className={selected ? "mt-2 text-[10px] text-black/55" : "mt-2 text-[10px] text-white/35"}>
                                {tier.price} · {tier.detail}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="email" className="mb-3 block text-[11px] text-white/40">
                        developer email
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                        <input
                          id="email"
                          type="email"
                          required
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="name@domain.com"
                          className="h-12 w-full border border-white/10 bg-white/[0.025] px-3 pl-10 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/40"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 border border-white/10 bg-white/[0.025] p-4 text-xs leading-5 text-white/42">
                      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-white/55" />
                      <span>
                        checkout creates a monthly founder subscription. capacity is
                        limited, usage is hard capped, and renewals are not guaranteed.
                      </span>
                    </div>

                    {error && (
                      <div className="border border-white/20 bg-white/[0.04] p-3 text-xs leading-5 text-white/60">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="inline-flex h-12 w-full items-center justify-center gap-2 border border-white bg-white px-5 text-xs text-black transition hover:bg-black hover:text-white disabled:opacity-60"
                    >
                      {isLoading ? "opening checkout" : "continue to stripe"}
                      {!isLoading && <ArrowRight className="h-4 w-4" />}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="py-8 text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center border border-white bg-white text-black">
                    <Check className="h-5 w-5" />
                  </div>
                  <h2 className="mt-6 text-3xl leading-none text-white">checkout complete</h2>
                  <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-white/50">
                    founder access checkout is complete. your gateway allocation will be
                    provisioned after payment confirmation.
                  </p>
                  <Link
                    href="/triad"
                    className="mt-8 inline-flex h-11 items-center justify-center border border-white/12 bg-white/[0.03] px-5 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
                  >
                    return to triad
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default function TriadSignupPage() {
  return (
    <Suspense fallback={null}>
      <TriadSignupContent />
    </Suspense>
  )
}
