export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const label =
    s === 'running' ? 'Running' :
    s === 'stopped' ? 'Stopped' :
    s === 'creating' ? 'Creating' :
    s === 'starting' ? 'Starting' :
    s === 'error' ? 'Error' :
    status;

  return (
    <span className={`badge badge-${s}`}>{label}</span>
  );
}
