import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { activateFreeCloudAccount } from '@/lib/db';

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const account = await activateFreeCloudAccount(userId);
    return NextResponse.json({ account });
  } catch (error) {
    console.error('Failed to activate free trial:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to activate free trial.',
      },
      { status: 500 },
    );
  }
}
