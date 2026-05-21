import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getIsAdmin } from '@/lib/admin';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = await getIsAdmin();
  // Return userId so the UI can display it for admin provisioning.
  // This is the user's own ID — safe to expose to themselves.
  return NextResponse.json({ isAdmin, userId });
}
