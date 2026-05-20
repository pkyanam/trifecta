import { createClient } from '@supabase/supabase-js';
import type { SandboxRecord } from './types';

// Service-level client for API routes — bypasses RLS when service role key is set,
// otherwise falls back to the publishable (anon) key and relies on query-level user_id filtering.
function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

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
