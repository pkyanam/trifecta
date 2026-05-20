'use client';

import { useState } from 'react';
import { X, Zap, Rocket, Users } from 'lucide-react';

const TIERS = [
  { id: 'starter', label: 'Starter', specs: '1 vCPU · 2 GB RAM · 10 GB', icon: Zap,    price: '$9/mo'  },
  { id: 'pro',     label: 'Pro',     specs: '2 vCPU · 4 GB RAM · 20 GB', icon: Rocket, price: '$19/mo' },
  { id: 'team',    label: 'Team',    specs: '4 vCPU · 8 GB RAM · 50 GB', icon: Users,  price: '$39/mo' },
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#ededed' }}>New Sandbox</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={15} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
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
            <p style={{ fontSize: '12px', color: '#444', marginTop: '5px' }}>
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
                      borderRadius: '6px',
                      border: `1px solid ${selected ? '#0070f3' : '#222'}`,
                      background: selected ? 'rgba(0,112,243,0.07)' : '#111',
                      cursor: 'pointer',
                      transition: 'all 0.1s',
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
                      width: 30, height: 30, borderRadius: 6,
                      background: selected ? 'rgba(0,112,243,0.15)' : '#1a1a1a',
                      border: `1px solid ${selected ? 'rgba(0,112,243,0.3)' : '#222'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon size={14} color={selected ? '#0070f3' : '#666'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: selected ? '#ededed' : '#888' }}>
                        {t.label}
                      </div>
                      <div style={{ fontSize: '11px', color: '#444', marginTop: '1px' }}>{t.specs}</div>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: selected ? '#ededed' : '#555' }}>
                      {t.price}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {error && (
            <div style={{
              background: 'rgba(220,0,0,0.08)',
              border: '1px solid rgba(220,0,0,0.2)',
              borderRadius: '6px',
              padding: '10px 14px',
              color: '#e00000',
              fontSize: '13px',
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
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
