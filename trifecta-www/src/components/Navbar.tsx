'use client';

import Link from 'next/link';
import Image from 'next/image';
import { UserButton } from '@clerk/nextjs';

export function Navbar() {
  return (
    <nav style={{
      position: 'sticky',
      top: 0,
      zIndex: 50,
      borderBottom: '1px solid #1a1a1a',
      background: 'rgba(0,0,0,0.9)',
      backdropFilter: 'blur(12px)',
    }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', height: '56px', gap: '16px' }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
          <Image src="/trifecta-logo.png" alt="Trifecta" width={28} height={28} style={{ borderRadius: 6, flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#ededed', letterSpacing: '-0.01em' }}>
            Trifecta
          </span>
        </Link>

        <div style={{ flex: 1 }} />

        <Link href="/dashboard" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
          Dashboard
        </Link>

        <UserButton
          appearance={{
            variables: { colorPrimary: '#0070f3' },
            elements: {
              avatarBox: { width: 30, height: 30 },
            },
          }}
        />
      </div>
    </nav>
  );
}
