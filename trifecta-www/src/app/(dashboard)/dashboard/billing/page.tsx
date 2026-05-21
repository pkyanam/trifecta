'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, CreditCard, ExternalLink, ShieldCheck, Zap, Clock, Server } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CLOUD_PLANS, GPU_ADDON_TIERS, type CloudPlanId } from '@/lib/billing';

interface CloudAccount {
  plan: CloudPlanId | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  runtime_credits_monthly: number;
  runtime_credits_used: number;
  running_sandbox_limit: number;
  stored_sandbox_limit: number;
  gpu_enabled: boolean;
  idle_timeout_minutes: number;
}

interface AccountResponse {
  account: CloudAccount | null;
  isAdmin: boolean;
  creditsUsedTotal: number;
  creditsRemaining: number;
  creditsTotal: number;
}

const planList = Object.values(CLOUD_PLANS);

async function readJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: text };
  }
}

export default function BillingPage() {
  return (
    <Suspense fallback={<BillingShell />}>
      <BillingContent />
    </Suspense>
  );
}

function BillingShell() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-10 pb-20">
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading account...
        </div>
      </main>
    </div>
  );
}

function BillingContent() {
  const searchParams = useSearchParams();
  const selectedPlan = searchParams.get('plan');
  const [account, setAccount] = useState<CloudAccount | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditsUsedTotal, setCreditsUsedTotal] = useState(0);
  const [creditsTotal, setCreditsTotal] = useState(0);
  const [creditsRemaining, setCreditsRemaining] = useState(0);

  const fetchAccount = useCallback(async () => {
    const res = await fetch('/api/billing/account');
    if (!res.ok) throw new Error('Unable to load account.');
    const data = (await res.json()) as AccountResponse;
    setAccount(data.account);
    setIsAdmin(data.isAdmin);
    setCreditsUsedTotal(data.creditsUsedTotal ?? 0);
    setCreditsTotal(data.creditsTotal ?? 0);
    setCreditsRemaining(data.creditsRemaining ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      fetchAccount().catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load account.');
        setLoading(false);
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchAccount]);

  const statusLabel = useMemo(() => {
    if (isAdmin) return 'God mode';
    if (!account?.plan || account.subscription_status !== 'active') return 'No active plan';
    return `${CLOUD_PLANS[account.plan].name} active`;
  }, [account, isAdmin]);

  const startCheckout = async (plan: CloudPlanId) => {
    setBusyPlan(plan);
    setError(null);
    try {
      if (plan === 'free') {
        const res = await fetch('/api/billing/free', { method: 'POST' });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Unable to activate free trial.');
        await fetchAccount();
        setBusyPlan(null);
        return;
      }

      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Unable to start checkout.');
      if (typeof data.url !== 'string') throw new Error('Checkout did not return a redirect URL.');
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update plan.');
      setBusyPlan(null);
    }
  };

  const openPortal = async () => {
    setPortalBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Unable to open subscription settings.');
      if (typeof data.url !== 'string') throw new Error('Subscription settings did not return a redirect URL.');
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open subscription settings.');
      setPortalBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-6xl px-6 py-10 pb-20">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">Account & Subscription</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage Trifecta Cloud access, sandbox limits, and subscription settings.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current status</p>
            <div className="mt-1 flex items-center gap-2">
              {isAdmin ? <ShieldCheck className="h-4 w-4 text-emerald-500" /> : <CreditCard className="h-4 w-4 text-muted-foreground" />}
              <span className="text-sm font-bold text-foreground">{loading ? 'Loading...' : statusLabel}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">
            {error}
          </div>
        )}

        <section className="mb-8 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-black text-foreground">Subscription Settings</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Update payment details, change plans, or cancel from your account portal.
              </p>
            </div>
            <Button onClick={openPortal} disabled={portalBusy || !account?.stripe_customer_id} className="gap-2">
              {portalBusy ? 'Opening...' : 'Manage Subscription'}
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </section>

        {!isAdmin && account?.plan && account.subscription_status === 'active' && (
          <section className="mb-8 rounded-xl border border-border bg-card p-5">
            <h2 className="text-base font-black text-foreground mb-4">Launch-Hour Credits</h2>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2">
              <span className="text-sm text-muted-foreground">
                {creditsUsedTotal.toFixed(2)} of {creditsTotal} hours used this period
              </span>
              <span className={`text-sm font-semibold ${creditsRemaining <= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {creditsRemaining <= 0 ? 'Exhausted' : `${creditsRemaining.toFixed(2)} hrs remaining`}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-secondary overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all ${creditsRemaining <= 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(100, (creditsUsedTotal / Math.max(1, creditsTotal)) * 100).toFixed(1)}%` }}
              />
            </div>
            {creditsRemaining <= 0 && (
              <p className="text-xs text-muted-foreground">
                Included credits are exhausted. Running sandboxes continue at pay-as-you-go rates starting at $0.12/hr.
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Idle auto-stop: {account.idle_timeout_minutes} minutes of inactivity</span>
            </div>
          </section>
        )}

        {isAdmin && (
          <section className="mb-8 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
              <div>
                <h2 className="font-black text-foreground">Admin god mode enabled</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  This account can create and manage cloud sandboxes even without an active subscription.
                </p>
              </div>
            </div>
          </section>
        )}

        <section>
          <div className="mb-5">
            <h2 className="text-xl font-black tracking-tight text-foreground">Choose a Plan</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Start free or choose a paid plan. Sandbox creation unlocks once your account plan is active.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {planList.map((plan) => {
              const isCurrent = account?.plan === plan.id && account.subscription_status === 'active';
              const isSelected = selectedPlan === plan.id;
              return (
                <article
                  key={plan.id}
                  className={`rounded-xl border bg-card p-5 ${isSelected ? 'border-foreground/50' : 'border-border'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black text-foreground">{plan.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {plan.monthlyLaunchHours} Launch-hours / month
                      </p>
                    </div>
                    {isCurrent && <Badge>Current</Badge>}
                  </div>

                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-foreground">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">/{plan.interval}</span>
                  </div>

                  <ul className="mt-5 space-y-3 text-sm text-foreground">
                    <PlanFeature>{plan.runningSandboxLimit} running sandbox{plan.runningSandboxLimit === 1 ? '' : 'es'}</PlanFeature>
                    <PlanFeature>{plan.storedSandboxLimit} stored sandboxes</PlanFeature>
                    <PlanFeature icon={<Clock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />}>{plan.idleTimeoutMinutes}-min idle auto-stop</PlanFeature>
                    <PlanFeature>{plan.gpuEnabled ? 'GPU add-ons available' : 'CPU sandboxes only'}</PlanFeature>
                  </ul>

                  <Button
                    className="mt-6 w-full gap-2"
                    onClick={() => startCheckout(plan.id)}
                    disabled={busyPlan !== null || isCurrent}
                  >
                    {isCurrent ? 'Current Plan' : busyPlan === plan.id ? 'Opening...' : `Choose ${plan.name}`}
                    {!isCurrent && <Zap className="h-4 w-4" />}
                  </Button>
                </article>
              );
            })}
          </div>
        </section>

        {(isAdmin || (account?.gpu_enabled && account.subscription_status === 'active')) && (
          <section className="mt-8 rounded-xl border border-border bg-card p-5">
            <div className="flex gap-3 mb-4">
              <Server className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <h2 className="text-base font-black text-foreground">GPU Add-ons</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  GPU sandboxes are available as pay-as-you-go add-ons. Select a GPU tier when creating a new sandbox.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.values(GPU_ADDON_TIERS).map((gpu) => (
                <div key={gpu.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{gpu.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Pro and Team plans · billed while running</p>
                    </div>
                    <span className="text-sm font-black text-foreground shrink-0">{gpu.price}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              GPU sandboxes are billed only while running. Select a GPU tier from the &quot;New Sandbox&quot; dialog.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

function PlanFeature({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      {icon ?? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />}
      <span>{children}</span>
    </li>
  );
}
