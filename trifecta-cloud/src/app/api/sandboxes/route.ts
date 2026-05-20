import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAllSandboxes, createSandbox as dbCreateSandbox, updateSandbox } from '@/lib/db';
import { createSandbox as daytonaCreateSandbox } from '@/lib/daytona';
import { SandboxTier } from '@/lib/config';
import { z } from 'zod';
import crypto from 'crypto';

const createSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens only'),
  tier: z.enum(['starter', 'pro', 'team'] as const),
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const sandboxes = await getAllSandboxes(userId);
    return NextResponse.json({ sandboxes });
  } catch (error) {
    console.error('Failed to list sandboxes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, tier } = createSchema.parse(body);
    const pairingToken = crypto.randomBytes(9).toString('base64url');

    const record = await dbCreateSandbox({ name, tier, pairing_token: pairingToken, user_id: userId });

    daytonaCreateSandbox({ name, tier: tier as SandboxTier, pairingToken })
      .then((info) => updateSandbox(record.id, userId, {
        daytona_sandbox_id: info.daytonaSandboxId,
        status: 'running',
      }))
      .catch((err) => {
        console.error('Background sandbox creation failed:', err);
        updateSandbox(record.id, userId, { status: 'error' });
      });

    return NextResponse.json({ sandbox: record });
  } catch (error) {
    console.error('Failed to create sandbox:', error);
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
