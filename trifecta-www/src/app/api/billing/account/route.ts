import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getCloudAccount } from '@/lib/db';
import { getIsAdmin } from '@/lib/admin';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [account, isAdmin] = await Promise.all([
    getCloudAccount(userId),
    getIsAdmin(),
  ]);

  return NextResponse.json({
    account,
    isAdmin,
  });
}
