'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { StatusBadge } from '@/components/StatusBadge';
import { TerminalEmbed } from '@/components/TerminalEmbed';
import { ConnectionInfo } from '@/components/ConnectionInfo';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ChevronLeft, Play, Square, Trash2, Terminal, Info, Calendar, Cpu } from 'lucide-react';
import type { SandboxRecord } from '@/lib/types';
import { SANDBOX_TIERS } from '@/lib/config';

export default function SandboxDetail() {
  const { sandboxId } = useParams<{ sandboxId: string }>();
  const [sandbox, setSandbox] = useState<SandboxRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

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
      const res = await fetch(`/api/sandboxes/${sandboxId}/${action}`, { method: 'POST' });
      if (res.ok) {
        toast.success(action === 'start' ? 'Sandbox started' : 'Sandbox stopped');
        await fetchSandbox();
      } else {
        toast.error(`Failed to ${action} sandbox`);
      }
    } finally {
      setActing(false);
    }
  };

  const doDelete = async () => {
    if (!confirm(`Delete "${sandbox?.name}"? This cannot be undone.`)) return;
    setActing(true);
    try {
      const res = await fetch(`/api/sandboxes/${sandboxId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Sandbox deleted');
        window.location.href = '/dashboard';
      } else {
        toast.error('Failed to delete sandbox');
        setActing(false);
      }
    } catch {
      toast.error('Network error');
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-56px)]">
          <LoadingSpinner size={32} />
        </div>
      </div>
    );
  }

  if (!sandbox) return null;

  const tier = SANDBOX_TIERS[sandbox.tier as keyof typeof SANDBOX_TIERS];
  const created = new Date(sandbox.created_at);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-6xl px-6 py-8 pb-20">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 -ml-2 text-muted-foreground hover:text-foreground")}
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Sandboxes
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-2xl font-black tracking-tight text-foreground">{sandbox.name}</h1>
              <StatusBadge status={sandbox.status} />
              {tier && (
                <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {tier.label}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-5 text-sm text-muted-foreground">
              {tier && (
                <span className="flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5" />
                  {tier.cpu} vCPU · {tier.memory} GB RAM · {tier.disk} GB disk
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {created.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {sandbox.status === 'stopped' && (
              <Button
                className="gap-2 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/10"
                variant="outline"
                onClick={() => doAction('start')}
                disabled={acting}
              >
                <Play className="h-4 w-4" /> Start
              </Button>
            )}
            {sandbox.status === 'running' && (
              <Button variant="outline" className="gap-2" onClick={() => doAction('stop')} disabled={acting}>
                <Square className="h-4 w-4" /> Stop
              </Button>
            )}
            <Button
              variant="outline"
              className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/10"
              onClick={doDelete}
              disabled={acting}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        </div>

        {/* Main content — two columns on lg+ */}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
          {/* Left — Terminal (hidden behind tabs on mobile) */}
          <div className="min-w-0">
            <Tabs defaultValue="terminal" className="lg:hidden mb-4">
              <TabsList className="h-9 rounded-xl bg-secondary/60 p-1">
                <TabsTrigger value="terminal" className="h-7 gap-2 rounded-lg text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <Terminal className="h-3.5 w-3.5" /> Terminal
                </TabsTrigger>
                <TabsTrigger value="connect" className="h-7 gap-2 rounded-lg text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <Info className="h-3.5 w-3.5" /> Connect
                </TabsTrigger>
              </TabsList>
              <TabsContent value="terminal" className="mt-4">
                <TerminalEmbed sandboxId={sandbox.id} status={sandbox.status} />
              </TabsContent>
              <TabsContent value="connect" className="mt-4">
                <ConnectionInfo sandboxId={sandbox.id} status={sandbox.status} />
              </TabsContent>
            </Tabs>

            <div className="hidden lg:block">
              <TerminalEmbed sandboxId={sandbox.id} status={sandbox.status} />
            </div>
          </div>

          {/* Right sidebar — hidden on mobile (tabs above handle it) */}
          <div className="hidden lg:flex flex-col gap-5">
            <ConnectionInfo sandboxId={sandbox.id} status={sandbox.status} />

            {/* Getting started */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50 mb-4">Getting Started</h3>
              <ol className="list-decimal pl-4 space-y-3 text-sm text-muted-foreground leading-relaxed">
                <li>
                  Authenticate your AI CLI:
                  <code className="block mt-1 rounded-md bg-secondary px-2 py-1 font-mono text-xs text-foreground/70">
                    export ANTHROPIC_API_KEY=sk-ant-…
                  </code>
                </li>
                <li>Navigate to <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">/home/daytona/data</code></li>
                <li>Scan the QR or open the pairing link in the Trifecta app</li>
              </ol>
            </div>

            {/* Resources */}
            {tier && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50 mb-4">Resources</h3>
                <div className="space-y-2.5 text-sm">
                  {[
                    ['CPU', `${tier.cpu} vCPU`],
                    ['Memory', `${tier.memory} GB`],
                    ['Disk', `${tier.disk} GB`],
                    ['Plan', `${tier.label} — ${tier.price}`],
                    ['Sandbox ID', sandbox.id.slice(0, 16) + '…'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground/60 shrink-0">{k}</span>
                      <span className={`font-medium text-foreground/80 ${k === 'Sandbox ID' ? 'font-mono text-xs' : ''}`}>
                        {v}
                      </span>
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
