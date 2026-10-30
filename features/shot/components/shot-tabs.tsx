"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { MOVES } from "@/lib/camera";
import { cn } from "@/lib/utils";
import { deleteShot, newShot, renameShot, selectShot } from "../actions/shots";
import { SHOT_TYPES } from "../state";

export type ShotTab = { id: string; name: string; active: boolean; picked: boolean };

// The scene's shots as tabs: pick one to work on (its move, keyframes and takes), add one from a
// camera move, rename or remove one. A dot marks a shot with a picked take, ready for the reel.
export function ShotTabs(props: { projectId: string; shots: ShotTab[]; locked?: boolean }) {
  const [adding, setAdding] = useState(false);
  const [bare, setBare] = useState(false); // the bare camera moves, under More
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const busy = pending || props.locked;
  const run = (fn: () => Promise<unknown>) => start(() => fn().then(() => setError(null), (e: Error) => setError(e.message)));

  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label="Shots" className="flex flex-wrap items-center gap-1.5">
        {props.shots.map((s) =>
          renaming === s.id ? (
            <form
              key={s.id}
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                setRenaming(null);
                run(() => renameShot(props.projectId, s.id, name));
              }}
            >
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Shot name" className="h-7 w-40 rounded-md border bg-background px-2 text-xs" />
              <button type="submit" aria-label="Save the name" className="rounded p-1 text-muted-foreground hover:text-foreground">
                <Check className="size-3.5" />
              </button>
            </form>
          ) : (
            <div key={s.id} className={cn("group flex items-center rounded-full border text-xs transition-colors", s.active ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-ring/60 hover:text-foreground")}>
              <button type="button" role="tab" aria-selected={s.active} disabled={busy} onClick={() => run(() => selectShot(props.projectId, s.id))} className="flex items-center gap-1.5 py-0.5 pr-1 pl-2.5">
                {s.picked && <span aria-label="has a picked take" className={cn("size-1.5 rounded-full", s.active ? "bg-primary-foreground" : "bg-primary")} />}
                {s.name}
              </button>
              {s.active && (
                <>
                  <button type="button" aria-label={`Rename ${s.name}`} disabled={busy} onClick={() => (setName(s.name), setRenaming(s.id))} className="rounded p-0.5 opacity-70 hover:opacity-100">
                    <Pencil className="size-3" />
                  </button>
                  {props.shots.length > 1 && (
                    <button type="button" aria-label={`Remove ${s.name}`} disabled={busy} onClick={() => confirm(`Remove ${s.name}? Its takes leave the list.`) && run(() => deleteShot(props.projectId, s.id))} className="mr-1 rounded p-0.5 opacity-70 hover:opacity-100">
                      <X className="size-3" />
                    </button>
                  )}
                </>
              )}
            </div>
          ),
        )}
        <button type="button" disabled={busy} aria-expanded={adding} onClick={() => setAdding(!adding)} className="flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground">
          <Plus className="size-3" />
          New shot
        </button>
      </div>
      {adding && (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Shot type</span>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {SHOT_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  setAdding(false);
                  run(() => newShot(props.projectId, t.id));
                }}
                className="flex flex-col items-start rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors hover:border-ring/60"
              >
                <span className="text-foreground">{t.label}</span>
                <span className="text-muted-foreground">{t.line}</span>
              </button>
            ))}
          </div>
          <button type="button" aria-expanded={bare} onClick={() => setBare(!bare)} className="self-start text-xs text-muted-foreground hover:text-foreground">
            {bare ? "Hide the camera moves" : "More: start from a camera move"}
          </button>
        </div>
      )}
      {adding && bare && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Start from</span>
          {MOVES.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={busy}
              onClick={() => {
                setAdding(false);
                run(() => newShot(props.projectId, m.id));
              }}
              className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground"
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
