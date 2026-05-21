'use client';

import { useEffect, useState, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { SandboxCard } from '@/components/SandboxCard';
import { CreateSandboxModal } from '@/components/CreateSandboxModal';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Box, Play, CircleDot, AlertTriangle, Copy, Check } from 'lucide-react';
import type { SandboxRecord } from '@/lib/types';

export default function Dashboard() {
  const [sandboxes, setSandboxes] = useState<SandboxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [clerkUserId, setClerkUserId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
      .then((d) => {
        setIsAdmin(d.isAdmin === true);
        if (d.userId) setClerkUserId(d.userId);
      })
      .catch(() => setIsAdmin(false));
  }, []);

  const copyUserId = () => {
    if (!clerkUserId) return;
    navigator.clipboard.writeText(clerkUserId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const running = sandboxes.filter((s) => s.status === 'running');
  const stopped = sandboxes.filter((s) => s.status === 'stopped');
  const errored = sandboxes.filter((s) => s.status === 'error');

  const tabData = [
    { value: 'all',     label: 'All',     items: sandboxes,          count: sandboxes.length },
    { value: 'running', label: 'Running', items: running,            count: running.length },
    { value: 'stopped', label: 'Stopped', items: stopped,            count: stopped.length },
    ...(errored.length > 0 ? [{ value: 'error', label: 'Error', items: errored, count: errored.length }] : []),
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-6xl px-6 py-10 pb-20">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">Sandboxes</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Isolated AI coding agent environments, powered by Daytona
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowModal(true)} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              New Sandbox
            </Button>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-8">
          <StatCard icon={<Box className="h-4 w-4" />} value={sandboxes.length} label="Total" />
          <StatCard icon={<Play className="h-4 w-4 text-emerald-500" />} value={running.length} label="Running" accent="emerald" />
          <StatCard icon={<CircleDot className="h-4 w-4 text-zinc-400" />} value={stopped.length} label="Stopped" />
          {errored.length > 0 && (
            <StatCard icon={<AlertTriangle className="h-4 w-4 text-red-500" />} value={errored.length} label="Error" accent="red" />
          )}
        </div>

        {/* Guest notice */}
        {!isAdmin && !loading && (
          <div className="mb-6 rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">Guest access</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Sandbox creation requires an admin account. Payments &amp; self-serve plans coming soon.
            </p>
            {clerkUserId && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">Your Clerk ID:</span>
                <code className="flex-1 truncate rounded border border-border bg-secondary px-2 py-1 text-xs font-mono text-foreground/70">
                  {clerkUserId}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 shrink-0"
                  onClick={copyUserId}
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Sandbox grid with tabs */}
        {loading ? (
          <div className="flex justify-center py-20">
            <LoadingSpinner size={28} />
          </div>
        ) : sandboxes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-20 text-center">
            <Box className="h-10 w-10 text-muted-foreground/20 mb-4" />
            <h3 className="font-semibold text-foreground text-base">No sandboxes yet</h3>
            {isAdmin ? (
              <>
                <p className="text-sm text-muted-foreground mt-2 mb-5">Create your first sandbox to get started.</p>
                <Button onClick={() => setShowModal(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Sandbox
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">Contact your admin to provision a sandbox.</p>
            )}
          </div>
        ) : (
          <Tabs defaultValue="all">
            <TabsList className="mb-6 h-9 bg-secondary/60 p-1 rounded-xl">
              {tabData.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="h-7 gap-2 rounded-lg text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <Badge
                      variant="secondary"
                      className="h-4 min-w-4 px-1 text-[10px] font-bold rounded-full pointer-events-none"
                    >
                      {tab.count}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {tabData.map((tab) => (
              <TabsContent key={tab.value} value={tab.value}>
                {tab.items.length === 0 ? (
                  <div className="py-16 text-center">
                    <p className="text-sm text-muted-foreground">No {tab.label.toLowerCase()} sandboxes.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {tab.items.map((sb) => (
                      <SandboxCard key={sb.id} sandbox={sb} onRefresh={fetchSandboxes} />
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </main>

      {showModal && isAdmin && (
        <CreateSandboxModal onClose={() => setShowModal(false)} onSuccess={fetchSandboxes} />
      )}
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  accent?: 'emerald' | 'red';
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
      <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
        {icon}
      </div>
      <div>
        <div className={`text-xl font-black tabular-nums ${accent === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : accent === 'red' ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
          {value}
        </div>
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
