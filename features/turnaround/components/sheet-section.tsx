"use client";

import { useState, useTransition } from "react";
import { Pencil, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { Textarea } from "@/components/ui/textarea";
import type { CharacterSheet, Job, SheetCell } from "@/lib/store";
import { cn } from "@/lib/utils";
import { chip } from "@/features/scene/components/chip";
import { cancelSheet, makeSheet, rerollCell } from "../actions/sheet";

// Tags that are a part of the body or hair, not a thing worn or carried: never offered as items.
const BODY = /(hair|eyes?|skin|face|beard|ears?|tail|fur|paws?|legs?|arms?|hands?)$/;
const MAX_ITEMS = 3;
// Things carried or worn on top come first: they are what a take most often drops or swaps.
const CARRIED = /(bag|satchel|backpack|pouch|lantern|sword|staff|book|hat|helmet|cape|cloak|coat|scarf)$/;

// The character's Ingredients reference sheet: the pictures LTX-2.5 keeps a take's character to
// (face, body, the things they wear or carry), made in one press, each re-rolled alone with its
// prompt as it is or edited. In Shots a shot turns it on for its takes.
export function SheetSection(props: { projectId: string; sheet: CharacterSheet | null; tags: string[]; jobs: Record<string, Job>; locked: boolean; cid?: string }) {
  const offered = [...new Set(props.tags.filter((t) => !BODY.test(t)))].sort((a, b) => Number(CARRIED.test(b)) - Number(CARRIED.test(a)));
  const made = props.sheet?.cells.filter((c) => c.kind === "item").map((c) => c.label);
  const [items, setItems] = useState<string[]>(made ?? offered.slice(0, 2));
  const [editing, setEditing] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const job = props.jobs.sheet;
  const running = job?.status === "running";
  const busy = pending || running || props.locked;
  const run = (fn: () => Promise<unknown>) => start(() => fn().then(() => setError(null), (e: Error) => setError(e.message)));
  const toggle = (t: string) => setItems((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : xs.length < MAX_ITEMS ? [...xs, t] : xs));
  const cells = props.sheet?.cells ?? [];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        One picture LTX-2.5 keeps this character to in a take: three close-ups of the face, the body in a relaxed pose from four sides, and the things they wear or carry on their own. About 3 min on Comfy Cloud.
      </p>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Things on their own (up to {MAX_ITEMS})</span>
        <div className="flex flex-wrap gap-1.5">
          {offered.length ? (
            offered.map((t) => (
              <button key={t} type="button" aria-pressed={items.includes(t)} disabled={busy || (!items.includes(t) && items.length >= MAX_ITEMS)} onClick={() => toggle(t)} className={chip(items.includes(t))}>
                {t}
              </button>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">No parts tagged on this version: the sheet shows the face and body only.</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy} onClick={() => run(() => makeSheet(props.projectId, items, props.cid))}>
          {cells.length ? <RefreshCw /> : null}
          {cells.length ? "Make the sheet again" : "Make the sheet"}
        </Button>
        {running && (
          <>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <LoadingDots />
              {job.detail}
            </span>
            <Button size="sm" variant="ghost" onClick={() => run(() => cancelSheet(props.projectId, props.cid))}>
              <Square />
              Stop
            </Button>
          </>
        )}
        {job?.status === "error" && <span className="text-xs text-destructive">Failed: {job.error}</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>

      {props.sheet?.drawn && <FadeImage src={file(props.sheet.drawn)} alt="The reference sheet" className="aspect-[768/448] w-full max-w-2xl rounded-md border bg-black object-contain" />}

      {cells.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {cells.map((c: SheetCell) => (
            <li key={c.id} className="flex min-w-0 flex-col gap-1">
              <div className="relative">
                {c.image ? (
                  <FadeImage src={file(c.image)} alt={c.label} className="aspect-square w-full rounded border bg-muted object-contain" />
                ) : (
                  <span className="flex aspect-square w-full items-center justify-center rounded border bg-card/40">{running && <LoadingDots />}</span>
                )}
                <div className="absolute top-1 right-1 flex gap-1">
                  <button type="button" aria-label={`Edit the prompt of ${c.label}`} disabled={busy} onClick={() => (setEditing(editing === c.id ? null : c.id), setPrompt(c.prompt))} className="rounded-md border bg-background/80 p-1 text-muted-foreground hover:text-foreground disabled:opacity-50">
                    <Pencil className="size-3" />
                  </button>
                  <button type="button" aria-label={`Paint ${c.label} again`} disabled={busy || !c.image} onClick={() => run(() => rerollCell(props.projectId, c.id, null, props.cid))} className="rounded-md border bg-background/80 p-1 text-muted-foreground hover:text-foreground disabled:opacity-50">
                    <RefreshCw className="size-3" />
                  </button>
                </div>
              </div>
              <span className={cn("truncate text-xs", c.image ? "text-foreground" : "text-muted-foreground")}>{c.label}</span>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="flex flex-col gap-2 sm:max-w-2xl">
          <Textarea aria-label="The cell's prompt" value={prompt} maxLength={600} rows={4} onChange={(e) => setPrompt(e.target.value)} />
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

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">What makes a good sheet</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
          <li>One character per sheet, and at most two things on their own: every extra picture makes the others smaller, and small pictures carry over less.</li>
          <li>A clean front close-up of the face matters most; re-roll it until it looks like them.</li>
          <li>The body in a relaxed pose, never the T-pose; an animal stands on four legs (Body in Set up).</li>
          <li>Pick the things they keep through the shot: a bag, a coat, a lantern. Leave out the hair and body parts.</li>
          <li>In the shot, say the expression (“smiling”, “frightened”): the sheet holds the face so firmly it goes stiff otherwise.</li>
          <li>A take with the sheet runs 5 s, the length the sheet was trained on, and its keyframes should show the same character.</li>
        </ul>
      </details>
    </div>
  );
}
