import type { Metadata } from "next"
import localFont from "next/font/local"
import Link from "next/link"
import {
  Activity,
  ArrowRight,
  Braces,
  Check,
  CircleDot,
  Gauge,
  KeyRound,
  Lock,
  Route,
  Terminal,
  Zap,
} from "lucide-react"

const geistPixel = localFont({
  src: "../../../public/fonts/GeistPixel-Square.woff2",
  variable: "--font-geist-pixel",
  display: "swap",
})

export const metadata: Metadata = {
  title: "triad ai gateway",
  description:
    "a private ai gateway for coding agents, harnesses, and developer tools.",
}

const compatibility = [
  "openai-compatible clients",
  "coding harnesses",
  "openclaw",
  "hermes agent",
  "custom cli agents",
  "local developer tools",
  "cloud workspaces",
  "server-side apps",
]

const controls = [
  "metered usage",
  "hard caps",
  "request logs",
  "model fallback",
  "stable endpoint",
  "no overages",
]

const flow = [
  {
    icon: Terminal,
    title: "connect",
    copy: "point your agent, app, or harness at one openai-compatible endpoint.",
  },
  {
    icon: Route,
    title: "route",
    copy: "send requests through a consistent gateway layer built for coding workflows.",
  },
  {
    icon: Gauge,
    title: "control",
    copy: "track usage, enforce caps, and keep long-running agents inside predictable limits.",
  },
]

const faqs = [
  {
    question: "is triad unlimited?",
    answer:
      "no. founder access includes a fixed monthly gateway usage amount. requests pause when the cap is reached.",
  },
  {
    question: "what clients does it support?",
    answer:
      "triad targets openai-compatible clients and common coding-agent harnesses, including openclaw, hermes agent, cli agents, and custom developer tools.",
  },
  {
    question: "can i use my own keys?",
    answer:
      "not in the first founder release. bring-your-own-key support is planned after the private alpha stabilizes.",
  },
  {
    question: "is this page public?",
    answer:
      "no. triad is a hidden private alpha surface with limited founder allocations.",
  },
]

