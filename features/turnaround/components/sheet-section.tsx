"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { Textarea } from "@/components/ui/textarea";
import { Section, SectionFire } from "@/components/section";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import { JobStatus } from "@/features/wizard/components/job-status";
import type { CharacterSheet, Job, SheetCell } from "@/lib/store";
import { cn } from "@/lib/utils";
import { cancelSheet, makeSheet, removeCell, rerollCell } from "../actions/sheet";

// Tags that are a part of the body or hair, not a thing worn or carried: never offered as items.
// The things offered for the sheet, carried ones first (Set up picks them before Generate).
export const itemChoices = (tags: string[]) => [...new Set(tags.filter((t) => !BODY.test(t)))].sort((a, b) => Number(CARRIED.test(b)) - Number(CARRIED.test(a)));
const BODY = /(hair|eyes?|skin|face|beard|ears?|tail|fur|paws?|legs?|arms?|hands?)$/;
export const MAX_ITEMS = 3;
// Expressions a shot often needs; any other in the user's words.
const EXPRESSIONS = ["smiling", "angry", "scared", "sad", "surprised", "determined"];
// Things carried or worn on top come first: they are what a take most often drops or swaps.
const CARRIED = /(bag|satchel|backpack|pouch|lantern|sword|staff|book|hat|helmet|cape|cloak|coat|scarf)$/;

const chip = (on: boolean) =>
  cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-ring/60 hover:text-foreground");

