"use client";

import { SectionNav } from "@/components/section-nav";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Clapperboard, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LoadingDots } from "@/components/loading-dots";
import { Section } from "@/components/section";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import { JobPoller } from "@/features/wizard/components/job-poller";
import { NextBar } from "@/features/wizard/components/next-bar";
import type { Job, Keyframes, Shot } from "@/lib/store";
import { cn } from "@/lib/utils";
import { cancelShot, pickTake, renderTake } from "../actions/shot";
import { ShotTabs, type ShotTab } from "./shot-tabs";

// Actions that only use what is in the keyframes: a prop the keys do not show makes LTX conjure it
// mid-take (04_shot ACCEPT proof 6). Props go into the keyframes through the In the frame note.
const EXAMPLES = ["slowly turns to look toward the camera", "looks around warily, the coat stirring in the wind", "takes a slow breath and glances down the street"];

// Step 03: make the keyframes, say what the character does; LTX-2.5 shoots the scene's camera move, guided by its
// keyframes. Each take is kept; pick the one the sequence uses, or download it.
export function ShotStep(props: { projectId: string; keyframes: Keyframes | null; ready: boolean; seconds: number; shot: Shot | null; job?: Job; keysRunning: boolean; keyPanel: React.ReactNode; shots: ShotTab[] }) {
  const [action, setAction] = useState(props.shot?.action ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const running = props.job?.status === "running";
  const busy = pending || running;
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const takes = props.shot?.takes ?? [];
  const run = (fn: () => Promise<unknown>) => start(() => fn().then(() => setError(null), (e: Error) => setError(e.message)));
  const expected = Math.round(25 + props.seconds * 18);

  return (
    <>
      <JobPoller running={running || props.keysRunning} />
      <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)]">
        <SectionNav items={[{ id: "keyframes", n: "1", title: "Keyframes", tone: "bg-tone-pink" }, { id: "action", n: "2", title: "What happens", tone: "bg-tone-yellow" }, { id: "takes", n: "3", title: "Takes", tone: "bg-tone-cyan" }]} />
        <div className="flex min-w-0 flex-col gap-10">
        <div className="nifl-enter flex flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">03 · Shots</span>
          <h1 className="text-2xl font-semibold tracking-tight">Say what happens</h1>
        </div>
        <ShotTabs projectId={props.projectId} shots={props.shots} locked={running} />

        <Section id="keyframes" n="1" tone="bg-tone-pink" title="Keyframes" line="The scene's camera move, painted at its key frames. LTX follows them, so the set, the character and the camera stay put. Say what should be in the frame (a held prop) in the note."
          summary={props.ready ? `${props.keyframes!.keys.length} keyframes painted from the scene's camera move` : "Make the keyframes"}
          open={!props.ready || !takes.length || props.keysRunning}
          actions={
            <>
              <Link href={`/p/${props.projectId}/scene`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Change the move in Scene
              </Link>
            </>
          }
          className="nifl-enter"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          {props.keyPanel}
        </Section>

        <Section id="action" n="2" tone="bg-tone-yellow" title="What happens" line="What the character does during the move, in a few words: a look, a turn, a gesture. Only use what the keyframes show; anything they do not show (a lantern, a sword) appears out of nowhere. Add props in the keyframes' note above."
          summary={props.shot?.action || "Say what the character does"}
          open={!takes.length || running}
          className="nifl-enter"
          style={{ "--i": 2 } as React.CSSProperties}
        >
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => renderTake(props.projectId, { action }));
            }}
          >
            <Textarea value={action} onChange={(e) => setAction(e.target.value)} rows={2} placeholder="slowly turns to look toward the camera" className="resize-none text-base" aria-label="What happens" />
            {!action && (
              <div className="-mt-1 flex flex-wrap gap-1.5">
                {EXAMPLES.map((x) => (
                  <button key={x} type="button" onClick={() => setAction(x)} className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground">
                    {x}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3 border-t pt-3">
              <span className="font-mono text-[11px] text-muted-foreground">
                ~{Math.round(expected / 10) * 10} s · {props.seconds} s of video with sound · every take is kept
              </span>
              <Button type="submit" size="lg" className="ml-auto" disabled={busy || !props.ready || action.trim().length < 3}>
                {pending && !running ? <LoadingDots /> : <Clapperboard data-icon="inline-start" />}
                Shoot a take
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </Section>

        <Section id="takes" n="3" tone="bg-tone-cyan" title="Takes" line={takes.length ? "Pick the take the sequence uses. Every take stays here." : "Your takes appear here."}
          summary={takes.length ? `${takes.length} take${takes.length === 1 ? "" : "s"}${props.shot?.picked != null ? " · one picked" : ""}` : "No takes yet"}
          className="nifl-enter"
          style={{ "--i": 3 } as React.CSSProperties}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {running && props.job && (
              <div className="relative aspect-[768/448] overflow-hidden rounded-lg border">
                <FogLoader className="absolute inset-0" message={props.job.detail ?? "Shooting the take"} startedAt={props.job.startedAt} expected={expected} onCancel={() => cancelShot(props.projectId)} />
              </div>
            )}
            {[...takes.entries()].reverse().map(([i, t]) => (
              <figure key={t.video} className={cn("flex flex-col gap-2 rounded-lg border p-2", props.shot?.picked === i && "border-primary")}>
                <video src={file(t.video)} controls loop playsInline preload="metadata" className="aspect-[768/448] w-full rounded-md bg-black" />
                <figcaption className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate" title={t.action}>
                    <span className="font-mono">Take {i + 1}</span>
                    {t.score && (
                      <span className="font-mono" title="Camera travel (px of flow) and frames where something pops in, from scripts/score_take.py">
                        {" "}· moves {t.score.travel.toFixed(0)} px · {t.score.popins} pop-in{t.score.popins === 1 ? "" : "s"}
                      </span>
                    )}{" "}
                    · {t.action}
                  </span>
                  <a href={file(t.video)} download={`take-${i + 1}.mp4`} className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={`Download take ${i + 1}`}>
                    <Download className="size-3.5" />
                  </a>
                  <Button size="sm" variant={props.shot?.picked === i ? "secondary" : "outline"} disabled={busy} onClick={() => run(() => pickTake(props.projectId, i))}>
                    {props.shot?.picked === i && <Check data-icon="inline-start" />}
                    {props.shot?.picked === i ? "Picked" : "Use this"}
                  </Button>
                </figcaption>
              </figure>
            ))}
          </div>
          {props.job?.status === "error" && <p className="text-sm text-destructive">The take failed: {props.job.error}</p>}
          {props.job?.status === "cancelled" && <p className="text-sm text-muted-foreground">Take cancelled.</p>}
        </Section>
        </div>
      </div>
      <NextBar
        back={{ href: `/p/${props.projectId}/scene`, label: "Scene" }}
        summary={props.shot?.picked !== undefined ? `Take ${props.shot.picked + 1} picked.` : takes.length ? `${takes.length} take${takes.length > 1 ? "s" : ""}: pick one.` : "Shoot a take to continue."}
        next={{ label: "Reel", href: `/p/${props.projectId}/export`, disabled: props.shot?.picked === undefined, hint: props.shot?.picked === undefined ? "Pick a take first" : undefined }}
      />
    </>
  );
}
