'use client';

import { useState } from 'react';
import { X, Zap, Rocket, Users } from 'lucide-react';

const TIERS = [
  { id: 'starter', label: 'Starter', specs: '1 vCPU · 2 GB RAM · 10 GB', icon: Zap, price: '$9/mo', color: '#a78bfa' },
  { id: 'pro', label: 'Pro', specs: '2 vCPU · 4 GB RAM · 20 GB', icon: Rocket, price: '$19/mo', color: '#22d3ee' },
  { id: 'team', label: 'Team', specs: '4 vCPU · 8 GB RAM · 50 GB', icon: Users, price: '$39/mo', color: '#fbbf24' },
];

export function CreateSandboxModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState('');
  const [tier, setTier] = useState('starter');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/sandboxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, tier }),
      });
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to create sandbox.');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700 }}>New Sandbox</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label>Sandbox Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent-env"
              required
              pattern="[a-z0-9-]+"
              title="Lowercase letters, numbers, and hyphens only"
              autoFocus
            />
            <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '6px' }}>
              Lowercase letters, numbers, and hyphens only
            </p>
          </div>

          <div>
            <label>Plan</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              {TIERS.map((t) => {
                const Icon = t.icon;
                const selected = tier === t.id;
                return (
                  <label
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: `1px solid ${selected ? t.color + '66' : 'var(--border)'}`,
                      background: selected ? t.color + '15' : 'rgba(0,0,0,0.25)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      width: '100%',
                    }}
                  >
                    <input
                      type="radio"
                      name="tier"
                      value={t.id}
                      checked={selected}
                      onChange={() => setTier(t.id)}
                      style={{ width: 'auto', display: 'none' }}
                    />
                    <div style={{
                      width: 32, height: 32, borderRadius: 7,
                      background: selected ? t.color + '25' : 'var(--panel)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={15} color={selected ? t.color : 'var(--text-2)'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: selected ? 'var(--text)' : 'var(--text-2)' }}>
                        {t.label}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>{t.specs}</div>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: selected ? t.color : 'var(--text-3)' }}>
                      {t.price}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: '8px',
              padding: '10px 14px',
              color: 'var(--danger)',
              fontSize: '13px',
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button type="button" className="btn" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Provisioning…' : 'Create Sandbox'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
