import Image from "next/image"
import Link from "next/link"

export function Nav() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/[0.04] bg-[#050505]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="relative h-6 w-6 overflow-hidden rounded-lg">
            <Image
              src="/trifecta-logo.png"
              alt="trifecta"
              fill
              className="object-cover"
              priority
            />
          </div>
          <span className="text-[11px] font-medium tracking-[0.25em] text-[#ececec] uppercase">
            trifecta
          </span>
        </Link>
        <div className="hidden items-center gap-8 text-xs text-[#666] md:flex">
          <Link href="/" className="transition-colors hover:text-[#ececec]">product</Link>
          <Link href="/developers" className="transition-colors hover:text-[#ececec]">developers</Link>
          <Link href="/docs" className="transition-colors hover:text-[#ececec]">docs</Link>
        </div>
        <div className="hidden md:flex">
          <Link
            href="https://github.com/pkyanam/trifecta"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] px-4 text-[11px] text-[#ececec] transition-colors hover:border-white/[0.15] hover:bg-white/[0.02]"
          >
            get trifecta
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-[#666]">
              <path d="M2.5 6H9.5M9.5 6L6.5 3M9.5 6L6.5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>
      </div>
    </nav>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-white/[0.04] bg-[#050505]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <div className="relative h-5 w-5 overflow-hidden rounded-md">
            <Image
              src="/trifecta-logo.png"
              alt="trifecta"
              fill
              className="object-cover"
            />
          </div>
          <span className="text-[10px] font-medium tracking-[0.2em] text-[#ececec] uppercase">
            trifecta
          </span>
          <span className="text-[9px] tracking-[0.15em] text-[#333] uppercase">by belweave</span>
        </div>
        <p className="text-[10px] text-[#333]">
          &copy; {new Date().getFullYear()} belweave. all rights reserved.
        </p>
      </div>
    </footer>
  )
}
