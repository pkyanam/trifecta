'use client';

import Link from 'next/link';
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
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
            <rect width="22" height="22" rx="5" fill="#0070f3" />
            <path d="M6 16L11 6L16 16" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 13H14" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#ededed', letterSpacing: '-0.01em' }}>
            Trifecta Cloud
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
