'use client';

import { useState } from 'react';
import { Zap, Rocket, Gauge } from 'lucide-react';
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

const TIERS = [
  { id: 'launch',  label: 'Launch',  specs: '1 vCPU · 2 GiB RAM · 10 GiB', icon: Zap,    price: '$0.12/hr' },
  { id: 'build',   label: 'Build',   specs: '2 vCPU · 4 GiB RAM · 10 GiB', icon: Rocket, price: '$0.24/hr' },
  { id: 'max-cpu', label: 'Max CPU', specs: '4 vCPU · 8 GiB RAM · 10 GiB', icon: Gauge,  price: '$0.48/hr' },
];

export function CreateSandboxModal({
  onClose,
  onSuccess,
  allowedTiers = TIERS.map((tier) => tier.id),
}: {
  onClose: () => void;
  onSuccess: () => void;
  allowedTiers?: string[];
}) {
  const [name, setName] = useState('');
  const [tier, setTier] = useState(allowedTiers[0] ?? 'launch');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/sandboxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, tier }),
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
            <Label className="text-sm font-semibold">Plan</Label>
            <div className="flex flex-col gap-2">
              {TIERS.filter((t) => allowedTiers.includes(t.id)).map((t) => {
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

          <div className="flex gap-2 justify-end pt-1">
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
