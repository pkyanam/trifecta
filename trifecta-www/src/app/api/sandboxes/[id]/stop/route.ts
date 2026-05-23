import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { finishSandboxUsageSession, getSandbox, updateSandbox } from '@/lib/db';
import { stopSandbox as daytonaStopSandbox } from '@/lib/daytona';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sandbox = await getSandbox(id, userId);
  if (!sandbox) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!sandbox.daytona_sandbox_id) return NextResponse.json({ error: 'Sandbox not ready' }, { status: 400 });

  try {
    await daytonaStopSandbox(sandbox.daytona_sandbox_id);

    const updates: Record<string, unknown> = { status: 'stopped', started_at: null };

    await finishSandboxUsageSession(sandbox);
    await updateSandbox(id, userId, updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to stop sandbox:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
