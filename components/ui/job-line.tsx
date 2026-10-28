export function JobLine({ status, message }: { status: "running" | "error" | "done"; message: string }) {
  if (status === "done") return null;
  if (status === "error") return <p className="font-sans text-sm text-danger">{message}</p>;
  return (
    <p className="flex items-center gap-2 font-mono text-xs text-muted">
      <span aria-hidden className="size-1.5 shrink-0 animate-pulse rounded-full border border-text" />
      {message}
    </p>
  );
}

export default JobLine;
