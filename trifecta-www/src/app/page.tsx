import Image from "next/image"
import Link from "next/link"
import { Nav, Footer } from "@/components/nav"

function CastleWireframe() {
  return (
    <svg
      viewBox="0 0 300 500"
      fill="none"
      className="wireframe-glow absolute -left-8 top-0 h-[480px] w-auto opacity-30 lg:left-0 lg:opacity-40"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Main tower */}
      <path
        d="M120 40 L120 20 L130 10 L150 5 L170 10 L180 20 L180 40"
        stroke="#3ecf8e"
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M120 40 L120 120 L110 125 L110 135 L120 140 L120 220 L110 225 L110 235 L120 240 L120 380"
        stroke="#3ecf8e"
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M180 40 L180 120 L190 125 L190 135 L180 140 L180 220 L190 225 L190 235 L180 240 L180 380"
        stroke="#3ecf8e"
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M120 380 L150 420 L180 380"
        stroke="#3ecf8e"
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Left tower */}
      <path
        d="M60 100 L60 85 L65 78 L75 75 L85 78 L90 85 L90 100"
        stroke="#3ecf8e"
        strokeWidth="0.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M60 100 L60 180 L55 183 L55 188 L60 191 L60 280 L55 283 L55 288 L60 291 L60 380"
        stroke="#3ecf8e"
        strokeWidth="0.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M90 100 L90 180 L95 183 L95 188 L90 191 L90 280 L95 283 L95 288 L90 291 L90 380"
        stroke="#3ecf8e"
        strokeWidth="0.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Right tower */}
      <path
        d="M210 120 L210 105 L215 98 L225 95 L235 98 L240 105 L240 120"
        stroke="#3ecf8e"
        strokeWidth="0.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M210 120 L210 200 L205 203 L205 208 L210 211 L210 300 L205 303 L205 308 L210 311 L210 380"
        stroke="#3ecf8e"
        strokeWidth="0.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M240 120 L240 200 L245 203 L245 208 L240 211 L240 300 L245 303 L245 308 L240 311 L240 380"
        stroke="#3ecf8e"
        strokeWidth="0.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Base connections */}
      <path
        d="M60 380 L120 380 M180 380 L240 380"
        stroke="#3ecf8e"
        strokeWidth="0.5"
        strokeLinecap="round"
      />
      {/* Circuit traces */}
      <path
        d="M90 380 L90 430 L70 450 L40 450"
        stroke="#3ecf8e"
        strokeWidth="0.4"
        strokeLinecap="round"
      />
      <path
        d="M210 380 L210 420 L230 440 L260 440"
        stroke="#3ecf8e"
        strokeWidth="0.4"
        strokeLinecap="round"
      />
      <path
        d="M150 420 L150 460 L120 480 L90 480"
        stroke="#3ecf8e"
        strokeWidth="0.4"
        strokeLinecap="round"
      />
      {/* Dots */}
      <circle cx="40" cy="450" r="1.5" fill="#3ecf8e" opacity="0.6" />
      <circle cx="260" cy="440" r="1.5" fill="#3ecf8e" opacity="0.6" />
      <circle cx="90" cy="480" r="1.5" fill="#3ecf8e" opacity="0.6" />
      <circle cx="150" cy="200" r="1.5" fill="#3ecf8e" opacity="0.4" />
      <circle cx="75" cy="250" r="1" fill="#3ecf8e" opacity="0.3" />
      <circle cx="225" cy="280" r="1" fill="#3ecf8e" opacity="0.3" />
    </svg>
  )
}

