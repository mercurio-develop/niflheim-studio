"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, RefreshCw, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { Textarea } from "@/components/ui/textarea";
import type { CharacterSheet, Job, SheetCell } from "@/lib/store";
import { cn } from "@/lib/utils";
import { addExpression, addItem, cancelSheet, makeSheet, removeCell, rerollCell } from "../actions/sheet";

// Tags that are a part of the body or hair, not a thing worn or carried: never offered as items.
// The things offered for the sheet, carried ones first (Set up picks them before Generate).
export const itemChoices = (tags: string[]) => [...new Set(tags.filter((t) => !BODY.test(t)))].sort((a, b) => Number(CARRIED.test(b)) - Number(CARRIED.test(a)));
const BODY = /(hair|eyes?|skin|face|beard|ears?|tail|fur|paws?|legs?|arms?|hands?)$/;
export const MAX_ITEMS = 3;
// Expressions a shot often needs; any other in the user's words.
const EXPRESSIONS = ["smiling", "angry", "scared", "sad", "surprised", "determined"];
// Things carried or worn on top come first: they are what a take most often drops or swaps.
const CARRIED = /(bag|satchel|backpack|pouch|lantern|sword|staff|book|hat|helmet|cape|cloak|coat|scarf)$/;

// The character's Ingredients reference sheet: the pictures LTX-2.5 keeps a take's character to
// (face, body, the things they wear or carry), made in one press, each re-rolled alone with its
// prompt as it is or edited. In Shots a shot turns it on for its takes.
// The character's Ingredients reference sheet, made with the turnaround's views (Generate): the
// drawn sheet, then its faces and things, each re-rolled alone with its prompt as is or edited.
// The views are re-rolled or fixed in the turnaround above; the sheet redraws with them.
export function SheetSection(props: { projectId: string; sheet: CharacterSheet | null; items: string[]; jobs: Record<string, Job>; locked: boolean; cid?: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [word, setWord] = useState("");
  const [thing, setThing] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const job = props.jobs.sheet;
  const running = job?.status === "running";
  const busy = pending || running || props.locked;
  const run = (fn: () => Promise<unknown>) => start(() => fn().then(() => setError(null), (e: Error) => setError(e.message)));
  const cells = (props.sheet?.cells ?? []).filter((c) => c.kind !== "view");

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">The sheet</span>
        <span className="text-xs text-muted-foreground">what LTX-2.5 keeps this character to in a take: the faces, the things, every side</span>
        <span className="ml-auto flex flex-wrap gap-2">
          {props.sheet?.drawn ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => makeSheet(props.projectId, props.items, props.cid))}>
              <RefreshCw />
              Repaint faces and props
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => run(() => makeSheet(props.projectId, props.items, props.cid))}>
              Make the sheet
            </Button>
          )}
          {running && (
            <Button size="sm" variant="ghost" onClick={() => run(() => cancelSheet(props.projectId, props.cid))}>
              <Square />
              Stop
            </Button>
          )}
        </span>
      </div>
      {running && (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <LoadingDots />
          {job.detail}
        </span>
      )}
      {job?.status === "error" && <span className="text-xs text-destructive">Failed: {job.error}</span>}
      {error && <span className="text-xs text-destructive">{error}</span>}

      {props.sheet?.drawn && <FadeImage src={file(props.sheet.drawn)} alt="The reference sheet" className="aspect-[768/448] w-full max-w-2xl rounded-md border bg-black object-contain" />}
      {props.sheet?.drawn && (
        <span className="text-xs text-muted-foreground">
          Any picture can be painted again on its own: a body with Again or Fix on its view above (the sheet redraws), a face, a thing or an expression with its ↻ below, or with its prompt edited (✎).
        </span>
      )}

      {props.sheet?.drawn && (
        <form className="flex flex-wrap items-center gap-1.5" onSubmit={(e) => (e.preventDefault(), run(() => addItem(props.projectId, thing, props.cid).then(() => setThing(""))))}>
          <span className="text-xs text-muted-foreground">A thing they wear or carry, in your words:</span>
          <input aria-label="A thing they wear or carry" value={thing} maxLength={40} placeholder="a truck tire" onChange={(e) => setThing(e.target.value)} className="h-7 w-48 rounded-md border bg-transparent px-2 text-xs" />
          <Button type="submit" size="sm" variant="ghost" disabled={busy || thing.trim().length < 2 || cells.filter((c) => c.kind === "item").length >= MAX_ITEMS}>
            <Plus />
            Add to the sheet
          </Button>
        </form>
      )}

      {props.sheet?.cells.some((c) => c.id === "face-front" && c.image) && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Expressions: painted from the front close-up, so a shot can hold them to their face with that look</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {EXPRESSIONS.filter((e) => !cells.some((c) => c.kind === "expression" && c.label === e)).map((e) => (
              <button key={e} type="button" disabled={busy} onClick={() => run(() => addExpression(props.projectId, e, props.cid))} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground disabled:opacity-50">
                <Plus className="size-3" />
                {e}
              </button>
            ))}
            <form className="flex items-center gap-1.5" onSubmit={(e) => (e.preventDefault(), run(() => addExpression(props.projectId, word, props.cid).then(() => setWord(""))))}>
              <input aria-label="An expression in your own words" value={word} maxLength={40} placeholder="or your own: a nervous half-smile" onChange={(e) => setWord(e.target.value)} className="h-7 w-48 rounded-md border bg-transparent px-2 text-xs" />
              <Button type="submit" size="sm" variant="ghost" disabled={busy || word.trim().length < 3}>
                Add
              </Button>
            </form>
          </div>
        </div>
      )}

      {cells.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
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

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">What makes a good sheet</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
          <li>One character per sheet, and at most three things on their own: every extra picture makes the others smaller, and small pictures carry over less.</li>
          <li>A clean front close-up of the face matters most; re-roll it until it looks like them.</li>
          <li>The body in a relaxed pose; an animal stands on four legs (Body in Set up).</li>
          <li>Pick the things they keep through the shot: a bag, a coat, a lantern. Leave out the hair and body parts.</li>
          <li>In the shot, say the expression (“smiling”, “frightened”): the sheet holds the face so firmly it goes stiff otherwise.</li>
        </ul>
      </details>
    </div>
  );
}
