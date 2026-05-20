'use client';

import { useEffect, useState } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { ExternalLink, Terminal } from 'lucide-react';

export function TerminalEmbed({ sandboxId, status }: { sandboxId: string; status: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'running') { setUrl(null); return; }
    let mounted = true;

    const load = async () => {
      try {
        setError(null);
        const res = await fetch(`/api/sandboxes/${sandboxId}/terminal`);
        if (res.ok && mounted) setUrl((await res.json()).url);
        else if (mounted) setError('Failed to load terminal');
      } catch {
        if (mounted) setError('Connection error');
      }
    };

    load();
    return () => { mounted = false; };
  }, [sandboxId, status]);

  const wrapStyle: React.CSSProperties = {
    borderRadius: '12px',
    border: '1px solid var(--border)',
    overflow: 'hidden',
    minHeight: '540px',
    display: 'flex',
    flexDirection: 'column',
    background: '#0a0e17',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'rgba(0,0,0,0.3)',
    flexShrink: 0,
  };

  if (status === 'creating') return (
    <div style={wrapStyle}>
      <div style={headerStyle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: 'var(--text-2)' }}>
          <Terminal size={14} /> Terminal
        </span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
        <LoadingSpinner size={28} />
        <p style={{ color: 'var(--text-2)', fontSize: '14px' }}>Provisioning sandbox…</p>
        <p style={{ color: 'var(--text-3)', fontSize: '12px' }}>This takes about 30–60 seconds</p>
      </div>
    </div>
  );

  if (status === 'stopped') return (
    <div style={wrapStyle}>
      <div style={headerStyle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: 'var(--text-2)' }}>
          <Terminal size={14} /> Terminal
        </span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
        <Terminal size={32} style={{ color: 'var(--text-3)' }} />
        <p style={{ color: 'var(--text-2)', fontSize: '14px' }}>Sandbox is stopped</p>
        <p style={{ color: 'var(--text-3)', fontSize: '12px' }}>Start the sandbox to access the terminal</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={wrapStyle}>
      <div style={headerStyle}>
        <span style={{ fontSize: '13px', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: '7px' }}>
          <Terminal size={14} /> Terminal
        </span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--danger)', fontSize: '14px' }}>{error}</p>
      </div>
    </div>
  );

  if (!url) return (
    <div style={wrapStyle}>
      <div style={headerStyle}>
        <span style={{ fontSize: '13px', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: '7px' }}>
          <Terminal size={14} /> Terminal
        </span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner size={24} />
      </div>
    </div>
  );

  return (
    <div style={wrapStyle}>
      <div style={headerStyle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: 'var(--text-2)' }}>
          {/* Traffic lights */}
          <span style={{ display: 'flex', gap: '5px', marginRight: '4px' }}>
            {['#ef4444', '#f59e0b', '#22c55e'].map((c, i) => (
              <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.7 }} />
            ))}
          </span>
          <Terminal size={13} /> Terminal — daytona@sandbox
        </span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none', fontSize: '12px' }}>
          <ExternalLink size={12} /> Pop out
        </a>
      </div>
      <iframe
        src={url}
        style={{ flex: 1, border: 'none', minHeight: '500px' }}
        title="Terminal"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
