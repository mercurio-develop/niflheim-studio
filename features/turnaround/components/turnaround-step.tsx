"use client";

import { useState, useTransition } from "react";
import { Maximize2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeImage } from "@/components/fade-image";
import { ImageViewer } from "@/components/image-viewer";
import { LoadingDots } from "@/components/loading-dots";
import { ParticleField } from "@/components/particle-field";
import { SectionTitle } from "@/components/section-title";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import { JobPoller } from "@/features/wizard/components/job-poller";
import { JobStatus } from "@/features/wizard/components/job-status";
import { NextBar } from "@/features/wizard/components/next-bar";
import { VIEWS, viewsFor } from "@/lib/progress";
import type { Asset, Job, TurnaroundOptions, ViewId, ViewStack } from "@/lib/store";
import { cn } from "@/lib/utils";
import { cancelTurnaround, generateTurnaround, generateView, makeAssetViews } from "../actions/turnaround";

// Things a character holds or carries come first among the parts you can hide.
const HELD = /(sword|dagger|axe|spear|staff|wand|bow|shield|gun|lantern|book|umbrella|bag|satchel|backpack|pouch|cape|cloak|helmet|hat|hood|banner|flag)$/;
const PER_VIEW = 25; // seconds for one Qwen edit, warm

export function TurnaroundStep(props: {
  projectId: string;
  character: string; // current character image
  characterLabel: string;
  tags: string[]; // parts of the current character version
  options: TurnaroundOptions | null; // what the last Generate used
  views: Partial<Record<ViewId, ViewStack>>;
  fresh: boolean; // made from the current character
  assets: Asset[];
  jobs: Record<string, Job>;
}) {
  const [options, setOptions] = useState<TurnaroundOptions>(props.options ?? { pose: "designed", hide: [], extras: [] });
  const [viewing, setViewing] = useState<{ src: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const job = props.jobs.turnaround;
  const running = job?.status === "running";
  const viewJob = (v: ViewId) => props.jobs[`view:${v}`];
  const assetJob = (name: string) => props.jobs[`asset:${name.replace(/ /g, "-")}`];
  const anyRunning = running || VIEWS.some((v) => viewJob(v.id)?.status === "running") || props.assets.some((a) => assetJob(a.name)?.status === "running");
  const wanted = viewsFor(options);
  const shown = viewsFor(props.options ?? options);
  const image = (v: ViewId) => {
    const s = props.views[v];
    return s ? s.versions[s.current]?.image : undefined;
  };
  const complete = props.fresh && shown.every((v) => image(v.id));
  const changed = JSON.stringify(props.options) !== JSON.stringify(options);
  const chips = [...props.tags].sort((a, b) => Number(HELD.test(b)) - Number(HELD.test(a)));
  const fail = (e: Error) => setError(e.message);

  const toggle = <K extends "hide" | "extras">(k: K, v: TurnaroundOptions[K][number]) =>
    setOptions((o) => ({ ...o, [k]: (o[k] as string[]).includes(v) ? (o[k] as string[]).filter((x) => x !== v) : [...(o[k] as string[]), v] }));
  const chip = (on: boolean, tone = "border-primary bg-primary text-primary-foreground") =>
    cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", on ? tone : "text-muted-foreground hover:border-ring/60 hover:text-foreground");

  return (
    <>
      <JobPoller running={anyRunning} />
      <ParticleField active={running} />
      <div className="flex flex-col gap-8">
        <div className="nifl-enter flex flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">02 · Turnaround</span>
          <h1 className="text-2xl font-semibold tracking-tight">Every side of your character</h1>
          <p className="text-sm text-muted-foreground">
            Made from <span className="text-foreground">{props.characterLabel}</span>. All views are painted fresh from it, so later shots and the 3D model see one character.
          </p>
        </div>

        {/* Settings: pose, what to leave out, which extra views */}
        <section className="nifl-enter flex flex-col gap-4" style={{ "--i": 1 } as React.CSSProperties}>
          <SectionTitle n="1" tone="bg-tone-yellow" title="Set up" line="Pose, what to leave out, and which views to paint." />
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3">
            <span className="text-xs text-muted-foreground">Pose</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Pose">
              {(["designed", "tpose"] as const).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={options.pose === p} onClick={() => setOptions((o) => ({ ...o, pose: p }))} className={chip(options.pose === p)}>
                  {p === "designed" ? "As designed" : "T-pose"}
                </button>
              ))}
            </div>

            <span className="self-start pt-0.5 text-xs text-muted-foreground">Hide</span>
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap gap-1.5">
                {chips.length ? (
                  chips.map((t) => (
                    <button key={t} type="button" aria-pressed={options.hide.includes(t)} onClick={() => toggle("hide", t)} className={chip(options.hide.includes(t), "border-tone-pink bg-tone-pink text-background")}>
                      {t}
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No parts named yet; pick parts on the Character step.</span>
                )}
              </div>
              {options.hide.length > 0 && <span className="text-[11px] text-muted-foreground">Hidden objects are left out of every view and kept as assets.</span>}
            </div>

            <span className="text-xs text-muted-foreground">Extra views</span>
            <div className="flex flex-wrap gap-1.5">
              {(["top", "bottom"] as const).map((x) => (
                <button key={x} type="button" aria-pressed={options.extras.includes(x)} onClick={() => toggle("extras", x)} className={chip(options.extras.includes(x))}>
                  {x === "top" ? "Top" : "Bottom"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 border-t pt-3">
            <span className="font-mono text-[11px] text-muted-foreground">
              {wanted.length} views · ~{Math.round((wanted.length * PER_VIEW) / 10) * 10} s
              {props.options && changed ? " · settings changed" : ""}
            </span>
            <Button
              size="lg"
              className="ml-auto"
              disabled={anyRunning || pending}
              onClick={() => {
                setError(null);
                start(() => generateTurnaround(props.projectId, options).catch(fail));
              }}
            >
              {pending && !running ? <LoadingDots /> : null}
              {props.options ? "Generate again" : "Generate turnaround"}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </section>

        {/* Views */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <SectionTitle n="2" tone="bg-primary" title="Views" line={props.options ? `Pose: ${props.options.pose === "tpose" ? "T-pose" : "as designed"}${props.options.hide.length ? ` · without ${props.options.hide.join(", ")}` : ""}` : "Nothing painted yet."} />
          </div>
          {running && job && <JobStatus message={job.detail ?? "Painting the views"} startedAt={job.startedAt} expected={shown.length * PER_VIEW} onCancel={() => cancelTurnaround(props.projectId, "turnaround")} />}
          {!props.fresh && Object.keys(props.views).length > 0 && (
            <p className="rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground">These views were made from an older version of the character. Generate again to update them.</p>
          )}
          <ol className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {shown.map((v, i) => {
              const img = image(v.id);
              const j = viewJob(v.id);
              const busy = j?.status === "running";
              const stack = props.views[v.id];
              return (
                <li key={v.id} className="nifl-enter flex flex-col gap-2" style={{ "--i": i } as React.CSSProperties}>
                  <div data-land className={cn("relative overflow-hidden rounded-xl border bg-card", !img && "bg-card/40", !props.fresh && img && "opacity-60")}>
                    {img ? (
                      <FadeImage key={img} src={file(img)} alt={`${v.label} view`} className="aspect-[7/9] w-full object-cover" />
                    ) : (
                      <div className={cn("aspect-[7/9] w-full", running && "motion-safe:animate-pulse")} />
                    )}
                    {img && !busy && (
                      <button
                        type="button"
                        onClick={() => setViewing({ src: file(img), label: `${v.label} · ${stack?.versions[stack.current]?.label ?? ""}` })}
                        aria-label={`See the ${v.label.toLowerCase()} view full screen`}
                        className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md border bg-background/75 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
                      >
                        <Maximize2 className="size-3.5" />
                      </button>
                    )}
                    {busy && j && (
                      <FogLoader className="absolute inset-0" compact message={`Painting the ${v.label.toLowerCase()}`} startedAt={j.startedAt} expected={PER_VIEW} onCancel={() => cancelTurnaround(props.projectId, `view:${v.id}`)} />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-baseline gap-1.5 text-sm">
                      {v.label}
                      {stack && stack.versions.length > 1 && <span className="font-mono text-[11px] text-muted-foreground">v{stack.current + 1}/{stack.versions.length}</span>}
                    </span>
                    <Button variant="ghost" size="sm" disabled={busy || running || pending || !props.options || (v.id !== "front" && !image("front"))} onClick={() => start(() => generateView(props.projectId, v.id).catch(fail))}>
                      <RefreshCw data-icon="inline-start" />
                      Again
                    </Button>
                  </div>
                  {j?.status === "error" && <p className="text-xs text-destructive">{j.error}</p>}
                </li>
              );
            })}
          </ol>
          {job?.status === "error" && <p className="text-sm text-destructive">Painting stopped: {job.error}</p>}
          {job?.status === "cancelled" && <p className="text-sm text-muted-foreground">Painting cancelled; the views made so far are kept.</p>}
        </section>

        {/* Hidden objects, kept to be made on their own later */}
        {props.assets.length > 0 && (
          <section className="flex flex-col gap-4">
            <SectionTitle n="3" tone="bg-tone-pink" title="Assets" line="Objects you hid, kept with their cutout. Make their views when you need them." />
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {props.assets.map((a) => {
                const j = assetJob(a.name);
                const busy = j?.status === "running";
                const pics = [a.cutout ? a.image : null, a.views?.front, a.views?.side].filter((x): x is string => !!x);
                return (
                  <li key={a.name} className="flex flex-col gap-2 rounded-xl border bg-card/40 p-2">
                    <div className="relative grid grid-cols-3 gap-1">
                      {pics.map((src) => (
                        <button key={src} type="button" onClick={() => setViewing({ src: file(src), label: a.name })} className="overflow-hidden rounded-md border bg-card">
                          <FadeImage src={file(src)} alt={a.name} className="aspect-square w-full object-contain" />
                        </button>
                      ))}
                      {busy && j && <FogLoader className="absolute inset-0 rounded-md" compact message={j.detail ?? `Painting the ${a.name}`} startedAt={j.startedAt} expected={2 * PER_VIEW} onCancel={() => cancelTurnaround(props.projectId, `asset:${a.name.replace(/ /g, "-")}`)} />}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm">{a.name}</span>
                      <Button variant="ghost" size="sm" disabled={busy || anyRunning || pending} onClick={() => start(() => makeAssetViews(props.projectId, a.name).catch(fail))}>
                        <RefreshCw data-icon="inline-start" />
                        {a.views ? "Again" : "Make views"}
                      </Button>
                    </div>
                    {!a.cutout && !a.views && <p className="text-xs text-muted-foreground">Not found in the picture; its views are painted from the whole character.</p>}
                    {j?.status === "error" && <p className="text-xs text-destructive">{j.error}</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
      {viewing && <ImageViewer src={viewing.src} label={viewing.label} onClose={() => setViewing(null)} />}
      <NextBar
        back={{ href: `/p/${props.projectId}/character`, label: "Character" }}
        summary={complete ? `${shown.length} views of one character.` : anyRunning ? "Painting the views..." : "Generate the turnaround to continue."}
        next={{ label: "Set", href: `/p/${props.projectId}/set`, disabled: !complete }}
      />
    </>
  );
}
