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
            <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '6px' }}>
              Sandboxes
            </h1>
            <p style={{ color: 'var(--text-2)', fontSize: '14px' }}>
              Isolated AI coding agent environments, powered by Daytona
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ flexShrink: 0 }}>
            <Plus size={15} />
            New Sandbox
          </button>
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
          marginBottom: '36px',
        }}>
          <StatCard icon={<Box size={20} />} value={sandboxes.length} label="Total Sandboxes" color="#6366f1" />
          <StatCard icon={<Play size={20} />} value={running} label="Running" color="#22c55e" />
          <StatCard icon={<CircleDot size={20} />} value={stopped} label="Stopped" color="#94a3b8" />
          {errored > 0 && (
            <StatCard icon={<AlertTriangle size={20} />} value={errored} label="Errored" color="#ef4444" />
          )}
        </div>

        {/* Sandbox grid */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '80px' }}>
            <LoadingSpinner size={32} />
          </div>
        ) : sandboxes.length === 0 ? (
          <div className="glass empty-state">
            <Box size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
            <h3>No sandboxes yet</h3>
            <p style={{ marginBottom: '24px' }}>Create your first sandbox to start using AI coding agents.</p>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={15} /> Create Sandbox
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '20px',
          }}>
            {sandboxes.map((sb) => (
              <SandboxCard key={sb.id} sandbox={sb} onRefresh={fetchSandboxes} />
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <CreateSandboxModal onClose={() => setShowModal(false)} onSuccess={fetchSandboxes} />
      )}
    </div>
  );
}

function StatCard({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) {
  return (
    <div className="glass stat-card">
      <div className="stat-icon" style={{ background: color + '1a' }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div>
        <div className="stat-value" style={{ color }}>{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}
