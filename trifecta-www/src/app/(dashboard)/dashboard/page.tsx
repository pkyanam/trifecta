'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { SandboxCard } from '@/components/SandboxCard';
import { CreateSandboxModal } from '@/components/CreateSandboxModal';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Box, Play, CircleDot, AlertTriangle, CreditCard, ShieldCheck, Clock } from 'lucide-react';
import type { CloudAccount, SandboxRecord } from '@/lib/types';
import { ACTIVE_SUBSCRIPTION_STATUSES, CLOUD_PLANS } from '@/lib/billing';

interface AccountInfo {
  account: CloudAccount | null;
  isAdmin: boolean;
  creditsUsedTotal: number;
  creditsRemaining: number;
  creditsTotal: number;
}

export default function Dashboard() {
  const [sandboxes, setSandboxes] = useState<SandboxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [account, setAccount] = useState<CloudAccount | null>(null);
  const [creditInfo, setCreditInfo] = useState<Omit<AccountInfo, 'account' | 'isAdmin'> | null>(null);
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
    const timeoutId = window.setTimeout(fetchSandboxes, 0);
    const id = setInterval(fetchSandboxes, 12000);
    return () => {
      window.clearTimeout(timeoutId);
      clearInterval(id);
    };
  }, [fetchSandboxes]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      fetch('/api/billing/account')
        .then((r) => r.json())
        .then((d: AccountInfo) => {
          setIsAdmin(d.isAdmin === true);
          setAccount(d.account ?? null);
          setCreditInfo({
            creditsUsedTotal: d.creditsUsedTotal ?? 0,
            creditsRemaining: d.creditsRemaining ?? 0,
            creditsTotal: d.creditsTotal ?? 0,
          });
        })
        .catch(() => setIsAdmin(false));
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const running = sandboxes.filter((s) => s.status === 'running');
  const stopped = sandboxes.filter((s) => s.status === 'stopped');
  const errored = sandboxes.filter((s) => s.status === 'error');

  const tabData = [
    { value: 'all',     label: 'All',     items: sandboxes,          count: sandboxes.length },
    { value: 'running', label: 'Running', items: running,            count: running.length },
    { value: 'stopped', label: 'Stopped', items: stopped,            count: stopped.length },
    ...(errored.length > 0 ? [{ value: 'error', label: 'Error', items: errored, count: errored.length }] : []),
  ];
  const hasActivePlan = ACTIVE_SUBSCRIPTION_STATUSES.has(account?.subscription_status ?? '');
  const canCreate = isAdmin || hasActivePlan;
  const currentPlan = account?.plan ? CLOUD_PLANS[account.plan as keyof typeof CLOUD_PLANS] : null;
  const allowedTiers = isAdmin
    ? ['launch', 'build', 'max-cpu']
    : [...(currentPlan?.allowedSandboxTiers ?? [])];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-6xl px-6 py-10 pb-20">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">Sandboxes</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Isolated cloud environments for AI coding agents
            </p>
          </div>
          {canCreate && (
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

        {/* Account notice */}
        {!loading && (
          <div className="mb-6 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3 flex-1 min-w-0">
                {isAdmin ? (
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                ) : (
                  <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {isAdmin ? 'Admin god mode' : hasActivePlan && currentPlan ? `${currentPlan.name} plan` : 'Choose a cloud plan'}
                  </p>
                  {!isAdmin && hasActivePlan && currentPlan && creditInfo ? (
                    <div className="mt-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 mb-1">
                        <span className="text-xs text-muted-foreground">
                          {creditInfo.creditsUsedTotal.toFixed(1)} / {creditInfo.creditsTotal} Launch-hours used
                        </span>
                        {creditInfo.creditsRemaining <= 0 && (
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Credits exhausted — overages apply</span>
                        )}
                        {creditInfo.creditsRemaining > 0 && creditInfo.creditsRemaining < creditInfo.creditsTotal * 0.1 && (
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">&lt;10% remaining</span>
                        )}
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            creditInfo.creditsRemaining <= 0 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, (creditInfo.creditsUsedTotal / Math.max(1, creditInfo.creditsTotal)) * 100).toFixed(1)}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>Idle auto-stop: {currentPlan.idleTimeoutMinutes} min</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {isAdmin
                        ? 'This account can create and manage all sandbox sizes.'
                        : 'Sandbox creation unlocks after a plan is active on your account.'}
                    </p>
                  )}
                </div>
              </div>
              <Link
                href="/dashboard/billing"
                className={`inline-flex h-8 shrink-0 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors ${
                  canCreate
                    ? 'border border-border bg-background text-foreground hover:bg-muted'
                    : 'bg-primary text-primary-foreground hover:bg-primary/80'
                }`}
              >
                {canCreate ? 'Manage Account' : 'Choose Plan'}
              </Link>
            </div>
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
            {canCreate ? (
              <>
                <p className="text-sm text-muted-foreground mt-2 mb-5">Create your first sandbox to get started.</p>
                <Button onClick={() => setShowModal(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Sandbox
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mt-2 mb-5">Choose a plan to unlock cloud sandboxes.</p>
                <Link
                  href="/dashboard/billing"
                  className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
                >
                  Choose Plan
                </Link>
              </>
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

      {showModal && canCreate && (
        <CreateSandboxModal
          allowedTiers={allowedTiers}
          gpuEnabled={isAdmin || (account?.gpu_enabled ?? false)}
          onClose={() => setShowModal(false)}
          onSuccess={fetchSandboxes}
        />
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