function CubeWireframe() {
  return (
    <svg
      viewBox="0 0 280 400"
      fill="none"
      className="wireframe-glow absolute -right-4 top-10 h-[420px] w-auto opacity-30 lg:right-0 lg:opacity-40"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Cube top face */}
      <path
        d="M140 40 L220 80 L220 160 L140 200 L60 160 L60 80 Z"
        stroke="#3ecf8e"
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Cube front face */}
      <path
        d="M60 160 L140 200 L140 280 L60 240 Z"
        stroke="#3ecf8e"
        strokeWidth="0.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Cube right face */}
      <path
        d="M140 200 L220 160 L220 240 L140 280 Z"
        stroke="#3ecf8e"
        strokeWidth="0.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Inner face lines */}
      <path
        d="M140 40 L140 120 L60 160"
        stroke="#3ecf8e"
        strokeWidth="0.4"
        strokeLinecap="round"
      />
      <path
        d="M140 120 L220 160"
        stroke="#3ecf8e"
        strokeWidth="0.4"
        strokeLinecap="round"
      />
      {/* Triquetra symbol on front face */}
      <path
        d="M100 210 C100 210, 120 190, 140 210 C140 210, 160 230, 140 250 C140 250, 120 270, 100 250"
        stroke="#3ecf8e"
        strokeWidth="0.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M100 250 C100 250, 80 230, 100 210"
        stroke="#3ecf8e"
        strokeWidth="0.8"
        strokeLinecap="round"
        fill="none"
      />
      {/* Beam extending down */}
      <path
        d="M140 280 L140 340"
        stroke="#3ecf8e"
        strokeWidth="0.5"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M135 290 L145 290 M130 310 L150 310 M125 330 L155 330"
        stroke="#3ecf8e"
        strokeWidth="0.3"
        strokeLinecap="round"
        opacity="0.3"
      />
      {/* Floating particles */}
      <circle cx="180" cy="300" r="1.5" fill="#3ecf8e" opacity="0.4" />
      <circle cx="80" cy="320" r="1" fill="#3ecf8e" opacity="0.3" />
      <circle cx="200" cy="340" r="1.2" fill="#3ecf8e" opacity="0.35" />
      <circle cx="100" cy="360" r="1" fill="#3ecf8e" opacity="0.25" />
      <circle cx="160" cy="370" r="1.5" fill="#3ecf8e" opacity="0.3" />
      {/* Platform base glow */}
      <ellipse cx="140" cy="350" rx="60" ry="8" stroke="#3ecf8e" strokeWidth="0.3" opacity="0.2" />
    </svg>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <CastleWireframe />
      <CubeWireframe />

      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 pb-12 pt-16 text-center md:pt-20">
        <p className="mb-6 text-[11px] text-[#444]">
          compatible with the official t3 code desktop server
        </p>

        <h1 className="text-4xl font-normal leading-[1.1] tracking-tight text-[#ececec] sm:text-5xl md:text-6xl lg:text-7xl">
          your code.
          <br />
          your castle.
          <br />
          <span className="text-[#3ecf8e]">our agents.</span>
        </h1>

        <p className="mt-5 max-w-md text-sm leading-relaxed text-[#666]">
          trifecta is a family of ai coding agent applications
          built for desktop and mobile.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/docs"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#3ecf8e]/40 px-6 text-xs text-[#ececec] transition-all hover:border-[#3ecf8e]/70 hover:bg-[#3ecf8e]/5 active:scale-[0.98]"
          >
            get started
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#666]">
              <path d="M3 7H11M11 7L7.5 3.5M11 7L7.5 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <Link
            href="/docs"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] px-6 text-xs text-[#ececec] transition-colors hover:bg-white/[0.04] hover:border-white/[0.1] active:scale-[0.98]"
          >
            read docs
          </Link>
        </div>

        <div className="mt-10">
          <p className="mb-3 text-[10px] tracking-widest text-[#444] uppercase">available on</p>
          <div className="flex items-center gap-1">
            {[
              { icon: "macos", label: "macos" },
              { icon: "ios", label: "ios" },
              { icon: "android", label: "android" },
              { icon: "windows", label: "windows" },
              { icon: "linux", label: "linux" },
            ].map((p) => (
              <span
                key={p.label}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.04] bg-white/[0.015] px-3 py-1.5 text-[11px] text-[#555]"
              >
                {p.icon === "macos" && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-[#666]">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.21-1.98 1.07-3.11-1.05.05-2.31.71-3.06 1.56-.68.78-1.28 2.03-1.12 3.14 1.19.09 2.4-.6 3.11-1.59"/>
                  </svg>
                )}
                {p.icon === "ios" && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-[#666]">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.21-1.98 1.07-3.11-1.05.05-2.31.71-3.06 1.56-.68.78-1.28 2.03-1.12 3.14 1.19.09 2.4-.6 3.11-1.59"/>
                  </svg>
                )}
                {p.icon === "android" && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-[#666]">
                    <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993.0001.5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0225 3.503C15.5902 8.4796 13.8533 8.1353 12 8.1353c-1.8533 0-3.5902.3443-5.1367.9555L4.8408 5.5878a.416.416 0 00-.5676-.1521.416.416 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589.3432 18.6617h23.3136c0-4.0028-2.3457-7.475-5.7752-9.3403"/>
                  </svg>
                )}
                {p.icon === "windows" && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-[#666]">
                    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
                  </svg>
                )}
                {p.icon === "linux" && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-[#666]">
                    <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.22-.334.982-.064 2.056.43 2.892.466.927.035 1.66-.363 1.814-.869.33.04.64-.014.95-.129.31-.115.61-.309.78-.684.31.036.64-.005.95-.139.31-.136.61-.335.78-.69.025-.05.048-.1.067-.154.157-.463.076-1.024-.159-1.618-.231-.575-.582-1.173-.857-1.723-.276-.55-.46-1.044-.396-1.31.176-.728.272-1.422.272-2.092.001-2.846-1.37-5.574-3.043-7.697-.855-1.07-1.786-1.979-2.65-2.816-.863-.837-1.659-1.62-2.27-2.551-.324-.497-.625-1.06-.78-1.728-.155-.668-.132-1.426.118-2.25.004-.013.008-.027.01-.04C12.677.03 12.594 0 12.504 0zm.016 5.97a.27.27 0 01.27.27v3.243a.27.27 0 01-.27.27.27.27 0 01-.27-.27V6.24a.27.27 0 01.27-.27zm-5.218 4.97c.313 0 .567.254.567.566 0 .313-.254.568-.567.568-.313 0-.566-.255-.566-.568 0-.312.253-.566.566-.566zm10.436 0c.313 0 .566.254.566.566 0 .313-.253.568-.566.568-.313 0-.567-.255-.567-.568 0-.312.254-.566.567-.566zM8.403 14.18c.26 0 .382.112.382.321 0 .15-.075.334-.302.5-.226.167-.585.299-1.081.299-.496 0-.855-.132-1.082-.299-.226-.166-.302-.35-.302-.5 0-.21.123-.321.382-.321.26 0 .548.146.748.146h.507c.2 0 .488-.146.748-.146zm7.196 0c.259 0 .382.112.382.321 0 .15-.076.334-.302.5-.227.167-.586.299-1.082.299-.496 0-.855-.132-1.081-.299-.227-.166-.302-.35-.302-.5 0-.21.122-.321.382-.321.259 0 .547.146.747.146h.508c.2 0 .488-.146.748-.146z"/>
                  </svg>
                )}
                {p.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function RealmCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col rounded-xl border border-white/[0.04] bg-[#080808] p-5 card-hover">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02]">
        <Icon className="h-4 w-4 text-[#3ecf8e]" />
      </div>
      <h3 className="text-sm font-medium text-[#ececec]">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-[#555]">{description}</p>
    </div>
  )
}

function Realms() {
  return (
    <section className="relative mx-auto max-w-5xl px-6 pb-16">
      <div className="mb-8 text-center">
        <p className="text-[10px] tracking-[0.2em] text-[#444] uppercase">
          built for every realm
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <RealmCard
          icon={() => (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          )}
          title="desktop agents"
          description="native apps for macos, windows, and linux. full power, offline capabilities."
        />
        <RealmCard
          icon={() => (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" />
              <line x1="12" y1="18" x2="12" y2="18.01" />
            </svg>
          )}
          title="mobile agents"
          description="ios and android apps. code, review, and deploy from anywhere in your kingdom."
        />
        <RealmCard
          icon={() => (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
            </svg>
          )}
          title="cloud agents"
          description="web-based agents that scale with your team. always in sync, always secure."
        />
      </div>
    </section>
  )
}

function T3CodeBanner() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-16">
      <div className="flex flex-col items-center rounded-xl border border-white/[0.04] bg-[#080808] p-6 text-center">
        <h2 className="text-sm font-medium text-[#ececec]">
          also compatible with t3 code
        </h2>
        <p className="mt-2 max-w-sm text-xs leading-relaxed text-[#555]">
          the trifecta mobile apps work seamlessly with the official t3 code desktop server.
        </p>
        <div className="mt-4 flex items-center gap-3 text-[11px] text-[#444]">
          <span>trifecta.belweave.com</span>
          <span className="text-[#333]">&middot;</span>
          <span>trifecta.belweave.ai</span>
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="flex-1">
        <Hero />
        <Realms />
        <T3CodeBanner />
      </main>
      <Footer />
    </div>
  )
}
