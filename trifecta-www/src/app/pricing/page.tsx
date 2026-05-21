import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  Check,
  Cpu,
  Gauge,
  KeyRound,
  Lock,
  Server,
  Sparkles,
  Zap,
} from "lucide-react"
import { Nav, Footer } from "@/components/nav"

export const metadata: Metadata = {
  title: "Pricing | Trifecta Cloud",
  description:
    "Trifecta Cloud pricing for hosted sandboxes, included runtime, pay-as-you-go overages, and GPU add-ons.",
}

const plans = [
  {
    name: "Free Trial",
    price: "$0",
    cadence: "once",
    includedHours: 10,
    summary: "Try Trifecta Cloud before adding a payment method.",
    perks: [
      "10 Launch-hours once",
      "1 running sandbox",
      "1 stored sandbox",
      "15 minute idle auto-stop",
      "OpenCode free model options included in the image",
    ],
  },
  {
    name: "Starter",
    price: "$9",
    cadence: "per month",
    includedHours: 60,
    summary: "Low-cost hosted sandboxes for occasional personal agent work.",
    perks: [
      "60 Launch-hours each month",
      "1 running sandbox",
      "3 stored sandboxes",
      "30 minute idle auto-stop",
      "Pay-as-you-go CPU overages",
    ],
  },
  {
    name: "Pro",
    price: "$19",
    cadence: "per month",
    includedHours: 150,
    summary: "More runtime and concurrency for regular cloud development.",
    perks: [
      "150 Launch-hours each month",
      "2 running sandboxes",
      "8 stored sandboxes",
      "60 minute idle auto-stop",
      "GPU add-ons available",
      "Higher pay-as-you-go limits",
    ],
  },
  {
    name: "Team",
    price: "$49",
    cadence: "per month",
    includedHours: 400,
    summary: "Shared hosted capacity for small teams and heavier agent sessions.",
    perks: [
      "400 Launch-hours each month",
      "4 running sandboxes",
      "20 stored sandboxes",
      "120 minute idle auto-stop",
      "GPU add-ons available",
      "Team subscription management",
    ],
  },
]

const sandboxSizes = [
  {
    name: "Launch",
    resources: "1 vCPU / 2 GiB RAM / 10 GiB disk",
    price: "$0.12/hr",
    credits: "1x",
    bestFor: "Light agent sessions, reviews, and small edits",
  },
  {
    name: "Build",
    resources: "2 vCPU / 4 GiB RAM / 10 GiB disk",
    price: "$0.24/hr",
    credits: "2x",
    bestFor: "Package installs, test runs, and everyday coding",
  },
  {
    name: "Max CPU",
    resources: "4 vCPU / 8 GiB RAM / 10 GiB disk",
    price: "$0.48/hr",
    credits: "4x",
    bestFor: "Heavier builds, parallel work, and larger repositories",
  },
]

const gpuAddOns = [
  {
    name: "Nvidia RTX PRO 6000",
    access: "Pro and Team",
    price: "$4.75/hr",
    note: "Billed only while the GPU sandbox is running",
  },
  {
    name: "Nvidia H100",
    access: "Pro and Team",
    price: "$5.95/hr",
    note: "Billed only while the GPU sandbox is running",
  },
]

