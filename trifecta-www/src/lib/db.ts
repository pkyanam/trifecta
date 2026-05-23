import { createClient } from '@supabase/supabase-js';
import type { CloudAccount, SandboxRecord } from './types';
import {
  CLOUD_PLANS,
  GPU_ADDON_TIERS,
  isSandboxSizeTier,
  sessionCredits,
  sessionGpuCost,
  sessionRuntimeHours,
  type CloudPlanId,
  type GpuAddonTier,
} from './billing';

// Service-level client for API routes — bypasses RLS when service role key is set,
// otherwise falls back to the publishable (anon) key and relies on query-level user_id filtering.
function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export { getClient as getSupabaseServiceClient };

function normalizeSandboxRecord(row: Record<string, unknown>): SandboxRecord {
  return {
    ...row,
    disk_gib: typeof row.disk_gib === 'number' ? row.disk_gib : 10,
    gpu_addon: typeof row.gpu_addon === 'string' ? row.gpu_addon : null,
  } as SandboxRecord;
}

function normalizeSandboxRecords(rows: Record<string, unknown>[] | null): SandboxRecord[] {
  return (rows ?? []).map(normalizeSandboxRecord);
}

function isMissingColumnError(error: { code?: string; message?: string } | null, column: string): boolean {
  return error?.code === 'PGRST204' && (error.message ?? '').includes(`'${column}'`);
}

