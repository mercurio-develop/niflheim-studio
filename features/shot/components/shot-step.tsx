"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Clapperboard, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { SectionTitle } from "@/components/section-title";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import { JobPoller } from "@/features/wizard/components/job-poller";
import { NextBar } from "@/features/wizard/components/next-bar";
import type { Job, Keyframes, Shot } from "@/lib/store";
import { cn } from "@/lib/utils";
import { cancelShot, pickTake, renderTake } from "../actions/shot";
import { DEFAULT_NEGATIVE } from "../graph";

const EXAMPLES = ["slowly turns to face the camera and raises the lantern", "looks around warily, then walks forward", "kneels, picks something up from the ground and studies it"];

// Step 06: say what the character does; LTX-2.5 shoots the scene's camera move, guided by its
// keyframes. Each take is kept; pick the one the sequence uses, or download it.
export function ShotStep(props: { projectId: string; keyframes: Keyframes | null; ready: boolean; seconds: number; shot: Shot | null; job?: Job }) {
  const [action, setAction] = useState(props.shot?.action ?? "");
  const [negative, setNegative] = useState(props.shot?.negative || DEFAULT_NEGATIVE);
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
      <JobPoller running={running} />
      <div className="flex min-w-0 flex-col gap-10">
        <div className="nifl-enter flex flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">06 · Shot</span>
          <h1 className="text-2xl font-semibold tracking-tight">Say what happens</h1>
        </div>

        <section className="nifl-enter flex flex-col gap-3" style={{ "--i": 1 } as React.CSSProperties}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionTitle n="1" tone="bg-tone-pink" title="Keyframes" line="The scene's camera move, painted at its key frames. LTX follows them, so the set, the character and the camera stay put." />
            <Link href={`/p/${props.projectId}/scene`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Change in Scene
            </Link>
          </div>
          {props.ready ? (
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {props.keyframes!.keys.map((k, i) => (
                <li key={k} className="relative overflow-hidden rounded-md border">
                  <FadeImage src={file(k!)} alt={`Keyframe at frame ${props.keyframes!.frames[i]}`} className="aspect-[768/448] w-full object-cover" />
                  <span className="absolute bottom-1 left-1 rounded border bg-background/80 px-1 font-mono text-[10px] text-muted-foreground backdrop-blur">{props.keyframes!.frames[i]}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">No keyframes yet: in the Scene step, choose a camera move and press Make keyframes.</p>
          )}
        </section>

        <section className="nifl-enter flex flex-col gap-3" style={{ "--i": 2 } as React.CSSProperties}>
          <SectionTitle n="2" tone="bg-tone-yellow" title="What happens" line="What the character does during the move, in a few words. The camera, the place and the look are added for you." />
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => renderTake(props.projectId, { action, negative }));
            }}
          >
            <Textarea value={action} onChange={(e) => setAction(e.target.value)} rows={2} placeholder="slowly turns to face the camera and raises the lantern" className="resize-none text-base" aria-label="What happens" />
            {!action && (
              <div className="-mt-1 flex flex-wrap gap-1.5">
                {EXAMPLES.map((x) => (
                  <button key={x} type="button" onClick={() => setAction(x)} className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground">
                    {x}
                  </button>
                ))}
              </div>
            )}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">What to avoid</summary>
              <Textarea value={negative} onChange={(e) => setNegative(e.target.value)} rows={2} className="mt-1.5 resize-none font-mono text-[11px]" aria-label="What to avoid" />
            </details>
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
        </section>

        <section className="nifl-enter flex flex-col gap-3" style={{ "--i": 3 } as React.CSSProperties}>
          <SectionTitle n="3" tone="bg-tone-cyan" title="Takes" line={takes.length ? "Pick the take the sequence uses. Every take stays here." : "Your takes appear here."} />
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
                    <span className="font-mono">Take {i + 1}</span> · {t.action}
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
        </section>
      </div>
      <NextBar
        back={{ href: `/p/${props.projectId}/scene`, label: "Scene" }}
        summary={props.shot?.picked !== undefined ? `Take ${props.shot.picked + 1} picked.` : takes.length ? `${takes.length} take${takes.length > 1 ? "s" : ""}: pick one.` : "Shoot a take to continue."}
        next={{ label: "Export", disabled: true, hint: "The export step comes next" }}
      />
    </>
  );
}
