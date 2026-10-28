"use client";

import { SectionNav } from "@/components/section-nav";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Clapperboard, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { LoadingDots } from "@/components/loading-dots";
import { Section } from "@/components/section";
import { JobPoller } from "@/features/wizard/components/job-poller";
import { JobStatus } from "@/features/wizard/components/job-status";
import { NextBar } from "@/features/wizard/components/next-bar";
import type { Job, Join } from "@/lib/store";
import { cn } from "@/lib/utils";
import { exportReel, saveReel } from "../actions/reel";

export type ReelRow = { shot: string; name: string; video: string | null }; // video: the picked take
const JOINS: { id: Join; label: string }[] = [
  { id: "cut", label: "Cut" },
  { id: "fade", label: "Fade" },
  { id: "dip", label: "Dip to black" },
];

// Step 04: the shots' picked takes in order, how each joins the next, and one MP4 of it all.
// Shots without a picked take are listed but left out of the reel.
export function ReelStep(props: { projectId: string; rows: ReelRow[]; joins: Join[]; export: { video: string; seconds: number; current: boolean } | null; job?: Job; autopilot?: React.ReactNode }) {
  const [rows, setRows] = useState(props.rows);
  const [joins, setJoins] = useState<Join[]>(props.joins);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const running = props.job?.status === "running";
  const busy = pending || running;
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const used = rows.filter((r) => r.video);
  const save = (r: ReelRow[], j: Join[]) => start(() => saveReel(props.projectId, { order: r.map((x) => x.shot), joins: j }).then(() => setError(null), (e: Error) => setError(e.message)));
  const move = (i: number, d: -1 | 1) => {
    const r = [...rows];
    [r[i], r[i + d]] = [r[i + d], r[i]];
    setRows(r);
    save(r, joins);
  };
  const setJoin = (i: number, j: Join) => {
    const next = [...joins];
    while (next.length <= i) next.push("cut");
    next[i] = j;
    setJoins(next);
    save(rows, next);
  };
  // Joins sit between the clips that are used, in order.
  let k = -1;

  return (
    <>
      <JobPoller running={running} />
      <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)]">
        <SectionNav items={[{ id: "autopilot", n: "1", title: "Autopilot", tone: "bg-tone-yellow" }, { id: "order", n: "2", title: "Order", tone: "bg-tone-cyan" }, { id: "reel", n: "3", title: "Reel", tone: "bg-tone-pink" }]} />
        <div className="flex min-w-0 flex-col gap-10">
        <div className="nifl-enter flex flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">04 · Reel</span>
          <h1 className="text-2xl font-semibold tracking-tight">Put the shots together</h1>
        </div>
        {props.autopilot}

        <Section id="order" n="2" tone="bg-tone-cyan" title="Order" line="Each shot's picked take, in the order the reel plays them, and how each one leads into the next."
          summary={`${used.length} of ${rows.length} shots have a picked take`}
          open={false}
          className="nifl-enter"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          <ol className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const join = r.video && k >= 0 ? (joins[k] ?? "cut") : null;
              const joinIndex = k;
              if (r.video) k++;
              return (
                <li key={r.shot} className="flex flex-col gap-2">
                  {join && (
                    <div className="flex items-center gap-1.5 pl-2" role="group" aria-label={`Join into ${r.name}`}>
                      <span className="text-[11px] text-muted-foreground">then</span>
                      {JOINS.map((j) => (
                        <button key={j.id} type="button" aria-pressed={join === j.id} disabled={busy} onClick={() => setJoin(joinIndex, j.id)} className={cn("rounded-full border px-2 py-0.5 text-[11px] transition-colors", join === j.id ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-ring/60 hover:text-foreground")}>
                          {j.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className={cn("flex items-center gap-3 rounded-lg border p-2", !r.video && "opacity-60")}>
                    {r.video ? <video src={file(r.video)} muted loop playsInline preload="metadata" onMouseEnter={(e) => void e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} className="aspect-[768/448] w-36 shrink-0 rounded-md bg-black" /> : <div className="aspect-[768/448] w-36 shrink-0 rounded-md border border-dashed" />}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">{r.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {r.video ? "Picked take" : (
                          <>
                            No take picked: <Link href={`/p/${props.projectId}/shot`} className="underline underline-offset-2">pick one in Shot</Link>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={`Move ${r.name} earlier`} disabled={busy || i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Move ${r.name} later`} disabled={busy || i === rows.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDown />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Section>

        <Section id="reel" n="3" tone="bg-tone-pink" title="Reel" line={used.length ? `${used.length} shot${used.length > 1 ? "s" : ""}, one MP4 with sound at 24 fps.` : "Pick a take in at least one shot."}
          summary={props.export ? "Exported · open to watch it" : used.length ? "Ready to export" : "Pick a take in at least one shot"}
          actions={
            <>
              <Button disabled={busy || !used.length} onClick={() => start(() => exportReel(props.projectId).then(() => setError(null), (e: Error) => setError(e.message)))}>
                {pending && !running ? <LoadingDots /> : <Clapperboard data-icon="inline-start" />}
                {props.export ? "Export again" : "Export reel"}
              </Button>
            </>
          }
          className="nifl-enter"
          style={{ "--i": 2 } as React.CSSProperties}
        >
          {running && props.job && <JobStatus message={props.job.detail ?? "Putting the reel together"} startedAt={props.job.startedAt} expected={10} />}
          {props.export && !running && (
            <figure className={cn("flex flex-col gap-2", !props.export.current && "opacity-60")}>
              <video key={props.export.video} src={file(props.export.video)} controls playsInline className="aspect-[768/448] w-full max-w-3xl rounded-lg border bg-black" />
              <figcaption className="flex items-center gap-3 text-xs text-muted-foreground">
                {props.export.seconds.toFixed(1)} s{!props.export.current && " · the order, the joins or a pick changed since: export again"}
                <a href={file(props.export.video)} download="reel.mp4" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  <Download data-icon="inline-start" />
                  Download
                </a>
              </figcaption>
            </figure>
          )}
          {props.job?.status === "error" && <p className="text-sm text-destructive">The reel failed: {props.job.error}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </Section>
        </div>
      </div>
      <NextBar back={{ href: `/p/${props.projectId}/shot`, label: "Shots" }} summary={props.export ? `Reel: ${props.export.seconds.toFixed(1)} s.` : "Export the reel to finish."} next={{ label: "Done", disabled: true }} />
    </>
  );
}