export default function TriadPage() {
  return (
    <div
      className={`${geistPixel.variable} min-h-screen bg-black font-[var(--font-geist-pixel)] text-white selection:bg-white selection:text-black`}
    >
      <main className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.055)_1px,transparent_1px)] bg-[size:72px_72px]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.18),rgba(255,255,255,0.06)_28%,transparent_58%)]" />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_46%,rgba(0,0,0,0.86)_82%)]" />

        <section className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-10">
          <header className="flex items-center justify-between border-b border-white/10 pb-5 font-[var(--font-geist-pixel)] text-[11px] text-white/55">
            <div className="flex items-center gap-3">
              <div className="grid h-7 w-7 place-items-center border border-white/15 bg-white text-black">
                <Braces className="h-3.5 w-3.5" />
              </div>
              <span>triad gateway</span>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              <span>private alpha</span>
            </div>
          </header>

          <div className="grid flex-1 items-center gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 border border-white/10 bg-white/[0.03] px-3 py-2 font-[var(--font-geist-pixel)] text-[11px] text-white/60">
                <CircleDot className="h-3.5 w-3.5 text-white" />
                <span>hidden founder release</span>
              </div>

              <h1 className="max-w-4xl font-[var(--font-geist-pixel)] text-[48px] leading-[0.92] tracking-normal text-white sm:text-[72px] md:text-[96px] lg:text-[112px]">
                triad ai gateway
              </h1>

              <p className="mt-8 max-w-2xl text-base leading-7 text-white/62 sm:text-lg">
                one metered endpoint for coding agents, harnesses, and developer tools.
                route model calls through a stable api with usage caps, logs, and
                predictable limits.
              </p>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/triad/signup"
                  className="group inline-flex h-12 items-center justify-center gap-2 border border-white bg-white px-5 font-[var(--font-geist-pixel)] text-xs text-black transition hover:bg-black hover:text-white"
                >
                  start access
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="#pricing"
                  className="inline-flex h-12 items-center justify-center border border-white/12 bg-white/[0.03] px-5 font-[var(--font-geist-pixel)] text-xs text-white/70 transition hover:border-white/30 hover:text-white"
                >
                  view pricing
                </a>
              </div>
            </div>

            <div id="pricing" className="relative">
              <div className="absolute -inset-px bg-[linear-gradient(135deg,rgba(255,255,255,0.75),rgba(255,255,255,0.06)_38%,rgba(255,255,255,0.35))] opacity-80" />
              <article className="relative border border-white/16 bg-black p-5 shadow-[0_0_80px_rgba(255,255,255,0.12)] sm:p-7">
                <div className="mb-7 flex items-center justify-between border-b border-white/10 pb-5 font-[var(--font-geist-pixel)]">
                  <div>
                    <p className="text-xs text-white/45">founder access</p>
                    <h2 className="mt-2 text-2xl text-white">gateway usage</h2>
                  </div>
                  <div className="border border-white/15 px-2 py-1 text-[10px] text-white/55">
                    first 25
                  </div>
                </div>

                <div className="font-[var(--font-geist-pixel)]">
                  <div className="flex items-end gap-2">
                    <span className="text-6xl leading-none text-white sm:text-7xl">$19.99</span>
                    <span className="pb-2 text-xs text-white/45">/ mo</span>
                  </div>
                  <p className="mt-4 text-sm text-white/55">
                    includes $23.50 of gateway usage
                  </p>
                </div>

                <div className="mt-8 grid gap-2">
                  {[
                    "15% founder discount",
                    "hard capped usage",
                    "no overages",
                    "openai-compatible endpoint",
                    "private alpha allocation",
                  ].map((feature) => (
                    <div
                      key={feature}
                      className="flex items-center gap-3 border border-white/10 bg-white/[0.025] px-3 py-3 text-sm text-white/68"
                    >
                      <Check className="h-4 w-4 text-white" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <Link
                  href="/triad/signup"
                  className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 border border-white bg-white px-5 font-[var(--font-geist-pixel)] text-xs text-black transition hover:bg-black hover:text-white"
                >
                  start founder access
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <p className="mt-5 text-xs leading-5 text-white/38">
                  usage resets monthly. requests pause when included usage is exhausted.
                  alpha capacity is limited and renewals are not guaranteed.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-white/[0.025] px-5 py-10 sm:px-8 lg:px-10">
          <div className="mx-auto grid max-w-7xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["endpoint", "openai-compatible"],
              ["billing", "metered usage"],
              ["limits", "hard capped"],
              ["status", "private alpha"],
            ].map(([label, value]) => (
              <div key={label} className="border border-white/10 bg-black/40 p-4">
                <p className="font-[var(--font-geist-pixel)] text-[10px] text-white/35">
                  {label}
                </p>
                <p className="mt-2 text-sm text-white">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
          <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <p className="font-[var(--font-geist-pixel)] text-xs text-white/35">
                compatibility
              </p>
              <h2 className="mt-4 max-w-sm font-[var(--font-geist-pixel)] text-4xl leading-none text-white sm:text-5xl">
                bring your agent
              </h2>
              <p className="mt-5 max-w-md text-sm leading-6 text-white/55">
                triad is designed for coding harnesses, local agents, cloud workspaces,
                and openai-compatible clients.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {compatibility.map((item) => (
                <div
                  key={item}
                  className="group flex items-center justify-between border border-white/10 bg-white/[0.025] p-4 text-sm text-white/65 transition hover:border-white/30 hover:text-white"
                >
                  <span>{item}</span>
                  <Terminal className="h-4 w-4 text-white/30 transition group-hover:text-white" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8 lg:px-10">
          <div className="grid gap-3 lg:grid-cols-3">
            {flow.map((item) => {
              const Icon = item.icon
              return (
                <article
                  key={item.title}
                  className="min-h-[250px] border border-white/10 bg-white/[0.025] p-6"
                >
                  <div className="mb-14 grid h-10 w-10 place-items-center border border-white/15 bg-black">
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-[var(--font-geist-pixel)] text-2xl text-white">
                    {item.title}
                  </h3>
                  <p className="mt-4 text-sm leading-6 text-white/52">{item.copy}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="border-y border-white/10 px-5 py-20 sm:px-8 lg:px-10">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_1fr]">
            <div>
              <p className="font-[var(--font-geist-pixel)] text-xs text-white/35">
                controls
              </p>
              <h2 className="mt-4 font-[var(--font-geist-pixel)] text-4xl leading-none text-white sm:text-5xl">
                predictable by default
              </h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {controls.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 border border-white/10 bg-white/[0.025] p-4 text-sm text-white/65"
                >
                  <Lock className="h-4 w-4 text-white/35" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="border border-white/10 bg-white p-6 text-black md:col-span-2">
              <div className="mb-16 flex items-start justify-between gap-8">
                <Zap className="h-6 w-6" />
                <p className="max-w-sm text-right text-xs leading-5 text-black/55">
                  founder access is built for developers who want one reliable gateway
                  layer across agents without wiring every tool separately.
                </p>
              </div>
              <h2 className="font-[var(--font-geist-pixel)] text-4xl leading-none sm:text-6xl">
                one endpoint. capped spend. cleaner agent loops.
              </h2>
            </div>

            <div className="grid gap-3">
              <div className="border border-white/10 bg-white/[0.025] p-6">
                <KeyRound className="mb-10 h-5 w-5 text-white" />
                <p className="font-[var(--font-geist-pixel)] text-2xl text-white">
                  stable auth
                </p>
                <p className="mt-3 text-sm leading-6 text-white/50">
                  one key path for supported clients and harnesses.
                </p>
              </div>
              <div className="border border-white/10 bg-white/[0.025] p-6">
                <Activity className="mb-10 h-5 w-5 text-white" />
                <p className="font-[var(--font-geist-pixel)] text-2xl text-white">
                  usage visibility
                </p>
                <p className="mt-3 text-sm leading-6 text-white/50">
                  see requests and keep agent runs inside fixed limits.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 pb-20 sm:px-8 lg:px-10">
          <div className="mb-8 text-center">
            <p className="font-[var(--font-geist-pixel)] text-xs text-white/35">
              questions
            </p>
            <h2 className="mt-4 font-[var(--font-geist-pixel)] text-4xl leading-none text-white sm:text-5xl">
              alpha notes
            </h2>
          </div>

          <div className="grid gap-3">
            {faqs.map((faq) => (
              <article key={faq.question} className="border border-white/10 bg-white/[0.025] p-5">
                <h3 className="font-[var(--font-geist-pixel)] text-lg text-white">
                  {faq.question}
                </h3>
                <p className="mt-3 text-sm leading-6 text-white/52">{faq.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="px-5 pb-8 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-[var(--font-geist-pixel)] text-xs text-white/35">
                  triad gateway
                </p>
                <h2 className="mt-3 font-[var(--font-geist-pixel)] text-3xl leading-none text-white sm:text-4xl">
                  start founder access
                </h2>
              </div>
              <Link
                href="/triad/signup"
                className="inline-flex h-12 items-center justify-center gap-2 border border-white bg-white px-5 font-[var(--font-geist-pixel)] text-xs text-black transition hover:bg-black hover:text-white"
              >
                continue
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
