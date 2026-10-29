"use client";

import { Eye, Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Over a stage viewer, top left: the painting's view or Overview (from above, with the camera path).
export function ViewSwitch(props: { overview: boolean; onOverview: (on: boolean) => void }) {
  return (
    <div role="group" aria-label="View" className="absolute top-3 left-3 flex rounded-full border bg-background/80 p-0.5 text-xs backdrop-blur">
      {([false, true] as const).map((on) => (
        <button
          key={String(on)}
          type="button"
          aria-pressed={props.overview === on}
          onClick={() => props.onOverview(on)}
          className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors", props.overview === on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {on ? <MapIcon className="size-3.5" /> : <Eye className="size-3.5" />}
          {on ? "Overview" : "Painting view"}
        </button>
      ))}
    </div>
  );
}
