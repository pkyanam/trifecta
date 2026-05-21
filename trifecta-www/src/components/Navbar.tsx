'use client';

import Link from 'next/link';
import Image from 'next/image';
import { UserButton } from '@clerk/nextjs';

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
        <Link href="/" className="flex items-center gap-2.5 group">
          <Image
            src="/trifectaAppLogo.png"
            alt="Trifecta"
            width={26}
            height={26}
            className="rounded-md ring-1 ring-border group-hover:ring-foreground/20 transition-all"
          />
          <span className="text-[15px] font-bold tracking-tight text-foreground">Trifecta</span>
        </Link>

        <div className="h-4 w-px bg-border/60" />

        <Link
          href="/dashboard"
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Dashboard
        </Link>
        <Link
          href="/dashboard/billing"
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Account
        </Link>

        <div className="flex-1" />

        <UserButton
          appearance={{
            variables: { colorPrimary: '#000000' },
            elements: { avatarBox: { width: 28, height: 28 } },
          }}
        />
      </div>
    </nav>
  );
}
