'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { StatusBadge } from '@/components/StatusBadge';
import { TerminalEmbed } from '@/components/TerminalEmbed';
import { ConnectionInfo } from '@/components/ConnectionInfo';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ChevronLeft, Play, Square, Trash2, Terminal, Info, Calendar, Cpu } from 'lucide-react';
import type { SandboxRecord } from '@/lib/types';
import { SANDBOX_TIERS } from '@/lib/config';

export default function SandboxDetail() {
  const { sandboxId } = useParams<{ sandboxId: string }>();
  const [sandbox, setSandbox] = useState<SandboxRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [activeTab, setActiveTab] = useState<'terminal' | 'info'>('terminal');

  const fetchSandbox = useCallback(async () => {
    try {
      const res = await fetch(`/api/sandboxes/${sandboxId}`);
      if (res.ok) setSandbox((await res.json()).sandbox);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [sandboxId]);

  useEffect(() => {
    fetchSandbox();
    const id = setInterval(fetchSandbox, 10000);
    return () => clearInterval(id);
  }, [fetchSandbox]);

  const doAction = async (action: string) => {
    setActing(true);
    try {
      await fetch(`/api/sandboxes/${sandboxId}/${action}`, { method: 'POST' });
      await fetchSandbox();
    } finally {
      setActing(false);
    }
  };

  const doDelete = async () => {
    if (!confirm(`Delete "${sandbox?.name}"? This action cannot be undone.`)) return;
    setActing(true);
    try {
      await fetch(`/api/sandboxes/${sandboxId}`, { method: 'DELETE' });
      window.location.href = '/dashboard';
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 60px)' }}>
          <LoadingSpinner size={32} />
        </div>
      </div>
    );
  }

  if (!sandbox) return null;

  const tier = SANDBOX_TIERS[sandbox.tier as keyof typeof SANDBOX_TIERS];
  const created = new Date(sandbox.created_at);

  return (
    <div style={{ minHeight: '100vh' }}>
      <Navbar />

      <main className="container" style={{ paddingTop: '32px', paddingBottom: '80px' }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: '24px' }}>
          <Link href="/dashboard" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none', paddingLeft: '6px' }}>
            <ChevronLeft size={14} /> Back to Sandboxes
          </Link>
        </div>

        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '28px',
          gap: '16px',
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 700 }}>{sandbox.name}</h1>
              <StatusBadge status={sandbox.status} />
              {tier && <span className={`tier-pill tier-${sandbox.tier}`}>{tier.label}</span>}
            </div>
            <div style={{ display: 'flex', gap: '20px', color: 'var(--text-2)', fontSize: '13px', flexWrap: 'wrap' }}>
              {tier && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Cpu size={13} /> {tier.cpu} vCPU · {tier.memory}GB RAM · {tier.disk}GB disk
                </span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Calendar size={13} /> {created.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {sandbox.status === 'stopped' && (
              <button className="btn btn-primary" onClick={() => doAction('start')} disabled={acting}>
                <Play size={14} /> Start
              </button>
            )}
            {sandbox.status === 'running' && (
              <button className="btn" onClick={() => doAction('stop')} disabled={acting}>
                <Square size={14} /> Stop
              </button>
            )}
            <button className="btn btn-danger" onClick={doDelete} disabled={acting}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>

        {/* Mobile tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--panel)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)', width: 'fit-content' }}
          className="md-tabs">
          <button
            className={`btn btn-sm ${activeTab === 'terminal' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('terminal')}
          >
            <Terminal size={13} /> Terminal
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'info' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('info')}
          >
            <Info size={13} /> Connect
          </button>
        </div>

        {/* Two-column layout */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          gap: '24px',
          alignItems: 'start',
        }}>
          {/* Left — Terminal */}
          <div style={{ minWidth: 0 }}>
            <TerminalEmbed sandboxId={sandbox.id} status={sandbox.status} />
          </div>

          {/* Right sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <ConnectionInfo sandboxId={sandbox.id} status={sandbox.status} />

            <div className="glass" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '14px', color: 'var(--text-2)' }}>
                Getting Started
              </h3>
              <ol style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '10px', color: 'var(--text-2)', fontSize: '13px', lineHeight: 1.6 }}>
                <li>
                  In the terminal, authenticate your AI CLI:
                  <br />
                  <code style={{ fontSize: '12px', color: 'var(--accent-3)', background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: '4px' }}>
                    export ANTHROPIC_API_KEY=sk-ant-…
                  </code>
                </li>
                <li>Navigate to your project in <code style={{ fontSize: '12px', color: 'var(--accent-3)', background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: '4px' }}>/home/daytona/data</code></li>
                <li>Scan the QR code or open the pairing link in the Trifecta web or mobile app</li>
              </ol>
            </div>

            {/* Resource details */}
            {tier && (
              <div className="glass" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '14px', color: 'var(--text-2)' }}>
                  Resources
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                  {[
                    ['CPU', `${tier.cpu} vCPU`],
                    ['Memory', `${tier.memory} GB`],
                    ['Disk', `${tier.disk} GB`],
                    ['Plan', `${tier.label} — ${tier.price}`],
                    ['Sandbox ID', sandbox.id.slice(0, 16) + '…'],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-3)' }}>{k}</span>
                      <span style={{ fontWeight: 500, fontFamily: k === 'Sandbox ID' ? 'monospace' : 'inherit', fontSize: k === 'Sandbox ID' ? '12px' : '13px' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
