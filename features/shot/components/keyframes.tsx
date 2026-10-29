"use client";

import { useState, useTransition } from "react";
import { Dices, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { JobStatus } from "@/features/wizard/components/job-status";
import { KeyCapture } from "@/features/scene/components/key-capture";
import type { StagePose } from "@/features/scene/components/stage-viewer";
import type { Block, Job, Keyframes, ViewId } from "@/lib/store";
import type { StageCamera } from "@/lib/stage-fill";
import { cn } from "@/lib/utils";
import { saveCamera } from "@/features/scene/actions/camera";
import type { CameraMove } from "@/lib/camera";
import { rerollKey, saveKeys } from "../actions/keyframes";

// The shot's keyframes: the stage at frames 0, 32, 64... of the camera move, each repainted into a
// finished frame with one strict prompt and seed. Make keyframes captures them in the browser and
// sends them to be painted; any one can be painted again. The note says what should be in the frame (a held prop, an action).
export function KeyframesPanel(props: {
  projectId: string;
  keyframes: Keyframes | null;
  current: boolean; // made from today's move, placement and stage
  frames: number[];
  job?: Job;
  move: CameraMove; // saved before capturing, so the server keys the same frames
  capture: { mesh: string; camera: StageCamera; cutouts: Partial<Record<ViewId, string>>; at: [number, number, number]; height: number; turn: number; blocks: Block[]; poses: StagePose[] };
}) {
  const k = props.keyframes;
  const [note, setNote] = useState(k?.note ?? "");
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
    act(() => saveKeys(props.projectId, form, note));
  };

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Keyframes</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          frames {props.frames.join(", ")} · the shot follows them · ~{props.frames.length * 30} s
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="key-note" className="sr-only">
          In the frame
        </label>
        <Input id="key-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="In the frame (optional): holds a torn tire to his mouth" className="min-w-0 flex-1" disabled={busy} />
        <Button size="sm" variant={k && props.current ? "ghost" : "default"} disabled={busy} onClick={() => act(async () => (await saveCamera(props.projectId, props.move), setCapturing(true)))}>
          {capturing || (pending && !running) ? <LoadingDots /> : <Images data-icon="inline-start" />}
          {k ? "Make keyframes again" : "Make keyframes"}
        </Button>
      </div>
      {running && props.job && <JobStatus message={props.job.detail ?? "Painting the keyframes"} startedAt={props.job.startedAt} expected={props.frames.length * 30} />}
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
              <span className="absolute bottom-1.5 left-1.5 rounded border bg-background/80 px-1 font-mono text-[10px] text-muted-foreground backdrop-blur">{k.frames[i]}</span>
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
            </li>
          ))}
        </ol>
      )}
      {k && !props.current && <p className="text-xs text-muted-foreground">The move, the placement or the stage changed since these were made.</p>}
      {props.job?.status === "error" && <p className="text-sm text-destructive">Keyframes failed: {props.job.error}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {capturing && <KeyCapture {...props.capture} onDone={captured} onError={(m) => (setCapturing(false), setError(m))} />}
    </div>
  );
}
