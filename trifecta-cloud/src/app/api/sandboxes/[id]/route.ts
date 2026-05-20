import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSandbox, deleteSandboxRecord, updateSandbox } from '@/lib/db';
import { deleteSandbox as daytonaDeleteSandbox, getSandboxStatus } from '@/lib/daytona';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sandbox = await getSandbox(id, userId);
  if (!sandbox) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (sandbox.daytona_sandbox_id) {
    const statusInfo = await getSandboxStatus(sandbox.daytona_sandbox_id);
    if (statusInfo.state !== 'unknown' && statusInfo.state !== sandbox.status) {
      let newStatus = statusInfo.state.toLowerCase();
      if (newStatus === 'started') newStatus = 'running';
      await updateSandbox(id, userId, { status: newStatus });
      sandbox.status = newStatus;
    }
  }

  return NextResponse.json({ sandbox });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sandbox = await getSandbox(id, userId);
  if (!sandbox) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    if (sandbox.daytona_sandbox_id) await daytonaDeleteSandbox(sandbox.daytona_sandbox_id);
    await deleteSandboxRecord(id, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete sandbox:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
