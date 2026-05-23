import type { Metadata } from "next"
import Link from "next/link"
import { Nav, Footer } from "@/components/nav"

export const metadata: Metadata = {
  title: "Terms of Service | Trifecta",
  description: "Terms governing use of Trifecta web, cloud sandboxes, accounts, billing, and related services.",
}

const sections = [
  {
    title: "Acceptance",
    body: [
      "These Terms of Service govern access to and use of Trifecta websites, cloud dashboard, hosted sandbox services, authentication, billing, and related online services operated by Belweave.",
      "By creating an account, using the dashboard, provisioning a sandbox, or otherwise using the service, you agree to these terms. If you use Trifecta on behalf of an organization, you represent that you have authority to bind that organization.",
    ],
  },
  {
    title: "Trifecta platform",
    body: [
      "Trifecta is a cross-platform coding-agent platform. A desktop/server component may run agents locally or in user-controlled environments, while Trifecta web and cloud features can provide account, billing, hosted sandbox, pairing, and dashboard capabilities.",
      "Hosted cloud sandboxes are optional. They are intended for development workflows and may contain code, generated output, logs, dependencies, credentials, and commands introduced by the user or by agents acting under user instruction.",
    ],
  },
  {
    title: "Accounts and authentication",
    body: [
      "You are responsible for maintaining the confidentiality of your account, authentication methods, devices, and sessions. Clerk provides authentication and user management for the web service.",
      "You must provide accurate account information and promptly update it if it changes. You are responsible for activity under your account unless caused by Trifecta’s breach of these terms.",
    ],
  },
  {
    title: "Billing and subscriptions",
    body: [
      "Paid plans, included runtime, usage credits, overages, GPU add-ons, storage, and subscription terms are described in the pricing interface at the time of purchase.",
      "Payments, invoices, taxes, subscription renewals, payment method handling, and fraud prevention may be processed by Stripe or another payment processor.",
      "Unless otherwise stated at checkout, subscriptions renew automatically until canceled. Usage-based charges may continue while resources are running.",
      "You are responsible for stopping or deleting sandboxes you no longer want to run. Stopped sandboxes may retain storage and may be subject to plan limits or storage charges where disclosed.",
    ],
  },
  {
    title: "Acceptable use",
    body: [
      "You may not use Trifecta to violate law, infringe rights, attack systems, distribute malware, abuse infrastructure, evade security controls, mine cryptocurrency without authorization, send spam, or process data you do not have rights to use.",
      "You may not attempt to bypass plan limits, interfere with service operation, overload infrastructure, probe other users’ environments, or use sandboxes as general-purpose hosting unless expressly permitted.",
      "You are responsible for reviewing agent commands, generated code, dependencies, and repository changes before relying on them or deploying them.",
    ],
  },
  {
    title: "User content and code",
    body: [
      "You retain ownership of your code, prompts, files, repositories, and other content. You grant Belweave the limited rights needed to host, process, transmit, display, store, back up, and operate that content solely to provide and secure the service.",
      "You represent that you have the rights necessary to upload, process, and use any content, repositories, credentials, and third-party services you connect to Trifecta.",
    ],
  },
  {
    title: "Third-party services",
    body: [
      "Trifecta integrates with or depends on third-party services including Clerk, PostHog, Google, Vercel, Supabase, Daytona, Stripe, GitHub, and user-selected AI provider tools. Third-party services may have their own terms and privacy policies.",
      "Belweave is not responsible for third-party model outputs, provider availability, provider pricing, provider account status, or the behavior of third-party tools you configure.",
    ],
  },
  {
    title: "AI output and professional responsibility",
    body: [
      "Coding agents can produce incorrect, insecure, incomplete, or inappropriate outputs. You are responsible for reviewing, testing, approving, and deciding whether to use generated changes.",
      "Trifecta does not provide legal, financial, security, medical, or other professional advice. Do not rely on generated output without appropriate review.",
    ],
  },
  {
    title: "Security and credentials",
    body: [
      "You are responsible for secrets, API keys, repository tokens, provider credentials, SSH keys, and environment variables you place into local servers or cloud sandboxes.",
      "Do not share credentials with support unless specifically requested through a secure process. Belweave may suspend access if account or infrastructure activity appears risky, abusive, or compromised.",
    ],
  },
  {
    title: "Service changes and availability",
    body: [
      "Trifecta is early and may change quickly. Features may be added, changed, limited, suspended, or discontinued.",
      "We aim to provide a reliable service, but we do not guarantee uninterrupted availability, data durability, model/provider availability, or compatibility with every repository, dependency, or third-party tool.",
    ],
  },
  {
    title: "Termination",
    body: [
      "You may stop using Trifecta at any time. You may delete sandboxes through the dashboard and cancel paid plans through the billing flow where available.",
      "Belweave may suspend or terminate access for breach of these terms, nonpayment, security risk, legal requirement, abuse, or operational harm.",
    ],
  },
  {
    title: "Disclaimers and limitation of liability",
    body: [
      "The service is provided as is and as available. To the maximum extent permitted by law, Belweave disclaims warranties of merchantability, fitness for a particular purpose, non-infringement, and uninterrupted or error-free operation.",
      "To the maximum extent permitted by law, Belweave will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenue, data, goodwill, or business interruption.",
    ],
  },
  {
    title: "Changes to these terms",
    body: [
      "We may update these terms as the product changes. Updated terms will be posted on this page with a new effective date. Continued use after changes means you accept the updated terms.",
    ],
  },
]

export default function TermsOfServicePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Nav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Legal</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-foreground">Terms of Service</h1>
        <p className="mt-3 text-sm text-muted-foreground">Effective date: May 22, 2026</p>
        <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground">
          These terms apply to Trifecta’s website, accounts, cloud dashboard, hosted sandboxes, billing, and related
          online services. They do not transfer ownership of your code or repositories to Belweave.
        </p>

        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.title} className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-lg font-black text-foreground">{section.title}</h2>
              <div className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-8 rounded-xl border border-border bg-card p-6 text-sm leading-7 text-muted-foreground">
          <h2 className="text-lg font-black text-foreground">Contact</h2>
          <p className="mt-4">
            Questions can be sent to{" "}
            <a className="font-semibold text-foreground hover:underline" href="mailto:info@belweave.com">
              info@belweave.com
            </a>
            .
          </p>
          <p className="mt-3">
            See also the{" "}
            <Link className="font-semibold text-foreground hover:underline" href="/privacy">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </main>
      <Footer />
    </div>
  )
}