const billingNotes = [
  "Sign in before creating or managing cloud sandboxes.",
  "Included runtime is measured in Launch-hour credits. Larger CPU sandboxes burn credits faster.",
  "Stopped sandboxes keep their filesystem but do not consume CPU/RAM runtime.",
  "Each sandbox includes 10 GiB disk. Additional persistent storage is planned at $0.12/GiB-month.",
  "The sandbox image will include supported AI tooling and OpenCode integration.",
  "OpenCode free model options will be available in the sandbox image where supported.",
  "Users supply their own subscription auth or API keys for paid model services and CLIs.",
]

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Nav />

      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-border/40 py-20 md:py-28">
          <div className="absolute inset-0 clean-grid opacity-80" />
          <div className="relative mx-auto max-w-6xl px-6">
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur">
                <Server className="h-3.5 w-3.5" />
                Trifecta Cloud pricing
              </div>
              <h1 className="text-4xl font-black tracking-tight text-foreground sm:text-5xl md:text-6xl">
                Cloud sandboxes without surprise bills.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Start with included runtime, scale up when a session needs more power, and keep heavy GPU work as a
                clear pay-as-you-go add-on.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/dashboard/billing"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-bold text-background transition-all hover:opacity-85"
                >
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-card px-6 text-sm font-semibold text-foreground transition-all hover:bg-accent"
                >
                  Dashboard
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-8 max-w-2xl">
              <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">Subscription Tiers</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Pick a monthly plan for included runtime and sandbox limits. You can manage your plan from the dashboard.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-4">
              {plans.map((plan) => (
                <article key={plan.name} className="flex h-full flex-col rounded-lg border border-border bg-card p-5">
                  <div className="flex min-h-28 flex-col justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-black text-foreground">{plan.name}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{plan.summary}</p>
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black tracking-tight text-foreground">{plan.price}</span>
                        <span className="text-sm text-muted-foreground">/{plan.cadence}</span>
                      </div>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">
                        {plan.includedHours} Launch-hours included
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-1 flex-col border-t border-border pt-5">
                    <div className="mb-4 rounded-md bg-secondary px-3 py-2 text-xs font-semibold text-muted-foreground">
                      Runtime after included credits starts at $0.12/hr for Launch sandboxes.
                    </div>
                    <ul className="space-y-3">
                      {plan.perks.map((perk) => (
                        <li key={perk} className="flex gap-2 text-sm leading-5 text-foreground">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                          <span>{perk}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-5">
                      <Link
                        href={`/dashboard/billing?plan=${plan.name === "Free Trial" ? "free" : plan.name.toLowerCase()}`}
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 text-sm font-bold text-background transition-all hover:opacity-85"
                      >
                        {plan.name === "Free Trial" ? "Start Free Trial" : `Select ${plan.name}`}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border/40 bg-secondary/35 py-16 md:py-20">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background">
                <Cpu className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">Runtime Rates</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Customers can use included Launch-hour credits or continue pay-as-you-go after credits are used. Larger
                sandboxes consume credits in proportion to their cost.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {sandboxSizes.map((size) => (
                <article key={size.name} className="rounded-lg border border-border bg-background p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-black text-foreground">{size.name}</h3>
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted-foreground">
                      {size.credits}
                    </span>
                  </div>
                  <p className="mt-4 text-sm font-medium text-foreground">{size.resources}</p>
                  <p className="mt-5 text-2xl font-black tracking-tight text-foreground">{size.price}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{size.bestFor}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
              <div>
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card">
                  <Zap className="h-5 w-5" />
                </div>
                <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">GPU Add-ons</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  GPU sandboxes are planned as pay-as-you-go add-ons for higher tiers, billed only while the GPU sandbox
                  is running.
                </p>
              </div>

              <div className="space-y-4">
                {gpuAddOns.map((gpu) => (
                  <article key={gpu.name} className="rounded-lg border border-border bg-card p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-black text-foreground">{gpu.name}</h3>
                        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                          <Lock className="h-4 w-4" />
                          {gpu.access} plans
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-2xl font-black tracking-tight text-foreground">{gpu.price}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{gpu.note}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-border/40 py-16 md:py-20">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card">
                <KeyRound className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">AI Access</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Trifecta Cloud provides the computer. It does not resell paid model subscriptions or hide token costs
                inside the sandbox price.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {billingNotes.map((note) => (
                <div key={note} className="flex gap-3 rounded-lg border border-border bg-card p-4">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <p className="text-sm leading-6 text-foreground">{note}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border/40 bg-foreground py-12 text-background">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-background/70">
                <Gauge className="h-4 w-4" />
                Usage guardrails
              </div>
              <p className="max-w-2xl text-lg font-semibold leading-7">
                Included credits, idle auto-stop, and metered overages keep cloud usage predictable without asking users
                to commit to large infrastructure contracts.
              </p>
            </div>
            <Link
              href="/dashboard/billing"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-background px-6 text-sm font-bold text-foreground transition-all hover:opacity-90"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
