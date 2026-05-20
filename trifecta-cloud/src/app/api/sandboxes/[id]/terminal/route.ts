import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSandbox } from '@/lib/db';
import { getTerminalUrl as daytonaGetTerminalUrl } from '@/lib/daytona';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sandbox = await getSandbox(id, userId);
  if (!sandbox) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!sandbox.daytona_sandbox_id) return NextResponse.json({ error: 'Sandbox not ready' }, { status: 400 });

  try {
    const url = await daytonaGetTerminalUrl(sandbox.daytona_sandbox_id);
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Failed to get terminal url:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
