'use client';

import { useEffect, useState, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { SandboxCard } from '@/components/SandboxCard';
import { CreateSandboxModal } from '@/components/CreateSandboxModal';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Plus, Box, Play, CircleDot, AlertTriangle } from 'lucide-react';
import type { SandboxRecord } from '@/lib/types';

export default function Dashboard() {
  const [sandboxes, setSandboxes] = useState<SandboxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const fetchSandboxes = useCallback(async () => {
    try {
      const res = await fetch('/api/sandboxes');
      if (res.ok) setSandboxes((await res.json()).sandboxes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSandboxes();
    const id = setInterval(fetchSandboxes, 12000);
    return () => clearInterval(id);
  }, [fetchSandboxes]);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setIsAdmin(d.isAdmin === true))
      .catch(() => setIsAdmin(false));
  }, []);

  const running = sandboxes.filter((s) => s.status === 'running').length;
  const stopped = sandboxes.filter((s) => s.status === 'stopped').length;
  const errored = sandboxes.filter((s) => s.status === 'error').length;

  return (
    <div style={{ minHeight: '100vh' }}>
      <Navbar />

      <main className="container" style={{ paddingTop: '40px', paddingBottom: '80px' }}>
        {/* Page header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px', letterSpacing: '-0.02em', color: '#ededed' }}>
              Sandboxes
            </h1>
            <p style={{ color: '#666', fontSize: '14px' }}>
              Isolated AI coding agent environments, powered by Daytona
            </p>
          </div>
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ flexShrink: 0 }}>
              <Plus size={14} />
              New Sandbox
            </button>
          )}
        </div>

        {/* Guest notice */}
        {!isAdmin && !loading && (
          <div className="guest-notice" style={{ marginBottom: '28px' }}>
            <strong>Guest access</strong> — Sandbox creation requires an admin account.
            Payments &amp; self-serve plans are coming soon.
          </div>
        )}

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
          marginBottom: '32px',
        }}>
          <StatCard icon={<Box size={16} />} value={sandboxes.length} label="Total" accent="#ededed" />
          <StatCard icon={<Play size={16} />} value={running}           label="Running" accent="#00c805" />
          <StatCard icon={<CircleDot size={16} />} value={stopped}      label="Stopped" accent="#666" />
          {errored > 0 && (
            <StatCard icon={<AlertTriangle size={16} />} value={errored} label="Error" accent="#e00000" />
          )}
        </div>

        {/* Sandbox grid */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '80px' }}>
            <LoadingSpinner size={28} />
          </div>
        ) : sandboxes.length === 0 ? (
          <div className="glass empty-state">
            <Box size={44} style={{ margin: '0 auto 16px', opacity: 0.15 }} />
            <h3>No sandboxes yet</h3>
            {isAdmin ? (
              <>
                <p style={{ marginBottom: '20px' }}>Create your first sandbox to start using AI coding agents.</p>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                  <Plus size={14} /> Create Sandbox
                </button>
              </>
            ) : (
              <p>Contact your admin to provision a sandbox for you.</p>
            )}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
            gap: '16px',
          }}>
            {sandboxes.map((sb) => (
              <SandboxCard key={sb.id} sandbox={sb} onRefresh={fetchSandboxes} />
            ))}
          </div>
        )}
      </main>

      {showModal && isAdmin && (
        <CreateSandboxModal onClose={() => setShowModal(false)} onSuccess={fetchSandboxes} />
      )}
    </div>
  );
}

function StatCard({ icon, value, label, accent }: { icon: React.ReactNode; value: number; label: string; accent: string }) {
  return (
    <div className="glass stat-card">
      <div className="stat-icon">
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div>
        <div className="stat-value" style={{ color: accent }}>{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}
