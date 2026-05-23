'use client';

import { useEffect, useState } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { Terminal } from 'lucide-react';

function TerminalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[540px] flex-col items-center justify-center gap-3 overflow-hidden rounded-xl bg-black">
      {children}
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
    <div className="flex min-h-[540px] flex-col overflow-hidden rounded-xl bg-black">
      <iframe
        src={url}
        className="min-h-[540px] flex-1 border-none bg-black"
        title="Terminal"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