export async function getAllSandboxes(userId: string): Promise<SandboxRecord[]> {
  const { data, error } = await getClient()
    .from('sandboxes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return normalizeSandboxRecords(data);
}

export async function getSandbox(id: string, userId: string): Promise<SandboxRecord | null> {
  const { data, error } = await getClient()
    .from('sandboxes')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeSandboxRecord(data) : null;
}

export async function createSandbox(data: {
  name: string;
  tier: string;
  disk_gib?: number;
  gpu_addon?: string | null;
  pairing_token: string;
  user_id: string;
}): Promise<SandboxRecord> {
  const insert = { ...data, disk_gib: data.disk_gib ?? 10, status: 'creating' };
  const { data: row, error } = await getClient()
    .from('sandboxes')
    .insert(insert)
    .select()
    .single();
  if (isMissingColumnError(error, 'disk_gib') || isMissingColumnError(error, 'gpu_addon')) {
    const fallbackInsert = {
      name: insert.name,
      tier: insert.tier,
      pairing_token: insert.pairing_token,
      user_id: insert.user_id,
      status: insert.status,
    };
    const { data: fallbackRow, error: fallbackError } = await getClient()
      .from('sandboxes')
      .insert(fallbackInsert)
      .select()
      .single();
    if (fallbackError) throw fallbackError;
    return normalizeSandboxRecord(fallbackRow);
  }
  if (error) throw error;
  return normalizeSandboxRecord(row);
}

export async function updateSandbox(
  id: string,
  userId: string,
  data: Partial<SandboxRecord>
): Promise<void> {
  const { error } = await getClient()
    .from('sandboxes')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function deleteSandboxRecord(id: string, userId: string): Promise<void> {
  const { error } = await getClient()
    .from('sandboxes')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function getCloudAccount(userId: string): Promise<CloudAccount | null> {
  const { data, error } = await getClient()
    .from('cloud_accounts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? { gpu_usage_usd: 0, ...data } as CloudAccount : null;
}

export async function getCloudAccountByStripeCustomer(stripeCustomerId: string): Promise<CloudAccount | null> {
  const { data, error } = await getClient()
    .from('cloud_accounts')
    .select('*')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();
  if (error) throw error;
  return data ? { gpu_usage_usd: 0, ...data } as CloudAccount : null;
}

export async function upsertCloudAccount(data: Partial<CloudAccount> & { user_id: string }): Promise<CloudAccount> {
  const { data: row, error } = await getClient()
    .from('cloud_accounts')
    .upsert({ ...data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return { gpu_usage_usd: 0, ...row } as CloudAccount;
}

export async function upsertCloudAccountForPlan(data: {
  user_id: string;
  plan: CloudPlanId | null;
  subscription_status: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  reset_credits?: boolean;
}): Promise<CloudAccount> {
  const plan = data.plan ? CLOUD_PLANS[data.plan] : null;
  const base: Partial<CloudAccount> & { user_id: string } = {
    user_id: data.user_id,
    plan: data.plan,
    subscription_status: data.subscription_status,
    stripe_customer_id: data.stripe_customer_id,
    stripe_subscription_id: data.stripe_subscription_id,
    current_period_end: data.current_period_end,
    cancel_at_period_end: data.cancel_at_period_end ?? false,
    runtime_credits_monthly: plan?.monthlyLaunchHours ?? 0,
    running_sandbox_limit: plan?.runningSandboxLimit ?? 0,
    stored_sandbox_limit: plan?.storedSandboxLimit ?? 0,
    gpu_enabled: plan?.gpuEnabled ?? false,
    idle_timeout_minutes: plan?.idleTimeoutMinutes ?? 15,
  };
  if (data.reset_credits) {
    base.runtime_credits_used = 0;
    base.gpu_usage_usd = 0;
  }
  return upsertCloudAccount(base);
}

export async function activateFreeCloudAccount(userId: string): Promise<CloudAccount> {
  const existing = await getCloudAccount(userId);
  if (existing?.plan && existing.subscription_status === 'active') {
    return existing;
  }

  return upsertCloudAccountForPlan({
    user_id: userId,
    plan: 'free',
    subscription_status: 'active',
  });
}

export async function saveCheckoutSession(data: {
  stripe_checkout_session_id: string;
  user_id: string;
  plan: CloudPlanId;
  stripe_customer_id?: string | null;
}): Promise<void> {
  const { error } = await getClient()
    .from('billing_checkout_sessions')
    .upsert(data, { onConflict: 'stripe_checkout_session_id' });
  if (error) throw error;
}

export async function getCheckoutSession(
  stripeCheckoutSessionId: string,
): Promise<{ user_id: string; plan: CloudPlanId; stripe_customer_id: string | null } | null> {
  const { data, error } = await getClient()
    .from('billing_checkout_sessions')
    .select('user_id, plan, stripe_customer_id')
    .eq('stripe_checkout_session_id', stripeCheckoutSessionId)
    .maybeSingle();
  if (error) throw error;
  return data as { user_id: string; plan: CloudPlanId; stripe_customer_id: string | null } | null;
}

export async function addRuntimeCreditsUsed(userId: string, credits: number): Promise<void> {
  const { error } = await getClient().rpc('increment_credits_used', {
    p_user_id: userId,
    p_credits: credits,
  });
  if (error) throw error;
}

export async function addGpuUsageUsd(userId: string, amountUsd: number): Promise<void> {
  if (amountUsd <= 0) return;
  const { error } = await getClient().rpc('increment_gpu_usage_usd', {
    p_user_id: userId,
    p_amount_usd: amountUsd,
  });
  if (error) throw error;
}

export async function startSandboxUsageSession(sandbox: SandboxRecord, startedAt: string): Promise<void> {
  const tierKey = isSandboxSizeTier(sandbox.tier) ? sandbox.tier : 'launch';
  const gpuAddon = sandbox.gpu_addon && sandbox.gpu_addon in GPU_ADDON_TIERS ? sandbox.gpu_addon : null;
  const { error } = await getClient()
    .from('sandbox_usage_sessions')
    .insert({
      user_id: sandbox.user_id,
      sandbox_id: sandbox.id,
      sandbox_tier: tierKey,
      gpu_addon: gpuAddon,
      started_at: startedAt,
    });
  if (error && error.code !== '23505') throw error;
}

export async function finishSandboxUsageSession(
  sandbox: SandboxRecord,
  endedAt = new Date().toISOString(),
): Promise<{ launchHours: number; runtimeHours: number; gpuCostUsd: number }> {
  if (!sandbox.started_at) {
    return { launchHours: 0, runtimeHours: 0, gpuCostUsd: 0 };
  }

  const tierKey = isSandboxSizeTier(sandbox.tier) ? sandbox.tier : 'launch';
  const gpuAddon = sandbox.gpu_addon && sandbox.gpu_addon in GPU_ADDON_TIERS
    ? (sandbox.gpu_addon as GpuAddonTier)
    : null;
  const runtimeHours = sessionRuntimeHours(sandbox.started_at, endedAt);
  const launchHours = sessionCredits(tierKey, sandbox.started_at, endedAt);
  const gpuCostUsd = sessionGpuCost(gpuAddon, sandbox.started_at, endedAt);
  const client = getClient();

  const { data: activeSession, error: activeError } = await client
    .from('sandbox_usage_sessions')
    .select('id')
    .eq('sandbox_id', sandbox.id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeError) throw activeError;

  if (activeSession?.id) {
    const { error } = await client
      .from('sandbox_usage_sessions')
      .update({
        ended_at: endedAt,
        runtime_hours: runtimeHours,
        launch_hours: launchHours,
        gpu_cost_usd: gpuCostUsd,
      })
      .eq('id', activeSession.id);
    if (error) throw error;
  } else {
    const { error } = await client
      .from('sandbox_usage_sessions')
      .insert({
        user_id: sandbox.user_id,
        sandbox_id: sandbox.id,
        sandbox_tier: tierKey,
        gpu_addon: gpuAddon,
        started_at: sandbox.started_at,
        ended_at: endedAt,
        runtime_hours: runtimeHours,
        launch_hours: launchHours,
        gpu_cost_usd: gpuCostUsd,
      });
    if (error) throw error;
  }

  await Promise.all([
    addRuntimeCreditsUsed(sandbox.user_id, launchHours),
    addGpuUsageUsd(sandbox.user_id, gpuCostUsd),
  ]);

  return { launchHours, runtimeHours, gpuCostUsd };
}

export async function getAllRunningSandboxes(): Promise<SandboxRecord[]> {
  const { data, error } = await getClient()
    .from('sandboxes')
    .select('*')
    .eq('status', 'running');
  if (error) throw error;
  return normalizeSandboxRecords(data);
}
