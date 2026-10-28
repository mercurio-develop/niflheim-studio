"use client";

import { useEffect, useState } from "react";
import { LoadingDots } from "@/components/loading-dots";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// A GPU wait as one line in the page: what is happening, honest time, and Cancel.
export function JobStatus(props: { message: string; startedAt: string; expected: number; onCancel?: () => unknown }) {
  // null until mounted: the server and the first client render both show 0:00, then the clock runs.
  const [now, setNow] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const elapsed = now === null ? 0 : Math.max(0, (now - Date.parse(props.startedAt)) / 1000);
  return (
    <div role="status" aria-live="polite" className="nifl-enter flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="flex items-center gap-2 font-medium text-foreground">
        {props.message} <LoadingDots className="text-primary" />
      </span>
      <span className="font-mono text-xs text-muted-foreground">
        {clock(elapsed)} · {elapsed > props.expected * 1.5 ? "taking longer than usual" : `usually ${clock(props.expected)}`}
      </span>
      {props.onCancel && (
        <button
          type="button"
          disabled={cancelling}
          onClick={() => {
            setCancelling(true);
            Promise.resolve(props.onCancel?.()).catch(() => setCancelling(false));
          }}
          className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground disabled:opacity-50"
        >
          {cancelling ? "Cancelling..." : "Cancel"}
        </button>
      )}
    </div>
  );
}
