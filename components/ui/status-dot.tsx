export function StatusDot({ on = false, pending = false, label }: { on?: boolean; pending?: boolean; label?: string }) {
  const fill = pending ? "animate-pulse border border-text bg-transparent" : on ? "border border-text bg-text" : "border border-text bg-transparent";
  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs text-muted">
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${fill}`} />
      {label}
    </span>
  );
}

export default StatusDot;
