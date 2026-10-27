"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Maximize2, Pencil, RefreshCw, X } from "lucide-react";
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
import { Editor } from "@/features/character/components/editor";
import { stackMoves } from "@/lib/history";
import { VIEWS, viewsFor } from "@/lib/progress";
import type { Asset, Job, TurnaroundOptions, ViewId, ViewStack } from "@/lib/store";
import { cn } from "@/lib/utils";
import { cancelTurnaround, findMasks, generateTurnaround, generateView } from "../actions/turnaround";
import { AssetsShelf } from "./assets-shelf";
import { ASSETS } from "../flags";
import { HiddenObjects } from "./hidden-objects";
import { ReplicateBar } from "./replicate-bar";

// Things a character holds or carries come first among the parts you can hide.
const HELD = /(sword|dagger|axe|spear|staff|wand|bow|shield|gun|lantern|book|umbrella|bag|satchel|backpack|pouch|cape|cloak|helmet|hat|hood|banner|flag)$/;
const PER_VIEW = 25; // seconds for one Qwen edit, warm
const EDIT_JOBS = ["mask", "swap", "tags", "brush"] as const; // the editor's jobs, per view: "view:side:brush"

export function TurnaroundStep(props: {
  projectId: string;
  character: string; // current character image
  characterLabel: string;
  tags: string[]; // parts of the current character version
  parts: Record<string, string>; // their masks, where found
  options: TurnaroundOptions | null; // what the last Generate used
  views: Partial<Record<ViewId, ViewStack>>;
  fresh: boolean; // made from the current character
  assets: Asset[];
  jobs: Record<string, Job>;
}) {
  const [options, setOptions] = useState<TurnaroundOptions>(props.options ?? { pose: "designed", hide: [], keep: [], extras: [] });
  const [viewing, setViewing] = useState<{ src: string; label: string } | null>(null);
  const [editing, setEditing] = useState<ViewId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const job = props.jobs.turnaround;
  const running = job?.status === "running";
  const viewJob = (v: ViewId) => props.jobs[`view:${v}`];
  const editJobs = (v: ViewId) => Object.fromEntries(EDIT_JOBS.map((k) => [k, props.jobs[`view:${v}:${k}`]]));
  const editBusy = (v: ViewId) => EDIT_JOBS.some((k) => props.jobs[`view:${v}:${k}`]?.status === "running" && k !== "tags");
  const assetJob = (name: string) => props.jobs[`asset:${name.replace(/ /g, "-")}`];
  const anyRunning = running || (["hide-masks", "assets", "replicate"] as const).some((k) => props.jobs[k]?.status === "running") || VIEWS.some((v) => viewJob(v.id)?.status === "running" || editBusy(v.id) || props.jobs[`view:${v.id}:tags`]?.status === "running") || props.assets.some((a) => assetJob(a.name)?.status === "running");
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

  // Find the mask of every hidden object that has none yet, one SAM job at a time, each name once.
  const finding = props.jobs["hide-masks"]?.status === "running";
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (finding) return;
    const missing = options.hide.filter((n) => !Object.hasOwn(props.parts, n) && !asked.current.has(n));
    if (!missing.length) return;
    missing.forEach((n) => asked.current.add(n));
    findMasks(props.projectId, missing).catch((e: Error) => setError(e.message));
  }, [finding, options.hide, props.parts, props.projectId]);
  const findingName = finding ? (props.jobs["hide-masks"]?.detail?.replace(/^Finding the /, "") ?? null) : null;
  const setHidden = (name: string, on: boolean) =>
    setOptions((o) => ({ ...o, hide: on ? [...o.hide, name] : o.hide.filter((x) => x !== name), keep: on && ASSETS ? [...o.keep, name] : o.keep.filter((x) => x !== name) }));

  const toggle = <K extends "extras">(k: K, v: TurnaroundOptions[K][number]) =>
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
                    <button key={t} type="button" aria-pressed={options.hide.includes(t)} onClick={() => setHidden(t, !options.hide.includes(t))} className={chip(options.hide.includes(t), "border-tone-pink bg-tone-pink text-background")}>
                      {t}
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No parts named yet; pick parts on the Character step.</span>
                )}
              </div>
              <HiddenObjects
                projectId={props.projectId}
                character={props.character}
                hide={options.hide}
                keep={options.keep}
                parts={props.parts}
                finding={findingName}
                disabled={anyRunning}
                onKeep={(name, on) => setOptions((o) => ({ ...o, keep: on ? [...o.keep, name] : o.keep.filter((x) => x !== name) }))}
                onUnhide={(name) => setHidden(name, false)}
              />
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
          {/* Turnarounds from before views were painted fresh have no options and no front. */}
          {Object.keys(props.views).length > 0 && (!props.options || !image("front")) ? (
            <p className="rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground">These views were made with an older version. Generate again to paint every view fresh, the front included.</p>
          ) : !props.fresh && Object.keys(props.views).length > 0 && (
            <p className="rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground">These views were made from an older version of the character. Generate again to update them.</p>
          )}
          {/* The concept art the views are made from, large on top; every view below is painted new. */}
          <figure className="nifl-enter flex flex-col items-center gap-2 rounded-xl border bg-card/40 p-4">
            <button type="button" onClick={() => setViewing({ src: file(props.character), label: `Concept art · ${props.characterLabel}` })} aria-label="See the concept art full screen" className="overflow-hidden rounded-lg">
              <FadeImage src={file(props.character)} alt="The concept art" className="max-h-[34rem] w-auto object-contain" />
            </button>
            <figcaption className="flex items-baseline gap-2 text-sm">
              Concept art
              <span className="font-mono text-[11px] text-muted-foreground">{props.characterLabel} · the source of every view</span>
            </figcaption>
          </figure>
          <ol className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {shown.map((v, i) => {
              const img = image(v.id);
              const j = viewJob(v.id);
              const busy = j?.status === "running";
              const stack = props.views[v.id];
              const fixing = editBusy(v.id);
              return (
                <li key={v.id} className="nifl-enter flex flex-col gap-2" style={{ "--i": i } as React.CSSProperties}>
                  <div data-land className={cn("relative overflow-hidden rounded-xl border bg-card", !img && "bg-card/40", !props.fresh && img && "opacity-60")}>
                    {img ? (
                      <FadeImage key={img} src={file(img)} alt={`${v.label} view`} className="aspect-[7/9] w-full object-cover" />
                    ) : (
                      <div className={cn("flex aspect-[7/9] w-full items-center justify-center text-xs text-muted-foreground", running && "motion-safe:animate-pulse")}>{running ? "" : "Not painted yet"}</div>
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
                    <span className="flex items-center">
                      <Button variant="ghost" size="sm" disabled={busy || fixing || running || pending || !props.options || (v.id !== "front" && !image("front"))} onClick={() => start(() => generateView(props.projectId, v.id).catch(fail))}>
                        <RefreshCw data-icon="inline-start" />
                        Again
                      </Button>
                      <Button variant={editing === v.id ? "secondary" : "ghost"} size="sm" disabled={!img || busy || running} aria-pressed={editing === v.id} onClick={() => setEditing(editing === v.id ? null : v.id)}>
                        <Pencil data-icon="inline-start" />
                        Fix
                      </Button>
                    </span>
                  </div>
                  {j?.status === "error" && <p className="text-xs text-destructive">{j.error}</p>}
                </li>
              );
            })}
          </ol>
          {job?.status === "error" && <p className="text-sm text-destructive">Painting stopped: {job.error}</p>}
          {job?.status === "cancelled" && <p className="text-sm text-muted-foreground">Painting cancelled; the views made so far are kept.</p>}
        </section>

        {/* Fix one view with the character editor: Part / Paint, then Change, Add object or Remove */}
        {editing && !running && props.views[editing]?.versions[props.views[editing]!.current] && (() => {
          const stack = props.views[editing]!;
          const moves = stackMoves(stack);
          const label = VIEWS.find((v) => v.id === editing)!.label;
          return (
            <div key={editing} className="nifl-enter relative flex flex-col gap-3 rounded-xl border bg-card/30 p-4">
              <Button variant="ghost" size="sm" className="absolute top-3 right-3 z-10" onClick={() => setEditing(null)} aria-label="Close the editor">
                <X data-icon="inline-start" />
                Close
              </Button>
              <Editor
                projectId={props.projectId}
                target={`view:${editing}`}
                title={{ n: "", title: `Fix the ${label.toLowerCase()} view`, line: "Select what is wrong, then change it, add what is missing or remove it. Undo walks this view's history." }}
                version={stack.versions[stack.current]}
                parentImage={moves.parent === null ? null : stack.versions[moves.parent].image}
                moves={moves}
                style=""
                jobs={editJobs(editing)}
              />
              {stack.versions[stack.current].edit && (
                <ReplicateBar
                  key={stack.current}
                  projectId={props.projectId}
                  from={editing}
                  edit={stack.versions[stack.current].edit!}
                  others={shown.filter((v) => v.id !== editing && image(v.id)).map((v) => ({ id: v.id, label: v.label }))}
                  job={props.jobs.replicate}
                  locked={editBusy(editing)}
                />
              )}
            </div>
          );
        })()}

        {ASSETS && <AssetsShelf projectId={props.projectId} assets={props.assets} jobs={props.jobs} locked={running} onView={(src, label) => setViewing({ src, label })} />}
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
