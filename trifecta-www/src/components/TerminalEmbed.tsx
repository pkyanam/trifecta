'use client';

import { useEffect, useState } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { ExternalLink, Terminal } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

function TerminalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-[#0a0e17] min-h-[540px]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-black/30 shrink-0">
        <span className="flex items-center gap-2 text-sm text-white/40">
          <Terminal className="h-3.5 w-3.5" />
          Terminal
        </span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        {children}
      </div>
    </div>
  );
}

export function TerminalEmbed({ sandboxId, status }: { sandboxId: string; status: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (status !== 'running') {
      const id = window.setTimeout(() => {
        if (mounted) setUrl(null);
      }, 0);
      return () => {
        mounted = false;
        window.clearTimeout(id);
      };
    }

    const load = async () => {
      try {
        setError(null);
        const res = await fetch(`/api/sandboxes/${sandboxId}/terminal`);
        if (res.ok && mounted) setUrl((await res.json()).url);
        else if (mounted) setError('Failed to load terminal');
      } catch {
        if (mounted) setError('Connection error');
      }
    };

    const id = window.setTimeout(load, 0);
    return () => {
      mounted = false;
      window.clearTimeout(id);
    };
  }, [sandboxId, status]);

  if (status === 'creating') return (
    <TerminalShell>
      <LoadingSpinner size={28} />
      <p className="text-sm text-white/40">Provisioning sandbox…</p>
      <p className="text-xs text-white/20">This takes about 30–60 seconds</p>
    </TerminalShell>
  );

  if (status === 'stopped') return (
    <TerminalShell>
      <Terminal className="h-8 w-8 text-white/10" />
      <p className="text-sm text-white/40">Sandbox is stopped</p>
      <p className="text-xs text-white/20">Start the sandbox to access the terminal</p>
    </TerminalShell>
  );

  if (error) return (
    <TerminalShell>
      <p className="text-sm text-red-400">{error}</p>
    </TerminalShell>
  );

  if (!url) return (
    <TerminalShell>
      <LoadingSpinner size={24} />
    </TerminalShell>
  );

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-[#0a0e17] min-h-[540px]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-black/30 shrink-0">
        <span className="flex items-center gap-2 text-sm text-white/50">
          <span className="flex gap-1.5 mr-1">
            {['bg-red-500', 'bg-amber-500', 'bg-emerald-500'].map((c, i) => (
              <span key={i} className={`h-2.5 w-2.5 rounded-full ${c} opacity-70`} />
            ))}
          </span>
          <Terminal className="h-3.5 w-3.5" />
          daytona@sandbox
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "ghost", size: "sm" }) + " h-6 gap-1.5 text-xs text-white/40 hover:text-white/70 hover:bg-white/10 px-2"}
        >
          <ExternalLink className="h-3 w-3" /> Pop out
        </a>
      </div>
      <iframe
        src={url}
        className="flex-1 min-h-[500px] border-none"
        title="Terminal"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
