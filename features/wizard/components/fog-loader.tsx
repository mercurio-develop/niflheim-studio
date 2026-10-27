"use client";

import { useEffect, useState } from "react";
import { MagneticField } from "@/components/magnetic-field";
import { cn } from "@/lib/utils";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// The "working" state for a GPU step: drifting fog, one clear sentence, and honest time.
export function FogLoader(props: {
  message: string;
  startedAt: string;
  expected: number;
  className?: string;
  compact?: boolean;
  onCancel?: () => unknown;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.max(0, (now - Date.parse(props.startedAt)) / 1000);
  const over = elapsed > props.expected * 1.5;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("nifl-fog nifl-enter isolate flex flex-col items-center justify-center gap-2 overflow-hidden bg-background/80 text-center backdrop-blur-sm", props.className)}
    >
      <MagneticField className="-z-10" density={props.compact ? 0.6 : 1} />
      <p className={cn("font-medium text-foreground drop-shadow", props.compact ? "text-sm" : "text-base")}>{props.message}</p>
      <p className="font-mono text-xs text-muted-foreground drop-shadow">
        {clock(elapsed)} · {over ? "taking longer than usual" : `usually ${clock(props.expected)}`}
      </p>
      {props.onCancel && (
        <button
          type="button"
          disabled={cancelling}
          onClick={() => {
            setCancelling(true);
            void props.onCancel?.();
          }}
          className="mt-1 rounded-full border border-foreground/25 bg-background/60 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/60 hover:text-foreground disabled:opacity-50"
        >
          {cancelling ? "Cancelling..." : "Cancel"}
        </button>
      )}
    </div>
  );
}
