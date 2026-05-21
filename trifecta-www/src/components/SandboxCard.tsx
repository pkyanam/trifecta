'use client';

import Link from 'next/link';
import { StatusBadge } from './StatusBadge';
import { Play, Square, Trash2, ChevronRight, Clock, Cpu } from 'lucide-react';
import type { SandboxRecord } from '@/lib/types';
import { SANDBOX_TIERS } from '@/lib/config';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const STATUS_ACCENT: Record<string, string> = {
  running: 'border-t-emerald-500',
  error: 'border-t-red-500',
  creating: 'border-t-blue-500',
  starting: 'border-t-amber-500',
};

export function SandboxCard({ sandbox, onRefresh }: { sandbox: SandboxRecord; onRefresh: () => void }) {
  const [acting, setActing] = useState(false);
  const tier = SANDBOX_TIERS[sandbox.tier as keyof typeof SANDBOX_TIERS];

  const doAction = async (action: string) => {
    setActing(true);
    try {
      const res = await fetch(`/api/sandboxes/${sandbox.id}/${action}`, { method: 'POST' });
      if (res.ok) {
        toast.success(action === 'start' ? 'Sandbox started' : 'Sandbox stopped');
        onRefresh();
      } else {
        toast.error(`Failed to ${action} sandbox`);
      }
    } catch {
      toast.error('Network error');
    } finally {
      setActing(false);
    }
  };

  const doDelete = async () => {
    if (!confirm(`Delete "${sandbox.name}"? This cannot be undone.`)) return;
    setActing(true);
    try {
      const res = await fetch(`/api/sandboxes/${sandbox.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Sandbox deleted');
        onRefresh();
      } else {
        toast.error('Failed to delete sandbox');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setActing(false);
    }
  };

  const accentClass = STATUS_ACCENT[sandbox.status] ?? 'border-t-border';

  return (
    <div className={cn(
      'group relative flex flex-col rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-foreground/15 hover:shadow-md',
      'border-t-2',
      accentClass,
    )}>
      <div className="flex flex-col gap-3 p-5 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground text-[15px] leading-tight truncate">
              <Link href={`/dashboard/${sandbox.id}`} className="hover:underline underline-offset-2">
                {sandbox.name}
              </Link>
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={sandbox.status} />
              {tier && (
                <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {tier.label}
                </span>
              )}
            </div>
          </div>
          <Link
            href={`/dashboard/${sandbox.id}`}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Resource info */}
        {tier && (
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Cpu className="h-3 w-3" />
              {tier.cpu} vCPU · {tier.memory} GB
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {timeAgo(sandbox.created_at)}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-border/60 bg-secondary/30 px-4 py-3">
        <Link
          href={`/dashboard/${sandbox.id}`}
          className={cn(buttonVariants({ size: "sm" }), "flex-1 h-8 text-xs font-semibold text-center")}
        >
          Open
        </Link>

        {sandbox.status === 'stopped' && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/10"
            onClick={() => doAction('start')}
            disabled={acting}
            title="Start sandbox"
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
        )}
        {sandbox.status === 'running' && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => doAction('stop')}
            disabled={acting}
            title="Stop sandbox"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        )}

        <Button
          size="sm"
          variant="outline"
          className="h-8 w-8 p-0 text-destructive border-destructive/20 hover:bg-destructive/10"
          onClick={doDelete}
          disabled={acting}
          title="Delete sandbox"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
