"use client";

import { Camera, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chip } from "@/features/scene/components/chip";
import { FPS, type Moment } from "@/lib/camera";

// The shot blocked as key moments (decision 0013): a chip per moment on the shot's timeline. The
// picked moment poses the stage above; there the gizmo moves whoever is picked for this moment only,
// camera mode's Take shot frames it, and the main character's pose is chosen here. Each moment is a
// keyframe; LTX fills what happens between them.
export function MomentsBar(props: {
  moments: Moment[];
  frames: number; // the shot's length in frames (8n + 1)
  picked: number | null;
  onPick: (i: number | null) => void;
  onBlock: () => void; // no moments yet: start and end from today's placement and path
  onAdd: () => void; // a moment between the picked one and the next
  onDelete: (i: number) => void;
  onFrame: (i: number, frame: number) => void;
  poses: { id: string; label: string }[]; // the main character's finished poses
  onPose: (i: number, pose: string) => void;
  canShoot: boolean; // camera mode is on: Take shot stores the view for the picked moment
  onShoot: () => void;
  warnings: string[];
}) {
  const label = (i: number) => (i === 0 ? "Start" : i === props.moments.length - 1 ? "End" : `Moment ${i + 1}`);
  const m = props.picked !== null ? props.moments[props.picked] : null;
  const pose = m?.marks.main?.pose ?? "";
  if (!props.moments.length)
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        <span>Block this shot by key moments: where everyone stands, their pose and the camera at each one.</span>
        <Button size="sm" variant="outline" onClick={props.onBlock}>
          <Plus data-icon="inline-start" />
          Block with moments
        </Button>
      </div>
    );
  return (
    <div className="flex flex-col gap-2 rounded-md border px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Moments</span>
        {props.moments.map((x, i) => (
          <button key={i} type="button" aria-pressed={props.picked === i} className={chip(props.picked === i)} onClick={() => props.onPick(props.picked === i ? null : i)}>
            {label(i)} · {(x.frame / FPS).toFixed(1)} s{x.camera ? "" : " ·  no camera"}
          </button>
        ))}
        <Button size="sm" variant="ghost" onClick={props.onAdd} disabled={props.moments.length >= 8}>
          <Plus data-icon="inline-start" />
          Add moment
        </Button>
      </div>
      {m && props.picked !== null && (
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:max-w-xl">
          <label htmlFor="moment-frame" className="text-xs text-muted-foreground">
            When
          </label>
          <div className="flex items-center gap-3">
            <input
              id="moment-frame"
              type="range"
              min={0}
              max={props.frames - 1}
              step={8}
              value={m.frame}
              disabled={props.picked === 0 || props.picked === props.moments.length - 1}
              onChange={(e) => props.onFrame(props.picked!, Number(e.target.value))}
              className="w-full accent-primary"
            />
            <span className="w-14 text-right font-mono text-xs text-muted-foreground">{(m.frame / FPS).toFixed(1)} s</span>
          </div>
          {props.poses.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">Pose</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {[{ id: "", label: "As designed" }, ...props.poses].map((x) => (
                  <button key={x.id} type="button" aria-pressed={pose === x.id} className={chip(pose === x.id)} onClick={() => props.onPose(props.picked!, x.id)}>
                    {x.label}
                  </button>
                ))}
              </div>
            </>
          )}
          <span className="text-xs text-muted-foreground">Camera</span>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Button size="sm" variant="outline" disabled={!props.canShoot} onClick={props.onShoot}>
              <Camera data-icon="inline-start" />
              Take shot
            </Button>
            {props.canShoot ? "Frames this moment from where camera mode looks." : "Turn on Camera mode, frame the view, then Take shot."}
          </div>
          <span />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Double-click someone and move them with the gizmo: it moves them for this moment only.
            {props.moments.length > 2 && props.picked > 0 && props.picked < props.moments.length - 1 && (
              <Button size="icon" variant="ghost" aria-label="Delete this moment" onClick={() => props.onDelete(props.picked!)}>
                <Trash2 />
              </Button>
            )}
          </div>
        </div>
      )}
      {props.warnings.map((w) => (
        <p key={w} className="text-xs text-amber-500">
          {w}
        </p>
      ))}
    </div>
  );
}
