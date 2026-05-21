import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string; bg: string; border: string }> = {
  running:  { label: 'Running',  dot: 'bg-emerald-500 animate-pulse', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-500/8 dark:bg-emerald-500/10', border: 'border-emerald-500/20' },
  stopped:  { label: 'Stopped',  dot: 'bg-zinc-400',                  text: 'text-zinc-500',                         bg: 'bg-zinc-500/5',                           border: 'border-zinc-500/15' },
  creating: { label: 'Creating', dot: 'bg-blue-500 animate-pulse',    text: 'text-blue-600 dark:text-blue-400',      bg: 'bg-blue-500/8 dark:bg-blue-500/10',       border: 'border-blue-500/20' },
  starting: { label: 'Starting', dot: 'bg-amber-500 animate-pulse',   text: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-500/8 dark:bg-amber-500/10',     border: 'border-amber-500/20' },
  error:    { label: 'Error',    dot: 'bg-red-500',                   text: 'text-red-600 dark:text-red-400',        bg: 'bg-red-500/8 dark:bg-red-500/10',         border: 'border-red-500/20' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cfg = STATUS_CONFIG[s] ?? { label: status, dot: 'bg-zinc-400', text: 'text-zinc-500', bg: 'bg-zinc-500/5', border: 'border-zinc-500/15' };

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold', cfg.bg, cfg.border, cfg.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', cfg.dot)} />
      {cfg.label}
    </span>
  );
}