// The character's Ingredients reference sheet: faces, things, expressions and the turnaround
// views, drawn last so a Fix or Again on a view shows up here. Generate waits until the views exist.
export function SheetSection(props: {
  projectId: string;
  sheet: CharacterSheet | null;
  items: string[]; // the turnaround's picks, the default until a sheet painted its own
  tags: string[]; // the character's parts, offered as props
  jobs: Record<string, Job>;
  locked: boolean;
  busy?: boolean; // any GPU job: Generate and Again stay off
  ready: boolean; // turnaround front exists
  source: string; // current character image: the sheet is stale when source on disk differs
  cid?: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [word, setWord] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const job = props.jobs.sheet;
  const running = job?.status === "running";
  const busy = pending || running || props.locked || !!props.busy;
  const run = (fn: () => Promise<unknown>) => start(() => fn().then(() => setError(null), (e: Error) => setError(e.message)));
  const cells = (props.sheet?.cells ?? []).filter((c) => c.kind !== "view");
  const savedExpr = cells.filter((c) => c.kind === "expression").map((c) => c.label);
  const savedKey = savedExpr.join(",");
  const [picked, setPicked] = useState<string[]>(savedExpr);
  const [seenExpr, setSeenExpr] = useState(savedKey);
  if (savedKey !== seenExpr) {
    setSeenExpr(savedKey);
    setPicked(savedExpr);
  }
  // Props: what the last sheet painted, else the turnaround's picks; edited here before Generate.
  const savedItems = cells.filter((c) => c.kind === "item").map((c) => c.label);
  const itemsKey = (savedItems.length ? savedItems : props.items).join(",");
  const [things, setThings] = useState<string[]>(savedItems.length ? savedItems : props.items);
  const [seenItems, setSeenItems] = useState(itemsKey);
  if (itemsKey !== seenItems) {
    setSeenItems(itemsKey);
    setThings(savedItems.length ? savedItems : props.items);
  }
  const [thing, setThing] = useState("");
  const stale = !!props.sheet?.drawn && props.sheet.source !== props.source;
  const blocked = props.locked ? "Looks good in Edit first" : !props.ready ? "Generate the turnaround first" : null;

  const toggle = (e: string) => setPicked((xs) => (xs.includes(e) ? xs.filter((x) => x !== e) : [...xs, e].slice(0, 6)));

  return (
    <Section
      id="sheet"
      n="5"
      tone="bg-tone-lilac"
      title="Sheet"
      line="The reference LTX keeps this character to: faces, the things they carry, the expressions you pick, then every side. Generate draws it from all of that."
      summary={props.sheet?.drawn ? (stale ? "Out of date: Generate again from the new views" : "Made · open to re-roll a face or a thing") : "No sheet yet"}
      open={!props.sheet?.drawn || running || stale}
      className="nifl-enter"
      style={{ "--i": 5 } as React.CSSProperties}
    >
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3">
        <span className="pt-0.5 text-xs text-muted-foreground">Props</span>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {[...new Set([...itemChoices(props.tags), ...things])].map((t) => (
              <button key={t} type="button" aria-pressed={things.includes(t)} disabled={busy || (!things.includes(t) && things.length >= MAX_ITEMS)} onClick={() => setThings((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t]))} className={chip(things.includes(t))}>
                {t}
              </button>
            ))}
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const t = thing.trim().toLowerCase();
                if (!/^[a-z][a-z \-]{1,39}$/.test(t)) return;
                setThings((xs) => [...new Set([...xs, t])].slice(0, MAX_ITEMS));
                setThing("");
              }}
            >
              <input aria-label="A prop in your own words" value={thing} maxLength={40} placeholder="+ a prop: a truck tire" disabled={busy || things.length >= MAX_ITEMS} onChange={(e) => setThing(e.target.value)} className="h-7 w-44 rounded-full border bg-transparent px-2.5 text-xs disabled:opacity-50" />
              <Button type="submit" size="sm" variant="ghost" disabled={busy || things.length >= MAX_ITEMS || thing.trim().length < 2}>
                <Plus data-icon="inline-start" />
                Add
              </Button>
            </form>
          </div>
          <span className="text-xs text-muted-foreground">Up to {MAX_ITEMS} things they wear or carry, each painted alone on the sheet so takes keep them. Pick from the parts or type one.</span>
        </div>

        <span className="pt-0.5 text-xs text-muted-foreground">Expressions</span>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {[...new Set([...EXPRESSIONS, ...picked])].map((e) => (
              <button key={e} type="button" aria-pressed={picked.includes(e)} disabled={busy} onClick={() => toggle(e)} className={chip(picked.includes(e))}>
                {e}
              </button>
            ))}
          </div>
          <form
            className="flex flex-wrap items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const w = word.trim().toLowerCase();
              if (w.length < 3) return;
              if (!picked.includes(w)) setPicked((xs) => [...xs, w].slice(0, 6));
              setWord("");
            }}
          >
            <input aria-label="An expression in your own words" value={word} maxLength={40} placeholder="or your own: a nervous half-smile" onChange={(e) => setWord(e.target.value)} className="h-7 w-52 rounded-full border bg-transparent px-2.5 text-xs" />
            <Button type="submit" size="sm" variant="ghost" disabled={busy || word.trim().length < 3}>
              <Plus data-icon="inline-start" />
              Add
            </Button>
          </form>
          <span className="text-xs text-muted-foreground">Painted from the front close-up when you Generate. A shot can hold them to that look.</span>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {job?.status === "error" && <p className="text-sm text-destructive">Failed: {job.error}</p>}
      {stale && !running && <p className="rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground">The views changed. Generate again so the sheet uses them.</p>}

      <SectionFire hint={blocked ?? (props.sheet?.drawn ? (stale ? "Views changed" : "Repaints faces, props and the drawn sheet") : "Faces, props, expressions, then the sheet")}>
        <Button
          size="lg"
          disabled={busy || !!blocked}
          onClick={() => run(() => makeSheet(props.projectId, things, props.cid, picked))}
        >
          {pending && !running ? <LoadingDots /> : null}
          {props.sheet?.drawn ? "Generate again" : "Generate sheet"}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </SectionFire>
      {running && job && <JobStatus message={job.detail ?? "Painting the sheet"} startedAt={job.startedAt} expected={90} onCancel={() => cancelSheet(props.projectId, props.cid)} />}

      {cells.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {cells.map((c: SheetCell) => (
            <li key={c.id} className="flex min-w-0 flex-col gap-1">
              <div className="relative">
                {c.image ? (
                  <FadeImage src={file(c.image)} alt={c.label} className="aspect-square w-full rounded border bg-muted object-contain" />
                ) : (
                  <span className={cn("flex aspect-square w-full items-center justify-center rounded border bg-card/40", running && "nifl-loading")}>{running && <LoadingDots />}</span>
                )}
                <div className="absolute top-1 right-1 flex gap-1">
                  <button type="button" aria-label={`Edit the prompt of ${c.label}`} disabled={busy} onClick={() => (setEditing(editing === c.id ? null : c.id), setPrompt(c.prompt))} className="rounded-md border bg-background/80 p-1 text-muted-foreground hover:text-foreground disabled:opacity-50">
                    <Pencil className="size-3" />
                  </button>
                  <button type="button" aria-label={`Paint ${c.label} again`} disabled={busy || !c.image} onClick={() => run(() => rerollCell(props.projectId, c.id, null, props.cid))} className="rounded-md border bg-background/80 p-1 text-muted-foreground hover:text-foreground disabled:opacity-50">
                    <RefreshCw className="size-3" />
                  </button>
                  {(c.kind === "expression" || c.kind === "item") && (
                    <button type="button" aria-label={`Remove ${c.label}`} disabled={busy} onClick={() => run(() => removeCell(props.projectId, c.id, props.cid))} className="rounded-md border bg-background/80 p-1 text-muted-foreground hover:text-foreground disabled:opacity-50">
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              </div>
              <span className={cn("truncate text-xs", c.image ? "text-foreground" : "text-muted-foreground")}>{c.label}</span>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="flex flex-col gap-2 sm:max-w-2xl">
          <Textarea aria-label="The picture's prompt" value={prompt} maxLength={600} rows={4} onChange={(e) => setPrompt(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || prompt.trim().length < 10} onClick={() => run(() => rerollCell(props.projectId, editing, prompt, props.cid).then(() => setEditing(null)))}>
              Paint with this prompt
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className={cn("relative w-full overflow-hidden rounded-xl border bg-card", stale && props.sheet?.drawn && "opacity-60")}>
        {props.sheet?.drawn ? (
          <FadeImage src={file(props.sheet.drawn)} alt="The reference sheet" className="aspect-[768/448] w-full object-contain" />
        ) : (
          <div className={cn("flex aspect-[768/448] w-full items-center justify-center text-sm text-muted-foreground", running && "nifl-loading")}>{running ? "" : "The sheet lands here"}</div>
        )}
        {running && job && (
          <FogLoader className="absolute inset-0" message={job.detail ?? "Painting the sheet"} startedAt={job.startedAt} expected={90} onCancel={() => cancelSheet(props.projectId, props.cid)} />
        )}
      </div>
    </Section>
  );
}
