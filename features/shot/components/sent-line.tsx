"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { videoLine } from "../actions/shot";

// The Generated video line a Character take will send, closed until asked for. An edit replaces the
// built line for the next take only (the parent clears it once that take is sent); Reset restores it.
export function SentLine(props: { projectId: string; beats: { start: string; then: string; end: string }; expression: string; edited: string | undefined; onEdit: (text: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const [built, setBuilt] = useState("");
  const { start, then, end } = props.beats;
  useEffect(() => {
    if (!open || start.trim().length < 3) return;
    let live = true;
    const t = setTimeout(() => void videoLine(props.projectId, { start, then, end }, props.expression).then((x) => live && setBuilt(x), () => {}), 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, props.projectId, start, then, end, props.expression]);
  const changed = props.edited !== undefined && props.edited !== built;
  return (
    <details className="text-xs" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Prompt</summary>
      <div className="mt-2 flex flex-col gap-2">
        <textarea
          aria-label="The Generated video line"
          rows={6}
          value={props.edited ?? built}
          onChange={(e) => props.onEdit(e.target.value)}
          className="w-full resize-y rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {changed && (
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => props.onEdit(undefined)}>
            Reset
          </Button>
        )}
      </div>
    </details>
  );
}
