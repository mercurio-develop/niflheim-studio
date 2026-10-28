"use client";

import { useState, useTransition } from "react";
import { Box, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/loading-dots";
import { SectionTitle } from "@/components/section-title";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import { JobPoller } from "@/features/wizard/components/job-poller";
import type { Job, Mesh } from "@/lib/store";
import { cancelMesh, generateMesh } from "../actions/mesh";
import { MeshViewer } from "./mesh-viewer";

const EXPECTED = 50; // seconds, Hunyuan3D-2 MV turbo on the 4080

// The character in 3D, made from the front, side and back views. Grey for now (no texture).
export function MeshSection(props: { projectId: string; mesh: Mesh | null; front: string | null; ready: boolean; locked: boolean; job?: Job }) {
  const [error, setError] = useState<string | null>(null);
  const [starting, start] = useTransition();
  const running = props.job?.status === "running";
  const stale = !!props.mesh && props.mesh.front !== props.front;
  const make = () => {
    setError(null);
    start(() => generateMesh(props.projectId).catch((e: Error) => setError(e.message)));
  };

  return (
    <section className="flex flex-col gap-3">
      <JobPoller running={running} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle n="3" tone="bg-tone-cyan" title="3D model" line="The character in 3D, from the front, side and back views. Drag to turn it." />
        {(props.mesh || props.ready) && (
          <Button variant={props.mesh && !stale ? "ghost" : "default"} size="sm" disabled={!props.ready || props.locked || running || starting} onClick={make}>
            {starting && !running ? <LoadingDots /> : props.mesh ? <RefreshCw data-icon="inline-start" /> : <Box data-icon="inline-start" />}
            {props.mesh ? "Generate again" : "Generate 3D"}
          </Button>
        )}
      </div>
      <div className="relative mx-auto aspect-[7/9] w-full max-w-[32rem] overflow-hidden rounded-xl border bg-card">
        {props.mesh ? (
          <MeshViewer key={props.mesh.glb} url={`/api/files/${props.projectId}/${props.mesh.glb}`} className="absolute inset-0" />
        ) : (
          <div className={`flex size-full items-center justify-center px-6 text-center text-sm text-muted-foreground ${starting && !running ? "nifl-loading" : ""}`}>
            {starting || running ? "" : props.ready ? "No 3D model yet. Generate 3D builds one in about a minute." : "Paint the front, side and back views first."}
          </div>
        )}
        {running && props.job && (
          <FogLoader className="absolute inset-0" message="Building the 3D model" startedAt={props.job.startedAt} expected={EXPECTED} onCancel={() => cancelMesh(props.projectId)} />
        )}
        {stale && !running && (
          <span className="absolute inset-x-3 top-3 rounded-md border bg-background/80 px-2.5 py-1 text-center text-xs text-muted-foreground backdrop-blur">
            Out of date: the front view changed. Generate again to match it.
          </span>
        )}
      </div>
      {props.job?.status === "error" && <p className="text-sm text-destructive">The 3D model failed: {props.job.error}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
