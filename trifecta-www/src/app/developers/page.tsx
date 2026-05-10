import { Nav, Footer } from "@/components/nav"
import {
  Code2,
  GitBranch,
  Smartphone,
  Monitor,
  Wifi,
  Lock,
  MessageSquare,
  Zap,
  ArrowRight,
  ExternalLink,
} from "lucide-react"
import Link from "next/link"

function DevCard({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: React.ElementType
  title: string
  description: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-xl border border-white/[0.04] bg-[#080808] p-5 card-hover"
    >
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02]">
        <Icon className="h-4 w-4 text-[#3ecf8e]" />
      </div>
      <h3 className="text-sm font-medium text-[#ececec]">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-[#555]">{description}</p>
      <div className="mt-3 flex items-center gap-1 text-xs text-[#3ecf8e]">
        <span>learn more</span>
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  )
}

export default function DevelopersPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 py-12">
          <div className="mb-8">
            <h1 className="text-2xl font-normal tracking-tight text-[#ececec] sm:text-3xl">
              developers
            </h1>
            <p className="mt-2 text-sm text-[#555]">
              everything you need to build with and extend trifecta.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DevCard
              icon={Code2}
              title="api reference"
              description="complete reference for the effect-style rpc protocol, websocket endpoints, and authentication flows."
              href="/docs"
            />
            <DevCard
              icon={Smartphone}
              title="ios sdk"
              description="build native ios extensions and integrations using the swiftui client architecture."
              href="/docs"
            />
            <DevCard
              icon={Smartphone}
              title="android sdk"
              description="extend the android client with jetpack compose components and kotlin coroutines."
              href="/docs"
            />
            <DevCard
              icon={Monitor}
              title="desktop server"
              description="run and customize the trifecta desktop server with react, node.js, and websocket streaming."
              href="/docs"
            />
            <DevCard
              icon={Wifi}
              title="websocket protocol"
              description="deep dive into the custom effect rpc wire format, streaming topics, and heartbeat mechanics."
              href="/docs"
            />
            <DevCard
              icon={Lock}
              title="authentication"
              description="implement pairing flows, bearer token exchange, and per-profile encrypted credential storage."
              href="/docs"
            />
          </div>

          <div className="mt-6 rounded-xl border border-white/[0.04] bg-[#080808] p-5">
            <div className="flex items-center gap-2 mb-3">
              <GitBranch className="h-4 w-4 text-[#3ecf8e]" />
              <h2 className="text-sm font-medium text-[#ececec]">open source</h2>
            </div>
            <p className="text-xs leading-relaxed text-[#555] mb-3">
              trifecta is built in the open. explore the source code, file issues, and contribute to the project on github.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.04] bg-white/[0.02] px-3 py-1.5 text-xs text-[#555]">
                <ExternalLink className="h-3 w-3" />
                github
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.04] bg-white/[0.02] px-3 py-1.5 text-xs text-[#555]">
                <MessageSquare className="h-3 w-3" />
                discussions
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.04] bg-white/[0.02] px-3 py-1.5 text-xs text-[#555]">
                <Zap className="h-3 w-3" />
                issues
              </span>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
