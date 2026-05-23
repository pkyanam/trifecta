import type { Metadata } from "next"
import Link from "next/link"
import { Check } from "lucide-react"

import { Footer, Nav } from "@/components/nav"
import { CLOUD_PLANS, GPU_ADDON_TIERS, SANDBOX_SIZE_TIERS } from "@/lib/billing"

export const metadata: Metadata = {
  title: "Pricing | Trifecta",
  description:
    "Trifecta pricing for cloud sandboxes, launch-hours, CPU sandbox sizes, and GPU add-ons.",
}

const plans = Object.values(CLOUD_PLANS)
const sandboxSizes = Object.values(SANDBOX_SIZE_TIERS)
const gpuAddons = Object.values(GPU_ADDON_TIERS)

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Nav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-16">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Pricing</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight text-foreground sm:text-5xl">
          Trifecta cloud sandbox pricing
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
          Plans include launch-hours for CPU sandbox runtime. GPU add-ons are billed separately while the
          GPU sandbox is running.
        </p>

        <section className="mt-10 grid gap-4 lg:grid-cols-4">
          {plans.map((plan) => (
            <article key={plan.id} className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-lg font-black text-foreground">{plan.name}</h2>
              <p className="mt-3">
                <span className="text-3xl font-black text-foreground">{plan.price}</span>
                <span className="text-sm text-muted-foreground">/{plan.interval}</span>
              </p>
              <p className="mt-2 text-sm font-semibold text-muted-foreground">
                {plan.monthlyLaunchHours} launch-hours / month
              </p>
              <ul className="mt-5 space-y-2 text-sm leading-6 text-muted-foreground">
                <Feature>{plan.runningSandboxLimit} running sandbox{plan.runningSandboxLimit === 1 ? "" : "es"}</Feature>
                <Feature>{plan.storedSandboxLimit} stored sandbox{plan.storedSandboxLimit === 1 ? "" : "es"}</Feature>
                <Feature>{plan.idleTimeoutMinutes}-minute idle auto-stop</Feature>
                <Feature>{plan.allowedSandboxTiers.map((tier) => SANDBOX_SIZE_TIERS[tier].label).join(", ")} sandbox access</Feature>
                <Feature>{plan.gpuEnabled ? "GPU add-ons available" : "CPU sandboxes only"}</Feature>
              </ul>
            </article>
          ))}
        </section>

        <section className="mt-12 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-xl font-black text-foreground">What launch-hours mean</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              A launch-hour is Trifecta’s normalized CPU sandbox runtime unit. Time accrues only while a
              sandbox is running. Stopped sandboxes do not consume launch-hours.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {sandboxSizes.map((size) => (
                <div key={size.id} className="rounded-lg border border-border bg-background p-4">
                  <h3 className="font-black text-foreground">{size.label}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    1 runtime hour = {size.creditMultiplier} launch-hour{size.creditMultiplier === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
          </article>
          <article className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-xl font-black text-foreground">Example calculation</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Run a Build sandbox for 2.5 hours and an H100 sandbox for 30 minutes:
            </p>
            <div className="mt-4 space-y-2 rounded-lg border border-border bg-background p-4 font-mono text-sm text-muted-foreground">
              <p>2.5 runtime hours x 2 = 5 launch-hours</p>
              <p>0.5 GPU hours x $4.45 = $2.23 GPU usage</p>
            </div>
          </article>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-black text-foreground">Sandbox sizes</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {sandboxSizes.map((size) => (
              <article key={size.id} className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-black text-foreground">{size.label}</h3>
                <p className="mt-3 text-sm font-semibold text-muted-foreground">
                  {size.cpu} vCPU · {size.memory} GiB RAM · {size.disk} GiB disk
                </p>
                <p className="mt-3 text-2xl font-black text-foreground">{size.price}</p>
                <p className="mt-1 text-sm text-muted-foreground">{size.creditMultiplier}x launch-hour multiplier</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-black text-foreground">GPU add-ons</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {gpuAddons.map((gpu) => (
              <article key={gpu.id} className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-black text-foreground">{gpu.label}</h3>
                <p className="mt-3 text-2xl font-black text-foreground">{gpu.price}</p>
                <p className="mt-1 text-sm text-muted-foreground">Available on Pro and Team plans. Billed while running.</p>
              </article>
            ))}
          </div>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/?app=pricing" className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-black text-background">
            Open pricing in Trifecta OS
          </Link>
          <Link href="/?app=dashboard" className="rounded-lg border border-border px-4 py-2.5 text-sm font-black text-foreground">
            Open dashboard
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  )
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-500" />
      <span>{children}</span>
    </li>
  )
}
