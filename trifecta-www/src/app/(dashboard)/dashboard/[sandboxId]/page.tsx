import type { Metadata } from "next"
import Link from "next/link"

import { Footer, Nav } from "@/components/nav"

export const metadata: Metadata = {
  title: "Sandbox Detail | Trifecta",
  description:
    "Trifecta sandbox detail page for terminal access, pairing links, runtime status, and resource metadata.",
}

export default async function SandboxDetailPage({
  params,
}: {
  params: Promise<{ sandboxId: string }>
}) {
  const { sandboxId } = await params

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Nav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Sandbox</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-foreground">Sandbox detail</h1>
        <p className="mt-5 text-base leading-7 text-muted-foreground">
          Sandbox ID: <span className="font-mono text-foreground">{sandboxId}</span>
        </p>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Authenticated users manage individual sandboxes inside the Trifecta OS Dashboard app. A running
          sandbox can expose terminal access, connection details, native pairing links, browser pairing links,
          current status, CPU tier, storage, GPU add-on metadata, and usage tracking.
        </p>

        <section className="mt-10 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-black text-foreground">Available in the Dashboard app</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
            <li>Terminal tab for a provisioned and running sandbox.</li>
            <li>Connect tab with fresh native and web pairing credentials.</li>
            <li>Resources tab with lifecycle status, CPU tier, disk, GPU, and Daytona identifier.</li>
            <li>Stop and delete controls for sandbox lifecycle management.</li>
          </ul>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/?app=dashboard" className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-black text-background">
            Open Dashboard in Trifecta OS
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
