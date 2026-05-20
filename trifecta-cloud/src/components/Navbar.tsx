'use client';

import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { LayoutDashboard } from 'lucide-react';

export function Navbar() {
  return (
    <nav style={{
      position: 'sticky',
      top: 0,
      zIndex: 50,
      borderBottom: '1px solid var(--border)',
      background: 'rgba(6,10,19,0.85)',
      backdropFilter: 'blur(16px)',
    }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', height: '60px', gap: '16px' }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <LayoutDashboard size={16} color="#fff" />
          </div>
          <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}>
            Trifecta <span className="gradient-text">Cloud</span>
          </span>
        </Link>

        <div style={{ flex: 1 }} />

        <Link href="/dashboard" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
          Dashboard
        </Link>

        <UserButton
          appearance={{
            variables: { colorPrimary: '#6366f1' },
            elements: {
              avatarBox: { width: 32, height: 32 },
            },
          }}
        />
      </div>
    </nav>
  );
}
