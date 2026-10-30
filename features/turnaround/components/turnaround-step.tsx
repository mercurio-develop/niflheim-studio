"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Pencil, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeImage } from "@/components/fade-image";
import { ImageViewer } from "@/components/image-viewer";
import { LoadingDots } from "@/components/loading-dots";
import { ParticleField } from "@/components/particle-field";
import { More, Section } from "@/components/section";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import { JobStatus } from "@/features/wizard/components/job-status";
import { Editor } from "@/features/character/components/editor";
import { stackMoves } from "@/lib/history";
import { VIEWS, viewsFor } from "@/lib/progress";
import type { Asset, CharacterPose, CharacterSheet, Job, Mesh, TurnaroundOptions, ViewId, ViewStack } from "@/lib/store";
import { PosesPanel } from "./poses-panel";
import { itemChoices, MAX_ITEMS, SheetSection } from "./sheet-section";
import { cn } from "@/lib/utils";
import { cancelTurnaround, findMasks, generateTurnaround, generateView } from "../actions/turnaround";
import { AssetsShelf } from "./assets-shelf";
import { ASSETS } from "../flags";
import { HiddenObjects } from "./hidden-objects";
import { MeshSection } from "./mesh-section";
import { ReplicateBar } from "./replicate-bar";

// Things a character holds or carries come first among the parts you can hide.
const HELD = /(sword|dagger|axe|spear|staff|wand|bow|shield|gun|lantern|book|umbrella|bag|satchel|backpack|pouch|cape|cloak|helmet|hat|hood|banner|flag)$/;
const PER_VIEW = 25; // seconds for one Qwen edit, warm
// How the pose reads in a summary.
const poseLabel = (o: TurnaroundOptions) => (o.body === "animal" ? "on four legs" : o.pose === "tpose" ? "T-pose" : o.pose === "relaxed" ? "relaxed" : "as designed");
const BODIES = [["person", "Person · two legs"], ["animal", "Animal · four legs"], ["creature", "Creature"]] as const;
const EDIT_JOBS = ["mask", "swap", "tags", "brush"] as const; // the editor's jobs, per view: "view:side:brush"

