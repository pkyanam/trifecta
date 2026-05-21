import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { activateFreeCloudAccount } from '@/lib/db';

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const account = await activateFreeCloudAccount(userId);
  return NextResponse.json({ account });
}
