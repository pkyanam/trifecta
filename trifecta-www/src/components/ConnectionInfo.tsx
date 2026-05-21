'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';
import { LoadingSpinner } from './LoadingSpinner';
import { Copy, Check, ExternalLink, Wifi, WifiOff } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ConnectionInfoResponse } from '@/lib/types';

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={copy} title={`Copy ${label ?? ''}`}>
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

export function ConnectionInfo({ sandboxId, status }: { sandboxId: string; status: string }) {
  const [info, setInfo] = useState<ConnectionInfoResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    if (status !== 'running') {
      const id = window.setTimeout(() => {
        if (!mounted) return;
        setInfo(null);
        setQrDataUrl('');
      }, 0);
      return () => {
        mounted = false;
        window.clearTimeout(id);
      };
    }

    const load = async () => {
      try {
        setError('');
        const res = await fetch(`/api/sandboxes/${sandboxId}/connect`);
        if (!res.ok) { setError('Failed to load connection info'); return; }
        const data: ConnectionInfoResponse = await res.json();
        if (!mounted) return;
        setInfo(data);
        if (data.pairingUrl) {
          const qr = await QRCode.toDataURL(data.pairingUrl, {
            color: { dark: '#000000', light: '#ffffff' },
            margin: 2,
            width: 200,
          });
          if (mounted) setQrDataUrl(qr);
        }
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

  if (status !== 'running') {
    return (
      <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-3 text-center">
        <WifiOff className="h-7 w-7 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Start the sandbox to view connection info</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!info) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 flex items-center justify-center gap-3 min-h-[120px]">
        <LoadingSpinner size={20} />
        <span className="text-sm text-muted-foreground">Loading connection info…</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Wifi className="h-4 w-4 text-emerald-500" />
        <h3 className="text-sm font-semibold text-foreground">Connect via Trifecta</h3>
      </div>

      {qrDataUrl && (
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-xl border border-border bg-white p-2">
            <Image src={qrDataUrl} alt="Scan to pair" width={180} height={180} unoptimized />
          </div>
          <p className="text-xs text-muted-foreground text-center">Scan with Trifecta mobile app to pair</p>
        </div>
      )}

      <a
        href={info.webPairingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants(), "w-full gap-2 justify-center")}
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Open in Trifecta Web App
      </a>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50">Pairing Token</p>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
          <code className="flex-1 truncate font-mono text-xs text-foreground/80">{info.pairingToken}</code>
          <CopyButton text={info.pairingToken ?? ''} label="token" />
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50">Pairing URL</p>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
          <code className="flex-1 truncate font-mono text-[11px] text-foreground/80">{info.pairingUrl}</code>
          <CopyButton text={info.pairingUrl} label="pairing URL" />
        </div>
        <p className="text-[11px] text-muted-foreground/50">
          Paste into iOS / Android / desktop app → Settings → Connections
        </p>
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none text-muted-foreground/50 hover:text-muted-foreground list-none">
          ▸ Advanced: raw server URL
        </summary>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
          <code className="flex-1 truncate font-mono text-[11px] text-foreground/80">{info.trifectaUrl}</code>
          <CopyButton text={info.trifectaUrl} label="server URL" />
        </div>
      </details>
    </div>
  );
}