// Sections 3-5 of the Character step: the turnaround (set up, views, fixing a view), the 3D model and
// the assets. The Character step polls the jobs and owns the Next bar.
export function TurnaroundSections(props: {
  projectId: string;
  character: string; // current character image
  characterLabel: string;
  tags: string[]; // parts of the current character version
  parts: Record<string, string>; // their masks, where found
  options: TurnaroundOptions | null; // what the last Generate used
  views: Partial<Record<ViewId, ViewStack>>;
  fresh: boolean; // made from the current character
  assets: Asset[];
  poses: CharacterPose[]; // the character in other poses, for shots
  mesh: Mesh | null; // the character in 3D, from these views
  sheet: CharacterSheet | null; // the Ingredients reference sheet's pictures
  jobs: Record<string, Job>;
  cid?: string; // which character (default c1)
}) {
  const [options, setOptions] = useState<TurnaroundOptions>(props.options ?? { pose: "relaxed", hide: [], keep: [], extras: [], items: itemChoices(props.tags).slice(0, 2) });
  const items = options.items ?? [];
  const offered = itemChoices(props.tags);
  const [viewing, setViewing] = useState<{ src: string; label: string } | null>(null);
  const [editing, setEditing] = useState<ViewId | null>(null);
  const [seeing, setSeeing] = useState<ViewId | null>(null); // the view shown full screen
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [starting, startGenerate] = useTransition(); // Generate pressed, the job not on the page yet
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const job = props.jobs.turnaround;
  const running = job?.status === "running";
  const viewJob = (v: ViewId) => props.jobs[`view:${v}`];
  const editJobs = (v: ViewId) => Object.fromEntries(EDIT_JOBS.map((k) => [k, props.jobs[`view:${v}:${k}`]]));
  const editBusy = (v: ViewId) => EDIT_JOBS.some((k) => props.jobs[`view:${v}:${k}`]?.status === "running" && k !== "tags");
  const assetJob = (name: string) => props.jobs[`asset:${name.replace(/ /g, "-")}`];
  const anyRunning = running || (["hide-masks", "assets", "replicate"] as const).some((k) => props.jobs[k]?.status === "running") || VIEWS.some((v) => viewJob(v.id)?.status === "running" || editBusy(v.id)) || props.assets.some((a) => assetJob(a.name)?.status === "running");
  const wanted = viewsFor(options);
  const shown = viewsFor(props.options ?? options);
  const image = (v: ViewId) => {
    const s = props.views[v];
    return s ? s.versions[s.current]?.image : undefined;
  };
  // The painted views in turnaround order; the arrows step round them (past the back is the front).
  const painted = shown.filter((v) => image(v.id)).map((v) => v.id);
  const step = (from: ViewId, by: number) => painted[(painted.indexOf(from) + by + painted.length) % painted.length];
  // A Generate paints the views in order and says which one it is on ("Making the side view (3/6)");
  // that view and every one after it still shows its old picture (or nothing) until it lands.
  const painting = running ? Number(job?.detail?.match(/\((\d+)\/\d+\)/)?.[1] ?? 1) - 1 : -1;
  const waiting = (i: number) => (starting && !running) || (running && i >= painting);
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
    findMasks(props.projectId, missing, props.cid).catch((e: Error) => setError(e.message));
  }, [finding, options.hide, props.parts, props.projectId, props.cid]);
  const findingName = finding ? (props.jobs["hide-masks"]?.detail?.replace(/^Finding the /, "") ?? null) : null;
  const setHidden = (name: string, on: boolean) =>
    setOptions((o) => ({ ...o, hide: on ? [...o.hide, name] : o.hide.filter((x) => x !== name), keep: on && ASSETS ? [...o.keep, name] : o.keep.filter((x) => x !== name) }));

  const toggle = <K extends "extras">(k: K, v: TurnaroundOptions[K][number]) =>
    setOptions((o) => ({ ...o, [k]: (o[k] as string[]).includes(v) ? (o[k] as string[]).filter((x) => x !== v) : [...(o[k] as string[]), v] }));
  const chip = (on: boolean, tone = "border-primary bg-primary text-primary-foreground") =>
    cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", on ? tone : "text-muted-foreground hover:border-ring/60 hover:text-foreground");

  const none = !Object.keys(props.views).length;
  return (
    <>
      <ParticleField active={running} />
      <Section
        id="turnaround"
        n="3"
        tone="bg-tone-lilac"
        title="Turnaround"
        line={`Every side of ${props.characterLabel}, painted fresh from it, so later shots and the 3D model see one character.`}
        summary={`${shown.filter((v) => image(v.id)).length} of ${shown.length} views painted${props.options ? ` · ${poseLabel(props.options)}` : ""}${props.sheet?.drawn ? " · sheet made" : ""}${props.options?.hide.length ? ` · without ${props.options.hide.join(", ")}` : ""}`}
        open={none || running || !props.fresh}
        className="nifl-enter"
        style={{ "--i": 3 } as React.CSSProperties}
      >
        <More label="Set up" summary={`${options.body === "animal" ? "Animal · four legs" : options.body === "creature" ? "Creature" : "Person"} · ${poseLabel(options)}${items.length ? ` · with ${items.join(", ")}` : ""}${options.hide.length ? ` · without ${options.hide.join(", ")}` : ""}${options.extras.length ? ` · + ${options.extras.join(", ")}` : ""}`} open={none}>
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3">
            <span className="text-xs text-muted-foreground">Body</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Body">
              {BODIES.map(([b, text]) => (
                <button key={b} type="button" role="radio" aria-checked={(options.body ?? "person") === b} onClick={() => setOptions((o) => ({ ...o, body: b, pose: b === "animal" ? "designed" : o.pose }))} className={chip((options.body ?? "person") === b)}>
                  {text}
                </button>
              ))}
            </div>

            <span className="text-xs text-muted-foreground">Pose</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Pose">
              {(options.body === "animal" ? (["designed"] as const) : (["relaxed", "designed"] as const)).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={options.pose === p} onClick={() => setOptions((o) => ({ ...o, pose: p }))} className={chip(options.pose === p)}>
                  {p === "relaxed" ? "Relaxed" : "As designed"}
                </button>
              ))}
            </div>

            <span className="self-start pt-0.5 text-xs text-muted-foreground">On their own</span>
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap gap-1.5">
                {offered.length ? (
                  offered.map((t) => (
                    <button key={t} type="button" aria-pressed={items.includes(t)} disabled={!items.includes(t) && items.length >= MAX_ITEMS} onClick={() => setOptions((o) => ({ ...o, items: items.includes(t) ? items.filter((x) => x !== t) : [...items, t] }))} className={chip(items.includes(t))}>
                      {t}
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No parts tagged on this version.</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">Up to {MAX_ITEMS} things they wear or carry, painted alone for the sheet.</span>
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
              {ASSETS && (
                <HiddenObjects
                  cid={props.cid}
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
              )}
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
        </More>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-muted-foreground">
              {wanted.length} views · ~{Math.round((wanted.length * PER_VIEW) / 10) * 10} s
              {props.options && changed ? " · settings changed" : ""}
            </span>
            <Button
              size="lg"
              className="ml-auto"
              disabled={anyRunning || pending || starting}
              onClick={() => {
                setError(null);
                startGenerate(() => generateTurnaround(props.projectId, options, props.cid).catch(fail));
              }}
            >
              {starting && !running ? <LoadingDots /> : null}
              {props.options ? "Generate again" : "Generate turnaround"}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {running && job && <JobStatus message={job.detail ?? "Painting the views"} startedAt={job.startedAt} expected={shown.length * PER_VIEW} onCancel={() => cancelTurnaround(props.projectId, "turnaround", props.cid)} />}
          {/* Turnarounds from before views were painted fresh have no options and no front. */}
          {Object.keys(props.views).length > 0 && (!props.options || !image("front")) ? (
            <p className="rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground">These views were made with an older version. Generate again to paint every view fresh, the front included.</p>
          ) : !props.fresh && Object.keys(props.views).length > 0 && (
            <p className="rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground">These views were made from an older version of the character. Generate again to update them.</p>
          )}
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
                      <div className={cn("flex aspect-[7/9] w-full items-center justify-center text-xs text-muted-foreground", waiting(i) && "nifl-loading")}>{waiting(i) ? "" : "Not painted yet"}</div>
                    )}
                    {img && waiting(i) && (
                      <div aria-hidden className="absolute inset-0 flex items-center justify-center bg-background/55 text-primary backdrop-blur-[1px]">
                        <LoadingDots className="scale-150" />
                      </div>
                    )}
                    {img && !busy && (
                      <button
                        type="button"
                        onClick={() => setSeeing(v.id)}
                        aria-label={`See the ${v.label.toLowerCase()} view full screen`}
                        className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md border bg-background/75 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
                      >
                        <Maximize2 className="size-3.5" />
                      </button>
                    )}
                    {busy && j && (
                      <FogLoader className="absolute inset-0" compact message={`Painting the ${v.label.toLowerCase()}`} startedAt={j.startedAt} expected={PER_VIEW} onCancel={() => cancelTurnaround(props.projectId, `view:${v.id}`, props.cid)} />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-2">
                    <span className="flex items-baseline gap-1.5 text-sm">
                      {v.label}
                      {stack && stack.versions.length > 1 && <span className="font-mono text-[11px] text-muted-foreground">v{stack.current + 1}/{stack.versions.length}</span>}
                    </span>
                    <span className="-ml-2 flex flex-wrap items-center">
                      <Button variant="ghost" size="sm" disabled={busy || fixing || running || pending || starting || !props.options || (v.id !== "front" && !image("front"))} onClick={() => start(() => generateView(props.projectId, v.id, props.cid).catch(fail))}>
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

        {/* Fix one view with the character editor: Part / Paint, then Change, Add object or Remove */}
        {editing && !running && props.views[editing]?.versions[props.views[editing]!.current] && (() => {
          const stack = props.views[editing]!;
          const moves = stackMoves(stack);
          const label = VIEWS.find((v) => v.id === editing)!.label;
          return (
            <div key={editing} className="nifl-enter relative flex flex-col gap-3 rounded-xl border bg-card/30 p-4">
              <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
                {painted.length > 1 && (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(step(editing, -1))} aria-label="Fix the previous view">
                      <ChevronLeft />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(step(editing, 1))} aria-label="Fix the next view">
                      <ChevronRight />
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)} aria-label="Close the editor">
                  <X data-icon="inline-start" />
                  Close
                </Button>
              </div>
              <Editor
                cid={props.cid}
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
                  cid={props.cid}
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
        {image("front") && (
          <More
            label="Poses"
            summary={props.poses.length ? props.poses.map((p) => p.label).join(", ") : "running, angry, happy: the character in other poses for shots"}
            open={props.poses.some((p) => props.jobs[`pose:${p.id}`]?.status === "running")}
          >
            <PosesPanel cid={props.cid} projectId={props.projectId} poses={props.poses} jobs={props.jobs} locked={running} />
          </More>
        )}
        {image("front") && <SheetSection cid={props.cid} projectId={props.projectId} sheet={props.sheet} items={items} jobs={props.jobs} locked={running} />}
      </Section>

        <MeshSection
          cid={props.cid}
          projectId={props.projectId}
          mesh={props.mesh}
          views={Object.fromEntries((["front", "side", "back", "threequarter"] as const).flatMap((v) => (image(v) ? [[v, image(v)!]] : [])))}
          ready={(["front", "side", "back"] as const).every((v) => image(v))}
          locked={running || starting}
          job={props.jobs.mesh}
        />

        {ASSETS && <AssetsShelf cid={props.cid} projectId={props.projectId} assets={props.assets} jobs={props.jobs} locked={running} onView={(src, label) => setViewing({ src, label })} />}
      {viewing && <ImageViewer src={viewing.src} label={viewing.label} onClose={() => setViewing(null)} />}
      {seeing && image(seeing) && (() => {
        const stack = props.views[seeing]!;
        const label = VIEWS.find((v) => v.id === seeing)!.label;
        const more = painted.length > 1;
        return (
          <ImageViewer
            src={file(image(seeing)!)}
            label={`${label} · ${stack.versions[stack.current]?.label ?? ""}`}
            onClose={() => setSeeing(null)}
            onPrev={more ? () => setSeeing(step(seeing, -1)) : undefined}
            onNext={more ? () => setSeeing(step(seeing, 1)) : undefined}
          />
        );
      })()}
    </>
  );
}
