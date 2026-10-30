"use client";

import { useState, useTransition } from "react";
import { Dices, Images, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { JobStatus } from "@/features/wizard/components/job-status";
import { KeyCapture } from "@/features/scene/components/key-capture";
import type { StagePose } from "@/features/scene/components/stage-viewer";
import type { Block, Job, Keyframes, SceneAsset, ViewId } from "@/lib/store";
import type { StageCamera } from "@/lib/stage-fill";
import { cn } from "@/lib/utils";
import { saveCamera } from "@/features/scene/actions/camera";
import type { CameraMove } from "@/lib/camera";
import { fixKeyFace, rerollKey, saveCaption, saveKeys } from "../actions/keyframes";

// The shot's keyframes: the stage at frames 0, 32, 64... of the camera move, each repainted into a
// finished frame with one strict prompt and seed. Make keyframes captures them in the browser and
// sends them to be painted; any one can be painted again. The note says what should be in the frame (a held prop, an action).
// Under each key, Florence-2's caption of it: editable, and merged into the take prompt in order.
export function KeyframesPanel(props: {
  projectId: string;
  keyframes: Keyframes | null;
  current: boolean; // made from today's move, placement and stage
  frames: number[];
  job?: Job;
  move: CameraMove; // saved before capturing, so the server keys the same frames
  capture: { mesh: string; camera: StageCamera; cutouts: Partial<Record<ViewId, string>>; at: [number, number, number]; height: number; turn: number; blocks: Block[]; assets: SceneAsset[]; poses: StagePose[] };
}) {
  const k = props.keyframes;
  const [note, setNote] = useState(k?.note ?? "");
  const [detail, setDetail] = useState(k?.detail ?? true); // the face and hand pass on every key
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const running = props.job?.status === "running";
  const busy = capturing || pending || running;
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const act = (fn: () => Promise<unknown>) => start(() => fn().then(() => setError(null), (e: Error) => setError(e.message)));

  const captured = (pngs: Blob[]) => {
    setCapturing(false);
    const form = new FormData();
    pngs.forEach((b, i) => form.set(`key${i}`, new File([b], `key${i}.jpg`, { type: "image/jpeg" })));
    act(() => saveKeys(props.projectId, form, note, detail));
  };

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Keyframes</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          frames {props.frames.join(", ")} · the shot follows them · ~{props.frames.length * 42} s
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="key-note" className="sr-only">
          In the frame
        </label>
        <Input id="key-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="In the frame (optional): what they hold or wear, e.g. a paper lantern" className="min-w-0 flex-1" disabled={busy} />
        <Button size="sm" variant={k && props.current ? "ghost" : "default"} disabled={busy} onClick={() => act(async () => (await saveCamera(props.projectId, props.move), setCapturing(true)))}>
          {capturing || (pending && !running) ? <LoadingDots /> : <Images data-icon="inline-start" />}
          {k ? "Make keyframes again" : "Make keyframes"}
        </Button>
        <label className="flex w-full items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} disabled={busy} className="accent-primary" />
          Fix faces and hands: a second pass repaints each face and hand on its own (about 15 s a key)
        </label>
        <p className="w-full text-xs text-muted-foreground">Only what they hold or wear. Someone else, or an object in the place, goes on the stage as a Scene asset or block: each key is painted on its own, so a note like &ldquo;a human&rdquo; paints a different one in every key.</p>
      </div>
      {running && props.job && <JobStatus message={props.job.detail ?? "Painting the keyframes"} startedAt={props.job.startedAt} expected={props.frames.length * 100} />}
      {k && (
        <ol className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", !props.current && "opacity-50")}>
          {k.raw.map((raw, i) => (
            <li key={raw} className="group relative overflow-hidden rounded-md border bg-card">
              {k.keys[i] ? (
                <FadeImage src={file(k.keys[i]!)} alt={`Keyframe at frame ${k.frames[i]}`} className="aspect-[768/448] w-full object-cover" />
              ) : (
                <div className="relative aspect-[768/448] w-full">
                  <FadeImage src={file(raw)} alt="" className="absolute inset-0 size-full object-cover opacity-40" />
                  {running && <div className="nifl-loading absolute inset-0 bg-transparent" />}
                </div>
              )}
              <span className="absolute top-1.5 left-1.5 rounded border bg-background/80 px-1 font-mono text-[10px] text-muted-foreground backdrop-blur">{k.frames[i]}</span>
              {k.keys[i] && !busy && (
                <button
                  type="button"
                  onClick={() => act(() => rerollKey(props.projectId, i))}
                  className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-md border bg-background/80 px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                >
                  <Dices className="size-3" />
                  Paint again
                </button>
              )}
              {k.keys[i] && !busy && (
                <button
                  type="button"
                  title="Repaint the face to match the character's sheet (its front close-up)"
                  onClick={() => act(() => fixKeyFace(props.projectId, i))}
                  className="absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-md border bg-background/80 px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                >
                  <ScanFace className="size-3" />
                  Fix face
                </button>
              )}
              {k.keys[i] && <KeyCaption key={`${raw}-${k.captions?.[i] ?? ""}`} text={k.captions?.[i] ?? ""} frame={k.frames[i]} disabled={busy} onSave={(t) => act(() => saveCaption(props.projectId, i, t))} />}
            </li>
          ))}
        </ol>
      )}
      {k && !props.current && <p className="text-xs text-muted-foreground">The move, the placement or the stage changed since these were made.</p>}
      {props.job?.status === "error" && <p className="text-sm text-destructive">Keyframes failed: {props.job.error}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {capturing && <KeyCapture {...props.capture} projectId={props.projectId} onDone={captured} onError={(m) => (setCapturing(false), setError(m))} />}
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
