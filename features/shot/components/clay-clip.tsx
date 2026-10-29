"use client";

import { useState, useTransition } from "react";
import { Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/loading-dots";
import { KeyCapture } from "@/features/scene/components/key-capture";
import type { LayoutClip } from "@/lib/store";
import { saveClay } from "../actions/layout";

type Capture = Omit<React.ComponentProps<typeof KeyCapture>, "projectId" | "onDone" | "onError" | "clay" | "onFrame">;

// The camera move drawn as a clay clip, every frame, for Layout-to-Render takes: the takes follow
// it frame by frame (the camera, where everyone stands and walks), so nothing has to be guessed
// between keyframes. A few seconds in the browser; out of date when the move or the stage changes.
export function ClayClip(props: { projectId: string; capture: Capture; layout: LayoutClip | null; current: boolean }) {
  const [capturing, setCapturing] = useState(false);
  const [n, setN] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const total = props.capture.poses.length;
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const captured = (jpegs: Blob[]) => {
    setCapturing(false);
    const form = new FormData();
    jpegs.forEach((b, i) => form.append(`f${i}`, new File([b], `${i}.jpg`, { type: "image/jpeg" })));
    start(() => saveClay(props.projectId, form).then(() => setError(null), (e: Error) => setError(e.message)));
  };

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">Clay clip</span>
        <span className="text-xs text-muted-foreground">
          {props.layout ? (props.current ? `${props.layout.frames} frames · up to date` : "the move or the stage changed since it was drawn") : "the move in grey, every frame, for Camera move takes"}
        </span>
        <Button
          size="sm"
          variant={props.layout && props.current ? "ghost" : "outline"}
          className="ml-auto"
          disabled={capturing || pending}
          onClick={() => (setN(0), setError(null), setCapturing(true))}
        >
          {capturing || pending ? <LoadingDots /> : <Box data-icon="inline-start" />}
          {capturing ? `Drawing ${n} of ${total}` : pending ? "Saving" : props.layout ? "Draw again" : "Draw the clay clip"}
        </Button>
      </div>
      {props.layout && <video src={file(props.layout.clip)} controls loop muted playsInline preload="metadata" className="aspect-[768/448] w-full max-w-md rounded-md border bg-black" />}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {capturing && <KeyCapture {...props.capture} clay projectId={props.projectId} onFrame={setN} onDone={captured} onError={(m) => (setCapturing(false), setError(m))} />}
    </div>
  );
}
