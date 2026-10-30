"use client";

import { useState, useTransition } from "react";
import { Dices, ScanFace, Scissors } from "lucide-react";
import { FadeImage } from "@/components/fade-image";
import { Textarea } from "@/components/ui/textarea";
import { JobStatus } from "@/features/wizard/components/job-status";
import type { Job, Keyframes } from "@/lib/store";
import { cn } from "@/lib/utils";
import { cutKeys, fixKeyFace, rerollKey, saveCaption, uncutKeys } from "../actions/keyframes";

// The shot's keyframes as a Guides preview: the stage at frames 0, 32, 64... of the camera move,
// each repainted into a finished frame. One Shoot makes them (repainting what is stale, faces
// fixed); here they are only shown. Under More, any one can be painted again or its face fixed,
// and Florence-2's caption of it edited (merged into the take prompt in order).
export function KeyframesPanel(props: { projectId: string; keyframes: Keyframes | null; current: boolean; frames: number[]; job?: Job; beatsChanged?: boolean; canCut?: boolean }) {
  const k = props.keyframes;
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const running = props.job?.status === "running";
  const busy = pending || running;
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const act = (fn: () => Promise<unknown>) => start(() => fn().then(() => setError(null), (e: Error) => setError(e.message)));

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Keyframes</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          frames {props.frames.join(", ")} · the shot follows them · {k ? (props.current ? "up to date" : props.beatsChanged ? "painted before What happens changed: Generate paints them again" : "out of date: Generate paints them again") : "made by Generate"}
        </span>
      </div>
      {running && props.job && <JobStatus message={props.job.detail ?? "Painting the keyframes"} startedAt={props.job.startedAt} expected={props.frames.length * 100} />}
      {k && (
        <ol className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", !props.current && "opacity-50")}>
          {k.raw.map((raw, i) => (
            <li key={raw} className="relative overflow-hidden rounded-md border bg-card">
              {k.keys[i] ? (
                <FadeImage src={file(k.keys[i]!)} alt={`Keyframe at frame ${k.frames[i]}`} className="aspect-[768/448] w-full object-cover" />
              ) : (
                <div className="relative aspect-[768/448] w-full">
                  <FadeImage src={file(raw)} alt="" className="absolute inset-0 size-full object-cover opacity-40" />
                  {running && <div className="nifl-loading absolute inset-0 bg-transparent" />}
                </div>
              )}
              <span className="absolute top-1.5 left-1.5 rounded border bg-background/80 px-1 font-mono text-[10px] text-muted-foreground backdrop-blur">{k.frames[i]}</span>
            </li>
          ))}
        </ol>
      )}
      {k && k.keys.some(Boolean) && (
        <details className="group text-sm" open>
          <summary className="w-fit cursor-pointer text-xs text-muted-foreground hover:text-foreground">More</summary>
          <ol className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {k.raw.map((raw, i) =>
              k.keys[i] ? (
                <li key={raw} className="flex flex-col overflow-hidden rounded-md border bg-card">
                  <div className="flex items-center gap-1 px-1.5 py-1">
                    <span className="mr-auto font-mono text-[10px] text-muted-foreground">{k.frames[i]}</span>
                    <button type="button" disabled={busy} onClick={() => act(() => rerollKey(props.projectId, i))} className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50">
                      <Dices className="size-3" />
                      Paint again
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      title="Repaint the face to match the character's sheet (its front close-up)"
                      onClick={() => act(() => fixKeyFace(props.projectId, i))}
                      className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      <ScanFace className="size-3" />
                      Fix face
                    </button>
                    {props.canCut && i > 0 && i < k.raw.length - 1 && (
                      <button type="button" disabled={busy} title={`End the take here, at frame ${k.frames[i]} (${((k.frames[i] + 1) / 24).toFixed(1)} s): the keys after it go`} onClick={() => act(() => cutKeys(props.projectId, i))} className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50">
                        <Scissors className="size-3" />
                        Cut here
                      </button>
                    )}
                  </div>
                  <KeyCaption key={`${raw}-${k.captions?.[i] ?? ""}`} text={k.captions?.[i] ?? ""} frame={k.frames[i]} disabled={busy} onSave={(t) => act(() => saveCaption(props.projectId, i, t))} />
                </li>
              ) : null,
            )}
          </ol>
        </details>
      )}
      {k?.full !== undefined && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Cut at frame {k.frames.at(-1)}: the take is {((k.frames.at(-1)! + 1) / 24).toFixed(1)} s instead of {((k.full + 1) / 24).toFixed(1)} s.
          <button type="button" disabled={busy} onClick={() => act(() => uncutKeys(props.projectId))} className="underline hover:text-foreground disabled:opacity-50">
            Full length again
          </button>
          (Generate draws the keys again)
        </p>
      )}
      {props.job?.status === "error" && <p className="text-sm text-destructive">Keyframes failed: {props.job.error}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// Saved when the field loses focus, only if it changed; empty means the take prompt skips this key.
function KeyCaption(props: { text: string; frame: number; disabled: boolean; onSave: (text: string) => void }) {
  const [text, setText] = useState(props.text);
  return (
    <Textarea
      aria-label={`What key ${props.frame} shows`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() !== props.text.trim() && props.onSave(text)}
      placeholder="What this key shows (described after painting)"
      disabled={props.disabled}
      rows={3}
      className="min-h-0 resize-none rounded-none border-0 border-t text-xs"
    />
  );
}
