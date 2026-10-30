"use client";

import type { Job, LayoutClip } from "@/lib/store";

// The camera move drawn as a clay clip, every frame, for Layout-to-Render takes: a read-only
// preview. One Shoot draws it (in the browser, when the move or the stage changed).
export function ClayClip(props: { projectId: string; layout: LayoutClip | null; current: boolean; job?: Job }) {
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">Motion guide (grey)</span>
        <span className="text-xs text-muted-foreground">
          {props.layout ? (props.current ? `${props.layout.frames} frames · up to date` : "the move or the stage changed since it was drawn") : "drawn by One Shoot for Camera move takes"}
        </span>
      </div>
      {props.layout && <video src={file(props.layout.clip)} controls loop muted playsInline preload="metadata" className="aspect-[768/448] w-full max-w-md rounded-md border bg-black" />}
      {props.job?.status === "running" && <p className="text-xs text-muted-foreground">Joining the clip…</p>}
      {props.job?.status === "error" && <p className="text-xs text-destructive">The motion guide failed: {props.job.error}. Until it is drawn, Camera move takes follow the keyframes.</p>}
      {props.layout && !props.current && <p className="text-xs text-muted-foreground">Out of date: One Shoot draws it again.</p>}
    </div>
  );
}
