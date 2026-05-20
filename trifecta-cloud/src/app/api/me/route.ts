import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getIsAdmin } from '@/lib/admin';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = await getIsAdmin();
  return NextResponse.json({ isAdmin });
}
