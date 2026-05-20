import { Nav, Footer } from "@/components/nav"

export default function PrivacyPage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <Nav />
      {/* Grid backdrops */}
      <div className="absolute inset-0 clean-grid opacity-100 -z-10" />

      <main className="flex-1 mx-auto max-w-2xl px-6 py-20 relative">
        <h1 className="text-xl font-bold text-foreground mb-1 tracking-tight">Trifecta Agent Privacy Policy</h1>
        <p className="text-xs text-muted-foreground mb-10 font-medium">Last updated: May 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
          <p>
            Trifecta Agent does not collect, transmit, or store any personal data on behalf of Belweave.
          </p>

          <p>
            All network communication occurs exclusively between your device and the Trifecta or T3 Code
            desktop server you configure. Belweave operates no intermediate servers, analytics services,
            or telemetry pipelines for this app.
          </p>

          <div className="border border-border bg-card/40 rounded-xl p-5 space-y-3">
            <p className="text-foreground font-bold tracking-tight text-xs uppercase">Data stored on your device:</p>
            <ul className="space-y-2 pl-4 border-l border-border text-xs">
              <li>
                A bearer token and server URL are saved to the device Keychain to enable automatic
                reconnection. This data never leaves your device to Belweave.
              </li>
              <li>
                App preferences (appearance, accent color, transcript density) are stored locally in standard
                user preferences settings.
              </li>
            </ul>
          </div>

          <p>
            Photos you attach to messages are transmitted directly to your configured server and are
            not accessible to Belweave.
          </p>

          <p className="pt-4 border-t border-border/40 text-xs">
            Contact:{" "}
            <a
              href="mailto:info@belweave.com"
              className="text-foreground font-semibold hover:underline"
            >
              info@belweave.com
            </a>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  )
}

