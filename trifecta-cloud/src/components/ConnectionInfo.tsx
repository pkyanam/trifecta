'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';
import { LoadingSpinner } from './LoadingSpinner';
import { Copy, Check, ExternalLink, Wifi, WifiOff } from 'lucide-react';
import type { ConnectionInfoResponse } from '@/lib/types';

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className="btn btn-sm btn-icon" onClick={copy} title={`Copy ${label ?? ''}`} style={{ flexShrink: 0 }}>
      {copied ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
    </button>
  );
}

export function ConnectionInfo({ sandboxId, status }: { sandboxId: string; status: string }) {
  const [info, setInfo] = useState<ConnectionInfoResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (status !== 'running') { setInfo(null); setQrDataUrl(''); return; }

    let mounted = true;
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
    load();
    return () => { mounted = false; };
  }, [sandboxId, status]);

  if (status !== 'running') {
    return (
      <div className="glass" style={{ padding: '24px', textAlign: 'center' }}>
        <WifiOff size={28} style={{ color: 'var(--text-3)', marginBottom: '12px' }} />
        <p style={{ color: 'var(--text-2)', fontSize: '13px' }}>
          Start the sandbox to view connection info
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass" style={{ padding: '24px', textAlign: 'center', color: 'var(--danger)', fontSize: '13px' }}>
        {error}
      </div>
    );
  }

  if (!info) {
    return (
      <div className="glass" style={{ padding: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', minHeight: '120px' }}>
        <LoadingSpinner size={20} />
        <span style={{ color: 'var(--text-2)', fontSize: '13px' }}>Loading connection info…</span>
      </div>
    );
  }

  return (
    <div className="glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Wifi size={16} color="var(--success)" />
        <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Connect via Trifecta</h3>
      </div>

      {/* QR code — big and prominent */}
      {qrDataUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div className="qr-container">
            <Image src={qrDataUrl} alt="Scan to pair" width={200} height={200} unoptimized style={{ display: 'block' }} />
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-3)', textAlign: 'center' }}>
            Scan with Trifecta mobile app to pair
          </p>
        </div>
      )}

      {/* Open in web app */}
      <a
        href={info.pairingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-primary"
        style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}
      >
        <ExternalLink size={14} />
        Open in Trifecta Web App
      </a>

      {/* Pairing token */}
      <div>
        <p className="section-title">Pairing Token</p>
        <div className="copy-row">
          <div className="mono">{info.pairingToken}</div>
          <CopyButton text={info.pairingToken ?? ''} label="token" />
        </div>
      </div>

      {/* Pairing URL */}
      <div>
        <p className="section-title">Pairing URL</p>
        <div className="copy-row">
          <div className="mono" style={{ fontSize: '11px' }}>{info.pairingUrl}</div>
          <CopyButton text={info.pairingUrl} label="pairing URL" />
        </div>
      </div>

      {/* Server URL (advanced) */}
      <details style={{ fontSize: '12px' }}>
        <summary style={{ color: 'var(--text-3)', cursor: 'pointer', userSelect: 'none', listStyle: 'none' }}>
          Advanced: server URL
        </summary>
        <div className="copy-row" style={{ marginTop: '8px' }}>
          <div className="mono" style={{ fontSize: '11px' }}>{info.trifectaUrl}</div>
          <CopyButton text={info.trifectaUrl} label="server URL" />
        </div>
      </details>
    </div>
  );
}
