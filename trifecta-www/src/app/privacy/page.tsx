import { Nav, Footer } from "@/components/nav"

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#050505]">
      <Nav />
      <main className="mx-auto max-w-2xl px-6 py-20">
        <h1 className="text-lg font-medium text-[#ececec] mb-1">Trifecta Agent Privacy Policy</h1>
        <p className="text-[11px] text-[#444] mb-10">Last updated: May 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-[#666]">
          <p>
            Trifecta Agent does not collect, transmit, or store any personal data on behalf of Belweave.
          </p>

          <p>
            All network communication occurs exclusively between your device and the Trifecta or T3 Code
            desktop server you configure. Belweave operates no intermediate servers, analytics services,
            or telemetry pipelines for this app.
          </p>

          <div>
            <p className="text-[#888] mb-3">Data stored on your device:</p>
            <ul className="space-y-2 pl-4 border-l border-white/[0.04]">
              <li>
                A bearer token and server URL are saved to the iOS Keychain to enable automatic
                reconnection. This data never leaves your device to Belweave.
              </li>
              <li>
                App preferences (appearance, accent color, transcript density) are stored in standard
                iOS UserDefaults.
              </li>
            </ul>
          </div>

          <p>
            Photos you attach to messages are transmitted directly to your configured server and are
            not accessible to Belweave.
          </p>

          <p>
            Contact:{" "}
            <a
              href="mailto:info@belweave.com"
              className="text-[#ececec] hover:text-[#3ecf8e] transition-colors"
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
