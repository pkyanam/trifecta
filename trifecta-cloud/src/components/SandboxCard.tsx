'use client';

import Link from 'next/link';
import { StatusBadge } from './StatusBadge';
import { Play, Square, Trash2, ChevronRight, Clock, Cpu } from 'lucide-react';
import type { SandboxRecord } from '@/lib/types';
import { SANDBOX_TIERS } from '@/lib/config';
import { useState } from 'react';

export function SandboxCard({ sandbox, onRefresh }: { sandbox: SandboxRecord; onRefresh: () => void }) {
  const [acting, setActing] = useState(false);
  const tier = SANDBOX_TIERS[sandbox.tier as keyof typeof SANDBOX_TIERS];

  const doAction = async (action: string) => {
    setActing(true);
    try {
      await fetch(`/api/sandboxes/${sandbox.id}/${action}`, { method: 'POST' });
      onRefresh();
    } finally {
      setActing(false);
    }
  };

  const doDelete = async () => {
    if (!confirm(`Delete "${sandbox.name}"? This cannot be undone.`)) return;
    setActing(true);
    try {
      await fetch(`/api/sandboxes/${sandbox.id}`, { method: 'DELETE' });
      onRefresh();
    } finally {
      setActing(false);
    }
  };

  const created = new Date(sandbox.created_at);
  const timeAgo = (() => {
    const diff = (Date.now() - created.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  })();

  return (
    <div className="glass glass-hover" style={{
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      transition: 'transform 0.15s',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* accent strip */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 2,
        background: sandbox.status === 'running'
          ? 'linear-gradient(90deg, #22c55e, #06b6d4)'
          : sandbox.status === 'error'
          ? 'linear-gradient(90deg, #ef4444, #f97316)'
          : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
        opacity: sandbox.status === 'stopped' ? 0.3 : 1,
      }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <Link href={`/dashboard/${sandbox.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              {sandbox.name}
            </Link>
          </h3>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge status={sandbox.status} />
            {tier && (
              <span className={`tier-pill tier-${sandbox.tier}`}>{tier.label}</span>
            )}
          </div>
        </div>
        <Link href={`/dashboard/${sandbox.id}`} style={{ color: 'var(--text-3)', marginLeft: '8px', flexShrink: 0 }}>
          <ChevronRight size={18} />
        </Link>
      </div>

      {/* Resource info */}
      {tier && (
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-2)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Cpu size={12} /> {tier.cpu} vCPU · {tier.memory}GB RAM
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={12} /> {timeAgo}
          </span>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
        <Link
          href={`/dashboard/${sandbox.id}`}
          className="btn btn-primary btn-sm"
          style={{ flex: 1, textAlign: 'center', textDecoration: 'none', justifyContent: 'center' }}
        >
          Open
        </Link>

        {sandbox.status === 'stopped' && (
          <button
            className="btn btn-sm"
            onClick={() => doAction('start')}
            disabled={acting}
            title="Start sandbox"
            style={{ color: 'var(--success)', borderColor: 'rgba(34,197,94,0.25)' }}
          >
            <Play size={13} />
          </button>
        )}
        {sandbox.status === 'running' && (
          <button
            className="btn btn-sm"
            onClick={() => doAction('stop')}
            disabled={acting}
            title="Stop sandbox"
          >
            <Square size={13} />
          </button>
        )}

        <button
          className="btn btn-sm btn-danger"
          onClick={doDelete}
          disabled={acting}
          title="Delete sandbox"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
