import type { Metadata } from "next"
import Link from "next/link"
import { Nav, Footer } from "@/components/nav"

export const metadata: Metadata = {
  title: "Privacy Policy | Trifecta",
  description: "Privacy policy for Trifecta web, cloud sandboxes, authentication, analytics, and connected client apps.",
}

const sections = [
  {
    title: "What Trifecta is",
    body: [
      "Trifecta is a cross-platform coding-agent platform operated by Belweave. The website and cloud dashboard help users authenticate, manage billing, create cloud sandboxes, and connect client apps to Trifecta services.",
      "Separately, users may run a Trifecta desktop/server instance on their own machine. Data handled by a self-hosted or local server is controlled by the user and by the third-party tools the user chooses to connect.",
    ],
  },
  {
    title: "Information we collect",
    body: [
      "Account information: email address, authentication identifiers, profile metadata, session metadata, and related security events through Clerk.",
      "Cloud dashboard data: sandbox names, configuration choices, status, resource tier, storage size, lifecycle timestamps, pairing metadata, connection URLs, and usage/billing counters.",
      "Payment and subscription data: plan selections, checkout state, subscription status, usage totals, and payment processor identifiers. Full card details are handled by the payment processor and are not stored by Trifecta.",
      "Analytics and product telemetry: page views, browser/device metadata, referrers, session events, feature interactions, and approximate location derived from network metadata, where enabled.",
      "Support and communications: messages, email content, and any files or diagnostics you choose to send to us.",
    ],
  },
  {
    title: "Service providers",
    body: [
      "Clerk provides authentication, session management, user profile storage, and related security features.",
      "PostHog may be used for product analytics, event capture, funnels, feature usage, and session diagnostics.",
      "Google services may be used for authentication, forms, analytics, security, infrastructure, or other product operations.",
      "Vercel hosts and deploys the web application and may process request logs, performance data, and deployment metadata.",
      "Supabase stores application database records such as account, billing, and sandbox metadata.",
      "Daytona provides cloud sandbox infrastructure and may process sandbox identifiers, runtime metadata, preview/terminal URLs, and operational logs needed to create, start, stop, and delete sandboxes.",
      "Stripe or another payment processor may process checkout, subscription, invoices, tax, fraud-prevention, and payment method data.",
    ],
  },
  {
    title: "How we use information",
    body: [
      "Provide, secure, and maintain the website, dashboard, authentication flows, billing flows, and cloud sandbox features.",
      "Provision, start, stop, connect to, and delete cloud sandboxes at your request.",
      "Calculate plan limits, usage, credits, overages, and subscription status.",
      "Improve reliability, debug issues, prevent abuse, analyze product usage, and understand which features are working.",
      "Communicate with users about account, security, billing, product updates, and support requests.",
    ],
  },
  {
    title: "Agent and provider credentials",
    body: [
      "Trifecta is designed for users to bring their own coding-agent tools and subscriptions. Provider credentials or API keys are handled by the user’s configured provider tools, local server, or cloud sandbox environment depending on how the user sets up Trifecta.",
      "Do not enter secrets into public forms or support messages. If a cloud sandbox stores secrets or provider credentials, those secrets are part of the sandbox environment the user configures.",
    ],
  },
  {
    title: "Cloud sandbox data",
    body: [
      "Cloud sandboxes may contain source code, generated code, dependencies, logs, terminal activity, files, environment variables, and tool configuration created or uploaded by the user or by agents acting under the user’s direction.",
      "Stopped sandboxes may retain their filesystem until deleted or expired according to the plan, product settings, or operational policy.",
      "Deleting a sandbox is intended to remove the associated hosted environment, though backups, provider logs, or billing records may persist for limited operational, legal, or security purposes.",
    ],
  },
  {
    title: "Sharing and disclosure",
    body: [
      "We share information with service providers only as needed to operate Trifecta, process payments, host infrastructure, authenticate users, analyze product usage, prevent abuse, and provide support.",
      "We may disclose information when required by law, to protect users or the service, to investigate abuse or security incidents, or as part of a merger, acquisition, financing, or sale of assets.",
      "We do not sell personal information in the ordinary sense of exchanging it for money.",
    ],
  },
  {
    title: "Retention",
    body: [
      "We retain account, billing, sandbox, analytics, and operational records for as long as needed to provide the service, meet legal obligations, resolve disputes, enforce agreements, prevent abuse, and maintain security.",
      "Users can delete cloud sandboxes from the dashboard. Account deletion or data access requests can be sent to the contact address below.",
    ],
  },
  {
    title: "Security",
    body: [
      "We use access controls, authentication, infrastructure isolation, HTTPS, service-provider security controls, and operational monitoring appropriate for an early-stage cloud product.",
      "No system is perfectly secure. Users are responsible for the code, credentials, repositories, provider tools, and commands they run through Trifecta or within cloud sandboxes.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "You can choose whether to create a cloud account, use hosted sandboxes, connect mobile clients, or run a local/self-hosted server.",
      "You can manage authentication through Clerk-supported flows, manage subscriptions through the billing dashboard, and delete sandboxes from the dashboard.",
      "Browser settings and provider controls may allow you to limit cookies, analytics, or third-party tracking, though some features may stop working.",
    ],
  },
  {
    title: "Children",
    body: [
      "Trifecta is not directed to children under 13 and should not be used by children without appropriate consent and supervision.",
    ],
  },
  {
    title: "Changes",
    body: [
      "We may update this policy as the product changes. The updated version will be posted on this page with a new effective date.",
    ],
  },
]

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Nav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Legal</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-foreground">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Effective date: May 22, 2026</p>
        <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground">
          This policy explains how Belweave handles information for Trifecta’s website, account system, cloud dashboard,
          cloud sandboxes, analytics, billing, and connected client surfaces.
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
            Questions or requests can be sent to{" "}
            <a className="font-semibold text-foreground hover:underline" href="mailto:info@belweave.com">
              info@belweave.com
            </a>
            .
          </p>
          <p className="mt-3">
            See also the{" "}
            <Link className="font-semibold text-foreground hover:underline" href="/terms-of-service">
              Terms of Service
            </Link>
            .
          </p>
        </section>
      </main>
      <Footer />
    </div>
  )
}
