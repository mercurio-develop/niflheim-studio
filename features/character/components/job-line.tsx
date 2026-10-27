import type { Job } from "@/lib/store";

// Status as words and a dot: running (pulsing hollow), error (destructive text). Done shows nothing.
export function JobLine({ job, running }: { job?: Job; running: string }) {
  if (!job || job.status === "done") return null;
  if (job.status === "error") return <p className="text-sm text-destructive">Failed: {job.error}</p>;
  return (
    <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
      <span className="size-1.5 animate-pulse rounded-full border border-foreground" />
      {running}
    </p>
  );
}
