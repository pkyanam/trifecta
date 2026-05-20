import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  // Service role key bypasses RLS — never expose to the browser.
  // Falls back to publishable key in local dev if service key isn't set.
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getIsAdmin(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;

  const { data, error } = await getServiceClient()
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('admin check failed:', error.message);
    return false;
  }

  return data?.role === 'admin';
}
