import type { Metadata } from "next"
import Link from "next/link"

import { Footer, Nav } from "@/components/nav"

export const metadata: Metadata = {
  title: "Dashboard | Trifecta",
  description:
    "Trifecta dashboard for cloud sandboxes, billing, terminal access, pairing links, and account management.",
}

const features = [
  "Create, start, stop, and delete Daytona-backed cloud sandboxes.",
  "Track launch-hour usage by user account and sandbox runtime session.",
  "Open sandbox terminal access after provisioning completes.",
  "Generate pairing links for iOS, Android, desktop, and browser clients.",
  "Manage subscription status, plan limits, GPU access, and billing portal links.",
]

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Nav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Dashboard</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-foreground">Trifecta cloud dashboard</h1>
        <p className="mt-5 text-base leading-7 text-muted-foreground">
          The dashboard is the authenticated control surface for Trifecta cloud sandboxes. In the browser OS,
          it opens as the Dashboard app; this route is a text-readable description for direct visitors,
          crawlers, and language models.
        </p>

        <section className="mt-10 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-black text-foreground">Dashboard capabilities</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
            {features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/?app=dashboard" className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-black text-background">
            Open dashboard in Trifecta OS
          </Link>
          <Link href="/pricing" className="rounded-lg border border-border px-4 py-2.5 text-sm font-black text-foreground">
            View pricing
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  )
}
