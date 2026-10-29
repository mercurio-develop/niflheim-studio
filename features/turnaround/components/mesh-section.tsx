"use client";

import { useState, useTransition } from "react";
import { Box, Download, Palette, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { LoadingDots } from "@/components/loading-dots";
import { Section } from "@/components/section";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import { JobPoller } from "@/features/wizard/components/job-poller";
import type { Job, Mesh, MeshColourView } from "@/lib/store";
import { cancelMesh, colourMesh, generateMesh } from "../actions/mesh";
import { MeshViewer } from "./mesh-viewer";

const EXPECTED = 50; // seconds, Hunyuan3D-2 MV turbo on the 4080

// The character in 3D, made from the front, side and back views and coloured from them.
// views: the current image of each view, to tell when the colour is older than a fixed view.
export function MeshSection(props: { projectId: string; mesh: Mesh | null; views: Partial<Record<MeshColourView, string>>; ready: boolean; locked: boolean; job?: Job }) {
  const [error, setError] = useState<string | null>(null);
  const [starting, start] = useTransition();
  const running = props.job?.status === "running";
  const stale = !!props.mesh && props.mesh.front !== props.views.front;
  const colours = props.mesh?.colours;
  const recolour = !!props.mesh && !stale && (!props.mesh.coloured || (Object.keys(props.views) as MeshColourView[]).some((v) => colours?.[v] !== props.views[v]));
  const act = (fn: (id: string) => Promise<void>) => {
    setError(null);
    start(() => fn(props.projectId).catch((e: Error) => setError(e.message)));
  };
  const make = () => act(generateMesh);

  return (
    <Section
      id="model"
      n="4"
      tone="bg-tone-cyan"
      title="3D model"
      line="The character in 3D, from the front, side and back views. Drag to turn it."
      summary={props.mesh ? (stale ? "Out of date: the front view changed" : "Made · open to turn it") : props.ready ? "No 3D model yet" : "Paint the front, side and back views first"}
      open={running}
      actions={
        <>
          {recolour && (
            <Button variant="default" size="sm" disabled={props.locked || running || starting} onClick={() => act(colourMesh)}>
              <Palette data-icon="inline-start" />
              {props.mesh?.coloured ? "Colour again" : "Colour it"}
            </Button>
          )}
          {props.mesh && (
            <a href={`/api/files/${props.projectId}/${props.mesh.coloured ?? props.mesh.glb}`} download={`character${props.mesh.coloured ? "-coloured" : ""}.glb`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <Download data-icon="inline-start" />
              Download GLB
            </a>
          )}
          {(props.mesh || props.ready) && (
            <Button variant={props.mesh && !stale ? "ghost" : "default"} size="sm" disabled={!props.ready || props.locked || running || starting} onClick={make}>
              {starting && !running ? <LoadingDots /> : props.mesh ? <RefreshCw data-icon="inline-start" /> : <Box data-icon="inline-start" />}
              {props.mesh ? "Generate again" : "Generate 3D"}
            </Button>
          )}
        </>
      }
    >
      <JobPoller running={running} />
      <div className="relative mx-auto aspect-[7/9] w-full max-w-[32rem] overflow-hidden rounded-xl border bg-card">
        {props.mesh ? (
          <MeshViewer key={props.mesh.coloured ?? props.mesh.glb} url={`/api/files/${props.projectId}/${props.mesh.coloured ?? props.mesh.glb}`} className="absolute inset-0" />
        ) : (
          <div className={`flex size-full items-center justify-center px-6 text-center text-sm text-muted-foreground ${starting && !running ? "nifl-loading" : ""}`}>
            {starting || running ? "" : props.ready ? "No 3D model yet. Generate 3D builds one in about a minute." : "Paint the front, side and back views first."}
          </div>
        )}
        {running && props.job && (
          <FogLoader className="absolute inset-0" message={props.job.detail ?? "Building the 3D model"} startedAt={props.job.startedAt} expected={EXPECTED} onCancel={() => cancelMesh(props.projectId)} />
        )}
        {recolour && !running && (
          <span className="absolute inset-x-3 top-3 rounded-md border bg-background/80 px-2.5 py-1 text-center text-xs text-muted-foreground backdrop-blur">
            {props.mesh?.coloured ? "A view changed since it was coloured. Colour again to match it." : "Made before models had colour. Colour it from the views in a few seconds."}
          </span>
        )}
        {stale && !running && (
          <span className="absolute inset-x-3 top-3 rounded-md border bg-background/80 px-2.5 py-1 text-center text-xs text-muted-foreground backdrop-blur">
            Out of date: the front view changed. Generate again to match it.
          </span>
        )}
      </div>
      {props.job?.status === "error" && <p className="text-sm text-destructive">The 3D model failed: {props.job.error}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Section>
  );
}
