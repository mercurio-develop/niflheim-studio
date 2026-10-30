"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { selectShot } from "../actions/shots";

export type ReelSlot = { id: string; name: string; active: boolean; take: { n: number; video: string; strip: string | null } | null };

// The reel as it stands, above the takes: every shot in the reel's order with the take it plays.
// A shot with no pick is left out of the reel. Click a shot to work on it.
export function ReelStrip(props: { projectId: string; slots: ReelSlot[]; locked?: boolean }) {
  const [pending, start] = useTransition();
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const used = props.slots.filter((s) => s.take).length;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">The reel</span>
        <span>
          {used} of {props.slots.length} shot{props.slots.length === 1 ? "" : "s"} picked · the Reel joins each picked take, in this order
        </span>
        <Link href={`/p/${props.projectId}/export`} className="ml-auto flex items-center gap-1 hover:text-foreground">
          Reel <ArrowRight className="size-3" />
        </Link>
      </div>
      <ol className="flex gap-2 overflow-x-auto pb-1">
        {props.slots.map((s, i) => (
          <li key={s.id} className="shrink-0">
            <button
              type="button"
              disabled={s.active || pending || props.locked}
              onClick={() => start(() => selectShot(props.projectId, s.id))}
              aria-current={s.active ? "true" : undefined}
              title={s.active ? "This shot" : `Work on ${s.name}`}
              className={cn("flex w-32 flex-col gap-1 rounded-md border p-1 text-left transition-colors", s.active ? "border-primary" : "hover:border-ring/60 disabled:opacity-60")}
            >
              {s.take ? (
                <video src={file(s.take.video)} muted loop playsInline preload="metadata" onMouseEnter={(e) => void e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} className="aspect-[768/448] w-full rounded bg-black" />
              ) : (
                <div className="flex aspect-[768/448] w-full items-center justify-center rounded border border-dashed text-[10px] text-muted-foreground">no pick yet</div>
              )}
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {i + 1}. {s.name}
                {s.take ? ` · take ${s.take.n}` : " · left out"}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
