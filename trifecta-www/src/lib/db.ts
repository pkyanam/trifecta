import { createClient } from '@supabase/supabase-js';
import type { CloudAccount, SandboxRecord } from './types';
import { CLOUD_PLANS, type CloudPlanId } from './billing';

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

export async function getAllSandboxes(userId: string): Promise<SandboxRecord[]> {
  const { data, error } = await getClient()
    .from('sandboxes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SandboxRecord[];
}

export async function getSandbox(id: string, userId: string): Promise<SandboxRecord | null> {
  const { data, error } = await getClient()
    .from('sandboxes')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as SandboxRecord | null;
}

export async function createSandbox(data: {
  name: string;
  tier: string;
  pairing_token: string;
  user_id: string;
}): Promise<SandboxRecord> {
  const { data: row, error } = await getClient()
    .from('sandboxes')
    .insert({ ...data, status: 'creating' })
    .select()
    .single();
  if (error) throw error;
  return row as SandboxRecord;
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
  return data as CloudAccount | null;
}

export async function getCloudAccountByStripeCustomer(stripeCustomerId: string): Promise<CloudAccount | null> {
  const { data, error } = await getClient()
    .from('cloud_accounts')
    .select('*')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();
  if (error) throw error;
  return data as CloudAccount | null;
}

export async function upsertCloudAccount(data: Partial<CloudAccount> & { user_id: string }): Promise<CloudAccount> {
  const { data: row, error } = await getClient()
    .from('cloud_accounts')
    .upsert({ ...data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return row as CloudAccount;
}

export async function upsertCloudAccountForPlan(data: {
  user_id: string;
  plan: CloudPlanId | null;
  subscription_status: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
}): Promise<CloudAccount> {
  const plan = data.plan ? CLOUD_PLANS[data.plan] : null;
  return upsertCloudAccount({
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
