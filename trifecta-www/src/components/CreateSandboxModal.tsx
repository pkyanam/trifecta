'use client';

import { useState } from 'react';
import { Zap, Rocket, Gauge, Server } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  GPU_ADDON_TIERS, type GpuAddonTier,
  DISK_PRESETS, DISK_MIN_GIB, DISK_MAX_GIB, extraStorageCostPerMonth,
} from '@/lib/billing';

const CPU_TIERS = [
  { id: 'launch',  label: 'Launch',  specs: '1 vCPU · 2 GiB RAM · 10 GiB', icon: Zap,    price: '$0.12/hr' },
  { id: 'build',   label: 'Build',   specs: '2 vCPU · 4 GiB RAM · 10 GiB', icon: Rocket, price: '$0.24/hr' },
  { id: 'max-cpu', label: 'Max CPU', specs: '4 vCPU · 8 GiB RAM · 10 GiB', icon: Gauge,  price: '$0.48/hr' },
];

const GPU_TIERS = Object.values(GPU_ADDON_TIERS).map((g) => ({
  id: g.id,
  label: g.label,
  specs: 'GPU-accelerated · 10 GiB disk',
  icon: Server,
  price: g.price,
}));

export function CreateSandboxModal({
  onClose,
  onSuccess,
  allowedTiers = CPU_TIERS.map((tier) => tier.id),
  gpuEnabled = false,
}: {
  onClose: () => void;
  onSuccess: () => void;
  allowedTiers?: string[];
  gpuEnabled?: boolean;
}) {
  const [name, setName] = useState('');
  const [tier, setTier] = useState(allowedTiers[0] ?? 'launch');
  const [gpuAddon, setGpuAddon] = useState<GpuAddonTier | null>(null);
  const [diskGiB, setDiskGiB] = useState(10);
  const [customDisk, setCustomDisk] = useState(false);
  const [customDiskInput, setCustomDiskInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/sandboxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, tier, gpuAddon, diskGiB }),
      });
      if (res.ok) {
        toast.success('Sandbox created');
        onSuccess();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to create sandbox');
      }
    } catch {
      toast.error('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md gap-6">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">New Sandbox</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="space-y-2">
            <Label htmlFor="sandbox-name" className="text-sm font-semibold">
              Sandbox Name
            </Label>
            <Input
              id="sandbox-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent-env"
              required
              pattern="[a-z0-9-]+"
              title="Lowercase letters, numbers, and hyphens only"
              autoFocus
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and hyphens only</p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">CPU Tier</Label>
            <div className="flex flex-col gap-2">
              {CPU_TIERS.filter((t) => allowedTiers.includes(t.id)).map((t) => {
                const Icon = t.icon;
                const selected = tier === t.id;
                return (
                  <label
                    key={t.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-all',
                      selected
                        ? 'border-foreground/40 bg-foreground/5'
                        : 'border-border bg-card hover:border-foreground/20',
                    )}
                  >
                    <input
                      type="radio"
                      name="tier"
                      value={t.id}
                      checked={selected}
                      onChange={() => setTier(t.id)}
                      className="sr-only"
                    />
                    <div className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                      selected ? 'border-foreground/20 bg-foreground/10' : 'border-border bg-secondary',
                    )}>
                      <Icon className={cn('h-4 w-4', selected ? 'text-foreground' : 'text-muted-foreground')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cn('text-sm font-semibold', selected ? 'text-foreground' : 'text-muted-foreground')}>
                        {t.label}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{t.specs}</div>
                    </div>
                    <div className={cn('text-sm font-semibold shrink-0', selected ? 'text-foreground' : 'text-muted-foreground/60')}>
                      {t.price}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Disk storage */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label className="text-sm font-semibold">Storage</Label>
              <span className="text-xs text-muted-foreground">
                {extraStorageCostPerMonth(diskGiB) === 0
                  ? 'Included'
                  : `+$${extraStorageCostPerMonth(diskGiB).toFixed(2)}/mo`}
              </span>
            </div>

            {/* Preset chips */}
            <div className="flex flex-wrap gap-2">
              {DISK_PRESETS.map((p) => {
                const active = !customDisk && diskGiB === p.gib;
                return (
                  <button
                    key={p.gib}
                    type="button"
                    onClick={() => { setDiskGiB(p.gib); setCustomDisk(false); }}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all',
                      active
                        ? 'border-foreground/40 bg-foreground/10 text-foreground'
                        : 'border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground',
                    )}
                  >
                    {p.label}
                    {p.tag && (
                      <span className="ml-1.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                        {p.tag}
                      </span>
                    )}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => { setCustomDisk(true); setCustomDiskInput(String(diskGiB)); }}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all',
                  customDisk
                    ? 'border-foreground/40 bg-foreground/10 text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground',
                )}
              >
                Custom
              </button>
            </div>

            {/* Custom input */}
            {customDisk && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={DISK_MIN_GIB}
                  max={DISK_MAX_GIB}
                  step={1}
                  value={customDiskInput}
                  onChange={(e) => {
                    setCustomDiskInput(e.target.value);
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= DISK_MIN_GIB && val <= DISK_MAX_GIB) {
                      setDiskGiB(val);
                    }
                  }}
                  className="font-mono w-28"
                  autoFocus
                />
                <span className="text-sm text-muted-foreground">GiB</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {DISK_MIN_GIB}–{DISK_MAX_GIB} GiB
                </span>
              </div>
            )}

            {/* Slider for preset range */}
            {!customDisk && (
              <div className="pt-1">
                <input
                  type="range"
                  min={DISK_MIN_GIB}
                  max={200}
                  step={5}
                  value={diskGiB}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setDiskGiB(val);
                    // deselect any preset if value doesn't match
                  }}
                  className="w-full accent-foreground"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>10 GiB</span>
                  <span className="font-semibold text-foreground">{diskGiB} GiB selected</span>
                  <span>200 GiB</span>
                </div>
              </div>
            )}
          </div>

          {gpuEnabled && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">GPU Add-on <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <div className="flex flex-col gap-2">
                <label className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-all',
                  gpuAddon === null
                    ? 'border-foreground/40 bg-foreground/5'
                    : 'border-border bg-card hover:border-foreground/20',
                )}>
                  <input
                    type="radio"
                    name="gpuAddon"
                    value=""
                    checked={gpuAddon === null}
                    onChange={() => setGpuAddon(null)}
                    className="sr-only"
                  />
                  <div className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                    gpuAddon === null ? 'border-foreground/20 bg-foreground/10' : 'border-border bg-secondary',
                  )}>
                    <Zap className={cn('h-4 w-4', gpuAddon === null ? 'text-foreground' : 'text-muted-foreground')} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={cn('text-sm font-semibold', gpuAddon === null ? 'text-foreground' : 'text-muted-foreground')}>No GPU</div>
                    <div className="text-xs text-muted-foreground mt-0.5">CPU-only sandbox</div>
                  </div>
                </label>
                {GPU_TIERS.map((g) => {
                  const Icon = g.icon;
                  const selected = gpuAddon === g.id;
                  return (
                    <label
                      key={g.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-all',
                        selected
                          ? 'border-foreground/40 bg-foreground/5'
                          : 'border-border bg-card hover:border-foreground/20',
                      )}
                    >
                      <input
                        type="radio"
                        name="gpuAddon"
                        value={g.id}
                        checked={selected}
                        onChange={() => setGpuAddon(g.id as GpuAddonTier)}
                        className="sr-only"
                      />
                      <div className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                        selected ? 'border-foreground/20 bg-foreground/10' : 'border-border bg-secondary',
                      )}>
                        <Icon className={cn('h-4 w-4', selected ? 'text-foreground' : 'text-muted-foreground')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={cn('text-sm font-semibold', selected ? 'text-foreground' : 'text-muted-foreground')}>
                          {g.label}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{g.specs}</div>
                      </div>
                      <div className={cn('text-sm font-semibold shrink-0', selected ? 'text-foreground' : 'text-muted-foreground/60')}>
                        +{g.price}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="sticky bottom-0 -mx-4 -mb-4 mt-1 flex gap-2 justify-end bg-popover px-4 py-3 border-t border-border/50">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Provisioning…' : 'Create Sandbox'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
