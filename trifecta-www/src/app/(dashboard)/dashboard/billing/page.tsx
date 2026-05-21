'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, CreditCard, ExternalLink, ShieldCheck, Zap } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CLOUD_PLANS, type CloudPlanId } from '@/lib/billing';

interface CloudAccount {
  plan: CloudPlanId | null;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  runtime_credits_monthly: number;
  running_sandbox_limit: number;
  stored_sandbox_limit: number;
  gpu_enabled: boolean;
}

interface AccountResponse {
  account: CloudAccount | null;
  isAdmin: boolean;
}

const planList = Object.values(CLOUD_PLANS);

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

  const fetchAccount = useCallback(async () => {
    const res = await fetch('/api/billing/account');
    if (!res.ok) throw new Error('Unable to load account.');
    const data = (await res.json()) as AccountResponse;
    setAccount(data.account);
    setIsAdmin(data.isAdmin);
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
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to start checkout.');
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start checkout.');
      setBusyPlan(null);
    }
  };

  const openPortal = async () => {
    setPortalBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to open subscription settings.');
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
            <Button onClick={openPortal} disabled={portalBusy || !account?.plan || !account?.subscription_status} className="gap-2">
              {portalBusy ? 'Opening...' : 'Manage Subscription'}
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </section>

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
              Plans unlock sandbox creation after payment succeeds and the subscription is reflected on your account.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
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
      </main>
    </div>
  );
}

function PlanFeature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      <span>{children}</span>
    </li>
  );
}
