"use client";

import { useEffect, useRef, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeImage } from "@/components/fade-image";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import { JobPoller } from "@/features/wizard/components/job-poller";
import { NextBar } from "@/features/wizard/components/next-bar";
import { VIEWS } from "@/lib/progress";
import type { Job, ViewId } from "@/lib/store";
import { cn } from "@/lib/utils";
import { cancelView, generateMissingViews, generateView } from "../actions/turnaround";

export function TurnaroundStep(props: {
  projectId: string;
  front: string;
  label: string;
  views: Partial<Record<ViewId, string>>;
  fresh: boolean; // the views were made from this character
  jobs: Record<string, Job>;
}) {
  const [pending, start] = useTransition();
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const job = (v: ViewId) => props.jobs[`view:${v}`];
  const running = VIEWS.some((v) => job(v.id)?.status === "running");
  const shown = (v: ViewId) => (props.fresh ? props.views[v] : undefined);
  const complete = VIEWS.every((v) => shown(v.id));

  // First visit (or the character changed): start the missing views right away.
  const kicked = useRef(false);
  useEffect(() => {
    if (kicked.current || complete || running) return;
    kicked.current = true;
    start(() => generateMissingViews(props.projectId));
  }, [complete, running, props.projectId]);

  const cards: { id: ViewId | "front"; label: string; image?: string }[] = [
    { id: "front", label: "Front", image: props.front },
    ...VIEWS.map((v) => ({ id: v.id, label: v.label, image: shown(v.id) })),
  ];

  return (
    <>
      <JobPoller running={running} />
      <div className="flex flex-col gap-8">
        <div className="nifl-enter flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs text-muted-foreground">02 · Turnaround</span>
            <h1 className="text-2xl font-semibold tracking-tight">The same character from every side</h1>
            <p className="text-sm text-muted-foreground">
              Made from <span className="text-foreground">{props.label}</span>. Every later shot uses these to keep them recognisable.
            </p>
          </div>
          {!props.fresh && Object.keys(props.views).length > 0 && (
            <p className="rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground">The character changed, so the views are being remade.</p>
          )}
        </div>

        <ol className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {cards.map((c, i) => {
            const j = c.id === "front" ? undefined : job(c.id);
            const busy = j?.status === "running";
            return (
              <li key={c.id} className="nifl-enter flex flex-col gap-2" style={{ "--i": i + 1 } as React.CSSProperties}>
                <div className={cn("relative overflow-hidden rounded-xl border bg-card", !c.image && "bg-card/50")}>
                  {c.image ? (
                    <FadeImage key={c.image} src={file(c.image)} alt={`${c.label} view`} className="aspect-[7/9] w-full object-cover" />
                  ) : (
                    <div className="aspect-[7/9] w-full" />
                  )}
                  {busy && j && (
                    <FogLoader
                      className="absolute inset-0"
                      compact
                      message={`Turning to the ${c.label.toLowerCase()}`}
                      startedAt={j.startedAt}
                      expected={30}
                      onCancel={() => cancelView(props.projectId, c.id)}
                    />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{c.label}</span>
                  {c.id !== "front" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy || pending}
                      onClick={() => start(() => generateView(props.projectId, c.id))}
                    >
                      <RefreshCw data-icon="inline-start" />
                      {c.image ? "Again" : "Make"}
                    </Button>
                  )}
                </div>
                {j?.status === "error" && <p className="text-xs text-destructive">{j.error}</p>}
                {j?.status === "cancelled" && !c.image && <p className="text-xs text-muted-foreground">Cancelled.</p>}
              </li>
            );
          })}
        </ol>
      </div>
      <NextBar
        back={{ href: `/p/${props.projectId}/character`, label: "Character" }}
        summary={complete ? "Four views of one character." : running ? "Turning the character..." : "Make the missing views to continue."}
        next={{ label: "Set", hint: "soon", disabled: true }}
      />
    </>
  );
}
