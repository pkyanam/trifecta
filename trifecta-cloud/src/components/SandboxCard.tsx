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

  const accentColor =
    sandbox.status === 'running' ? '#00c805' :
    sandbox.status === 'error'   ? '#e00000' :
    '#333333';

  return (
    <div className="glass glass-hover" style={{
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* top accent line */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 2,
        background: accentColor,
        opacity: sandbox.status === 'stopped' ? 0.2 : 0.8,
      }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <Link href={`/dashboard/${sandbox.id}`} style={{ color: '#ededed', textDecoration: 'none' }}>
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
        <Link href={`/dashboard/${sandbox.id}`} style={{ color: '#444', marginLeft: '8px', flexShrink: 0 }}>
          <ChevronRight size={16} />
        </Link>
      </div>

      {/* Resource info */}
      {tier && (
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#666' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Cpu size={11} /> {tier.cpu} vCPU · {tier.memory} GB RAM
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={11} /> {timeAgo}
          </span>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #1a1a1a' }}>
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
            style={{ color: '#00c805', borderColor: 'rgba(0,200,5,0.2)' }}
          >
            <Play size={12} />
          </button>
        )}
        {sandbox.status === 'running' && (
          <button
            className="btn btn-sm"
            onClick={() => doAction('stop')}
            disabled={acting}
            title="Stop sandbox"
          >
            <Square size={12} />
          </button>
        )}

        <button
          className="btn btn-sm btn-danger"
          onClick={doDelete}
          disabled={acting}
          title="Delete sandbox"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
