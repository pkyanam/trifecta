import { Nav, Footer } from "@/components/nav"
import {
  BookOpen,
  Smartphone,
  Monitor,
  Wifi,
  Lock,
  GitBranch,
  MessageSquare,
  Zap,
  ChevronRight,
} from "lucide-react"

function DocSection({
  icon: Icon,
  title,
  items,
}: {
  icon: React.ElementType
  title: string
  items: { label: string; desc: string }[]
}) {
  return (
    <div className="rounded-xl border border-white/[0.04] bg-[#080808] p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.02]">
          <Icon className="h-3.5 w-3.5 text-[#3ecf8e]" />
        </div>
        <h2 className="text-sm font-medium text-[#ececec]">{title}</h2>
      </div>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li
            key={item.label}
            className="group flex cursor-default items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-white/[0.02]"
          >
            <div>
              <p className="text-xs text-[#ececec]">{item.label}</p>
              <p className="text-[11px] text-[#444]">{item.desc}</p>
            </div>
            <ChevronRight className="h-3 w-3 text-[#333] transition-colors group-hover:text-[#555]" />
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function DocsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 py-12">
          <div className="mb-8">
            <h1 className="text-2xl font-normal tracking-tight text-[#ececec] sm:text-3xl">
              documentation
            </h1>
            <p className="mt-2 text-sm text-[#555]">
              learn how to use, build, and extend trifecta.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DocSection
              icon={BookOpen}
              title="getting started"
              items={[
                { label: "introduction", desc: "what is trifecta and how it works" },
                { label: "installation", desc: "set up the desktop server" },
                { label: "pairing", desc: "connect your mobile device" },
                { label: "first steps", desc: "create your first thread" },
              ]}
            />

            <DocSection
              icon={Smartphone}
              title="mobile clients"
              items={[
                { label: "ios app", desc: "swiftui client guide" },
                { label: "android app", desc: "jetpack compose client guide" },
                { label: "configuration", desc: "server profiles and settings" },
                { label: "troubleshooting", desc: "common issues and fixes" },
              ]}
            />

            <DocSection
              icon={Monitor}
              title="desktop server"
              items={[
                { label: "server setup", desc: "install and run the server" },
                { label: "agent configuration", desc: "codex, claude, opencode" },
                { label: "environment variables", desc: "configure server options" },
                { label: "logs and debugging", desc: "monitor server activity" },
              ]}
            />

            <DocSection
              icon={Wifi}
              title="protocol"
              items={[
                { label: "websocket connection", desc: "connection lifecycle and heartbeat" },
                { label: "effect rpc", desc: "wire format and message types" },
                { label: "streaming topics", desc: "shell and thread subscriptions" },
                { label: "error handling", desc: "defects, reconnects, and retries" },
              ]}
            />

            <DocSection
              icon={Lock}
              title="authentication"
              items={[
                { label: "pairing flow", desc: "url parsing and token exchange" },
                { label: "bearer tokens", desc: "session management and storage" },
                { label: "ws tokens", desc: "short-lived websocket tokens" },
                { label: "security", desc: "encryption and best practices" },
              ]}
            />

            <DocSection
              icon={GitBranch}
              title="git integration"
              items={[
                { label: "git lite", desc: "mobile git operations" },
                { label: "vcs status", desc: "branch and working tree info" },
                { label: "stacked actions", desc: "commit and push workflows" },
                { label: "diff viewer", desc: "reviewing changes on mobile" },
              ]}
            />
          </div>

          <div className="mt-6 rounded-xl border border-white/[0.04] bg-[#080808] p-5">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-3.5 w-3.5 text-[#3ecf8e]" />
              <h2 className="text-sm font-medium text-[#ececec]">need help?</h2>
            </div>
            <p className="text-xs leading-relaxed text-[#555]">
              if you cannot find what you are looking for, reach out to the team or join the community discussions.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.04] bg-white/[0.02] px-3 py-1.5 text-xs text-[#555]">
                <Zap className="h-3 w-3" />
                contact support
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.04] bg-white/[0.02] px-3 py-1.5 text-xs text-[#555]">
                <MessageSquare className="h-3 w-3" />
                community
              </span>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
